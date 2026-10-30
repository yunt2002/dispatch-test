type SavedRouteScope = {
  routes: { stopIds: string[]; stopMemberIds?: string[][] }[];
  unassigned: string[];
};

/** 이전 경로가 현재 표시할 납품 전체와 정확히 일치하는지 확인한다. */
export function snapshotMatchesScope(result: SavedRouteScope, currentIds: string[]): boolean {
  const savedIds = result.routes.flatMap((route) => route.stopMemberIds ? route.stopMemberIds.flat() : route.stopIds).concat(result.unassigned);
  const saved = new Set(savedIds);
  const current = new Set(currentIds);
  return saved.size === savedIds.length && saved.size === current.size && [...saved].every((id) => current.has(id));
}
