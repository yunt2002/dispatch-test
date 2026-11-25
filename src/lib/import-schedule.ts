import { Prisma } from "@prisma/client";
import type { NormalizedShipment, RegionLookup } from "@/lib/delivery-excel";
import { recommendForQuantity } from "@/lib/dispatch-group";
import { prisma } from "@/lib/prisma";
import { getDispatchSettings } from "@/lib/settings";
import { randomUUID } from "node:crypto";
import { boxLoadingKey, boxLoadingTargetKey } from "@/lib/schedule-box-loading";
import { excludePreservedImportRows, scheduleImportMatchSelect } from "@/lib/schedule-import-rows";

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

/** 엑셀에 포함된 날짜의 엑셀 신청만 교체하고 확정·완료·취소 이력을 보존한다. */
export async function replaceExcelSchedule(rows: NormalizedShipment[]): Promise<number> {
  const usable = rows.filter((row) => row.deliveryDate && row.customerName);
  if (!usable.length) return 0;
  const [vehicles, regions, settings] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    loadRegions(),
    getDispatchSettings(),
  ]);

  const data = usable.map((row) => {
    const rec = recommendForQuantity({
      locationName: row.location,
      boxCount: row.boxCount,
      palletCount: row.palletCount,
      productCode: row.productCode,
      productName: row.productName,
      vehicles,
      regions,
      kgPerPallet: settings.kgPerPallet,
    });
    return {
      id: randomUUID(),
      deliveryDate: row.deliveryDate,
      locationName: row.location || "",
      regionType: rec.regionType,
      customerName: row.customerName,
      productCode: row.productCode || null,
      productName: row.productName || null,
      quantity: row.quantity,
      boxCount: row.boxCount,
      piecesPerBox: row.piecesPerBoxRaw,
      palletCount: row.palletCount === null ? null : rec.palletCount,
      recommendedVehicleJson: rec.recommended ? JSON.stringify(rec.recommended) : null,
      selectedVehicleJson: rec.recommended ? JSON.stringify(rec.recommended) : null,
      recommendationReason: rec.reasonLines.join("\n"),
      warningsJson: JSON.stringify(rec.warnings),
      logistics: rec.recommended?.vehicleName || row.logistics || null,
      staff: row.staff || null,
      notes: row.notes || null,
      status: "PLANNED",
      source: "EXCEL",
    };
  });

  return prisma.$transaction(async (tx) => {
    const scope = { source: "EXCEL", deliveryDate: { in: [...new Set(data.map((row) => row.deliveryDate))] } };
    const existing = await tx.scheduleEntry.findMany({
      where: scope,
      select: { id: true, status: true, ...scheduleImportMatchSelect },
    });
    const replaceIds = existing.filter((row) => row.status === "PLANNED").map((row) => row.id);
    const preserved = existing.filter((row) => row.status !== "PLANNED");
    const toCreate = excludePreservedImportRows(data, preserved, (row, index) => ({
      ...row, palletCount: usable[index].palletCount,
    }));

    if (replaceIds.length) {
      await tx.scheduleEntry.deleteMany({ where: { ...scope, status: "PLANNED" } });
      const keys = replaceIds.flatMap((id) => [boxLoadingKey(id), boxLoadingTargetKey(id)]);
      await tx.appSetting.deleteMany({ where: { key: { in: keys } } });
    }
    if (toCreate.length) {
      await tx.scheduleEntry.createMany({ data: toCreate });
      const boxSettings = toCreate.filter((item) => item.boxCount != null && item.boxCount > 0).map((item) => ({ key: boxLoadingKey(item.id), value: "unknown" }));
      if (boxSettings.length) await tx.appSetting.createMany({ data: boxSettings });
    }
    return toCreate.length;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** 이미 업로드된 최신 Excel 세션이 있으면 일정으로 한 번 옮긴다. */
export async function importLatestExcelIfNeeded(): Promise<number> {
  const existing = await prisma.scheduleEntry.count({ where: { source: "EXCEL" } });
  if (existing > 0) return 0;

  const session = await prisma.planSession.findFirst({ orderBy: { createdAt: "desc" } });
  if (!session) return 0;

  const shipments = await prisma.shipment.findMany({
    where: { planSessionId: session.id },
    include: { customer: true, product: true },
    orderBy: { createdAt: "asc" },
  });
  if (!shipments.length) return 0;

  const rows: NormalizedShipment[] = shipments.map((shipment) => ({
    rowNumber: 0,
    deliveryDate: shipment.deliveryDate,
    customerName: shipment.customer.customerName,
    location: shipment.location ?? "",
    productCode: shipment.product.productCode,
    productName: shipment.product.productName,
    quantity: shipment.quantity,
    boxCount: shipment.boxCount,
    palletCount: shipment.palletCount ?? undefined,
    piecesPerBoxRaw: shipment.piecesPerBox,
    totalWeight: shipment.totalWeight,
    logistics: shipment.actualLogistics ?? "",
    staff: shipment.staff ?? "",
    notes: shipment.notes ?? "",
    issues: [],
  }));

  try {
    return await replaceExcelSchedule(rows);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return 0;
    throw error;
  }
}
