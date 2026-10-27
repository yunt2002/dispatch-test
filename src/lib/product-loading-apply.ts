import type { VehicleRecommendation } from "@/lib/dispatch-group";
import { recommendForQuantity } from "@/lib/dispatch-group";
import { parseJson } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { PRODUCT_FAMILIES } from "@/lib/product-loading";
import { getDispatchSettings } from "@/lib/settings";

export const PRODUCT_LOADING_VERSION = "2026-10-28-v1";

async function loadRegions() {
  const regions = await prisma.regionMaster.findMany();
  return new Map(
    regions.map((region) => [
      region.locationName,
      {
        regionType: region.regionType,
        preferredVehicleTypeId: region.preferredVehicleTypeId,
      },
    ]),
  );
}

export async function upsertProductLoadingMasters() {
  for (const family of PRODUCT_FAMILIES) {
    await prisma.productLoadingMaster.upsert({
      where: { productCode: family.id },
      create: {
        productCode: family.id,
        productName: family.familyName,
        boxesPerPallet: family.boxesPerPallet,
        specialLoadingRule: JSON.stringify({
          boxType: family.boxType,
          boxTypeRaw: family.boxTypeRaw,
          palletSpec: family.palletSpec,
          loose: family.boxesPerPallet == null,
          customers: family.customers,
        }),
      },
      update: {
        productName: family.familyName,
        boxesPerPallet: family.boxesPerPallet,
        specialLoadingRule: JSON.stringify({
          boxType: family.boxType,
          boxTypeRaw: family.boxTypeRaw,
          palletSpec: family.palletSpec,
          loose: family.boxesPerPallet == null,
          customers: family.customers,
        }),
      },
    });
  }
}

/** 적재표가 바뀌면 기존 일정 추천·PLT를 한 번 다시 계산한다. */
export async function applyProductLoadingIfNeeded() {
  const current = await prisma.appSetting.findUnique({
    where: { key: "product_loading_version" },
  });
  if (current?.value === PRODUCT_LOADING_VERSION) return;

  await upsertProductLoadingMasters();

  await prisma.appSetting.upsert({
    where: { key: "kg_per_pallet" },
    create: { key: "kg_per_pallet", value: "600" },
    update: { value: "600" },
  });
  await prisma.appSetting.upsert({
    where: { key: "kg_per_pallet_confirmed" },
    create: { key: "kg_per_pallet_confirmed", value: "true" },
    update: { value: "true" },
  });

  // 1·2호 제원 통일: 윙바디 · 최대 8 PLT · 적재함 치수
  await prisma.vehicleType.updateMany({
    where: { id: "vehicle-1ho-4t" },
    data: {
      maxPallet: 8,
      description:
        "4.0t 윙바디 · 적재함 5,200×2,300 · 최대 8 PLT · 지방·고정 루트. 600kg/PLT 기준.",
    },
  });
  await prisma.vehicleType.updateMany({
    where: { id: "vehicle-2ho-3-5t" },
    data: {
      maxPallet: 8,
      description:
        "3.5t 윙바디 · 적재함 5,000×2,150 · 최대 8 PLT · 수도권·유동. 600kg/PLT 기준.",
    },
  });

  const [vehicles, regions, settings, entries] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    loadRegions(),
    getDispatchSettings(),
    prisma.scheduleEntry.findMany({ where: { status: { not: "CANCELLED" } } }),
  ]);

  for (const entry of entries) {
    if (!entry.productCode && !entry.productName) continue;
    const rec = recommendForQuantity({
      locationName: entry.locationName,
      boxCount: entry.boxCount,
      palletCount: entry.boxCount != null ? null : entry.palletCount,
      productCode: entry.productCode,
      productName: entry.productName,
      vehicles,
      regions,
      kgPerPallet: settings.kgPerPallet,
    });
    const oldRec = parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
    const oldSel = parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null);
    const manual = Boolean(
      oldSel && oldRec && oldSel.vehicleTypeId !== oldRec.vehicleTypeId,
    );
    await prisma.scheduleEntry.update({
      where: { id: entry.id },
      data: {
        palletCount: entry.boxCount != null ? rec.palletCount : entry.palletCount,
        recommendedVehicleJson: rec.recommended ? JSON.stringify(rec.recommended) : null,
        selectedVehicleJson: manual
          ? entry.selectedVehicleJson
          : rec.recommended
            ? JSON.stringify(rec.recommended)
            : entry.selectedVehicleJson,
        recommendationReason: rec.reasonLines.join("\n"),
        warningsJson: JSON.stringify(rec.warnings),
        logistics: manual ? entry.logistics : (rec.recommended?.vehicleName ?? entry.logistics),
      },
    });
  }

  await prisma.appSetting.upsert({
    where: { key: "product_loading_version" },
    create: { key: "product_loading_version", value: PRODUCT_LOADING_VERSION },
    update: { value: PRODUCT_LOADING_VERSION },
  });
}
