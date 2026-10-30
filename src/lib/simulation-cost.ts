/** 거래처·지역별 한 번의 용차를 가정한다. 실제 운행 횟수가 아니다. */
export function estimateCharterTrips(items: { rowNumber: number; customer: string; location: string; transport: string; vehicle: string | null }[]): number {
  const charter = items.filter((item) => !item.vehicle && /용차/.test(item.transport));
  return new Set(charter.map((item) => item.customer.trim() ? `${item.customer.trim().replace(/\s+/g, " ")}|${item.location.trim().replace(/\s+/g, " ")}` : `미확인:${item.rowNumber}`)).size;
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
