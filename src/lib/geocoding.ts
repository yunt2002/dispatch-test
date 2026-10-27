/**
 * 주소 → 위경도 (Geocoding) + 거리 산출 골격.
 * 실제 API 호출은 KAKAO_REST_API_KEY 또는 NAVER 키가 있을 때만 동작한다.
 * 키 없으면 null을 반환하고, 배차 추천은 권역·PLT로 계속 동작한다.
 */

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

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const kakaoKey = envKey("KAKAO_REST_API_KEY", "KAKAO_MAP_REST_KEY");
  if (kakaoKey) {
    try {
      const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
        next: { revalidate: 86400 },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        documents?: { x: string; y: string }[];
      };
      const doc = data.documents?.[0];
      if (!doc) return null;
      return { lat: Number(doc.y), lng: Number(doc.x), provider: "kakao" };
    } catch {
      return null;
    }
  }

  // 네이버 등은 키·엔드포인트 확정 후 추가. 현재는 스텁.
  return null;
}

export function geocodingStatus(): {
  ready: boolean;
  provider: string | null;
  message: string;
} {
  if (envKey("KAKAO_REST_API_KEY", "KAKAO_MAP_REST_KEY")) {
    return {
      ready: true,
      provider: "kakao",
      message: "카카오 Geocoding 사용 가능",
    };
  }
  return {
    ready: false,
    provider: null,
    message:
      "지도 API 키 없음 — 권역·PLT 기준으로 배차. 거리/통행료는 KAKAO_REST_API_KEY 설정 후 연동",
  };
}
