"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { matchDeliveryCustomer } from "@/lib/delivery-customers";
import type { RegionLookup } from "@/lib/delivery-excel";
import {
  loadingRateForPallets,
  recommendForQuantity,
  vehicleCountForPallets,
  type VehicleRecommendation,
} from "@/lib/dispatch-group";
import { optionalText, text } from "@/lib/form";
import { parseJson } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getDispatchSettings } from "@/lib/settings";

function go(params: Record<string, string | undefined>): never {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const qs = q.toString();
  redirect(qs ? `/?${qs}` : "/");
}

function parsePositive(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadRegions(): Promise<RegionLookup> {
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

/** 당일 차량별 잔여 PLT (한도 − 배정 합). PLT 없고 박스만 있으면 1칸으로 본다. */
async function remainingPalletsByVehicle(deliveryDate: string) {
  const [vehicles, entries] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    prisma.scheduleEntry.findMany({
      where: { deliveryDate, status: { notIn: ["CANCELLED", "DONE"] } },
    }),
  ]);
  const used = new Map<string, number>();
  for (const entry of entries) {
    const selected =
      parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null) ??
      parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
    if (!selected) continue;
    const units =
      entry.palletCount != null && entry.palletCount > 0
        ? entry.palletCount
        : entry.boxCount != null && entry.boxCount > 0
          ? 1
          : 0;
    if (units <= 0) continue;
    used.set(selected.vehicleTypeId, (used.get(selected.vehicleTypeId) ?? 0) + units);
  }
  const remaining: Record<string, number> = {};
  for (const vehicle of vehicles) {
    const max = vehicle.maxPallet ?? 0;
    remaining[vehicle.id] = Math.max(0, max - (used.get(vehicle.id) ?? 0));
  }
  return remaining;
}

/** 지역·수량 입력 → 즉시 추천 후 일정 등록 */
export async function registerSchedule(formData: FormData) {
  const deliveryDate = text(formData, "deliveryDate");
  const locationName = text(formData, "locationName");
  const customerName = optionalText(formData, "customerName");
  const productName = optionalText(formData, "productName");
  const notes = optionalText(formData, "notes");
  const qtyUnit = text(formData, "qtyUnit") === "plt" ? "plt" : "box";
  const quantity = parsePositive(optionalText(formData, "quantity") ?? undefined);
  const boxCount = qtyUnit === "box" ? quantity : null;
  const palletCount = qtyUnit === "plt" ? quantity : null;

  if (!deliveryDate || !locationName) {
    go({ error: "납품일과 지역(위치)은 필수입니다.", date: deliveryDate });
  }
  if (quantity == null) {
    go({
      error: "수량을 입력하세요.",
      date: deliveryDate,
    });
  }

  const deliveryCustomer = matchDeliveryCustomer(customerName);
  const resolvedLocation = locationName.trim() || deliveryCustomer?.locationHint || "";

  const [vehicles, regions, settings, remainingByVehicleId] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    loadRegions(),
    getDispatchSettings(),
    remainingPalletsByVehicle(deliveryDate),
  ]);

  const result = recommendForQuantity({
    locationName: resolvedLocation,
    customerName: customerName || deliveryCustomer?.name || null,
    boxCount,
    palletCount,
    productName,
    vehicles,
    regions,
    kgPerPallet: settings.kgPerPallet,
    remainingByVehicleId,
  });

  await prisma.scheduleEntry.create({
    data: {
      deliveryDate,
      locationName: resolvedLocation,
      regionType: result.regionType,
      customerName: customerName || deliveryCustomer?.name || null,
      productName,
      boxCount,
      palletCount: qtyUnit === "plt" ? palletCount : result.palletCount,
      recommendedVehicleJson: result.recommended
        ? JSON.stringify(result.recommended)
        : null,
      selectedVehicleJson: result.recommended
        ? JSON.stringify(result.recommended)
        : null,
      recommendationReason: result.reasonLines.join("\n"),
      warningsJson: JSON.stringify(result.warnings),
      logistics: result.recommended?.vehicleName ?? null,
      notes,
      status: "PLANNED",
    },
  });

  await prisma.appLog.create({
    data: {
      userAction: "schedule_register",
      routeCode: deliveryDate,
      recommendation: result.recommended
        ? `${result.recommended.vehicleName}×${result.recommended.vehicleCount}`
        : "없음",
    },
  });

  revalidatePath("/");
  const vehicleLabel = result.recommended
    ? `${result.recommended.vehicleName}${result.recommended.vehicleCount > 1 ? ` ×${result.recommended.vehicleCount}` : ""}`
    : "추천 없음";
  go({
    date: deliveryDate,
    ok: `등록 · 추천 ${vehicleLabel}`,
  });
}

export async function changeScheduleVehicle(formData: FormData) {
  const id = text(formData, "id");
  const date = optionalText(formData, "date") ?? undefined;
  const vehicleTypeId = text(formData, "vehicleTypeId");
  if (!vehicleTypeId) {
    go({ date, error: "바꿀 차량을 선택하세요." });
  }

  const [entry, vehicle] = await Promise.all([
    prisma.scheduleEntry.findUnique({ where: { id } }),
    prisma.vehicleType.findUnique({ where: { id: vehicleTypeId } }),
  ]);
  if (!entry || !vehicle) {
    go({ date, error: "일정 또는 차량을 확인하세요." });
  }

  const recommended = parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
  const vehicleCount = vehicleCountForPallets(entry.palletCount, vehicle.maxPallet);
  const selected: VehicleRecommendation = {
    vehicleTypeId: vehicle.id,
    vehicleName: vehicle.vehicleName,
    vehicleCount,
    maxPallet: vehicle.maxPallet,
    maxWeight: vehicle.maxWeight,
    loadingRate: loadingRateForPallets(entry.palletCount, vehicle.maxPallet, vehicleCount),
    primaryRegionType: vehicle.primaryRegionType,
    boxPreferred: vehicle.boxPreferred,
  };

  await prisma.scheduleEntry.update({
    where: { id },
    data: {
      selectedVehicleJson: JSON.stringify(selected),
      logistics: vehicle.vehicleName,
    },
  });

  await prisma.appLog.create({
    data: {
      userAction: "schedule_vehicle_change",
      routeCode: date,
      recommendation: recommended?.vehicleName ?? null,
      selectedResult: vehicle.vehicleName,
    },
  });

  revalidatePath("/");
  const countLabel = vehicleCount > 1 ? ` ×${vehicleCount}` : "";
  go({ date, ok: `${vehicle.vehicleName}${countLabel}로 바꿨습니다.` });
}

function sameQty(a: number | null | undefined, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

/** 지역·수량·거래처 수정. 지역/수량이 바뀌면 추천을 다시 돌린다. */
export async function updateSchedule(formData: FormData) {
  const id = text(formData, "id");
  const date = optionalText(formData, "date") ?? undefined;
  const locationName = text(formData, "locationName");
  const customerName = optionalText(formData, "customerName");
  const productName = optionalText(formData, "productName");
  const qtyUnit = text(formData, "qtyUnit") === "plt" ? "plt" : "box";
  const quantity = parsePositive(optionalText(formData, "quantity") ?? undefined);

  if (!locationName) {
    go({ date, error: "지역(위치)은 필수입니다." });
  }
  if (quantity == null) {
    go({ date, error: "수량을 입력하세요." });
  }

  const entry = await prisma.scheduleEntry.findUnique({ where: { id } });
  if (!entry) {
    go({ date, error: "일정을 확인하세요." });
  }
  if (entry.status === "DONE") {
    go({ date, error: "완료된 일정은 완료 취소 후 수정하세요." });
  }

  const boxCount = qtyUnit === "box" ? quantity : null;
  const palletCount = qtyUnit === "plt" ? quantity : null;
  const locationChanged = locationName.trim() !== entry.locationName;
  const qtyChanged =
    qtyUnit === "plt" ? !sameQty(entry.palletCount, palletCount) : !sameQty(entry.boxCount, boxCount);
  const customerChanged = (customerName ?? null) !== (entry.customerName ?? null);
  const productChanged = (productName ?? null) !== (entry.productName ?? null);

  if (!locationChanged && !qtyChanged && !customerChanged && !productChanged) {
    go({ date, ok: "변경된 내용이 없습니다." });
  }

  if (!locationChanged && !qtyChanged && !productChanged) {
    await prisma.scheduleEntry.update({
      where: { id },
      data: { customerName },
    });
    await prisma.appLog.create({
      data: {
        userAction: "schedule_update",
        routeCode: date,
        selectedResult: customerName,
      },
    });
    revalidatePath("/");
    go({ date, ok: "거래처를 수정했습니다." });
  }

  const deliveryDate = entry.deliveryDate;
  const [vehicles, regions, settings, remainingByVehicleId] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    loadRegions(),
    getDispatchSettings(),
    remainingPalletsByVehicle(deliveryDate),
  ]);

  const result = recommendForQuantity({
    locationName,
    customerName,
    boxCount,
    palletCount,
    productCode: entry.productCode,
    productName,
    vehicles,
    regions,
    kgPerPallet: settings.kgPerPallet,
    remainingByVehicleId,
  });

  await prisma.scheduleEntry.update({
    where: { id },
    data: {
      locationName: locationName.trim(),
      regionType: result.regionType,
      customerName,
      productName,
      boxCount,
      palletCount: qtyUnit === "plt" ? palletCount : result.palletCount,
      recommendedVehicleJson: result.recommended ? JSON.stringify(result.recommended) : null,
      selectedVehicleJson: result.recommended ? JSON.stringify(result.recommended) : null,
      recommendationReason: result.reasonLines.join("\n"),
      warningsJson: JSON.stringify(result.warnings),
      logistics: result.recommended?.vehicleName ?? null,
    },
  });

  await prisma.appLog.create({
    data: {
      userAction: "schedule_update",
      routeCode: date,
      recommendation: result.recommended
        ? `${result.recommended.vehicleName}×${result.recommended.vehicleCount}`
        : "없음",
    },
  });

  revalidatePath("/");
  const vehicleLabel = result.recommended
    ? `${result.recommended.vehicleName}${result.recommended.vehicleCount > 1 ? ` ×${result.recommended.vehicleCount}` : ""}`
    : "추천 없음";
  go({ date, ok: `수정 · 추천 ${vehicleLabel}` });
}

export async function markScheduleDone(formData: FormData) {
  const id = text(formData, "id");
  const date = optionalText(formData, "date") ?? undefined;
  await prisma.scheduleEntry.update({
    where: { id },
    data: { status: "DONE" },
  });
  revalidatePath("/");
  go({ date, ok: "완료 처리했습니다." });
}

export async function confirmSchedule(formData: FormData) {
  const id = text(formData, "id");
  const date = optionalText(formData, "date") ?? undefined;
  const entry = await prisma.scheduleEntry.findUnique({ where: { id } });
  if (!entry) {
    go({ date, error: "일정을 확인하세요." });
  }
  if (entry.status === "DONE") {
    go({ date, error: "이미 완료된 일정입니다." });
  }

  await prisma.scheduleEntry.update({
    where: { id },
    data: { status: "CONFIRMED" },
  });
  await prisma.appLog.create({
    data: {
      userAction: "schedule_confirm",
      routeCode: date,
      selectedResult: entry.logistics,
    },
  });
  revalidatePath("/");
  go({ date, ok: "배차를 확정했습니다." });
}

export async function reopenSchedule(formData: FormData) {
  const id = text(formData, "id");
  const date = optionalText(formData, "date") ?? undefined;
  await prisma.scheduleEntry.update({
    where: { id },
    data: { status: "CONFIRMED" },
  });
  revalidatePath("/");
  go({ date, ok: "완료를 취소했습니다." });
}

export async function deleteSchedule(formData: FormData) {
  const id = text(formData, "id");
  const date = optionalText(formData, "date") ?? undefined;
  await prisma.scheduleEntry.delete({ where: { id } });
  revalidatePath("/");
  go({ date, ok: "삭제했습니다." });
}
