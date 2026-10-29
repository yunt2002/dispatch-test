import "server-only";

import { fetchKakaoDrivingRoute } from "@/lib/kakao-route-matrix";
import { ROUTE_PRIORITIES, type RoutePriorityId } from "@/lib/route-priority";

export type RouteAlternativeOption = {
  priority: RoutePriorityId;
  label: string;
  hint: string;
  distanceKm: number;
  durationMin: number;
  path: { lat: number; lng: number }[];
};

export async function fetchRouteAlternatives(
  points: { lat: number; lng: number }[],
): Promise<{
  ok: boolean;
  options: RouteAlternativeOption[];
  error?: string;
}> {
  if (points.length < 2) {
    return { ok: false, options: [], error: "경로 포인트가 부족합니다." };
  }

  const settled = await Promise.all(
    ROUTE_PRIORITIES.map(async (item) => {
      const road = await fetchKakaoDrivingRoute(points, item.id);
      if (!road) return null;
      const option: RouteAlternativeOption = {
        priority: item.id,
        label: item.label,
        hint: item.hint,
        distanceKm: road.distanceKm,
        durationMin: road.durationMin,
        path: road.path,
      };
      return option;
    }),
  );
  const options = settled.flatMap((item) => (item ? [item] : []));
  if (!options.length) {
    return {
      ok: false,
      options: [],
      error: "대안 경로를 가져오지 못했습니다. REST API 키·쿼터를 확인하세요.",
    };
  }

  return { ok: true, options };
}
