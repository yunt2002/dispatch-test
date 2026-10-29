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
  /** 경로에서 빠진 건의 표시명·사유 (좌표 없음 / 차량 미배정) */
  unassignedDetails?: { id: string; title: string; reason: string }[];
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
 * (OR-Tools 없음 — 방문 순서는 visitOrder / 드래그 수동 조정)
 */
export async function solveRoutesForDate(date: string): Promise<RouteSolveResult> {
  const [entries, vehicles] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: {
        deliveryDate: date,
        status: { in: ["PLANNED", "CONFIRMED"] },
      },
      orderBy: [{ visitOrder: "asc" }, { createdAt: "asc" }, { locationName: "asc" }],
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
    visitOrder: number | null;
    createdAt: Date;
  };

  const unassignedDetails: { id: string; title: string; reason: string }[] = [];
  const stops: Stop[] = [];
  for (const entry of entries) {
    const title =
      entry.locationName?.trim() ||
      entry.customerName?.trim() ||
      "납품지";
    const marker = markerById.get(entry.id);
    if (!marker) {
      unassignedDetails.push({
        id: entry.id,
        title,
        reason: "좌표 없음",
      });
      continue;
    }
    const assigned = assignedVehicle(entry);
    const demand =
      entry.palletCount != null && entry.palletCount > 0 ? entry.palletCount : 1;
    stops.push({
      id: entry.id,
      lat: marker.lat,
      lng: marker.lng,
      demand,
      title: marker.title,
      vehicleId: assigned?.vehicleTypeId ?? null,
      visitOrder: entry.visitOrder ?? null,
      createdAt: entry.createdAt,
    });
  }

  if (!stops.length) {
    return {
      ok: false,
      solverReachable: true,
      depot: DEFAULT_DEPOT,
      note: unassignedDetails.length
        ? `좌표를 찾지 못한 납품 ${unassignedDetails.length}건이 있어 경로를 만들 수 없습니다. 주소·거래처 매핑을 확인하세요.`
        : "좌표가 있는 납품 일정이 없습니다. REST Geocoding 키와 주소를 확인하세요.",
      routes: [],
      unassigned: unassignedDetails.map((u) => u.id),
      unassignedDetails,
    };
  }

  const grouped = new Map<string, Stop[]>();
  for (const stop of stops) {
    if (!stop.vehicleId || !vehicleById.has(stop.vehicleId)) {
      unassignedDetails.push({
        id: stop.id,
        title: stop.title,
        reason: "차량 미배정",
      });
      continue;
    }
    const list = grouped.get(stop.vehicleId) ?? [];
    list.push(stop);
    grouped.set(stop.vehicleId, list);
  }
  const unassigned = unassignedDetails.map((u) => u.id);
  const ungeocodedCount = unassignedDetails.filter((u) => u.reason === "좌표 없음").length;

  for (const list of grouped.values()) {
    list.sort((a, b) => {
      const ao = a.visitOrder;
      const bo = b.visitOrder;
      if (ao != null && bo != null && ao !== bo) return ao - bo;
      if (ao != null && bo == null) return -1;
      if (ao == null && bo != null) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
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
  const missingNote =
    ungeocodedCount > 0
      ? ` · 좌표 없음 ${ungeocodedCount}건은 경로에서 제외됨`
      : "";
  return {
    ok,
    solverReachable: true,
    depot: DEFAULT_DEPOT,
    note: ok
      ? usedKakao
        ? `저장된 방문 순서(또는 등록 순)로 카카오 도로 길찾기를 계산했습니다. 드래그로 순서를 바꿀 수 있습니다.${missingNote}`
        : `카카오 길찾기 실패로 직선 근사를 사용했습니다. REST API 키·쿼터를 확인하세요.${missingNote}`
      : "배정된 차량이 있는 납품지가 없습니다.",
    matrixNote: usedKakao
      ? `카카오 자동차 길찾기 · API ${totalApiCalls}회 · OR-Tools 미사용`
      : "haversine×1.3 / 40km/h 폴백 · OR-Tools 미사용",
    routes,
    unassigned,
    unassignedDetails,
  };
}
