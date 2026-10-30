/** 거래처·지역별 한 번의 용차를 가정한다. 실제 운행 횟수가 아니다. */
export function estimateCharterTrips(items: { rowNumber: number; customer: string; location: string; transport: string; vehicle: string | null }[]): number {
  const charter = items.filter((item) => !item.vehicle && /용차/.test(item.transport));
  return new Set(charter.map((item) => item.customer.trim() ? `${item.customer.trim().replace(/\s+/g, " ")}|${item.location.trim().replace(/\s+/g, " ")}` : `미확인:${item.rowNumber}`)).size;
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
