/**
 * 납품 root 시트 기준 고객사·주소·차량 힌트.
 * 출처: 당사 제품 출고 기준.xlsx → 납품 root
 */

export type DeliveryVehicleHint = "1HO" | "2HO" | "FLEX";

export type DeliveryCustomer = {
  id: string;
  /** 표기명 */
  name: string;
  aliases: string[];
  address: string;
  /** 일정 locationName 후보 */
  locationHint: string;
  vehicleHint: DeliveryVehicleHint;
};

/** 1호·2호 고정 루트 시퀀스 (참고·UI용) */
export const DELIVERY_ROUTE_SEQUENCES = {
  localJeolla: [
    { id: "J1", label: "BMC", stops: ["BMC"] },
    { id: "J2", label: "BMC ▶ 코아오토모티브", stops: ["BMC", "코아오토모티브"] },
  ],
  localGyeongsang: [
    { id: "G1", label: "DIC ▶ 삼보모터스", stops: ["DIC", "삼보모터스"] },
    { id: "G2", label: "DIC", stops: ["DIC"] },
    { id: "G3", label: "GMB ▶ LGIT(씨앤엠 김해)", stops: ["GMB", "LGIT(씨앤엠 김해)"] },
    { id: "G4", label: "GMB ▶ 삼현(엘지이노텍)", stops: ["GMB", "LGIT(삼현)"] },
    { id: "G5", label: "GMB ▶ 부산항", stops: ["GMB", "부산항"] },
  ],
  metro: [
    {
      id: "M1",
      label: "만도브로제 ▶ 만도평택 ▶ 조이슨세이프티",
      stops: ["만도브로제", "만도 평택", "조이슨세이프티"],
    },
    {
      id: "M2",
      label: "만도브로제 ▶ 만도 ▶ 현담",
      stops: ["만도브로제", "만도", "현담산업"],
    },
    {
      id: "M3",
      label: "현담 ▶ 듀링 ▶ 씨앤엠 아산",
      stops: ["현담산업", "듀링플러스", "씨앤엠 아산"],
    },
  ],
} as const;

export const DELIVERY_CUSTOMERS: DeliveryCustomer[] = [
  {
    id: "bmc",
    name: "BMC",
    aliases: ["bmc", "비엠씨"],
    address: "전남광주통합특별시 광산구 손재로287번길 153",
    locationHint: "광주",
    vehicleHint: "1HO",
  },
  {
    id: "corea-auto",
    name: "코아오토모티브",
    aliases: ["코아오토모티브", "corea"],
    address: "광주광역시 북구 첨단벤처로60번길 20 (대촌동)",
    locationHint: "광주",
    vehicleHint: "1HO",
  },
  {
    id: "sambo",
    name: "삼보모터스",
    aliases: ["삼보모터스", "삼보", "keffico", "케피코"],
    address: "대구광역시 달서구 월암동 1080-3",
    locationHint: "대구",
    vehicleHint: "1HO",
  },
  {
    id: "gmb",
    name: "GMB",
    aliases: ["gmb"],
    address: "경상남도 창원시 성산구 웅남로 618",
    locationHint: "창원",
    vehicleHint: "1HO",
  },
  {
    id: "cnm-gimhae",
    name: "LGIT(씨앤엠 김해)",
    aliases: ["씨앤엠 김해", "cnm 김해", "엘지이노텍(씨앤엠 김해)", "lgit(씨앤엠 김해)"],
    address: "경상남도 김해시 김해대로2635번길 29 (안동)",
    locationHint: "김해",
    vehicleHint: "1HO",
  },
  {
    id: "busan-port",
    name: "부산항",
    aliases: ["부산항", "수출(부산항)"],
    address: "부산광역시 강서구 신항남로 586 (가덕도동)",
    locationHint: "부산항",
    vehicleHint: "1HO",
  },
  {
    id: "mbco",
    name: "만도브로제",
    aliases: ["만도브로제", "mbco", "만도 브로제"],
    address: "인천광역시 연수구 첨단대로60번길 75",
    locationHint: "인천",
    vehicleHint: "2HO",
  },
  {
    id: "joyson",
    name: "조이슨세이프티",
    aliases: ["조이슨세이프티", "조이슨", "joyson"],
    address: "경기도 화성시 장안면 장안공단6길 22 (금의리)",
    locationHint: "화성",
    vehicleHint: "2HO",
  },
  {
    id: "mando-pyeongtaek",
    name: "만도 평택",
    aliases: ["만도 평택", "만도평택"],
    address: "경기도 평택시 포승읍 하만호길 32 (만호리)",
    locationHint: "평택",
    vehicleHint: "2HO",
  },
  {
    id: "mando",
    name: "만도",
    aliases: ["만도"],
    address: "경기도 평택시 포승읍 하만호길 32 (만호리)",
    locationHint: "평택",
    vehicleHint: "2HO",
  },
  {
    id: "hyundam",
    name: "현담산업",
    aliases: ["현담산업", "현담"],
    address: "충청남도 아산시 영인면 역리길 29",
    locationHint: "아산",
    vehicleHint: "2HO",
  },
  {
    id: "during",
    name: "듀링플러스",
    aliases: ["듀링플러스", "듀링", "during"],
    address: "충청남도 서산시 지곡면 무장산업로 263-12",
    locationHint: "서산",
    vehicleHint: "2HO",
  },
  {
    id: "cnm-asan",
    name: "씨앤엠 아산",
    aliases: ["씨앤엠 아산", "cnm 아산"],
    address: "충청남도 아산시 선장면 삼봉로162번길 19-21",
    locationHint: "아산",
    vehicleHint: "2HO",
  },
  {
    id: "dic",
    name: "DIC",
    aliases: ["dic", "디아이씨"],
    address: "대구광역시 달서구 월암동 1080-3",
    locationHint: "대구",
    vehicleHint: "1HO",
  },
  {
    id: "lgit-samhyun",
    name: "LGIT(삼현)",
    aliases: ["lgit(삼현)", "삼현", "엘지이노텍"],
    address: "경상남도 김해시 김해대로2635번길 29 (안동)",
    locationHint: "김해",
    vehicleHint: "1HO",
  },
  {
    id: "coreavis",
    name: "코아비스",
    aliases: ["코아비스", "coreavis"],
    address: "",
    locationHint: "세종",
    vehicleHint: "FLEX",
  },
];

function norm(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

export function matchDeliveryCustomer(
  customerName?: string | null,
): DeliveryCustomer | null {
  const raw = (customerName ?? "").trim();
  if (!raw) return null;
  const n = norm(raw);

  const ranked = [...DELIVERY_CUSTOMERS].sort(
    (a, b) =>
      Math.max(...b.aliases.map((x) => x.length), b.name.length) -
      Math.max(...a.aliases.map((x) => x.length), a.name.length),
  );

  // 1) 완전 일치
  for (const customer of ranked) {
    const keys = [customer.name, ...customer.aliases].map(norm);
    if (keys.some((key) => key && n === key)) return customer;
  }

  // 2) 입력 문자열이 alias를 포함 (예: "만도 평택공장" ⊃ "만도 평택")
  //    짧은 쪽이 긴 이름을 흡수하지 않게 함 ("만도" ↛ "만도브로제")
  for (const customer of ranked) {
    const keys = [customer.name, ...customer.aliases].map(norm);
    if (keys.some((key) => key && key.length >= 2 && n.includes(key))) {
      return customer;
    }
  }
  return null;
}

export function resolveCustomerAddress(customerName?: string | null): string | null {
  const hit = matchDeliveryCustomer(customerName);
  return hit?.address?.trim() || null;
}

/** 거래처 → 지역(위치). RegionMaster 목록이 있으면 그중으로 맞춘다. */
export function resolveLocationFromCustomer(
  customerName?: string | null,
  regionNames: string[] = [],
): string | null {
  const hit = matchDeliveryCustomer(customerName);
  const hint = hit?.locationHint?.trim();
  if (!hint) return null;
  if (!regionNames.length) return hint;

  const exact = regionNames.find((name) => name === hint);
  if (exact) return exact;

  const fuzzy = regionNames.find(
    (name) => name.includes(hint) || hint.includes(name),
  );
  return fuzzy ?? hint;
}
