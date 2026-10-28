/**
 * 주소 → 위경도 (Geocoding) + 거리 산출 골격.
 * REST 키(KAKAO_REST_API_KEY)는 서버에서만 사용한다. 지도 표시용 JS 키는
 * NEXT_PUBLIC_KAKAO_MAP_KEY 로 클라이언트 SDK에만 쓴다.
 * 키 없으면 null을 반환하고, 배차 추천은 권역·PLT로 계속 동작한다.
 */

import "server-only";

import { prisma } from "@/lib/prisma";

export type GeoPoint = { lat: number; lng: number; provider: "kakao" | "naver" | "manual" };

export type DistanceEstimate = {
  oneWayKm: number;
  roundTripKm: number;
  /** 통행료는 API/요금표 연동 전이라 null */
  tollWon: number | null;
  note: string;
};

function envKey(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

/** Haversine 직선거리(km). 도로거리 대체용 근사. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
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

export function estimateRoundTrip(a: GeoPoint, b: GeoPoint): DistanceEstimate {
  const oneWayKm = Math.round(haversineKm(a, b) * 10) / 10;
  return {
    oneWayKm,
    roundTripKm: Math.round(oneWayKm * 2 * 10) / 10,
    tollWon: null,
    note: "직선거리 근사 · 통행료/도로거리는 지도 API 연동 후 산출",
  };
}

function cacheKey(address: string): string {
  return address.trim().replace(/\s+/g, " ");
}

const GEOCODE_CONCURRENCY = 6;

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

/** 성공·무결과만 캐시. 네트워크/HTTP 오류는 캐시하지 않는다. */
async function fetchKakaoPoint(
  query: string,
  kakaoKey: string,
): Promise<{ cache: true; point: GeoPoint | null } | { cache: false }> {
  try {
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
      cache: "no-store",
    });
    if (!res.ok) return { cache: false };
    const data = (await res.json()) as {
      documents?: { x: string; y: string }[];
    };
    const doc = data.documents?.[0];
    if (!doc) return { cache: true, point: null };
    const lat = Number(doc.y);
    const lng = Number(doc.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { cache: true, point: null };
    return { cache: true, point: { lat, lng, provider: "kakao" } };
  } catch {
    return { cache: false };
  }
}

/**
 * 여러 주소를 DB 캐시 우선으로 변환한다.
 * 캐시에 없는 항목만 카카오에 병렬(최대 6) 조회한다.
 */
export async function geocodeAddresses(
  addresses: string[],
): Promise<Map<string, GeoPoint | null>> {
  const keys = [...new Set(addresses.map(cacheKey).filter(Boolean))];
  const out = new Map<string, GeoPoint | null>();
  if (!keys.length) return out;

  const cached = await prisma.geocodeCache.findMany({
    where: { query: { in: keys } },
  });
  const known = new Set<string>();
  for (const row of cached) {
    known.add(row.query);
    out.set(
      row.query,
      row.found && row.lat != null && row.lng != null
        ? { lat: row.lat, lng: row.lng, provider: "kakao" }
        : null,
    );
  }

  const missing = keys.filter((key) => !known.has(key));
  const kakaoKey = envKey("KAKAO_REST_API_KEY", "KAKAO_MAP_REST_KEY");
  if (!kakaoKey) {
    for (const key of missing) out.set(key, null);
    return out;
  }

  await mapPool(missing, GEOCODE_CONCURRENCY, async (query) => {
    const result = await fetchKakaoPoint(query, kakaoKey);
    if (!result.cache) {
      out.set(query, null);
      return;
    }
    out.set(query, result.point);
    await prisma.geocodeCache.upsert({
      where: { query },
      create: {
        query,
        lat: result.point?.lat ?? null,
        lng: result.point?.lng ?? null,
        found: Boolean(result.point),
      },
      update: {
        lat: result.point?.lat ?? null,
        lng: result.point?.lng ?? null,
        found: Boolean(result.point),
      },
    });
  });

  return out;
}

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const key = cacheKey(address);
  if (!key) return null;
  const points = await geocodeAddresses([key]);
  return points.get(key) ?? null;
}

export function geocodingStatus(): {
  ready: boolean;
  provider: string | null;
  message: string;
  mapJsReady: boolean;
} {
  const restReady = Boolean(envKey("KAKAO_REST_API_KEY", "KAKAO_MAP_REST_KEY"));
  const mapJsReady = Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim());

  if (restReady) {
    return {
      ready: true,
      provider: "kakao",
      mapJsReady,
      message: mapJsReady
        ? "카카오 Geocoding·지도 SDK 사용 가능"
        : "Geocoding 가능 · 지도 표시는 NEXT_PUBLIC_KAKAO_MAP_KEY 필요",
    };
  }
  return {
    ready: false,
    provider: null,
    mapJsReady,
    message: mapJsReady
      ? "지도 SDK 키만 있음 — 마커 좌표는 KAKAO_REST_API_KEY(서버) 설정 후 표시"
      : "지도 API 키 없음 — 권역·PLT 기준으로 배차. JS키·REST키 설정 후 연동",
  };
}
