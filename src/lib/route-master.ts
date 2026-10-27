/**
 * 고정 납품 루트 마스터 (1호차 4.0t 기준 + 공통/유동).
 * 위치명·고객명으로 권역을 찾고, 추천 차량 힌트를 준다.
 */

export type RouteZoneCode = "JEOLLA" | "GYEONGSANG" | "FLEX" | "METRO" | "UNKNOWN";

export type RouteZone = {
  code: RouteZoneCode;
  label: string;
  /** LOCAL → 1호 고정, FLEX → 잔여 PLT·동선으로 1·2호, METRO → 2호 */
  vehiclePolicy: "LOCAL_1HO" | "FLEX" | "METRO_2HO";
  /** 위치 키워드 (부분 일치) */
  locations: string[];
  /** 고객사 키워드 */
  customers: string[];
  notes: string;
};

export const ROUTE_ZONES: RouteZone[] = [
  {
    code: "JEOLLA",
    label: "전라도 권역",
    vehiclePolicy: "LOCAL_1HO",
    locations: ["광주", "완주", "전주", "군산", "익산", "여수", "순천"],
    customers: ["비엠씨", "bmc", "코아오토모티브", "한온", "한온시스템"],
    notes: "1호차(4.0t) 고정 납품 루트",
  },
  {
    code: "GYEONGSANG",
    label: "경상도 권역",
    vehiclePolicy: "LOCAL_1HO",
    locations: [
      "대구",
      "창원",
      "김해",
      "울주",
      "부산",
      "부산항",
      "진해",
      "진해항",
      "거창",
      "울산",
    ],
    customers: [
      "삼보",
      "삼보모터스",
      "대양자석",
      "엘지이노텍",
      "lg이노텍",
      "gmb",
      "snt",
      "dic",
      "디아이씨",
    ],
    notes: "1호차(4.0t) 고정 납품 루트 · 대구·창원·김해·울주·부산항",
  },
  {
    code: "FLEX",
    label: "공통/유동 권역",
    vehiclePolicy: "FLEX",
    locations: ["세종", "음성", "충주", "청주", "서산", "예산", "천안", "아산", "대전"],
    customers: ["코아비스", "coreavis"],
    notes: "1호·2호 중 잔여 PLT와 동선이 유리한 쪽으로 유동 배차",
  },
  {
    code: "METRO",
    label: "수도권",
    vehiclePolicy: "METRO_2HO",
    locations: [
      "서울",
      "인천",
      "경기",
      "평택",
      "화성",
      "안산",
      "안양",
      "판교",
      "김포",
      "인천공항",
      "인천항",
    ],
    customers: ["만도", "조이슨", "mbco", "듀링", "삼현", "현담"],
    notes: "2호차(3.5t) 기본",
  },
];

export function matchRouteZone(input: {
  locationName?: string | null;
  customerName?: string | null;
}): RouteZone | null {
  const location = (input.locationName ?? "").replace(/\s+/g, "").toLowerCase();
  const customer = (input.customerName ?? "").replace(/\s+/g, "").toLowerCase();

  for (const zone of ROUTE_ZONES) {
    const locHit = zone.locations.some((key) => location.includes(key.replace(/\s+/g, "").toLowerCase()));
    if (locHit) return zone;
  }
  for (const zone of ROUTE_ZONES) {
    const custHit = zone.customers.some((key) =>
      customer.includes(key.replace(/\s+/g, "").toLowerCase()),
    );
    if (custHit) return zone;
  }
  return null;
}

export function routeZoneLabel(code: RouteZoneCode | null | undefined): string {
  if (!code || code === "UNKNOWN") return "미분류";
  return ROUTE_ZONES.find((zone) => zone.code === code)?.label ?? code;
}

/** 권역 정책 + (있으면) 잔여 PLT로 선호 차량 id를 고른다. */
export function preferredVehicleIdForZone(input: {
  zone: RouteZone | null;
  vehicleIds: { local: string; metro: string };
  remainingByVehicleId?: Record<string, number>;
  needPallets?: number | null;
}): string | null {
  const { zone, vehicleIds, remainingByVehicleId, needPallets } = input;
  if (!zone) return null;

  if (zone.vehiclePolicy === "LOCAL_1HO") return vehicleIds.local;
  if (zone.vehiclePolicy === "METRO_2HO") return vehicleIds.metro;

  // FLEX: 잔여 PLT가 더 큰 쪽. 같으면 1호.
  if (!remainingByVehicleId) return null;
  const need = needPallets != null && needPallets > 0 ? needPallets : 0;
  const rem1 = remainingByVehicleId[vehicleIds.local] ?? 0;
  const rem2 = remainingByVehicleId[vehicleIds.metro] ?? 0;
  if (need > 0) {
    const fit1 = rem1 >= need;
    const fit2 = rem2 >= need;
    if (fit1 && !fit2) return vehicleIds.local;
    if (fit2 && !fit1) return vehicleIds.metro;
  }
  if (rem2 > rem1) return vehicleIds.metro;
  return vehicleIds.local;
}
