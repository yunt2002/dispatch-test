"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  customerCodeFromName,
  extractShipments,
  listMonthSheets,
  loadWorkbook,
  type RegionLookup,
} from "@/lib/delivery-excel";
import { buildDispatchGroups } from "@/lib/dispatch-group";
import { optionalText, text } from "@/lib/form";
import { replaceExcelSchedule } from "@/lib/import-schedule";
import { prisma } from "@/lib/prisma";
import { getDispatchSettings } from "@/lib/settings";

function planRedirect(path: string, params: Record<string, string | undefined>): never {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const qs = q.toString();
  redirect(qs ? `${path}?${qs}` : path);
}

async function loadRegionLookup(): Promise<RegionLookup> {
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

export async function uploadPlanExcel(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    planRedirect("/plan", { error: "납품관리 Excel 파일을 선택하세요." });
  }

  const preferredSheet = optionalText(formData, "sheetName") ?? undefined;
  const buffer = Buffer.from(await file.arrayBuffer());

  let workbook;
  try {
    workbook = await loadWorkbook(buffer);
  } catch {
    planRedirect("/plan", { error: "Excel 파일을 읽을 수 없습니다. 형식을 확인하세요." });
  }

  const monthSheets = listMonthSheets(workbook);
  if (monthSheets.length === 0 && !preferredSheet) {
    planRedirect("/plan", {
      error: "YY년 MM월 형식의 월별 시트를 찾지 못했습니다.",
    });
  }

  const sheetName = preferredSheet && workbook.getWorksheet(preferredSheet)
    ? preferredSheet
    : monthSheets[0];
  const sheet = workbook.getWorksheet(sheetName!);
  if (!sheet) {
    planRedirect("/plan", { error: `시트 '${sheetName}'를 열 수 없습니다.` });
  }

  const parsed = extractShipments(sheet);
  if (!parsed.dates.length) {
    planRedirect("/plan", {
      error: "날짜별 납품 데이터를 추출하지 못했습니다. 헤더(일자/업체명)를 확인하세요.",
      notice: parsed.warnings.slice(0, 3).join(" · "),
    });
  }

  const session = await prisma.planSession.create({
    data: {
      fileName: file.name,
      sheetName: parsed.sheetName,
      sheetsJson: JSON.stringify(monthSheets.length ? monthSheets : [parsed.sheetName]),
      datesJson: JSON.stringify(parsed.dates),
      warningsJson: JSON.stringify(parsed.warnings),
    },
  });

  try {
    const regions = await loadRegionLookup();
    const routeByCode = Object.fromEntries(
      (await prisma.route.findMany()).map((route) => [route.routeCode, route.id]),
    );

    const customerCache = new Map<string, { id: string }>();
    const productCache = new Map<string, { id: string }>();

    for (const row of parsed.rows) {
      if (!row.deliveryDate || !row.customerName || !row.productCode) continue;
      if (row.quantity == null && row.boxCount == null) continue;

      const customerCode = customerCodeFromName(row.customerName);
      let customer = customerCache.get(customerCode);
      if (!customer) {
        customer = await prisma.customer.upsert({
          where: { customerCode },
          create: {
            customerCode,
            customerName: row.customerName,
            address: row.location || null,
            allowedVehicleTypeIds: "[]",
            restrictedVehicleTypeIds: "[]",
            specialConditions: "거래처별 차량 제한 없음 (기획서)",
            isDummy: false,
          },
          update: {
            customerName: row.customerName,
            address: row.location || undefined,
          },
          select: { id: true },
        });
        customerCache.set(customerCode, customer);
      }

      const productCode = row.productCode.trim();
      let product = productCache.get(productCode);
      if (!product) {
        product = await prisma.product.upsert({
          where: { productCode },
          create: {
            productCode,
            productName: row.productName,
            piecesPerBox: row.piecesPerBoxRaw,
            isDummy: false,
          },
          update: {
            productName: row.productName || undefined,
            piecesPerBox: row.piecesPerBoxRaw ?? undefined,
          },
          select: { id: true },
        });
        productCache.set(productCode, product);
      }

      const regionHit = regions.get(row.location);
      const regionType = /용차/.test(row.logistics)
        ? "CHARTER"
        : /경동|택배/.test(row.logistics)
          ? "COURIER"
          : (regionHit?.regionType ?? "UNKNOWN");

      await prisma.shipment.create({
        data: {
          deliveryDate: row.deliveryDate,
          customerId: customer.id,
          productId: product.id,
          quantity: row.quantity ?? 0,
          boxCount: row.boxCount,
          piecesPerBox: row.piecesPerBoxRaw,
          actualLogistics: row.logistics || null,
          staff: row.staff || null,
          location: row.location || null,
          regionType,
          notes: row.notes || null,
          planSessionId: session.id,
          routeId:
            regionType === "LOCAL"
              ? routeByCode["R-LOCAL"]
              : regionType === "METROPOLITAN"
                ? routeByCode["R-CAPITAL"]
                : regionType === "CHARTER"
                  ? routeByCode["R-CHARTER"]
                  : regionType === "COURIER"
                    ? routeByCode["R-COURIER"]
                    : routeByCode["R-OTHER"],
        },
      });
    }
  } catch (error) {
    await prisma.shipment.deleteMany({ where: { planSessionId: session.id } });
    await prisma.planSession.delete({ where: { id: session.id } }).catch(() => undefined);
    const message =
      error instanceof Error ? error.message.slice(0, 180) : "업로드 중 오류가 발생했습니다.";
    planRedirect("/plan", { error: `데이터 저장 실패: ${message}` });
  }

  const imported = await replaceExcelSchedule(parsed.rows);
  const defaultDate = parsed.dates[parsed.dates.length - 1]?.date;
  if (defaultDate) {
    await ensureDispatchGroups(session.id, defaultDate);
  }

  revalidatePath("/");
  revalidatePath("/plan");
  planRedirect("/", {
    date: defaultDate,
    ok: `처음 가져오기 완료 · ${imported}건이 일정으로 등록됨`,
  });
}

/** 해당 날짜 배차 그룹을 계산·저장. 이미 있어도 다시 계산. */
export async function ensureDispatchGroups(sessionId: string, date: string): Promise<number> {
  const shipments = await prisma.shipment.findMany({
    where: { planSessionId: sessionId, deliveryDate: date },
    include: { customer: true, product: true },
    orderBy: { createdAt: "asc" },
  });
  if (!shipments.length) return 0;

  const [vehicles, regions, loadings, settings] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    loadRegionLookup(),
    prisma.productLoadingMaster.findMany(),
    getDispatchSettings(),
  ]);

  const loadingByProduct = new Map(
    loadings.map((item) => [item.productCode, { boxesPerPallet: item.boxesPerPallet }]),
  );

  const rows = shipments.map((shipment) => ({
    rowNumber: 0,
    deliveryDate: shipment.deliveryDate,
    customerName: shipment.customer.customerName,
    location: shipment.location ?? shipment.customer.address ?? "",
    productCode: shipment.product.productCode,
    productName: shipment.product.productName,
    quantity: shipment.quantity,
    boxCount: shipment.boxCount,
    piecesPerBoxRaw: shipment.piecesPerBox,
    totalWeight: shipment.totalWeight,
    logistics: shipment.actualLogistics ?? "",
    staff: shipment.staff ?? "",
    notes: shipment.notes ?? "",
    issues: [] as string[],
  }));

  const drafts = buildDispatchGroups({
    rows,
    vehicles,
    regions,
    loadingByProduct,
    kgPerPallet: settings.kgPerPallet,
  });

  await prisma.dispatchGroup.deleteMany({
    where: { planSessionId: sessionId, dispatchDate: date },
  });

  for (const draft of drafts) {
    const shipmentIds = draft.shipmentIndexes.map((index) => shipments[index]?.id).filter(Boolean);
    await prisma.dispatchGroup.create({
      data: {
        dispatchDate: date,
        groupKey: draft.groupKey,
        regionType: draft.regionType,
        customerSummary: draft.customers.join(", "),
        totalBoxes: draft.totalBoxes,
        totalPallets: draft.totalPallets,
        shipmentIdsJson: JSON.stringify(shipmentIds),
        recommendedVehicleJson: draft.recommended ? JSON.stringify(draft.recommended) : null,
        selectedVehicleJson: draft.recommended ? JSON.stringify(draft.recommended) : null,
        actualLogisticsSummary: draft.actualLogistics.join(", ") || null,
        recommendationReason: draft.reasonLines.join("\n"),
        warningsJson: JSON.stringify(draft.warnings),
        matchStatus: draft.matchStatus,
        planSessionId: sessionId,
      },
    });
  }

  await prisma.appLog.create({
    data: {
      userAction: "plan_analyze",
      routeCode: date,
      recommendation: `${drafts.length} groups`,
    },
  });

  return drafts.length;
}

export async function analyzePlanDate(formData: FormData) {
  const sessionId = text(formData, "sessionId");
  const date = text(formData, "date");
  if (!sessionId || !date) {
    planRedirect("/plan", { error: "세션 또는 날짜가 없습니다. Excel을 다시 업로드하세요." });
  }

  const session = await prisma.planSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    planRedirect("/plan", { error: "업로드 세션이 만료되었습니다. 다시 업로드하세요." });
  }

  const count = await ensureDispatchGroups(sessionId, date);
  if (!count) {
    planRedirect("/plan/dispatch", {
      session: sessionId,
      date,
      error: "해당 날짜 납품 데이터가 없습니다.",
    });
  }

  revalidatePath("/plan/dispatch");
  planRedirect("/plan/dispatch", {
    session: sessionId,
    date,
    ok: `${count}개 배차 그룹 추천 완료`,
  });
}

export async function changeDispatchDate(formData: FormData) {
  const sessionId = text(formData, "sessionId");
  const date = text(formData, "date");
  if (!sessionId || !date) {
    planRedirect("/plan", { error: "세션/날짜를 확인하세요." });
  }
  await ensureDispatchGroups(sessionId, date);
  revalidatePath("/plan/dispatch");
  planRedirect("/plan/dispatch", { session: sessionId, date });
}

export async function saveGroupSelection(formData: FormData) {
  const sessionId = text(formData, "sessionId");
  const date = text(formData, "date");
  const groupId = text(formData, "groupId");
  const vehicleTypeId = text(formData, "vehicleTypeId");
  const reason = optionalText(formData, "overrideReason");

  const group = await prisma.dispatchGroup.findUnique({ where: { id: groupId } });
  const vehicle = await prisma.vehicleType.findUnique({ where: { id: vehicleTypeId } });
  if (!group || !vehicle) {
    planRedirect("/plan/dispatch", {
      session: sessionId,
      date,
      error: "배차 그룹 또는 차량을 확인하세요.",
    });
  }

  const recommended = group.recommendedVehicleJson
    ? (JSON.parse(group.recommendedVehicleJson) as { vehicleTypeId: string; vehicleCount: number })
    : null;
  const selected = {
    vehicleTypeId: vehicle.id,
    vehicleName: vehicle.vehicleName,
    vehicleCount: recommended?.vehicleCount ?? 1,
    maxPallet: vehicle.maxPallet,
    maxWeight: vehicle.maxWeight,
    loadingRate: null,
    primaryRegionType: vehicle.primaryRegionType,
    boxPreferred: vehicle.boxPreferred,
  };
  const manualOverride = Boolean(
    recommended && recommended.vehicleTypeId !== vehicle.id,
  );
  if (manualOverride && !reason) {
    planRedirect("/plan/dispatch", {
      session: sessionId,
      date,
      error: "추천과 다른 차량을 고르면 변경 사유가 필요합니다.",
    });
  }

  await prisma.dispatchGroup.update({
    where: { id: groupId },
    data: {
      selectedVehicleJson: JSON.stringify(selected),
      manualOverride,
      overrideReason: reason,
    },
  });

  revalidatePath("/plan/dispatch");
  planRedirect("/plan/dispatch", {
    session: sessionId,
    date,
    ok: manualOverride ? "수동 변경을 저장했습니다." : "추천안을 확정했습니다.",
  });
}
