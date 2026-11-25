"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ExcelJS from "exceljs";
import type { VehicleType } from "@prisma/client";
import {
  loadingRateForPallets,
  recommendForQuantity,
  vehicleCountForPallets,
  type VehicleRecommendation,
} from "@/lib/dispatch-group";
import { loadCustomProducts } from "@/lib/custom-product-server";
import { findCustomProduct } from "@/lib/custom-product";
import {
  EXCEL_DAY_PRESERVED_STATUSES,
  missingLocationNames,
  missingProductNames,
  notesWithWorkbookAddress,
  normalizeProductKey,
  parseExcelDayRegisterRows,
  summarizeExcelDayRegisterRows,
  type ExcelDayRegisterRow,
  type ExcelDayRegisterSummary,
  type LogisticsVehicleHint,
} from "@/lib/excel-day-register";
import type { RegionLookup } from "@/lib/delivery-excel";
import { optionalText, text } from "@/lib/form";
import { listErpProductNames } from "@/lib/product-loading";
import { prisma } from "@/lib/prisma";
import { rebalanceDayFleet } from "@/lib/rebalance-day-fleet";
import { boxLoadingKey, boxLoadingTargetKey } from "@/lib/schedule-box-loading";
import { getDispatchSettings } from "@/lib/settings";
import { externalTransport } from "@/lib/external-transport";
import { confirmedSimulationAddress } from "@/lib/simulation-address";

function go(formData: FormData, params: Record<string, string | undefined>): never {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const qs = q.toString();
  revalidatePath("/");
  revalidatePath("/products");
  redirect(qs ? `/?${qs}` : "/");
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

function vehicleFromHint(
  hint: LogisticsVehicleHint,
  logistics: string,
  vehicles: VehicleType[],
  palletCount: number | null,
): VehicleRecommendation | null {
  if (hint === "용차") return externalTransport("external:charter");
  if (hint === "택배") return externalTransport("external:courier");
  const wanted =
    hint ??
    (() => {
      const raw = logistics.replace(/\s+/g, " ").trim();
      return raw || null;
    })();
  if (!wanted) return null;
  const vehicle =
    vehicles.find((row) => row.vehicleName === wanted) ||
    vehicles.find((row) => row.vehicleName.replace(/\s+/g, "") === wanted.replace(/\s+/g, "")) ||
    vehicles.find((row) => logistics.includes(row.vehicleName)) ||
    vehicles.find((row) => row.vehicleName.includes(wanted.replace(/차$/, "")));
  if (!vehicle) return null;
  const vehicleCount = vehicleCountForPallets(palletCount, vehicle.maxPallet);
  return {
    vehicleTypeId: vehicle.id,
    vehicleName: vehicle.vehicleName,
    vehicleCount,
    maxPallet: vehicle.maxPallet,
    maxWeight: vehicle.maxWeight,
    loadingRate: loadingRateForPallets(palletCount, vehicle.maxPallet, vehicleCount),
    primaryRegionType: vehicle.primaryRegionType,
    boxPreferred: vehicle.boxPreferred,
  };
}

async function ensureMissingProducts(
  rows: ExcelDayRegisterRow[],
  knownNames: string[],
) {
  const missing = missingProductNames(rows, knownNames);
  for (const productName of missing) {
    const sample = rows.find((row) => normalizeProductKey(row.productName) === normalizeProductKey(productName));
    const key = normalizeProductKey(productName);
    const productCode = `USER-${createHash("sha256").update(key).digest("hex")}`;
    const defaultUnit = "box";
    const specialLoadingCondition = JSON.stringify({
      customerName: sample?.customerName || null,
      locationName: sample?.locationName || null,
      defaultUnit,
      boxWeightKg: null,
      palletWeightKg: null,
      boxesPerPallet: null,
    });
    const restored = await prisma.product.updateMany({
      where: { productCode, isActive: false },
      data: { productName, specialLoadingCondition, isActive: true },
    });
    if (!restored.count) {
      await prisma.product.upsert({
        where: { productCode },
        create: { productCode, productName, specialLoadingCondition },
        update: { productName, specialLoadingCondition, isActive: true },
      });
    }
  }
  return missing.length;
}

async function ensureMissingRegions(rows: ExcelDayRegisterRow[], knownLocations: string[]) {
  const missing = missingLocationNames(rows, knownLocations);
  for (const locationName of missing) {
    await prisma.regionMaster.upsert({
      where: { locationName },
      create: { locationName, regionType: "UNKNOWN", isConfirmed: false },
      update: {},
    });
  }
  return missing.length;
}

async function upsertCustomerAddress(customerName: string, address: string) {
  const existing = await prisma.customer.findFirst({
    where: { customerName, isActive: true },
    select: { id: true, address: true },
  });
  if (!existing) return;
  if (existing.address?.trim()) return;
  await prisma.customer.update({ where: { id: existing.id }, data: { address } });
}

/** 선택한 납품일을 엑셀 물류 그대로 덮어쓴다. DONE/CANCELLED만 유지. */
export async function registerExcelDay(formData: FormData) {
  const deliveryDate = text(formData, "deliveryDate");
  const file = formData.get("file");

  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    go(formData, { error: "납품일을 확인하세요." });
  }
  if (!(file instanceof File) || file.size === 0) {
    go(formData, { date: deliveryDate, error: "납품예상 일정표 엑셀 파일을 선택하세요." });
  }

  let rows: ExcelDayRegisterRow[];
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ExcelJS.Buffer);
    rows = parseExcelDayRegisterRows(workbook, deliveryDate);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 160) : "엑셀을 읽지 못했습니다.";
    go(formData, { date: deliveryDate, error: message });
  }

  if (!rows.length) {
    go(formData, {
      date: deliveryDate,
      error: `${deliveryDate} 일정이 엑셀에 없습니다. 월 시트와 일자를 확인하세요.`,
    });
  }

  const [vehicles, regionRows, settings, customProducts, existingProducts] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    prisma.regionMaster.findMany({ select: { locationName: true } }),
    getDispatchSettings(),
    loadCustomProducts(),
    prisma.product.findMany({
      where: { isActive: true },
      select: { productName: true },
    }),
  ]);

  const knownProductNames = [
    ...listErpProductNames(),
    ...existingProducts.map((row) => row.productName),
    ...customProducts.map((row) => row.productName),
  ];
  const knownLocations = regionRows.map((row) => row.locationName);

  const addedProducts = await ensureMissingProducts(rows, knownProductNames);
  const addedRegions = await ensureMissingRegions(rows, knownLocations);
  const regions = await loadRegions();
  const refreshedCustoms = await loadCustomProducts();

  const preserved = [...EXCEL_DAY_PRESERVED_STATUSES];
  const toRemove = await prisma.scheduleEntry.findMany({
    where: { deliveryDate, status: { notIn: [...preserved] } },
    select: { id: true },
  });
  const removeIds = toRemove.map((row) => row.id);

  const entryData = rows.map((row, index) => {
    const locationName = row.locationName || "미확인";
    const boxCount = row.boxCount != null && row.boxCount > 0 ? row.boxCount : null;
    const customProduct = findCustomProduct(refreshedCustoms, row.productName);
    const result = recommendForQuantity({
      customProduct,
      locationName,
      customerName: row.customerName || null,
      boxCount,
      productCode: row.productCode || null,
      productName: row.productName || null,
      vehicles,
      regions,
      kgPerPallet: settings.kgPerPallet,
    });
    const palletCount = result.palletCount;

    const fromLogistics = vehicleFromHint(row.vehicleHint, row.logistics, vehicles, palletCount);
    const selected = fromLogistics ?? result.recommended;
    const warnings = [...result.warnings];
    if (row.logistics && !fromLogistics) {
      warnings.push(
        row.vehicleHint
          ? `물류 「${row.logistics}」 차량을 찾지 못해 추천으로 대체`
          : `물류 「${row.logistics}」를 인식하지 못해 추천으로 대체`,
      );
    }
    if (!selected) warnings.push("차량을 배정하지 못함 · 홈에서 직접 선택하세요");

    const address =
      row.address ||
      confirmedSimulationAddress(row.customerName, row.locationName) ||
      null;
    const id = randomUUID();
    return {
      id,
      deliveryDate,
      locationName,
      regionType: result.regionType,
      customerName: row.customerName || null,
      productCode: row.productCode || null,
      productName: row.productName || null,
      quantity: row.quantity,
      boxCount,
      palletCount,
      recommendedVehicleJson: result.recommended ? JSON.stringify(result.recommended) : null,
      selectedVehicleJson: selected ? JSON.stringify(selected) : null,
      recommendationReason: [
        fromLogistics ? `엑셀 물류 그대로 · ${row.logistics || selected?.vehicleName}` : null,
        ...result.reasonLines,
      ]
        .filter(Boolean)
        .join("\n"),
      warningsJson: JSON.stringify(warnings),
      logistics: selected?.vehicleName || row.logistics || null,
      staff: null,
      notes: notesWithWorkbookAddress(address),
      status: "PLANNED" as const,
      source: "EXCEL" as const,
      visitOrder: index,
      address,
    };
  });

  await prisma.$transaction(async (tx) => {
    if (removeIds.length) {
      const settingKeys = removeIds.flatMap((id) => [boxLoadingKey(id), boxLoadingTargetKey(id)]);
      await tx.appSetting.deleteMany({ where: { key: { in: settingKeys } } });
      await tx.scheduleEntry.deleteMany({ where: { id: { in: removeIds } } });
    }
    await tx.scheduleEntry.createMany({
      data: entryData.map(({ address: _address, ...row }) => row),
    });
    const boxSettings = entryData
      .filter((row) => row.boxCount != null)
      .map((row) => ({ key: boxLoadingKey(row.id), value: "unknown" }));
    if (boxSettings.length) await tx.appSetting.createMany({ data: boxSettings });
    await tx.appLog.create({
      data: {
        userAction: "schedule_register_excel_day",
        routeCode: deliveryDate,
        recommendation: `${entryData.length}건 · 물류 그대로`,
        selectedResult: `삭제 ${removeIds.length} · 품명+${addedProducts} · 지역+${addedRegions}`,
      },
    });
  });

  for (const row of entryData) {
    if (row.customerName && row.address) {
      await upsertCustomerAddress(row.customerName, row.address);
    }
  }

  await rebalanceDayFleet(deliveryDate);

  const warnCount = entryData.filter((row) => {
    try {
      return (JSON.parse(row.warningsJson) as string[]).some((line) => /물류/.test(line));
    } catch {
      return false;
    }
  }).length;

  const parts = [
    `${deliveryDate} 엑셀 ${entryData.length}건 등록`,
    removeIds.length ? `기존 ${removeIds.length}건 덮어씀` : null,
    addedProducts ? `신규 품명 ${addedProducts}` : null,
    addedRegions ? `신규 지역 ${addedRegions}` : null,
    warnCount ? `물류 미인식 ${warnCount}건(추천 대체)` : null,
  ].filter(Boolean);

  go(formData, {
    date: deliveryDate,
    ok: parts.join(" · "),
  });
}

export type ExcelDayPreviewResult =
  | {
      ok: true;
      summary: ExcelDayRegisterSummary;
      newProducts: string[];
      newLocations: string[];
    }
  | { error: string };

/** 다이얼로그 미리보기용. 서버에서만 엑셀을 연다. */
export async function previewExcelDay(formData: FormData): Promise<ExcelDayPreviewResult> {
  const deliveryDate = optionalText(formData, "deliveryDate") ?? "";
  const file = formData.get("file");
  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return { error: "납품일을 확인하세요." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "엑셀 파일을 선택하세요." };
  }
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ExcelJS.Buffer);
    const rows = parseExcelDayRegisterRows(workbook, deliveryDate);
    if (!rows.length) {
      return { error: `${deliveryDate} 일정이 엑셀에 없습니다.` };
    }
    const [regionRows, products, customs] = await Promise.all([
      prisma.regionMaster.findMany({ select: { locationName: true } }),
      prisma.product.findMany({ where: { isActive: true }, select: { productName: true } }),
      loadCustomProducts(),
    ]);
    const knownProducts = [
      ...listErpProductNames(),
      ...products.map((row) => row.productName),
      ...customs.map((row) => row.productName),
    ];
    const knownLocations = regionRows.map((row) => row.locationName);
    return {
      ok: true,
      summary: summarizeExcelDayRegisterRows(rows),
      newProducts: missingProductNames(rows, knownProducts),
      newLocations: missingLocationNames(rows, knownLocations),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message.slice(0, 160) : "엑셀을 읽지 못했습니다.",
    };
  }
}
