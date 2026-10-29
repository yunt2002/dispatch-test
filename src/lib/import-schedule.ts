import type { NormalizedShipment, RegionLookup } from "@/lib/delivery-excel";
import { recommendForQuantity } from "@/lib/dispatch-group";
import { prisma } from "@/lib/prisma";
import { getDispatchSettings } from "@/lib/settings";

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

/** Excel 행을 일정으로 넣는다. 기존 Excel 출처 일정은 교체한다. */
export async function replaceExcelSchedule(rows: NormalizedShipment[]): Promise<number> {
  const usable = rows.filter((row) => row.deliveryDate && row.customerName);
  const [vehicles, regions, settings] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    loadRegions(),
    getDispatchSettings(),
  ]);

  const data = usable.map((row) => {
    const rec = recommendForQuantity({
      locationName: row.location,
      boxCount: row.boxCount,
      productCode: row.productCode,
      productName: row.productName,
      vehicles,
      regions,
      kgPerPallet: settings.kgPerPallet,
    });
    return {
      deliveryDate: row.deliveryDate,
      locationName: row.location || "",
      regionType: rec.regionType,
      customerName: row.customerName,
      productCode: row.productCode || null,
      productName: row.productName || null,
      quantity: row.quantity,
      boxCount: row.boxCount,
      piecesPerBox: row.piecesPerBoxRaw,
      palletCount: rec.palletCount,
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

  // 삭제→생성은 한 트랜잭션. 중간에 실패하면 기존 EXCEL 일정이 유지된다.
  await prisma.$transaction(async (tx) => {
    await tx.scheduleEntry.deleteMany({ where: { source: "EXCEL" } });
    if (data.length) {
      await tx.scheduleEntry.createMany({ data });
    }
  });
  return data.length;
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
    piecesPerBoxRaw: shipment.piecesPerBox,
    totalWeight: shipment.totalWeight,
    logistics: shipment.actualLogistics ?? "",
    staff: shipment.staff ?? "",
    notes: shipment.notes ?? "",
    issues: [],
  }));

  return replaceExcelSchedule(rows);
}
