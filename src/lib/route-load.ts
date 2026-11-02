import { capacityUnits } from "./schedule-box-loading";

/** 저장된 경로도 현재 납품의 PLT 기준으로 적재량을 표시한다. */
export function routePalletLoad(route: { stopIds: string[]; stopMemberIds?: string[][] }, entries: { id: string; palletCount: number | null; boxCount: number | null }[]): number {
  const ids = new Set(route.stopMemberIds ? route.stopMemberIds.flat() : route.stopIds);
  return Math.round(entries.filter((entry) => ids.has(entry.id)).reduce((sum, entry) => sum + capacityUnits(entry.palletCount, entry.boxCount), 0) * 10) / 10;
}
