import type { SimulationRoute } from "./simulation";

export type RouteFieldReadiness = "ready" | "unknown_load" | "over";

/** 알려진 한도만으로 운행 가능을 단정하지 않는다. 미확인 적재는 현장 확인 전으로 본다. */
export function routeFieldReadiness(route: SimulationRoute): RouteFieldReadiness {
  if (route.over) return "over";
  if (route.unknownPallets > 0 || route.unknownWeight > 0) return "unknown_load";
  return "ready";
}

export function routeFieldReadinessLabel(status: RouteFieldReadiness): string {
  if (status === "over") return "알려진 적재 한도 초과 · 운행 불가";
  if (status === "unknown_load") return "적재 미확인 · 현장 확인 전 운행 가능으로 보지 않음";
  return "확인된 적재 기준 통과";
}

export function planHasUnknownLoad(routes: SimulationRoute[]): boolean {
  return routes.some((route) => routeFieldReadiness(route) === "unknown_load");
}

export function planHasOverLimit(routes: SimulationRoute[]): boolean {
  return routes.some((route) => routeFieldReadiness(route) === "over");
}
