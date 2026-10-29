/**
 * 카카오 내비 자동차 길찾기로 시간·거리 행렬 생성.
 * (다중 목적지는 반경 10km 제한이라 장거리 납품에 부적합 → 쌍별 directions 사용)
 * 무료 쿼터: 자동차 길찾기 일 10,000건. 실패 시 Haversine 폴백.
 */
import "server-only";

import type { RoutePriorityId } from "@/lib/route-priority";

export type RoutePoint = { lat: number; lng: number; id?: string };

export type RouteMatrix = {
  timeSec: number[][];
  distanceKm: number[][];
  note: string;
  provider: "kakao" | "haversine";
  apiCalls: number;
};

function restKey(): string | null {
  return (
    process.env.KAKAO_REST_API_KEY?.trim() ||
    process.env.KAKAO_MAP_REST_KEY?.trim() ||
    null
  );
}

function haversineKm(a: RoutePoint, b: RoutePoint): number {
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

export function buildHaversineMatrix(
  points: RoutePoint[],
  avgSpeedKmh = 40,
): RouteMatrix {
  const n = points.length;
  const timeSec = Array.from({ length: n }, () => Array(n).fill(0));
  const distanceKm = Array.from({ length: n }, () => Array(n).fill(0));
  const speed = Math.max(avgSpeedKmh, 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const km = haversineKm(points[i], points[j]) * 1.3;
      distanceKm[i][j] = Math.round(km * 10) / 10;
      timeSec[i][j] = Math.max(1, Math.round((km / speed) * 3600));
    }
  }
  return {
    timeSec,
    distanceKm,
    note: `haversine×1.3 / ${avgSpeedKmh}km/h (폴백)`,
    provider: "haversine",
    apiCalls: 0,
  };
}

type DirSummary = {
  routes?: {
    result_code: number;
    summary?: { distance: number; duration: number; fare?: { toll?: number } };
  }[];
};

async function fetchPair(
  key: string,
  from: RoutePoint,
  to: RoutePoint,
): Promise<{ distanceM: number; durationSec: number } | null> {
  const params = new URLSearchParams({
    origin: `${from.lng},${from.lat}`,
    destination: `${to.lng},${to.lat}`,
    priority: "RECOMMEND",
    summary: "true",
  });
  const res = await fetch(
    `https://apis-navi.kakaomobility.com/v1/directions?${params}`,
    {
      headers: { Authorization: `KakaoAK ${key}` },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as DirSummary;
  const route = data.routes?.[0];
  if (!route || route.result_code !== 0 || !route.summary) return null;
  return {
    distanceM: route.summary.distance,
    durationSec: route.summary.duration,
  };
}

/**
 * N×N 도로 시간·거리 행렬. 호출 수 = N×(N-1).
 * 프로토타입(납품지 소수)에서는 무료 쿼터로 충분.
 */
export async function buildKakaoRouteMatrix(
  points: RoutePoint[],
): Promise<RouteMatrix> {
  const key = restKey();
  if (!key || points.length < 2) {
    return buildHaversineMatrix(points);
  }

  const n = points.length;
  const timeSec = Array.from({ length: n }, () => Array(n).fill(0));
  const distanceKm = Array.from({ length: n }, () => Array(n).fill(0));
  let apiCalls = 0;
  let failures = 0;

  const jobs: { i: number; j: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) jobs.push({ i, j });
    }
  }

  // 동시성 제한 (쿼터·레이트 보호)
  const concurrency = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const idx = cursor++;
      const { i, j } = jobs[idx];
      apiCalls += 1;
      try {
        const pair = await fetchPair(key!, points[i], points[j]);
        if (pair) {
          distanceKm[i][j] = Math.round((pair.distanceM / 1000) * 10) / 10;
          timeSec[i][j] = Math.max(1, pair.durationSec);
        } else {
          failures += 1;
          const km = haversineKm(points[i], points[j]) * 1.3;
          distanceKm[i][j] = Math.round(km * 10) / 10;
          timeSec[i][j] = Math.max(1, Math.round((km / 40) * 3600));
        }
      } catch {
        failures += 1;
        const km = haversineKm(points[i], points[j]) * 1.3;
        distanceKm[i][j] = Math.round(km * 10) / 10;
        timeSec[i][j] = Math.max(1, Math.round((km / 40) * 3600));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
  );

  const total = jobs.length;
  const note =
    failures === 0
      ? `카카오 자동차 길찾기 · 도로거리/예상시간 · API ${apiCalls}회`
      : failures >= total
        ? `카카오 실패 → haversine 폴백 · API ${apiCalls}회`
        : `카카오 ${total - failures}/${total} · 일부 폴백 · API ${apiCalls}회`;

  return {
    timeSec,
    distanceKm,
    note,
    provider: failures >= total ? "haversine" : "kakao",
    apiCalls,
  };
}

export type DrivingRouteResult = {
  path: { lat: number; lng: number }[];
  distanceKm: number;
  durationMin: number;
  apiCalls: number;
  provider: "kakao" | "haversine";
  priority?: RoutePriorityId;
};

async function fetchOneDirectionsSegment(
  key: string,
  points: RoutePoint[],
  priority: RoutePriorityId = "RECOMMEND",
): Promise<{
  path: { lat: number; lng: number }[];
  distanceM: number;
  durationSec: number;
} | null> {
  if (points.length < 2) return null;
  const origin = points[0];
  const destination = points[points.length - 1];
  const middles = points.slice(1, -1).slice(0, 5);

  const params = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    priority,
    summary: "false",
  });
  if (middles.length) {
    params.set(
      "waypoints",
      middles.map((p) => `${p.lng},${p.lat}`).join("|"),
    );
  }

  const res = await fetch(
    `https://apis-navi.kakaomobility.com/v1/directions?${params}`,
    {
      headers: { Authorization: `KakaoAK ${key}` },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    routes?: {
      result_code?: number;
      summary?: { distance: number; duration: number };
      sections?: { roads?: { vertexes?: number[] }[] }[];
    }[];
  };
  const route = data.routes?.[0];
  if (!route || route.result_code !== 0) return null;

  const path: { lat: number; lng: number }[] = [];
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const v = road.vertexes ?? [];
      for (let i = 0; i + 1 < v.length; i += 2) {
        path.push({ lng: v[i], lat: v[i + 1] });
      }
    }
  }
  return {
    path,
    distanceM: route.summary?.distance ?? 0,
    durationSec: route.summary?.duration ?? 0,
  };
}

/**
 * 출발→경유→도착 도로 경로.
 * 기본 길찾기 경유 최대 5개라, 그 이상이면 구간을 이어 붙인다.
 */
export async function fetchKakaoDrivingRoute(
  points: RoutePoint[],
  priority: RoutePriorityId = "RECOMMEND",
): Promise<DrivingRouteResult | null> {
  const key = restKey();
  if (!key || points.length < 2) return null;

  // 한 구간에 origin + 최대 5 경유 + destination = 최대 7 포인트
  const chunkSize = 7;
  const path: { lat: number; lng: number }[] = [];
  let distanceM = 0;
  let durationSec = 0;
  let apiCalls = 0;

  let start = 0;
  while (start < points.length - 1) {
    const end = Math.min(start + chunkSize - 1, points.length - 1);
    const segmentPoints = points.slice(start, end + 1);
    apiCalls += 1;
    try {
      const seg = await fetchOneDirectionsSegment(key, segmentPoints, priority);
      if (!seg) {
        return null;
      }
      if (path.length && seg.path.length) {
        path.push(...seg.path.slice(1));
      } else {
        path.push(...seg.path);
      }
      distanceM += seg.distanceM;
      durationSec += seg.durationSec;
    } catch {
      return null;
    }
    if (end >= points.length - 1) break;
    start = end;
  }

  if (!path.length) return null;
  return {
    path,
    distanceKm: Math.round((distanceM / 1000) * 10) / 10,
    durationMin: Math.max(1, Math.round(durationSec / 60)),
    apiCalls,
    provider: "kakao",
    priority,
  };
}

/** @deprecated fetchKakaoDrivingRoute 사용 */
export async function fetchKakaoDrivingPath(
  points: RoutePoint[],
): Promise<{ lat: number; lng: number }[] | null> {
  const route = await fetchKakaoDrivingRoute(points);
  return route?.path ?? null;
}
