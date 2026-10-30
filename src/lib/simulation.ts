import type { ComparisonShipment } from "./comparison-workbook";

export type SimulationItem = ComparisonShipment & { vehicle: "1호차" | "2호차" | null; lat: number | null; lng: number | null; pallets: number | null; weight: number | null };
export type SimulationRoute = { vehicle: string; items: SimulationItem[]; pallets: number; weight: number; unknownPallets: number; unknownWeight: number; distance: number | null; minutes: number | null; toll: number | null; fuel: number | null; over: boolean };
export type SimulationResult = { items: SimulationItem[]; original: SimulationRoute[]; proposed: SimulationRoute[]; remaining: SimulationItem[]; note: string; warnings: string[] };

/** AI가 반환한 ID를 검증한다. 자사 품목은 반드시 포함하고, 외부 품목은 0~1회만 포함한다. */
export function validateSimulationOrders(items: SimulationItem[], orders: { vehicle: string; ids: string[] }[]): string | null {
  if (!Array.isArray(orders) || orders.length !== 2 || new Set(orders.map((o) => o.vehicle)).size !== 2 || orders.some((o) => !["1호차", "2호차"].includes(o.vehicle) || !Array.isArray(o.ids))) return "AI 차량 목록이 올바르지 않습니다.";
  const ids = orders.flatMap((o) => o.ids);
  if (new Set(ids).size !== ids.length || ids.some((id) => !items.some((item) => String(item.rowNumber) === id))) return "AI가 납품을 중복하거나 알 수 없는 품목을 반환했습니다.";
  if (items.some((item) => item.vehicle && !ids.includes(String(item.rowNumber)))) return "AI가 기존 자사 납품을 누락했습니다.";
  if (ids.some((id) => { const item = items.find((row) => String(row.rowNumber) === id)!; return !item.vehicle && !/용차|택배|경동/.test(item.transport); })) return "운송 방식이 확인되지 않은 품목은 옮길 수 없습니다.";
  if (ids.some((id) => { const item = items.find((row) => String(row.rowNumber) === id)!; return item.lat == null || item.lng == null; })) return "좌표가 없는 납품은 차량 경로에 포함할 수 없습니다.";
  return null;
}
