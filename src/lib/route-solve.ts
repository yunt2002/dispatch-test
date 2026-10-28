import "server-only";

import type { VehicleRecommendation } from "@/lib/dispatch-group";
import { DEFAULT_DEPOT } from "@/lib/depot";
import { buildDispatchMapMarkers } from "@/lib/dispatch-map-markers";
import { parseJson } from "@/lib/format";
import { fetchKakaoDrivingRoute } from "@/lib/kakao-route-matrix";
import { prisma } from "@/lib/prisma";

export type RouteSolveResult = {
  ok: boolean;
  note: string;
  matrixNote?: string;
  depot: { lat: number; lng: number; title: string };
  routes: {
    vehicleId: string;
    vehicleName: string;
    stopIds: string[];
    titles: string[];
    totalDistanceKm: number;
    totalTimeMin: number;
    load: number;
    capacity: number;
    path?: { lat: number; lng: number; label?: string }[];
  }[];
  unassigned: string[];
  /** 항상 true — 외부 OR-Tools 불필요 */
  solverReachable: boolean;
  error?: string;
};

export { DEFAULT_DEPOT };

function assignedVehicle(entry: {
  selectedVehicleJson: string | null;
  recommendedVehicleJson: string | null;
}) {
  return (
    parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null) ??
    parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null)
  );
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 보드 차량 배정 + 일정 등록 순서를 유지한 채
 * 카카오 자동차 길찾기로 도로 거리·시간·폴리라인을 구한다.
 * (OR-Tools 솔버 없음 — 순서 커스터마이징 UI는 이후 추가)
 */
export async function solveRoutesForDate(date: string): Promise<RouteSolveResult> {
  const [entries, vehicles] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: {
        deliveryDate: date,
        status: { in: ["PLANNED", "CONFIRMED"] },
      },
      orderBy: [{ createdAt: "asc" }, { locationName: "asc" }],
    }),
    prisma.vehicleType.findMany({
      where: { isActive: true },
      orderBy: { vehicleName: "asc" },
    }),
  ]);

  const markers = await buildDispatchMapMarkers(entries);
  const markerById = new Map(markers.map((m) => [m.id, m]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  type Stop = {
    id: string;
    lat: number;
    lng: number;
    demand: number;
    title: string;
    vehicleId: string | null;
  };

  const stops: Stop[] = entries
    .map((entry) => {
      const marker = markerById.get(entry.id);
      if (!marker) return null;
      const assigned = assignedVehicle(entry);
      const demand =
        entry.palletCount != null && entry.palletCount > 0 ? entry.palletCount : 1;
      return {
        id: entry.id,
        lat: marker.lat,
        lng: marker.lng,
        demand,
        title: marker.title,
        vehicleId: assigned?.vehicleTypeId ?? null,
      };
    })
    .filter((s): s is Stop => Boolean(s));

  if (!stops.length) {
    return {
      ok: false,
      solverReachable: true,
      depot: DEFAULT_DEPOT,
      note: "좌표가 있는 납품 일정이 없습니다. REST Geocoding 키와 주소를 확인하세요.",
      routes: [],
      unassigned: [],
    };
  }

  const grouped = new Map<string, Stop[]>();
  const unassigned: string[] = [];
  for (const stop of stops) {
    if (!stop.vehicleId || !vehicleById.has(stop.vehicleId)) {
      unassigned.push(stop.id);
      continue;
    }
    const list = grouped.get(stop.vehicleId) ?? [];
    list.push(stop);
    grouped.set(stop.vehicleId, list);
  }

  const depot = { lat: DEFAULT_DEPOT.lat, lng: DEFAULT_DEPOT.lng };
  let totalApiCalls = 0;
  let usedKakao = false;

  const routes = await Promise.all(
    [...grouped.entries()].map(async ([vehicleId, groupStops]) => {
      const vehicle = vehicleById.get(vehicleId)!;
      const capacity = vehicle.maxPallet && vehicle.maxPallet > 0 ? vehicle.maxPallet : 8;
      const load = groupStops.reduce((sum, s) => sum + s.demand, 0);
      const stopIds = groupStops.map((s) => s.id);
      const titles = groupStops.map((s) => s.title);

      const points = [depot, ...groupStops.map((s) => ({ lat: s.lat, lng: s.lng })), depot];
      const road = await fetchKakaoDrivingRoute(points);

      if (road) {
        totalApiCalls += road.apiCalls;
        usedKakao = true;
        return {
          vehicleId,
          vehicleName: vehicle.vehicleName,
          stopIds,
          titles,
          totalDistanceKm: road.distanceKm,
          totalTimeMin: road.durationMin,
          load: Math.round(load * 10) / 10,
          capacity,
          path: road.path.map((p, i) => (i === 0 ? { ...p, label: "출" } : p)),
        };
      }

      // 폴백: 직선×1.3 / 40km/h
      let km = 0;
      for (let i = 0; i < points.length - 1; i++) {
        km += haversineKm(points[i], points[i + 1]) * 1.3;
      }
      km = Math.round(km * 10) / 10;
      return {
        vehicleId,
        vehicleName: vehicle.vehicleName,
        stopIds,
        titles,
        totalDistanceKm: km,
        totalTimeMin: Math.max(1, Math.round((km / 40) * 60)),
        load: Math.round(load * 10) / 10,
        capacity,
        path: points.map((p, i) => (i === 0 ? { ...p, label: "출" } : p)),
      };
    }),
  );

  const ok = routes.length > 0;
  return {
    ok,
    solverReachable: true,
    depot: DEFAULT_DEPOT,
    note: ok
      ? usedKakao
        ? "보드 차량 배정·등록 순서를 유지하고, 카카오 도로 길찾기로 거리·시간을 계산했습니다. (순서는 이후 화면에서 바꿀 수 있게 할 예정)"
        : "카카오 길찾기 실패로 직선 근사를 사용했습니다. REST API 키·쿼터를 확인하세요."
      : "배정된 차량이 있는 납품지가 없습니다.",
    matrixNote: usedKakao
      ? `카카오 자동차 길찾기 · API ${totalApiCalls}회 · OR-Tools 미사용`
      : "haversine×1.3 / 40km/h 폴백 · OR-Tools 미사용",
    routes,
    unassigned,
  };
}
