import type { ComparisonShipment } from "./comparison-workbook";

export type PackingMode = "auto" | "unknown" | "shared" | "loose" | "pallet";
export type SimulationItem = ComparisonShipment & { vehicle: "1호차" | "2호차" | "스타리아" | null; lat: number | null; lng: number | null; pallets: number | null; weight: number | null; packing: PackingMode; address?: string | null; addressSource?: string; addressIssue?: string | null; region?: "capital" | "regional" | "unknown"; regionalGroup?: string | null };
export type SimulationRoute = { vehicle: string; items: SimulationItem[]; pallets: number; weight: number; unknownPallets: number; unknownWeight: number; distance: number | null; minutes: number | null; toll: number | null; fuel: number | null; over: boolean; maxPallet?: number; maxWeight?: number; fuelEconomy?: number; legs?: { from: string; to: string; distanceKm: number | null; minutes: number | null }[] };
export type CharterGroup = { items: SimulationItem[] };
export type RegionalScenario = { routes: SimulationRoute[]; remaining: SimulationItem[]; charterGroups: CharterGroup[]; note: string; error?: string; savedAt?: string; routeUpdatedAt?: string };
export type SimulationResult = { items: SimulationItem[]; original: SimulationRoute[]; proposed: SimulationRoute[]; remaining: SimulationItem[]; charterGroups: CharterGroup[] | null; regional?: RegionalScenario; note: string; warnings: string[]; savedAt?: string; routeUpdatedAt?: string; inputFingerprint?: string; candidateCount?: number; candidateCountVerified?: boolean; comparisonNote?: string; planSource?: string; restored?: boolean };

/** 같은 경고가 경로 새로고침 때 반복해서 붙지 않도록 한다. */
export function appendSimulationNotes(note: string, ...additions: string[]): string {
  let result = note.trim();
  for (const addition of additions) {
    const text = addition.trim();
    if (text && !result.includes(text)) result = result ? `${result} ${text}` : text;
  }
  return result;
}

export function parseSimulationAiOrders(value: unknown): { vehicle: string; ids: string[] }[] | null {
  if (!Array.isArray(value)) return null;
  const orders: { vehicle: string; ids: string[] }[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof row.vehicle !== "string" || !Array.isArray(row.ids) || row.ids.some((id: unknown) => typeof id !== "string" && typeof id !== "number")) return null;
    orders.push({ vehicle: row.vehicle, ids: row.ids.map(String) });
  }
  return orders;
}

/** 지방안만 재시도할 때 기존 계획과 일반 AI안의 값과 조회 시각을 보존한다. */
export function replaceRegionalScenario(stored: SimulationResult, regional: RegionalScenario, inputFingerprint: string): SimulationResult {
  return { ...stored, regional, inputFingerprint, restored: false };
}

/** AI가 반환한 ID를 검증한다. 자사 품목은 반드시 포함하고, 외부 품목은 0~1회만 포함한다. */
export function validateSimulationOrders(items: SimulationItem[], orders: { vehicle: string; ids: string[] }[], vehicles: string[] = ["1호차", "2호차"]): string | null {
  if (!Array.isArray(orders) || orders.length !== vehicles.length || new Set(orders.map((o) => o.vehicle)).size !== vehicles.length || orders.some((o) => !vehicles.includes(o.vehicle) || !Array.isArray(o.ids))) return "AI 차량 목록이 올바르지 않습니다.";
  const ids = orders.flatMap((o) => o.ids);
  if (new Set(ids).size !== ids.length || ids.some((id) => !items.some((item) => String(item.rowNumber) === id))) return "AI가 납품을 중복하거나 알 수 없는 품목을 반환했습니다.";
  const missing = items.filter((item) => item.vehicle && !ids.includes(String(item.rowNumber)));
  if (missing.length) return `AI가 기존 자사 납품을 누락했습니다: ${missing.map((item) => `${item.rowNumber}행 ${item.customer || "거래처 미확인"}`).join(", ")}.`;
  if (ids.some((id) => { const item = items.find((row) => String(row.rowNumber) === id)!; return !item.vehicle && !/용차|택배|경동/.test(item.transport); })) return "운송 방식이 확인되지 않은 품목은 옮길 수 없습니다.";
  if (ids.some((id) => { const item = items.find((row) => String(row.rowNumber) === id)!; return item.lat == null || item.lng == null; })) return "좌표가 없는 납품은 차량 경로에 포함할 수 없습니다.";
  return null;
}

/** 자사차로 이동하지 않은 용차 품목은 AI 용차 묶음에 빠짐없이 한 번만 포함한다. 다른 거래처 다중 경유를 허용한다. */
export function validateCharterGroups(items: SimulationItem[], orders: { vehicle: string; ids: string[] }[], groups: string[][]): string | null {
  if (!Array.isArray(groups) || groups.some((group) => !Array.isArray(group) || !group.length || group.some((id) => typeof id !== "string"))) return "AI 용차 묶음 형식이 올바르지 않습니다.";
  const assigned = new Set(orders.flatMap((order) => order.ids));
  const expected = items.filter((item) => !item.vehicle && /용차/.test(item.transport) && !assigned.has(String(item.rowNumber))).map((item) => String(item.rowNumber));
  const ids = groups.flat();
  if (new Set(ids).size !== ids.length || ids.length !== expected.length || ids.some((id) => !expected.includes(id))) return "AI 용차 묶음에 품목 누락 또는 중복이 있습니다.";
  return null;
}

/** AI 묶음이 유효하지 않을 때만 같은 거래처·같은 지역 기준으로 보수적으로 묶는다. */
export function fallbackCharterGroups(items: SimulationItem[], orders: { vehicle: string; ids: string[] }[]): string[][] {
  const assigned = new Set(orders.flatMap((order) => order.ids));
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const id = String(item.rowNumber);
    if (item.vehicle || !/용차/.test(item.transport) || assigned.has(id)) continue;
    const customer = item.customer.trim().replace(/\s+/g, " ");
    const location = item.location.trim().replace(/\s+/g, " ");
    const key = customer && location ? JSON.stringify([customer, location]) : JSON.stringify(["미확인", id]);
    const group = groups.get(key) ?? [];
    group.push(id);
    groups.set(key, group);
  }
  return [...groups.values()];
}
