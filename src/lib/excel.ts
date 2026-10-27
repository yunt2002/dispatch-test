import ExcelJS from "exceljs";
import { parseJson } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { VehicleCombination } from "@/engine/types";

function comboLabel(raw: string | null): string {
  const combo = parseJson<VehicleCombination | null>(raw, null);
  if (!combo) return "";
  return `${combo.vehicleName} × ${combo.vehicleCount}`;
}

export async function buildDispatchWorkbook(dispatchDate: string): Promise<Buffer> {
  const [results, shipments] = await Promise.all([
    prisma.dispatchResult.findMany({
      where: { dispatchDate },
      include: { route: true },
      orderBy: { route: { routeCode: "asc" } },
    }),
    prisma.shipment.findMany({
      where: { deliveryDate: dispatchDate },
      include: { customer: true, product: true, route: true },
      orderBy: [{ routeId: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const resultByRoute = new Map(results.map((item) => [item.routeId, item]));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("배차결과");

  sheet.columns = [
    { header: "배차일", key: "date", width: 14 },
    { header: "루트", key: "route", width: 14 },
    { header: "거래처", key: "customer", width: 16 },
    { header: "제품", key: "product", width: 20 },
    { header: "수량", key: "quantity", width: 10 },
    { header: "중량(kg)", key: "weight", width: 12 },
    { header: "추천 차량", key: "recommended", width: 18 },
    { header: "차량 대수", key: "count", width: 10 },
    { header: "적재율", key: "rate", width: 10 },
    { header: "예상 비용", key: "cost", width: 14 },
    { header: "최종 선택", key: "selected", width: 18 },
    { header: "비고", key: "notes", width: 36 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const shipment of shipments) {
    const result = shipment.routeId ? resultByRoute.get(shipment.routeId) : undefined;
    const recommended = parseJson<VehicleCombination | null>(
      result?.recommendedCombinationJson ?? null,
      null,
    );
    sheet.addRow({
      date: dispatchDate,
      route: shipment.route?.routeCode ?? "",
      customer: shipment.customer.customerName,
      product: shipment.product.productName,
      quantity: shipment.quantity,
      weight: shipment.totalWeight,
      recommended: comboLabel(result?.recommendedCombinationJson ?? null),
      count: recommended?.vehicleCount ?? "",
      rate: recommended ? `${recommended.loadingRate.toFixed(1)}%` : "",
      cost: recommended?.estimatedCost ?? "",
      selected: comboLabel(result?.selectedCombinationJson ?? null),
      notes: shipment.notes ?? result?.overrideReason ?? "",
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
