/** 거래처·지역별 한 번의 용차를 가정한다. 실제 운행 횟수가 아니다. */
export function estimateCharterTrips(items: { rowNumber: number; customer: string; location: string; transport: string; vehicle: string | null }[]): number {
  const charter = items.filter((item) => !item.vehicle && /용차/.test(item.transport));
  return new Set(charter.map((item) => item.customer.trim() ? `${item.customer.trim().replace(/\s+/g, " ")}|${item.location.trim().replace(/\s+/g, " ")}` : `미확인:${item.rowNumber}`)).size;
}

type Destination = { rowNumber: number; customer: string; location: string };
export function charterDestinationKey(item: Destination): string {
  return item.customer.trim() ? JSON.stringify([item.customer.trim().replace(/\s+/g, " "), item.location.trim().replace(/\s+/g, " ")]) : `row:${item.rowNumber}`;
}

export type CharterLeg = "one_way" | "round_trip";

/** 한 번의 용차 출고. 운임은 운행 1건에 1금액(편도·왕복 패키지). */
export type CharterTrip = {
  id: string;
  leg: CharterLeg;
  rowNumbers: number[];
  fare: string;
  excluded?: boolean;
};

export function isCharterLeg(value: unknown): value is CharterLeg {
  return value === "one_way" || value === "round_trip";
}

export function parseCharterTrips(raw: unknown): CharterTrip[] {
  if (!Array.isArray(raw)) return [];
  const trips: CharterTrip[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    if (!isCharterLeg(row.leg)) continue;
    if (!Array.isArray(row.rowNumbers) || !row.rowNumbers.every((n) => typeof n === "number" && Number.isInteger(n))) continue;
    if (typeof row.fare !== "string" || !/^\d*$/.test(row.fare)) continue;
    const rowNumbers = [...new Set(row.rowNumbers as number[])].sort((a, b) => a - b);
    if (!rowNumbers.length) continue;
    trips.push({ id: row.id, leg: row.leg, rowNumbers, fare: row.fare, ...(row.excluded === true ? { excluded: true } : {}) });
  }
  return trips;
}

/** 비교 대상 중 용차가 필요한 목적지만 중복 없이 표시한다. */
export function charterFareDestinations<T extends Destination>(original: (T & { vehicle: string | null; transport: string })[], proposed: { items: T[] }[] | null, regional?: { charterGroups: { items: T[] }[]; error?: string }): [string, T][] {
  const items = [
    ...original.filter((item) => !item.vehicle && /용차/.test(item.transport)),
    ...(proposed ?? []).flatMap((group) => group.items),
    ...(regional && !regional.error ? regional.charterGroups.flatMap((group) => group.items) : []),
  ];
  return [...new Map(items.map((item) => [charterDestinationKey(item), item])).entries()];
}

export function charterItemsFromPlan<T extends { rowNumber: number; customer: string; location: string; transport: string; vehicle: string | null }>(items: T[]): T[] {
  return items.filter((item) => !item.vehicle && /용차/.test(item.transport));
}

/** 기존 계획: 거래처·지역별 기본 편도 운행. */
export function defaultOriginalCharterTrips<T extends Destination>(items: T[]): CharterTrip[] {
  const groups = new Map<string, number[]>();
  for (const item of items) {
    const key = charterDestinationKey(item);
    const list = groups.get(key) ?? [];
    list.push(item.rowNumber);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, rowNumbers]) => ({
    id: `original:${key}`,
    leg: "one_way" as const,
    rowNumbers: [...new Set(rowNumbers)].sort((a, b) => a - b),
    fare: "",
  }));
}

/** 저장된 운행이 현재 용차 품목을 모두 포함하면 복원, 아니면 기본 운행. */
export function syncOriginalCharterTrips<T extends Destination>(items: T[], saved: CharterTrip[] | null | undefined): CharterTrip[] {
  const defaults = defaultOriginalCharterTrips(items);
  const rows = new Set(items.map((item) => item.rowNumber));
  if (!saved?.length || !rows.size) return defaults;
  const cleaned = saved
    .map((trip) => ({
      ...trip,
      rowNumbers: [...new Set(trip.rowNumbers.filter((row) => rows.has(row)))].sort((a, b) => a - b),
    }))
    .filter((trip) => trip.rowNumbers.length);
  const covered = new Set(cleaned.flatMap((trip) => trip.rowNumbers));
  if (![...rows].every((row) => covered.has(row))) return defaults;
  return cleaned;
}

export function charterGroupTripId(rowNumbers: number[], prefix: string): string {
  return `${prefix}:${[...new Set(rowNumbers)].sort((a, b) => a - b).join(",")}`;
}

/** AI 결과의 용차 품목과 묶음이 같은 경우에만 사용자의 수정안을 복원한다. */
export function charterGroupsSignature(groups: { items: { rowNumber: number }[] }[]): string {
  return JSON.stringify(groups.map((group) => [...new Set(group.items.map((item) => item.rowNumber))].sort((a, b) => a - b)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export function restoreEditedCharterTrips<T extends Destination>(groups: { items: T[] }[], saved: CharterTrip[], savedSignature: unknown): CharterTrip[] {
  const defaults = tripsFromCharterGroups(groups, "proposed", saved);
  if (savedSignature !== charterGroupsSignature(groups)) return defaults;
  const expected = groups.flatMap((group) => group.items.map((item) => item.rowNumber)).sort((a, b) => a - b);
  const actual = saved.filter((trip) => !trip.id.includes(":return:")).flatMap((trip) => trip.rowNumbers).sort((a, b) => a - b);
  const validReturns = saved.filter((trip) => trip.id.includes(":return:")).every((trip) => trip.rowNumbers.every((row) => expected.includes(row)));
  return JSON.stringify(expected) === JSON.stringify(actual) && validReturns ? saved : defaults;
}

/** AI·지방 집중 묶음을 운행 목록으로 만든다. 저장된 leg/fare가 있으면 유지. */
export function tripsFromCharterGroups<T extends Destination>(
  groups: { items: T[] }[],
  prefix: string,
  saved: CharterTrip[] | null | undefined = null,
): CharterTrip[] {
  const byId = new Map((saved ?? []).map((trip) => [trip.id, trip]));
  return groups.map((group) => {
    const rowNumbers = [...new Set(group.items.map((item) => item.rowNumber))].sort((a, b) => a - b);
    const id = charterGroupTripId(rowNumbers, prefix);
    const prev = byId.get(id);
    return {
      id,
      leg: prev?.leg ?? "one_way",
      rowNumbers,
      fare: prev?.fare ?? "",
    };
  });
}

export function tripLabel(
  trip: CharterTrip,
  itemsByRow: Map<number, { customer: string; location: string }>,
): string {
  const stops: string[] = [];
  for (const row of trip.rowNumbers) {
    const item = itemsByRow.get(row);
    const name = item?.customer?.trim() || `행 ${row}`;
    const place = item?.location?.trim();
    const label = place ? `${name}(${place})` : name;
    if (!stops.includes(label)) stops.push(label);
  }
  const mid = stops.join(" → ") || "목적지 미확인";
  if (trip.id.includes(":return:")) return `${mid} → 네오 (회수)`;
  return trip.leg === "round_trip" ? `네오 → ${mid} → 네오` : `네오 → ${mid}`;
}

export function mergeCharterTrips(trips: CharterTrip[], selectedIds: string[]): CharterTrip[] {
  const selected = trips.filter((trip) => selectedIds.includes(trip.id));
  if (selected.length < 2) return trips;
  const rest = trips.filter((trip) => !selectedIds.includes(trip.id));
  return [
    ...rest,
    {
      id: `original:merged:${Date.now()}`,
      leg: selected.some((trip) => trip.leg === "round_trip") ? "round_trip" : "one_way",
      rowNumbers: [...new Set(selected.flatMap((trip) => trip.rowNumbers))].sort((a, b) => a - b),
      fare: selected.find((trip) => trip.fare)?.fare ?? "",
    },
  ];
}

export function splitCharterTrip<T extends Destination>(trip: CharterTrip, items: T[]): CharterTrip[] {
  const subset = items.filter((item) => trip.rowNumbers.includes(item.rowNumber));
  return defaultOriginalCharterTrips(subset).map((part) => ({
    ...part,
    leg: trip.leg,
    fare: trip.fare,
  }));
}

export function addReturnCharterTrip(trip: CharterTrip): CharterTrip {
  return {
    id: `original:return:${trip.id}:${Date.now()}`,
    leg: "one_way",
    rowNumbers: [...trip.rowNumbers],
    fare: "",
  };
}

function parseFare(fare: string): number | null {
  const value = fare.trim() === "" ? "200000" : fare.trim();
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return null;
  return Number(value);
}

/** 운행 단위 운임 합계. 다중 경유도 운행당 1금액. 미입력은 20만 원 가정. */
export function estimatedTripsCost(trips: CharterTrip[]): number | null {
  let total = 0;
  for (const trip of trips) {
    if (trip.excluded) continue;
    if (!trip.rowNumbers.length) return null;
    const amount = parseFare(trip.fare);
    if (amount == null) return null;
    total += amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

/** @deprecated 목적지 키 기반 — 테스트 호환용. 다중 목적지는 운행 단위 fare로 합산한다. */
export function charterGroupsCost(groups: { items: Destination[] }[], fares: Record<string, string>): number | null {
  let total = 0;
  for (const group of groups) {
    const keys = [...new Set(group.items.map(charterDestinationKey))];
    if (!keys.length) return null;
    if (keys.length === 1) {
      const value = fares[keys[0]];
      if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return null;
      total += Number(value);
    } else {
      const entered = keys.map((key) => fares[key]).filter((value): value is string => typeof value === "string" && value !== "");
      if (entered.length !== 1) return null;
      if (!/^\d+$/.test(entered[0]) || !Number.isSafeInteger(Number(entered[0]))) return null;
      total += Number(entered[0]);
    }
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

/** @deprecated 그룹+목적지 키 — 신규는 estimatedTripsCost 사용. 다중 경유 1운행은 미입력 시 20만. */
export function estimatedCharterGroupsCost(groups: { items: Destination[] }[], fares: Record<string, string>): number | null {
  let total = 0;
  for (const group of groups) {
    const keys = [...new Set(group.items.map(charterDestinationKey))];
    if (!keys.length) return null;
    const entered = keys.filter((key) => fares[key] !== undefined && fares[key] !== "");
    if (keys.length > 1 && entered.length > 1) return null;
    const value = entered.length ? fares[entered[0]] : "200000";
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return null;
    total += Number(value);
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function estimatedOriginalCharterCost(groups: { items: Destination[] }[], fares: Record<string, string>, trips: string): number | null {
  if (!/^\d+$/.test(trips) || !Number.isSafeInteger(Number(trips)) || (groups.length ? Number(trips) < 1 : Number(trips) !== 0)) return null;
  if (Number(trips) === groups.length) return estimatedCharterGroupsCost(groups, fares);
  if (groups.some((group) => group.items.some((item) => fares[charterDestinationKey(item)]))) return null;
  const total = Number(trips) * 200000;
  return Number.isSafeInteger(total) ? total : null;
}

/** 적재 초과는 실행 불가 경고이며 비용 자료의 누락과는 별개다. */
export function hasComparableRoutes(result: {
  items: { rowNumber: number; vehicle: string | null }[];
  original: { vehicle?: string; items: { rowNumber: number }[]; minutes: number | null }[];
  proposed: { vehicle?: string; items: { rowNumber: number }[]; minutes: number | null }[];
}): boolean {
  if (![2, 3].includes(result.original.length) || result.original.length !== result.proposed.length) return false;
  if (result.items.some((item) => item.vehicle === "스타리아") || [...result.original, ...result.proposed].some((route) => route.vehicle === "스타리아")) {
    if (result.original.length !== 3 || !result.original.some((route) => route.vehicle === "스타리아") || !result.proposed.some((route) => route.vehicle === "스타리아")) return false;
  }
  const originalIds = new Set(result.original.flatMap((route) => route.items.map((item) => item.rowNumber)));
  const proposedIds = new Set(result.proposed.flatMap((route) => route.items.map((item) => item.rowNumber)));
  if (result.items.some((item) => item.vehicle && (!originalIds.has(item.rowNumber) || !proposedIds.has(item.rowNumber)))) return false;
  return [...result.original, ...result.proposed].every((route) => !route.items.length || route.minutes != null);
}

export function estimateSimulationCost(input: { originalVehicle: number | null; proposedVehicle: number | null; originalTrips: string; proposedTrips: string; originalHasCharter: boolean; proposedHasCharter: boolean }): { original: number; proposed: number; saving: number } | null {
  const { originalVehicle, proposedVehicle, originalTrips, proposedTrips, originalHasCharter, proposedHasCharter } = input;
  if (originalVehicle == null || proposedVehicle == null || !/^\d+$/.test(originalTrips) || !/^\d+$/.test(proposedTrips)) return null;
  const before = Number(originalTrips); const after = Number(proposedTrips);
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || (originalHasCharter ? before < 1 : before !== 0) || (proposedHasCharter ? after < 1 : after !== 0)) return null;
  const original = originalVehicle + before * 200000;
  const proposed = proposedVehicle + after * 200000;
  return { original, proposed, saving: original - proposed };
}

export function simulationCostIssues(routes: { label: string; routes: { vehicle: string; items: unknown[]; distance: number | null; fuel: number | null; toll: number | null }[] }[], originalTripCount: number, originalHasCharter: boolean): string[] {
  const issues: string[] = [];
  for (const plan of routes) for (const route of plan.routes) {
    if (!route.items.length) continue;
    const missing = route.distance == null ? "카카오 경로" : [route.fuel == null ? "경유비" : null, route.toll == null ? "통행료" : null].filter(Boolean).join("·");
    if (missing) issues.push(`${plan.label} ${route.vehicle}: ${missing} 미확인`);
  }
  if (!Number.isSafeInteger(originalTripCount) || (originalHasCharter ? originalTripCount < 1 : originalTripCount !== 0)) {
    issues.push("기존 용차 운행 횟수 확인 필요");
  }
  return issues;
}
