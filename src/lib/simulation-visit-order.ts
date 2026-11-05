import { DEFAULT_DEPOT } from "./depot";
import type { SimulationItem, SimulationRoute } from "./simulation";
import { sameOrder, suggestVisitOrder } from "./visit-order-suggest";

export type OrderStop = {
  id: string;
  label: string;
  lat: number | null;
  lng: number | null;
};

export type VehicleOrderCompare = {
  vehicle: string;
  manager: OrderStop[];
  recommended: OrderStop[] | null;
  status: "same" | "different" | "unavailable" | "single";
};

/** 같은 납품지(거래처·주소·좌표)는 한 번만, 기존 품목 순서를 유지한다. */
export function stopsInVisitOrder(items: SimulationItem[]): OrderStop[] {
  const out: OrderStop[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const id = `${item.customer}\0${item.address ?? ""}\0${item.lat ?? ""}\0${item.lng ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: item.customer?.trim() || item.location?.trim() || "납품지 미확인",
      lat: item.lat,
      lng: item.lng,
    });
  }
  return out;
}

export function compareManagerToRecommended(routes: SimulationRoute[]): VehicleOrderCompare[] {
  return routes
    .filter((route) => route.items.length > 0)
    .map((route) => {
      const manager = stopsInVisitOrder(route.items);
      if (manager.length <= 1) {
        return { vehicle: route.vehicle, manager, recommended: manager, status: "single" as const };
      }
      if (manager.some((stop) => stop.lat == null || stop.lng == null)) {
        return { vehicle: route.vehicle, manager, recommended: null, status: "unavailable" as const };
      }
      const ids = suggestVisitOrder(
        DEFAULT_DEPOT,
        manager.map((stop) => ({ id: stop.id, lat: stop.lat!, lng: stop.lng! })),
      );
      const byId = new Map(manager.map((stop) => [stop.id, stop]));
      const recommended = ids.map((id) => byId.get(id)!);
      return {
        vehicle: route.vehicle,
        manager,
        recommended,
        status: sameOrder(manager.map((stop) => stop.id), ids) ? ("same" as const) : ("different" as const),
      };
    });
}

export function orderCompareSummary(rows: VehicleOrderCompare[]): string {
  if (!rows.length) return "비교할 자사 경로 없음";
  return rows
    .map((row) => {
      if (row.status === "same") return `${row.vehicle} 동일`;
      if (row.status === "different") return `${row.vehicle} 다름`;
      if (row.status === "single") return `${row.vehicle} 1곳`;
      return `${row.vehicle} 좌표 부족`;
    })
    .join(" · ");
}

export function orderStatusLabel(status: VehicleOrderCompare["status"]): string {
  if (status === "same") return "순서 동일";
  if (status === "different") return "순서 다름";
  if (status === "single") return "납품지 1곳";
  return "추천 불가 · 좌표 확인 필요";
}
