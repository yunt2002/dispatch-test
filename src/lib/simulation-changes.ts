import type { SimulationResult } from "./simulation";

export function simulationChanges(result: SimulationResult) {
  const originalRows = new Set(result.original.flatMap((route) => route.items.map((item) => item.rowNumber)));
  const proposed = new Map(result.proposed.flatMap((route) => route.items.map((item) => [item.rowNumber, route.vehicle] as const)));
  const groups = new Map<string, { from: string; to: string; items: typeof result.items }>();
  const unknown = result.items.filter((item) => item.vehicle && (!originalRows.has(item.rowNumber) || !proposed.has(item.rowNumber)));
  for (const item of result.items) {
    if (unknown.includes(item)) continue;
    const from = item.vehicle ?? (item.transport.trim() || "운송 미확인");
    const to = proposed.get(item.rowNumber) ?? from;
    if (from === to) continue;
    const key = JSON.stringify([from, to]);
    const group = groups.get(key) ?? { from, to, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  const orderChanges = result.original.flatMap((route) => {
    const next = result.proposed.find((entry) => entry.vehicle === route.vehicle);
    if (!next) return [];
    const nextIds = new Set(next.items.map((item) => item.rowNumber));
    const originalIds = new Set(route.items.map((item) => item.rowNumber));
    const before = route.items.filter((item) => nextIds.has(item.rowNumber)).map((item) => item.rowNumber);
    const after = next.items.filter((item) => originalIds.has(item.rowNumber)).map((item) => item.rowNumber);
    return before.length > 1 && before.some((id, index) => id !== after[index]) ? [route.vehicle] : [];
  });
  return { groups: [...groups.values()], unknown, orderChanges };
}
