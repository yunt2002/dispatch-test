import type { ComparisonShipment } from "./comparison-workbook";

export type PackingMode = "unknown" | "shared" | "loose" | "pallet";
export type SimulationItem = ComparisonShipment & { vehicle: "1호차" | "2호차" | null; lat: number | null; lng: number | null; pallets: number | null; weight: number | null; packing: PackingMode };
export type SimulationRoute = { vehicle: string; items: SimulationItem[]; pallets: number; weight: number; unknownPallets: number; unknownWeight: number; distance: number | null; minutes: number | null; toll: number | null; fuel: number | null; over: boolean };
export type CharterGroup = { items: SimulationItem[] };
export type SimulationResult = { items: SimulationItem[]; original: SimulationRoute[]; proposed: SimulationRoute[]; remaining: SimulationItem[]; charterGroups: CharterGroup[] | null; note: string; warnings: string[] };

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

/** 자사차로 이동하지 않은 용차 품목은 AI 용차 묶음에 빠짐없이 한 번만 포함한다. */
export function validateCharterGroups(items: SimulationItem[], orders: { vehicle: string; ids: string[] }[], groups: string[][]): string | null {
  if (!Array.isArray(groups) || groups.some((group) => !Array.isArray(group) || !group.length || group.some((id) => typeof id !== "string"))) return "AI 용차 묶음 형식이 올바르지 않습니다.";
  const assigned = new Set(orders.flatMap((order) => order.ids));
  const expected = items.filter((item) => !item.vehicle && /용차/.test(item.transport) && !assigned.has(String(item.rowNumber))).map((item) => String(item.rowNumber));
  const ids = groups.flat();
  if (new Set(ids).size !== ids.length || ids.length !== expected.length || ids.some((id) => !expected.includes(id))) return "AI 용차 묶음에 품목 누락 또는 중복이 있습니다.";
  for (const group of groups) {
    const grouped = group.map((id) => items.find((item) => String(item.rowNumber) === id)!);
    const first = grouped[0];
    if (grouped.some((item) => {
      const sameCustomer = !!item.customer.trim() && item.customer.trim() === first.customer.trim() && item.location.trim() === first.location.trim();
      const samePoint = item.lat != null && first.lat != null && item.lng != null && first.lng != null && Math.abs(item.lat - first.lat) < 0.0005 && Math.abs(item.lng - first.lng) < 0.0005;
      return !sameCustomer && !samePoint;
    })) return "서로 다른 납품지를 한 용차로 묶은 제안은 경유·운임 확인이 필요합니다. 같은 납품지만 묶어 다시 제안하세요.";
  }
  return null;
}
