/**
 * 제품 정리 시트 기준 적재표.
 * 품명 매칭은 ERP 명을 우선한다. (출처: 당사 제품 출고 기준.xlsx → 제품 정리)
 */

import { matchDeliveryCustomer } from "@/lib/delivery-customers";


export type ProductFamily = {
  id: string;
  familyName: string;
  /** 시트 구분 */
  group: string;
  /** ERP 명 (품명으로 사용) */
  erpNames: string[];
  /** 원문. P 접이식박스는 P 박스로 정규화한다. */
  boxTypeRaw: string;
  boxType: string;
  /** 박스당 입수(개). 참고용 */
  piecesPerBox: number | null;
  /** BOX별 중량(g). 제품 정리 시트 — 출고 중량 = 박스수 × 이 값 / 1000 */
  boxWeightG: number | null;
  /** 1PLT당 박스. 낱개면 null — 별도 보관, PLT 환산 안 함 */
  boxesPerPallet: number | null;
  palletSpec: string | null;
  /** 시트 PLT 무게(kg, 박스·파렛트 포함). 없으면 설정 kg/PLT 사용 */
  kgPerPallet: number | null;
  /** 납품 고객사 (현장 표) */
  customers: string[];
  match: (text: string) => boolean;
};

export function normalizeBoxType(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  if (compact.includes("접이식") && compact.includes("p")) return "P 박스";
  if (compact.startsWith("p박스") || compact === "pbox") return "P 박스";
  if (compact.includes("종이")) return "종이박스";
  if (compact.includes("단프라")) return "단프라";
  return raw.replace(/\s+/g, " ").trim();
}

function haystack(productCode?: string | null, productName?: string | null): string {
  return `${productCode ?? ""} ${productName ?? ""}`.replace(/\s+/g, " ").trim();
}

function includesErp(text: string, erp: string): boolean {
  const t = text.replace(/\s+/g, "").toLowerCase();
  const e = erp.replace(/\s+/g, "").toLowerCase();
  if (!e) return false;
  return t.includes(e);
}

/** 현장 적재표 2026-10-16 (제품 정리 · ERP 명 = 품명) */
export const PRODUCT_FAMILIES: ProductFamily[] = [
  {
    id: "IDB2-TAEYANG",
    familyName: "IDB2 Hollow shaft Assy_태양",
    group: "IDB2",
    erpNames: ["IDB2 Hollow shaft Assy_태양"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 40,
    boxWeightG: 13000,
    boxesPerPallet: 40,
    palletSpec: "1200*1000*1230",
    kgPerPallet: 520,
    customers: ["BMC", "수출(인천항)"],
    match: (text) => /idb2|idb\s*gen\s*2/i.test(text) && /태양/.test(text),
  },
  {
    id: "IDB2-YEONGWAN",
    familyName: "IDB2 Hollow shaft Assy_영완",
    group: "IDB2",
    erpNames: ["IDB2 Hollow shaft Assy_영완"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 40,
    boxWeightG: 13000,
    boxesPerPallet: 40,
    palletSpec: "1200*1000*1230",
    kgPerPallet: 520,
    customers: ["BMC", "수출(인천항)"],
    match: (text) => /idb2|idb\s*gen\s*2/i.test(text) && /영완/.test(text),
  },
  {
    id: "IDB-GEN2",
    familyName: "IDB GEN2",
    group: "IDB2",
    erpNames: ["IDB2 Hollow shaft Assy_태양", "IDB2 Hollow shaft Assy_영완"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 40,
    boxWeightG: 13000,
    boxesPerPallet: 40,
    palletSpec: "1200*1000*1230",
    kgPerPallet: 520,
    customers: ["BMC", "수출(인천항)"],
    match: (text) => /idb2|idb\s*gen\s*2/i.test(text),
  },
  {
    id: "EPS-NX4",
    familyName: "MBCo EPS NX4 ROTOR ASSY(HRE FREE)",
    group: "EPS",
    erpNames: ["MBCo EPS NX4 ROTOR ASSY(HRE FREE)"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 30,
    boxWeightG: 14000,
    boxesPerPallet: 42,
    palletSpec: "1200*1000*1200",
    kgPerPallet: 588,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /\beps\b/i.test(text) && /nx4/i.test(text),
  },
  {
    id: "EPS-BC3",
    familyName: "MBCo eps BC3 ROTOR ASSY",
    group: "EPS",
    erpNames: ["MBCo eps BC3 ROTOR ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 30,
    boxWeightG: 11000,
    boxesPerPallet: 42,
    palletSpec: "1200*1000*1200",
    kgPerPallet: 462,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /\beps\b/i.test(text) && /bc3/i.test(text),
  },
  {
    id: "EPS",
    familyName: "EPS",
    group: "EPS",
    erpNames: ["MBCo EPS NX4 ROTOR ASSY(HRE FREE)", "MBCo eps BC3 ROTOR ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 30,
    boxWeightG: 14000,
    boxesPerPallet: 42,
    palletSpec: "1200*1000*1200",
    kgPerPallet: 588,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /\beps\b/i.test(text),
  },
  {
    id: "ROTOR-3-2",
    familyName: "HFP 3.2 FE ROTOR ASSY (8호 금형)",
    group: "3.2 ROTOR",
    erpNames: ["HFP 3.2 FE ROTOR ASSY (8호 금형)"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 100,
    boxWeightG: 5620,
    boxesPerPallet: 60,
    palletSpec: "1100*1100*1200",
    kgPerPallet: 352,
    customers: ["현담산업"],
    match: (text) => /3\.2\s*rotor|hfp\s*3\.2|3\.2\s*로터|hfp\s*3\.2\s*fe/i.test(text),
  },
  {
    id: "KEFFICO-SBW",
    familyName: "SBW ROTOR ASSY (CE)",
    group: "SBW",
    erpNames: ["SBW ROTOR ASSY (CE)"],
    boxTypeRaw: "단프라",
    boxType: "단프라",
    piecesPerBox: 60,
    boxWeightG: 6870,
    boxesPerPallet: 60,
    palletSpec: "1150*1150*1200",
    kgPerPallet: 427,
    customers: ["KEFFICO (삼보모터스)", "삼보모터스"],
    match: (text) =>
      (/\bsbw\b/i.test(text) && (/\(\s*ce\s*\)/i.test(text) || /수출/.test(text))) ||
      /keffico/i.test(text),
  },
  {
    id: "DIC-SBW",
    familyName: "DIC SBW ROTOR ASSY (NBPM / 폭 8.65/42UH)",
    group: "SBW",
    erpNames: ["DIC SBW ROTOR ASSY (NBPM / 폭 8.65/42UH)"],
    boxTypeRaw: "단프라",
    boxType: "단프라",
    piecesPerBox: 80,
    boxWeightG: 11400,
    boxesPerPallet: 28,
    palletSpec: "1100*1100*1200",
    kgPerPallet: 334,
    customers: ["DIC"],
    match: (text) => /\bdic\b/i.test(text) || (/\bsbw\b/i.test(text) && !/\(\s*ce\s*\)/i.test(text)),
  },
  {
    id: "MPS-EX",
    familyName: "MPS Assy Base_수출",
    group: "MPS",
    erpNames: ["MPS Assy Base_수출"],
    boxTypeRaw: "종이박스",
    boxType: "종이박스",
    piecesPerBox: 15,
    boxWeightG: 117,
    boxesPerPallet: 15,
    palletSpec: "1100*910",
    kgPerPallet: null,
    customers: ["만도"],
    match: (text) => /\bmps\b/i.test(text) && /수출/.test(text),
  },
  {
    id: "MPS-HAD",
    familyName: "MPS Assy HAD",
    group: "MPS",
    erpNames: ["MPS Assy HAD"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 96,
    boxWeightG: 768,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["만도"],
    match: (text) => /\bmps\b/i.test(text) && /\bhad\b/i.test(text),
  },
  {
    id: "MPS",
    familyName: "MPS Assy Base_내수",
    group: "MPS",
    erpNames: ["MPS Assy Base_내수"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 96,
    boxWeightG: 748.8,
    boxesPerPallet: 48,
    palletSpec: "1100*1100*1200",
    kgPerPallet: 51,
    customers: ["만도"],
    match: (text) => /\bmps\b/i.test(text),
  },
  {
    id: "7AM-DCT",
    familyName: "7AM DCT ASSY",
    group: "7AM",
    erpNames: ["7AM DCT ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 96,
    boxWeightG: 2140.8,
    boxesPerPallet: 130,
    palletSpec: "1200*1000*1200",
    kgPerPallet: 294,
    customers: ["LGIT(삼현)", "삼현"],
    match: (text) => /\b7am\b/i.test(text) || /dct\s*assy/i.test(text),
  },
  {
    id: "TMED2",
    familyName: "KOH TMED2 EOP SENSOR MAGNET ASSY에폭시 적용",
    group: "TMED2",
    erpNames: ["KOH TMED2 EOP SENSOR MAGNET ASSY에폭시 적용"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 884,
    boxWeightG: 8800,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: 220,
    customers: ["코아오토모티브"],
    match: (text) => /tmed2/i.test(text),
  },
  {
    id: "CN7",
    familyName: "CN7 SENSING ASSY",
    group: "CN7",
    erpNames: ["CN7 SENSING ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 350,
    boxWeightG: 1650,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["엘지이노텍(씨앤엠 김해)", "LGIT(씨앤엠 김해)"],
    match: (text) => /\bcn7\b/i.test(text),
  },
  {
    id: "GEN1",
    familyName: "IDB GEN1 SENSOR MAGNET ASSY",
    group: "GEN1",
    erpNames: ["IDB GEN1 SENSOR MAGNET ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 1000,
    boxWeightG: 18300,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /(?:idb\s*)?gen\s*1(?!\d)/i.test(text),
  },
  {
    id: "IMEB3",
    familyName: "DRI MAGNET-POWER CYLINDER(IMEB3)",
    group: "IMEB3",
    erpNames: ["DRI MAGNET-POWER CYLINDER(IMEB3)"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 252,
    boxWeightG: 6800,
    boxesPerPallet: 30,
    palletSpec: "1100*1100*1100",
    kgPerPallet: 220,
    customers: ["듀링", "듀링플러스"],
    match: (text) => /imeb3/i.test(text),
  },
  {
    id: "PURGE-PUMP",
    familyName: "D GMB Active Purge Pump Rotor Ass'y_rev2",
    group: "PURGE PUMP",
    erpNames: ["D GMB Active Purge Pump Rotor Ass'y_rev2"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 90,
    boxWeightG: 1340,
    boxesPerPallet: 60,
    palletSpec: "1100*1100*1100",
    kgPerPallet: 95,
    customers: ["GMB"],
    match: (text) => /purge\s*pump/i.test(text),
  },
  {
    id: "EC-PUMP",
    familyName: "EC PUMP",
    group: "EC PUMP",
    erpNames: ["EC PUMP"],
    boxTypeRaw: "P 접이식 박스",
    boxType: "P 박스",
    piecesPerBox: 2112,
    boxWeightG: 15700,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["현담산업"],
    match: (text) => /ec[\s-]*pump/i.test(text),
  },
  {
    id: "PE",
    familyName: "CVS SW PE EWP IMPELLER ASSY",
    group: "SW EWP",
    erpNames: ["CVS SW PE EWP IMPELLER ASSY"],
    boxTypeRaw: "단프라",
    boxType: "단프라",
    piecesPerBox: 60,
    boxWeightG: 6500,
    boxesPerPallet: 24,
    palletSpec: "1100*1100*1550",
    kgPerPallet: 170,
    customers: ["코아비스"],
    match: (text) => /cvs\s*sw\s*pe|\bpe\s+ewp/i.test(text),
  },
  {
    id: "BATT",
    familyName: "CVS SW BATT EWP IMPELLER ASSY",
    group: "SW EWP",
    erpNames: ["CVS SW BATT EWP IMPELLER ASSY"],
    boxTypeRaw: "단프라",
    boxType: "단프라",
    piecesPerBox: 60,
    boxWeightG: 7400,
    boxesPerPallet: 24,
    palletSpec: "1100*1100*1550",
    kgPerPallet: 190,
    customers: ["코아비스"],
    match: (text) => /\bbatt\b/i.test(text),
  },
  {
    id: "AK-EJECTOR-EX",
    familyName: "JSS AK EJECTOR HALL sensor ass'y SW_수출",
    group: "AK EJECTOR",
    erpNames: ["JSS AK EJECTOR HALL sensor ass'y SW_수출"],
    boxTypeRaw: "종이박스",
    boxType: "종이박스",
    piecesPerBox: 540,
    boxWeightG: 500,
    boxesPerPallet: 30,
    palletSpec: "1100*900*1200",
    kgPerPallet: 30,
    customers: ["수출(부산항)", "부산항"],
    match: (text) =>
      (/조이슨|joyson|ak\s*ejector|jss\s*ak/i.test(text) && /수출/.test(text)),
  },
  {
    id: "AK-EJECTOR",
    familyName: "JSS AK EJECTOR HALL sensor ass'y SW_내수",
    group: "AK EJECTOR",
    erpNames: ["JSS AK EJECTOR HALL sensor ass'y SW_내수"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 360,
    boxWeightG: 350,
    boxesPerPallet: null,
    palletSpec: "1100*1100",
    kgPerPallet: null,
    customers: ["조이슨세이프티"],
    match: (text) => /조이슨|joyson|ak\s*ejector|jss\s*ak/i.test(text),
  },
  {
    id: "BD-STATOR",
    familyName: "BD STATOR ASSY",
    group: "BD",
    erpNames: ["BD STATOR ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 40,
    boxWeightG: 3700,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /\bbd\b/i.test(text) && /stator/i.test(text),
  },
  {
    id: "BD-HIP-ROTOR",
    familyName: "BD HIP ROTOR ASSY",
    group: "BD",
    erpNames: ["BD HIP ROTOR ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 25,
    boxWeightG: 1600,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /\bbd\b/i.test(text) && /hip\s*rotor/i.test(text),
  },
  {
    id: "BD-UP-LEG",
    familyName: "BD UP/LEG ROTOR ASSY",
    group: "BD",
    erpNames: ["BD UP/LEG ROTOR ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 28,
    boxWeightG: 1500,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /\bbd\b/i.test(text) && /(up\/?leg|up\s*leg)/i.test(text),
  },
  {
    id: "BD-KNEE",
    familyName: "BD KNEE SENSOR MAGNNET ASSY",
    group: "BD",
    erpNames: ["BD KNEE SENSOR MAGNNET ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 150,
    boxWeightG: 600,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /\bbd\b/i.test(text) && /knee/i.test(text),
  },
  {
    id: "BD-HIP-SENSOR",
    familyName: "BD HIP SENSOR MAGNET ASSY",
    group: "BD",
    erpNames: ["BD HIP SENSOR MAGNET ASSY"],
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    piecesPerBox: 100,
    boxWeightG: 100,
    boxesPerPallet: null,
    palletSpec: null,
    kgPerPallet: null,
    customers: ["Mbco", "만도브로제"],
    match: (text) => /\bbd\b/i.test(text) && /hip\s*sensor/i.test(text),
  },
  {
    id: "CKD",
    familyName: "CKD",
    group: "CKD",
    erpNames: ["CKD"],
    boxTypeRaw: "종이박스",
    boxType: "종이박스",
    piecesPerBox: 48,
    boxWeightG: 14600,
    boxesPerPallet: 48,
    palletSpec: "1200*1080*1100",
    kgPerPallet: 700,
    customers: ["BMC"],
    match: (text) => /\bckd\b/i.test(text),
  },
];

export function matchProductLoading(
  productCode?: string | null,
  productName?: string | null,
): ProductFamily | null {
  const text = haystack(productCode, productName);
  if (!text) return null;

  // 1) ERP 명 부분일치 — 실제로 맞은 ERP 문자열 길이 우선, 동점이면 더 구체적인 패밀리
  const byErp = PRODUCT_FAMILIES.map((family) => {
    let matchedLen = 0;
    for (const erp of family.erpNames) {
      if (includesErp(text, erp)) matchedLen = Math.max(matchedLen, erp.length);
    }
    return { family, matchedLen };
  })
    .filter((row) => row.matchedLen > 0)
    .sort((a, b) => {
      if (b.matchedLen !== a.matchedLen) return b.matchedLen - a.matchedLen;
      return a.family.erpNames.length - b.family.erpNames.length;
    });
  if (byErp[0]) return byErp[0].family;

  // 2) 키워드 매칭 (시트 순서: 구체 규칙이 위에 있음)
  return PRODUCT_FAMILIES.find((family) => family.match(text)) ?? null;
}

export function isLooseProduct(
  productCode?: string | null,
  productName?: string | null,
): boolean {
  const family = matchProductLoading(productCode, productName);
  return Boolean(family && family.boxesPerPallet == null);
}

/** 등록 UI용 ERP 품명 목록 */
export function listErpProductNames(): string[] {
  const names = new Set<string>();
  for (const family of PRODUCT_FAMILIES) {
    for (const erp of family.erpNames) names.add(erp);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "ko"));
}

export type ScheduleFieldDefaults = {
  customerName: string | null;
  locationName: string | null;
  note: string | null;
};

/**
 * 품명(ERP) → 제품 정리 고객사 → 납품 root 주소/지역.
 * 등록 폼에서 품명 고르면 지역·거래처 자동 채움용.
 */
export function resolveDefaultsFromProduct(
  productName?: string | null,
): ScheduleFieldDefaults {
  const family = matchProductLoading(null, productName);
  if (!family) {
    return { customerName: null, locationName: null, note: null };
  }

  for (const rawCustomer of family.customers) {
    const delivery = matchDeliveryCustomer(rawCustomer);
    if (delivery) {
      return {
        customerName: delivery.name,
        locationName: delivery.locationHint,
        note: `${family.familyName} → ${delivery.name} · ${delivery.locationHint}`,
      };
    }
    // 수출 항구 등 root에 없는 표기
    if (/인천항/.test(rawCustomer)) {
      return {
        customerName: rawCustomer,
        locationName: "인천항",
        note: `${family.familyName} → ${rawCustomer}`,
      };
    }
    if (/부산항|진해항/.test(rawCustomer)) {
      return {
        customerName: rawCustomer,
        locationName: /진해/.test(rawCustomer) ? "진해항" : "부산항",
        note: `${family.familyName} → ${rawCustomer}`,
      };
    }
  }

  const first = family.customers[0] ?? null;
  return {
    customerName: first,
    locationName: null,
    note: first ? `${family.familyName} → ${first} (지역 미매칭)` : family.familyName,
  };
}
