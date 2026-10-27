export type ProductFamily = {
  id: string;
  familyName: string;
  /** 원문. P 접이식박스는 P 박스로 정규화한다. */
  boxTypeRaw: string;
  boxType: string;
  /** 1PLT당 박스. 낱개면 null — 별도 보관, PLT 환산 안 함 */
  boxesPerPallet: number | null;
  palletSpec: string | null;
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

/** 현장 적재표 2026-10 (+ 납품고객사). PLT당 중량은 설정 600kg 기준. */
export const PRODUCT_FAMILIES: ProductFamily[] = [
  {
    id: "JOYSON-EX",
    familyName: "조이슨(수출)",
    boxTypeRaw: "종이박스",
    boxType: "종이박스",
    boxesPerPallet: 30,
    palletSpec: "1100*900",
    customers: ["수출(인천항)"],
    match: (text) => /조이슨|joyson/i.test(text) && /수출/.test(text),
  },
  {
    id: "JOYSON",
    familyName: "조이슨",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 30,
    palletSpec: "1100*1100",
    customers: ["조이슨세이프티"],
    match: (text) => /조이슨|joyson/i.test(text),
  },
  {
    id: "MPS-EX",
    familyName: "MPS(수출)",
    boxTypeRaw: "종이박스",
    boxType: "종이박스",
    boxesPerPallet: 15,
    palletSpec: "1100*910",
    customers: ["만도"],
    match: (text) => /\bmps\b/i.test(text) && /수출/.test(text),
  },
  {
    id: "MPS",
    familyName: "MPS 내수",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 96,
    palletSpec: "1100*1100",
    customers: ["삼보"],
    match: (text) => /\bmps\b/i.test(text),
  },
  {
    id: "DIC-EX",
    familyName: "DIC(수출)",
    boxTypeRaw: "종이박스",
    boxType: "종이박스",
    boxesPerPallet: 30,
    palletSpec: "1100*1100",
    customers: ["DIC"],
    match: (text) =>
      (/\bdic\b/i.test(text) || /\bsbw\b/i.test(text)) && (/수출/.test(text) || /\(\s*ce\s*\)/i.test(text)),
  },
  {
    id: "KEFFICO-SBW",
    familyName: "KEFFICO SBW",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 60,
    palletSpec: "1100*1100",
    customers: ["DIC"],
    match: (text) => /keffico/i.test(text),
  },
  {
    id: "DIC-SBW",
    familyName: "DIC SBW 내수",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 28,
    palletSpec: "1150*1150",
    customers: ["DIC"],
    match: (text) => /\bdic\b/i.test(text) || /\bsbw\b/i.test(text),
  },
  {
    id: "IDB-GEN2",
    familyName: "IDB GEN2",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 40,
    palletSpec: "1200*1000",
    customers: ["BMC", "수출(인천항)"],
    match: (text) => /idb\s*gen\s*2/i.test(text),
  },
  {
    id: "GEN1",
    familyName: "GEN1",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: null,
    palletSpec: null,
    customers: ["Mbco"],
    match: (text) => /(?:idb\s*)?gen\s*1(?!\d)/i.test(text),
  },
  {
    id: "EPS",
    familyName: "EPS",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 42,
    palletSpec: "1200*1000",
    customers: ["Mbco"],
    match: (text) => /\beps\b/i.test(text),
  },
  {
    id: "7AM-DCT",
    familyName: "7AM DCT",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 130,
    palletSpec: "1200*1000",
    customers: ["삼현"],
    match: (text) => /\b7am\b/i.test(text),
  },
  {
    id: "TMED2",
    familyName: "TMED2",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: null,
    palletSpec: null,
    customers: ["코아오토모티브"],
    match: (text) => /tmed2/i.test(text),
  },
  {
    id: "CN7",
    familyName: "CN7",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 40,
    palletSpec: "1100*1100",
    customers: ["엘지이노텍"],
    match: (text) => /\bcn7\b/i.test(text),
  },
  {
    id: "IMEB3",
    familyName: "IMEB3",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 30,
    palletSpec: "1100*1100",
    customers: ["듀링"],
    match: (text) => /imeb3/i.test(text),
  },
  {
    id: "ROTOR-3-2",
    familyName: "3.2 ROTOR",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 60,
    palletSpec: "1100*1100",
    customers: ["현담산업"],
    match: (text) => /3\.2\s*rotor|hfp\s*3\.2|3\.2\s*로터/i.test(text),
  },
  {
    id: "D45",
    familyName: "D45",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 100,
    palletSpec: "1100*900",
    customers: ["수출(진해항, 부산항)"],
    match: (text) => /\bd45\b/i.test(text) || /4545/.test(text),
  },
  {
    id: "PURGE-PUMP",
    familyName: "PURGE PUMP",
    boxTypeRaw: "P 박스",
    boxType: "P 박스",
    boxesPerPallet: 60,
    palletSpec: "1100*1100",
    customers: ["GMB"],
    match: (text) => /purge\s*pump/i.test(text),
  },
  {
    id: "EC-PUMP",
    familyName: "EC PUMP",
    boxTypeRaw: "P 접이식박스",
    boxType: "P 박스",
    boxesPerPallet: null,
    palletSpec: null,
    customers: ["현담산업"],
    match: (text) => /ec[\s-]*pump/i.test(text),
  },
  {
    id: "PE",
    familyName: "PE",
    boxTypeRaw: "단프라",
    boxType: "단프라",
    boxesPerPallet: 24,
    palletSpec: "1100*1100",
    customers: ["코아비스"],
    match: (text) => /cvs\s*sw\s*pe|\bpe\s+ewp/i.test(text),
  },
  {
    id: "BATT",
    familyName: "BATT",
    boxTypeRaw: "단프라",
    boxType: "단프라",
    boxesPerPallet: 24,
    palletSpec: "1100*1100",
    customers: ["코아비스"],
    match: (text) => /\bbatt\b/i.test(text),
  },
];

export function matchProductLoading(
  productCode?: string | null,
  productName?: string | null,
): ProductFamily | null {
  const text = haystack(productCode, productName);
  if (!text) return null;
  return PRODUCT_FAMILIES.find((family) => family.match(text)) ?? null;
}

export function isLooseProduct(
  productCode?: string | null,
  productName?: string | null,
): boolean {
  const family = matchProductLoading(productCode, productName);
  return Boolean(family && family.boxesPerPallet == null);
}
