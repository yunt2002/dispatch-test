"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type VehicleType } from "@prisma/client";
import {
  loadingRateForPallets,
  vehicleCountForPallets,
  type VehicleRecommendation,
} from "@/lib/dispatch-group";
import { loadCustomProducts } from "@/lib/custom-product-server";
import { findCustomProduct } from "@/lib/custom-product";
import {
  EXCEL_DAY_PRESERVED_STATUSES,
  extractNoteAddress,
  missingLocationNames,
  missingProductNames,
  notesWithExcelDayMeta,
  normalizeProductKey,
  parseExcelDayRegisterRows,
  recommendExcelDayRow,
  summarizeExcelDayRegisterRows,
  type ExcelDayRegisterRow,
  type ExcelDayRegisterSummary,
  type LogisticsVehicleHint,
} from "@/lib/excel-day-register";
import { loadWorkbook, type RegionLookup } from "@/lib/delivery-excel";
import { excelUploadError } from "@/lib/excel-upload";
import { EXCEL_LOGISTICS_REASON_PREFIX } from "@/lib/schedule-vehicle-source";
import { excludePreservedImportRows, scheduleImportMatchSelect } from "@/lib/schedule-import-rows";
import { optionalText, text } from "@/lib/form";
import { listErpProductNames } from "@/lib/product-loading";
import { prisma } from "@/lib/prisma";
import { rebalanceDayFleet } from "@/lib/rebalance-day-fleet";
import { boxLoadingKey, boxLoadingTargetKey } from "@/lib/schedule-box-loading";
import { getDispatchSettings } from "@/lib/settings";
import { externalTransport } from "@/lib/external-transport";
import { confirmedSimulationAddress } from "@/lib/simulation-address";

function go(params: Record<string, string | undefined>): never {
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
  await prisma.customer.updateMany({ where: { id: existing.id, address: existing.address }, data: { address } });
}

type CustomerAddress = { customerName: string | null; address: string | null };

async function finishExcelDay(
  deliveryDate: string,
  loadAddresses: (() => CustomerAddress[] | Promise<CustomerAddress[]>) | null,
  rebalance: boolean,
) {
  let addressesFailed = false;
  if (loadAddresses) {
    try {
      for (const { customerName, address } of await loadAddresses()) {
        if (!customerName || !address) continue;
        try {
          await upsertCustomerAddress(customerName, address);
        } catch (error) {
          addressesFailed = true;
          console.error("엑셀 등록 후 거래처 주소 보강 실패", deliveryDate, error);
        }
      }
    } catch (error) {
      addressesFailed = true;
      console.error("엑셀 등록 후 주소 대상 조회 실패", deliveryDate, error);
    }
  }

  let fleetFailed = false;
  if (rebalance) {
    try {
      await rebalanceDayFleet(deliveryDate);
    } catch (error) {
      fleetFailed = true;
      console.error("엑셀 등록 후 차량 재배정 실패", deliveryDate, error);
    }
  }

  const excelRetry = addressesFailed ? fleetFailed ? "both" : "addresses" : fleetFailed ? "fleet" : undefined;
  const failedSteps = [addressesFailed ? "거래처 주소 보강" : null, fleetFailed ? "차량 재배정" : null].filter(Boolean);
  return {
    excelRetry,
    notice: excelRetry ? `일정은 저장됐습니다. ${failedSteps.join("·")}에 실패했습니다. 실패한 작업만 다시 실행할 수 있습니다.` : undefined,
  };
}

export async function retryExcelDayFollowUp(formData: FormData) {
  const date = text(formData, "date");
  const retry = text(formData, "retry");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (retry !== "addresses" && retry !== "fleet" && retry !== "both")) {
    go({ error: "다시 실행할 납품일과 작업을 확인하세요." });
  }
  const loadAddresses = retry === "fleet" ? null : async () => {
    const entries = await prisma.scheduleEntry.findMany({
      where: { deliveryDate: date, source: "EXCEL", status: { not: "CANCELLED" }, notes: { not: null } },
      select: { customerName: true, notes: true },
      orderBy: [{ visitOrder: "asc" }, { id: "asc" }],
    });
    return entries.map(({ customerName, notes }) => ({ customerName, address: extractNoteAddress(notes) }));
  };
  const response = await finishExcelDay(date, loadAddresses, retry !== "addresses");
  go({ date, ok: response.excelRetry ? undefined : "엑셀 등록 후처리를 완료했습니다.", ...response });
}

async function readExcelDayRows(file: File, deliveryDate: string) {
  const fileError = excelUploadError(file);
  if (fileError) throw new Error(fileError);
  return parseExcelDayRegisterRows(await loadWorkbook(await file.arrayBuffer()), deliveryDate);
}

/** 선택한 납품일을 엑셀 물류 그대로 덮어쓴다. DONE/CANCELLED만 유지. */
export async function registerExcelDay(formData: FormData) {
  const deliveryDate = text(formData, "deliveryDate");
  const file = formData.get("file");

  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    go({ error: "납품일을 확인하세요." });
  }
  if (!(file instanceof File)) {
    go({ date: deliveryDate, error: "납품예상 일정표 엑셀 파일을 선택하세요." });
  }

  let rows: ExcelDayRegisterRow[];
  try {
    rows = await readExcelDayRows(file, deliveryDate);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 160) : "엑셀을 읽지 못했습니다.";
    go({ date: deliveryDate, error: message });
  }

  if (!rows.length) {
    go({
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

  const entryData = rows.map((row, index) => {
    const locationName = row.locationName || "미확인";
    const customProduct = findCustomProduct(refreshedCustoms, row.productName);
    const { quantity, boxCount, palletCount, result } = recommendExcelDayRow(row, {
      customProduct,
      vehicles,
      regions,
      kgPerPallet: settings.kgPerPallet,
    });
    const fromLogistics = vehicleFromHint(row.vehicleHint, row.logistics, vehicles, palletCount);
    const selected = fromLogistics ?? result.recommended;
    const logisticsFallback = Boolean(row.logistics && !fromLogistics);
    const warnings = [...result.warnings];
    if (logisticsFallback) {
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
      address,
      logisticsFallback,
      schedule: {
        id,
        deliveryDate,
        locationName,
        regionType: result.regionType,
        customerName: row.customerName || null,
        productCode: row.productCode || null,
        productName: row.productName || null,
        quantity,
        boxCount,
        palletCount,
        recommendedVehicleJson: result.recommended ? JSON.stringify(result.recommended) : null,
        selectedVehicleJson: selected ? JSON.stringify(selected) : null,
        recommendationReason: [
          fromLogistics ? `${EXCEL_LOGISTICS_REASON_PREFIX}${row.logistics || fromLogistics.vehicleName}` : null,
          ...result.reasonLines,
        ]
          .filter(Boolean)
          .join("\n"),
        warningsJson: JSON.stringify(warnings),
        logistics: selected?.vehicleName || row.logistics || null,
        staff: null,
        notes: notesWithExcelDayMeta({
          address,
          charterFare:
            row.vehicleHint === "용차" || /용차/.test(row.logistics) ? row.charterFare : null,
        }),
        status: "PLANNED" as const,
        source: "EXCEL" as const,
        visitOrder: index,
      },
    };
  });

  const replaceDay = () => prisma.$transaction(async (tx) => {
    const existing = await tx.scheduleEntry.findMany({
      where: { deliveryDate },
      select: { id: true, status: true, ...scheduleImportMatchSelect },
    });
    const preserved = existing.filter((row) => EXCEL_DAY_PRESERVED_STATUSES.some((status) => status === row.status));
    const preservedIds = new Set(preserved.map((row) => row.id));
    const toCreate = excludePreservedImportRows(entryData, preserved, ({ schedule }) => schedule);
    const { count } = await tx.scheduleEntry.deleteMany({
      where: { deliveryDate, status: { notIn: [...EXCEL_DAY_PRESERVED_STATUSES] } },
    });
    const settingKeys = existing
      .filter(({ id }) => !preservedIds.has(id))
      .flatMap(({ id }) => [boxLoadingKey(id), boxLoadingTargetKey(id)]);
    if (settingKeys.length) await tx.appSetting.deleteMany({ where: { key: { in: settingKeys } } });
    if (toCreate.length) await tx.scheduleEntry.createMany({ data: toCreate.map(({ schedule }) => schedule) });
    const boxSettings = toCreate
      .filter(({ schedule }) => schedule.boxCount != null)
      .map(({ schedule }) => ({ key: boxLoadingKey(schedule.id), value: "unknown" }));
    if (boxSettings.length) await tx.appSetting.createMany({ data: boxSettings });
    await tx.appLog.create({
      data: {
        userAction: "schedule_register_excel_day",
        routeCode: deliveryDate,
        recommendation: `${toCreate.length}건 · 물류 그대로`,
        selectedResult: `삭제 ${count} · 품명+${addedProducts} · 지역+${addedRegions}`,
      },
    });
    return { removedCount: count, createdRows: toCreate };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  let replacement: Awaited<ReturnType<typeof replaceDay>>;
  try {
    replacement = await replaceDay();
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
    go({ date: deliveryDate, error: "다른 작업과 동시에 일정이 변경되었습니다. 현재 일정을 확인한 뒤 다시 등록해 주세요." });
  }

  const { removedCount, createdRows } = replacement;
  const matchedPreservedCount = entryData.length - createdRows.length;
  const followUp = await finishExcelDay(deliveryDate, () => createdRows.map(({ address, schedule }) => ({
    address, customerName: schedule.customerName,
  })), true);

  const warnCount = createdRows.filter(({ logisticsFallback }) => logisticsFallback).length;

  const parts = [
    `${deliveryDate} 엑셀 ${createdRows.length}건 등록`,
    removedCount ? `기존 ${removedCount}건 덮어씀` : null,
    matchedPreservedCount ? `같은 완료·취소 ${matchedPreservedCount}건 유지` : null,
    addedProducts ? `신규 품명 ${addedProducts}` : null,
    addedRegions ? `신규 지역 ${addedRegions}` : null,
    warnCount ? `물류 미인식 ${warnCount}건(추천 대체)` : null,
  ].filter(Boolean);

  go({
    date: deliveryDate,
    ok: parts.join(" · "),
    ...followUp,
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
  if (!(file instanceof File)) {
    return { error: "엑셀 파일을 선택하세요." };
  }
  try {
    const rows = await readExcelDayRows(file, deliveryDate);
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
