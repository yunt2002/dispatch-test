import { snapshotMatchesScope } from "./route-snapshot-scope";

export const CHARTER_GROUPING_VERSION = 1;

type SavedConfirmedRoute = {
  signature: string;
  charterGroupingVersion?: number;
  result: {
    routes: { isCharter?: boolean; stopIds: string[]; stopMemberIds?: string[][]; path?: { lat: number; lng: number }[] }[];
    unassigned: string[];
  };
};

export function hasStaleCharterGrouping(saved: SavedConfirmedRoute): boolean {
  return saved.charterGroupingVersion !== CHARTER_GROUPING_VERSION &&
    saved.result.routes.some((route) => route.isCharter);
}

/** 전체 지도에서는 개별 묶음의 최신 저장 경로만 선으로 표시한다. */
export function confirmedRouteState(saved: SavedConfirmedRoute | null, signature: string, currentIds: string[]): "ready" | "stale" | "missing" {
  if (!saved) return "missing";
  if (hasStaleCharterGrouping(saved) || saved.signature !== signature || !snapshotMatchesScope(saved.result, currentIds) || saved.result.routes.some((route) => !route.stopMemberIds)) return "stale";
  return saved.result.routes.length > 0 && saved.result.routes.every((route) => route.path && route.path.length >= 2) ? "ready" : "missing";
}
