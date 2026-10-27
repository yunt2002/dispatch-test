import ExcelJS from "exceljs";

export type RegionType = "LOCAL" | "METROPOLITAN" | "EMERGENCY" | "UNKNOWN" | "CHARTER" | "COURIER";

export type NormalizedShipment = {
  rowNumber: number;
  deliveryDate: string;
  customerName: string;
  location: string;
  productCode: string;
  productName: string;
  quantity: number | null;
  boxCount: number | null;
  /** 엑셀 박스ㅊ 원값. 의미 TODO: 실무자 확인 필요 */
  piecesPerBoxRaw: number | null;
  /** 있으면 중량 기반 PLT 추정에 사용 (1PLT≈kgPerPallet) */
  totalWeight: number | null;
  logistics: string;
  staff: string;
  notes: string;
  issues: string[];
};

export type DateSummary = {
  date: string;
  rowCount: number;
};

export type SheetParseResult = {
  sheetName: string;
  rows: NormalizedShipment[];
  dates: DateSummary[];
  warnings: string[];
};

export type RegionLookup = Map<string, { regionType: string; preferredVehicleTypeId: string | null }>;

const MONTH_SHEET_RE = /^\d{2}년\s*\d{1,2}월$/;

export function isMonthSheetName(name: string): boolean {
  return MONTH_SHEET_RE.test(name.trim());
}

export function yearFromSheetName(name: string): number | null {
  const match = name.trim().match(/(\d{2})년/);
  if (!match) return null;
  return 2000 + Number(match[1]);
}

function sheetYearMonth(name: string): number {
  const match = name.trim().match(/(\d{2})년\s*(\d{1,2})월/);
  if (!match) return 0;
  return Number(match[1]) * 100 + Number(match[2]);
}

export function listMonthSheets(workbook: ExcelJS.Workbook): string[] {
  return workbook.worksheets
    .map((sheet) => sheet.name)
    .filter((name) => {
      if (!isMonthSheetName(name)) return false;
      const sheet = workbook.getWorksheet(name);
      if (!sheet) return false;
      const rows = Math.max(sheet.actualRowCount || 0, sheet.rowCount || 0);
      return rows > 2;
    })
    .sort((a, b) => sheetYearMonth(b) - sheetYearMonth(a));
}

export function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).replace(/\s+/g, " ").trim();
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if ("text" in value && value.text != null) return String(value.text).replace(/\s+/g, " ").trim();
    if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    }
    if ("formula" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
  }
  return "";
}

export function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellText(value).replace(/,/g, "");
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function normalizeDate(value: ExcelJS.CellValue, yearHint?: number | null): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const excelEpoch = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    const date = new Date(excelEpoch);
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }
  const text = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const stripped = text.replace(/\([^)]*\)/g, "").trim();
  const md = stripped.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (md && yearHint) {
    return `${yearHint}-${pad2(Number(md[1]))}-${pad2(Number(md[2]))}`;
  }
  return text;
}

type HeaderMap = {
  date: number;
  customer: number;
  location: number;
  productCode: number;
  productName: number;
  quantity: number;
  boxes: number;
  piecesPerBox: number;
  logistics: number;
  staff: number;
  notes: number;
};

function findHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; map: HeaderMap } | null {
  const maxScan = Math.min(5, Math.max(sheet.actualRowCount || 0, sheet.rowCount || 0, 5));
  for (let r = 1; r <= maxScan; r++) {
    const labels: { col: number; text: string }[] = [];
    for (let c = 1; c <= 20; c++) {
      const text = cellText(sheet.getRow(r).getCell(c).value);
      if (text) labels.push({ col: c, text });
    }
    const find = (pred: (t: string) => boolean) => labels.find((item) => pred(item.text))?.col;
    const date = find((t) => t.includes("일자"));
    const customer = find((t) => t.includes("업체명"));
    if (!date || !customer) continue;
    return {
      rowNumber: r,
      map: {
        date,
        customer,
        location: find((t) => t.includes("업체위치") || t === "위치") ?? 0,
        productCode: find((t) => t.includes("품번")) ?? customer + 2,
        productName: find((t) => t.includes("품명")) ?? customer + 3,
        quantity: find((t) => t.includes("수량") && t.includes("합계")) ?? 9,
        boxes: find((t) => t === "박스수량" || t.includes("박스수량")) ?? 10,
        piecesPerBox: find((t) => t.includes("박스ㅊ") || t.includes("박스입")) ?? 11,
        logistics: find((t) => t === "물류") ?? 12,
        staff: find((t) => t.includes("납품직원")) ?? 13,
        notes: find((t) => t.includes("비고")) ?? 15,
      },
    };
  }
  return null;
}

/**
 * forward-fill: 일자 / 업체명 / 업체위치만.
 * 물류·납품직원은 상속하지 않음 (TODO: 실무자 확인).
 */
export function extractShipments(
  sheet: ExcelJS.Worksheet,
  options?: { date?: string },
): SheetParseResult {
  const warnings: string[] = [];
  const rows: NormalizedShipment[] = [];
  const header = findHeaderRow(sheet);
  if (!header) {
    return {
      sheetName: sheet.name,
      rows: [],
      dates: [],
      warnings: [`${sheet.name}: 일자/업체명 헤더를 찾지 못했습니다.`],
    };
  }

  let fillDate = "";
  let fillCustomer = "";
  let fillLocation = "";
  const yearHint = yearFromSheetName(sheet.name);

  for (let r = header.rowNumber + 1; r <= Math.max(sheet.actualRowCount || 0, sheet.rowCount || 0); r++) {
    const row = sheet.getRow(r);
    const rawDate = normalizeDate(row.getCell(header.map.date).value, yearHint);
    const rawCustomer = cellText(row.getCell(header.map.customer).value);
    const rawLocation =
      header.map.location > 0 ? cellText(row.getCell(header.map.location).value) : "";
    const productCode = cellText(row.getCell(header.map.productCode).value);
    const productName = cellText(row.getCell(header.map.productName).value);
    const quantity = cellNumber(row.getCell(header.map.quantity).value);
    const boxCount = cellNumber(row.getCell(header.map.boxes).value);
    const piecesPerBoxRaw = cellNumber(row.getCell(header.map.piecesPerBox).value);
    const logistics = cellText(row.getCell(header.map.logistics).value);
    const staff = cellText(row.getCell(header.map.staff).value);
    const notes = cellText(row.getCell(header.map.notes).value);

    if (rawDate) fillDate = rawDate;
    if (rawCustomer) fillCustomer = rawCustomer;
    if (rawLocation) fillLocation = rawLocation;

    const emptyRow =
      !rawDate &&
      !rawCustomer &&
      !rawLocation &&
      !productCode &&
      quantity == null &&
      boxCount == null &&
      !logistics;
    if (emptyRow) continue;

    const issues: string[] = [];
    if (!fillDate) issues.push("일자 없음");
    if (!fillCustomer) issues.push("업체명 없음 (forward-fill 불가)");
    if (!productCode) issues.push("품번 없음");
    if ((quantity == null || quantity <= 0) && (boxCount == null || boxCount <= 0)) {
      issues.push("수량 합계·박스수량 없음");
    }
    if (!fillLocation) issues.push("업체위치 없음");
    if (!logistics) {
      issues.push("물류 빈칸 (자동 상속 안 함 · TODO: 실무자 확인)");
    }

    if (!productCode) {
      warnings.push(`${sheet.name} ${r}행: 품번 없음 — 건너뜀`);
      continue;
    }
    if (!fillDate || !fillCustomer) {
      warnings.push(`${sheet.name} ${r}행: 일자/업체명 부족 — 건너뜀`);
      continue;
    }

    if (options?.date && fillDate !== options.date) continue;

    rows.push({
      rowNumber: r,
      deliveryDate: fillDate,
      customerName: fillCustomer,
      location: fillLocation,
      productCode,
      productName: productName || productCode,
      quantity,
      boxCount,
      piecesPerBoxRaw,
      totalWeight: null,
      logistics,
      staff,
      notes,
      issues,
    });
  }

  const dateMap = new Map<string, number>();
  for (const row of rows) {
    dateMap.set(row.deliveryDate, (dateMap.get(row.deliveryDate) || 0) + 1);
  }
  const dates = [...dateMap.entries()]
    .map(([date, rowCount]) => ({ date, rowCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  warnings.push(
    "TODO: 박스ㅊ 컬럼 의미 실무자 확인 필요 — 원값만 보관합니다.",
    "TODO: 물류/납품직원 빈 셀 상속 여부 실무자 확인 필요 — 현재 자동 상속하지 않습니다.",
  );

  return { sheetName: sheet.name, rows, dates, warnings };
}

export function listDates(sheet: ExcelJS.Worksheet): DateSummary[] {
  return extractShipments(sheet).dates;
}

export async function loadWorkbook(
  buffer: ArrayBuffer | Buffer | ExcelJS.Buffer,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

export async function parseDeliveryWorkbook(
  buffer: ArrayBuffer | Buffer | ExcelJS.Buffer,
  preferredSheet?: string,
): Promise<SheetParseResult> {
  const workbook = await loadWorkbook(buffer);
  const monthSheets = listMonthSheets(workbook);
  const sheet =
    (preferredSheet ? workbook.getWorksheet(preferredSheet) : null) ||
    (monthSheets[0] ? workbook.getWorksheet(monthSheets[0]) : null) ||
    workbook.worksheets.find((item) => (item.actualRowCount || 0) > 2);

  if (!sheet) {
    return { sheetName: "", rows: [], dates: [], warnings: ["읽을 수 있는 월별 시트가 없습니다."] };
  }
  const parsed = extractShipments(sheet);
  if (monthSheets.length === 0) {
    parsed.warnings.unshift("YY년 MM월 형식 시트를 찾지 못해 대체 시트를 사용했습니다.");
  }
  return parsed;
}

export function resolveRegionType(
  location: string,
  logistics: string,
  regions: RegionLookup,
): RegionType {
  const logi = logistics.trim();
  if (/경동|택배/.test(logi)) return "COURIER";
  if (/용차/.test(logi)) return "CHARTER";
  const hit = regions.get(location.trim());
  if (hit?.regionType === "LOCAL" || hit?.regionType === "METROPOLITAN") {
    return hit.regionType;
  }
  if (/스타리아|투싼|K5|긴급/.test(logi)) return "EMERGENCY";
  return "UNKNOWN";
}

/** @deprecated Use RegionMaster + resolveRegionType. Kept for legacy route helpers. */
export function inferRouteCode(location: string, logistics: string): string {
  const region = resolveRegionType(location, logistics, new Map());
  if (region === "COURIER") return "R-COURIER";
  if (region === "CHARTER") return "R-CHARTER";
  if (region === "EMERGENCY") return "R-EXPRESS";
  if (region === "METROPOLITAN") return "R-CAPITAL";
  if (region === "LOCAL") return "R-LOCAL";
  if (/1호/.test(logistics)) return "R-LOCAL";
  if (/2호/.test(logistics)) return "R-CAPITAL";
  return "R-OTHER";
}

export function customerCodeFromName(name: string): string {
  const compact = name.replace(/\s+/g, " ").trim();
  return `C-${compact.slice(0, 40)}`;
}

/**
 * PLT 계산 우선순위:
 * 1) 품목별 boxesPerPallet (ProductLoadingMaster) — 확정 기준
 * 2) 중량 / kgPerPallet — 현장 잠정치(예: 700kg). 박스÷임의수 환산은 하지 않음.
 */
export function computePallets(input: {
  boxCount: number | null;
  boxesPerPallet?: number | null;
  totalWeight?: number | null;
  kgPerPallet?: number | null;
}): { pallets: number | null; source: "boxes" | "weight" | null; warning?: string } {
  const { boxCount, boxesPerPallet, totalWeight, kgPerPallet } = input;

  if (boxCount != null && boxCount > 0 && boxesPerPallet != null && boxesPerPallet > 0) {
    return { pallets: Math.ceil(boxCount / boxesPerPallet), source: "boxes" };
  }

  if (totalWeight != null && totalWeight > 0 && kgPerPallet != null && kgPerPallet > 0) {
    return {
      pallets: Math.ceil(totalWeight / kgPerPallet),
      source: "weight",
      warning:
        boxesPerPallet == null
          ? `품목별 박스/PLT 미등록 — 잠정 ${kgPerPallet}kg/PLT로 중량 환산 (TODO: 실무 확정)`
          : undefined,
    };
  }

  if (boxCount == null || !(boxCount > 0)) {
    if (totalWeight == null || !(totalWeight > 0)) {
      return { pallets: null, source: null, warning: "박스수량·중량이 없어 PLT를 계산할 수 없습니다." };
    }
    return {
      pallets: null,
      source: null,
      warning: "1PLT당 kg 기준이 없어 중량만으로는 PLT를 계산할 수 없습니다.",
    };
  }

  return {
    pallets: null,
    source: null,
    warning:
      "PLT 적재 기준(품목별 박스/PLT)이 없고 중량도 없어 박스→PLT 환산을 하지 않습니다. (임의 나눗셈 금지)",
  };
}
