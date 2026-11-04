/** 거래처·지역별 한 번의 용차를 가정한다. 실제 운행 횟수가 아니다. */
export function estimateCharterTrips(items: { rowNumber: number; customer: string; location: string; transport: string; vehicle: string | null }[]): number {
  const charter = items.filter((item) => !item.vehicle && /용차/.test(item.transport));
  return new Set(charter.map((item) => item.customer.trim() ? `${item.customer.trim().replace(/\s+/g, " ")}|${item.location.trim().replace(/\s+/g, " ")}` : `미확인:${item.rowNumber}`)).size;
}

type Destination = { rowNumber: number; customer: string; location: string };
export function charterDestinationKey(item: Destination): string {
  return item.customer.trim() ? JSON.stringify([item.customer.trim().replace(/\s+/g, " "), item.location.trim().replace(/\s+/g, " ")]) : `row:${item.rowNumber}`;
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

/** 운행별 목적지 금액. 한 운행에 서로 다른 목적지가 있으면 운임을 임의 합산하지 않는다. */
export function charterGroupsCost(groups: { items: Destination[] }[], fares: Record<string, string>): number | null {
  let total = 0;
  for (const group of groups) {
    const keys = [...new Set(group.items.map(charterDestinationKey))];
    if (keys.length !== 1) return null;
    const value = fares[keys[0]];
    if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return null;
    total += Number(value);
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

/** 미입력 운임은 예시 금액을 사용하며 잘못 입력한 값은 계산하지 않는다. */
export function estimatedCharterGroupsCost(groups: { items: Destination[] }[], fares: Record<string, string>): number | null {
  let total = 0;
  for (const group of groups) {
    const keys = [...new Set(group.items.map(charterDestinationKey))];
    if (!keys.length) return null;
    const entered = keys.filter((key) => fares[key] !== undefined && fares[key] !== "");
    if (keys.length > 1 && entered.length) return null;
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
  original: { items: { rowNumber: number }[]; minutes: number | null }[];
  proposed: { items: { rowNumber: number }[]; minutes: number | null }[];
}): boolean {
  if (result.original.length !== 2 || result.proposed.length !== 2) return false;
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

export function simulationCostIssues(routes: { label: string; routes: { vehicle: string; items: unknown[]; distance: number | null; fuel: number | null; toll: number | null }[] }[], originalTrips: string, originalHasCharter: boolean): string[] {
  const issues: string[] = [];
  for (const plan of routes) for (const route of plan.routes) {
    if (!route.items.length) continue;
    const missing = route.distance == null ? "카카오 경로" : [route.fuel == null ? "경유비" : null, route.toll == null ? "통행료" : null].filter(Boolean).join("·");
    if (missing) issues.push(`${plan.label} ${route.vehicle}: ${missing} 미확인`);
  }
  if (!/^\d+$/.test(originalTrips) || !Number.isSafeInteger(Number(originalTrips)) || (originalHasCharter ? Number(originalTrips) < 1 : Number(originalTrips) !== 0)) issues.push("기존 용차 운행 횟수 확인 필요");
  return issues;
}
