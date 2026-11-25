import type ExcelJS from "exceljs";
import {
  extractComparisonShipments,
  extractWorkbookAddress,
  findComparisonSheet,
  type ComparisonShipment,
} from "@/lib/comparison-workbook";
import { simulationVehicleName } from "@/lib/simulation-vehicles";

export type LogisticsVehicleHint = "1호차" | "2호차" | "스타리아" | "용차" | "택배" | null;

export type ExcelDayRegisterRow = {
  rowNumber: number;
  deliveryDate: string;
  customerName: string;
  locationName: string;
  productName: string;
  productCode: string;
  quantity: number | null;
  boxCount: number | null;
  logistics: string;
  address: string | null;
  vehicleHint: LogisticsVehicleHint;
};

export type ExcelDayRegisterSummary = {
  count: number;
  byLogistics: Record<string, number>;
  productNames: string[];
  locationNames: string[];
  addressCount: number;
  unrecognizedLogistics: number;
};

/** 엑셀 물류 열 → 차량/외부운송 힌트. AI 없이 문자열만 본다. */
export function logisticsVehicleHint(logistics: string): LogisticsVehicleHint {
  const raw = logistics.replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const own = simulationVehicleName(raw);
  if (own) return own;
  if (/용차/.test(raw)) return "용차";
  if (/택배|경동/.test(raw)) return "택배";
  // 「1호 차량」「2호차량」 외 표기
  if (/1\s*호/.test(raw)) return "1호차";
  if (/2\s*호/.test(raw)) return "2호차";
  if (/스타리|staria/i.test(raw)) return "스타리아";
  if (/3\s*호/.test(raw)) return null; // 보드에 3호가 있어도 물류 표기가 드묾 → 서버에서 이름 매칭
  return null;
}

function fromComparison(row: ComparisonShipment): ExcelDayRegisterRow {
  return {
    rowNumber: row.rowNumber,
    deliveryDate: row.date,
    customerName: row.customer.trim(),
    locationName: row.location.trim(),
    productName: row.product.trim(),
    productCode: row.productCode.trim(),
    quantity: row.quantity,
    boxCount: row.boxes,
    logistics: row.transport.trim(),
    address: row.workbookAddress?.trim() || null,
    vehicleHint: logisticsVehicleHint(row.transport),
  };
}

/** 월 시트에서 선택한 납품일 행만 뽑는다. */
export function parseExcelDayRegisterRows(
  workbook: ExcelJS.Workbook,
  date: string,
): ExcelDayRegisterRow[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("납품일 형식을 확인하세요. (YYYY-MM-DD)");
  }
  const sheet = findComparisonSheet(workbook, date);
  if (!sheet) {
    throw new Error(`${date.slice(0, 7)} 월 시트를 일정표에서 찾지 못했습니다.`);
  }
  return extractComparisonShipments(sheet, date)
    .filter((row) => row.customer.trim() || row.product.trim())
    .map(fromComparison);
}

export function summarizeExcelDayRegisterRows(
  rows: ExcelDayRegisterRow[],
): ExcelDayRegisterSummary {
  const byLogistics: Record<string, number> = {};
  const products = new Set<string>();
  const locations = new Set<string>();
  let addressCount = 0;
  let unrecognizedLogistics = 0;
  for (const row of rows) {
    const key = row.logistics || "(물류 미입력)";
    byLogistics[key] = (byLogistics[key] ?? 0) + 1;
    if (row.productName) products.add(row.productName);
    if (row.locationName) locations.add(row.locationName);
    if (row.address) addressCount += 1;
    if (!row.vehicleHint && row.logistics) unrecognizedLogistics += 1;
  }
  return {
    count: rows.length,
    byLogistics,
    productNames: [...products].sort((a, b) => a.localeCompare(b, "ko")),
    locationNames: [...locations].sort((a, b) => a.localeCompare(b, "ko")),
    addressCount,
    unrecognizedLogistics,
  };
}

/** 엑셀 당일 등록 시 유지하는 일정 상태 (덮어쓰지 않음). */
export const EXCEL_DAY_PRESERVED_STATUSES = ["DONE", "CANCELLED"] as const;

export function notesWithWorkbookAddress(address: string | null, existingNotes?: string | null) {
  const base = existingNotes?.trim() || "";
  if (!address?.trim()) return base || null;
  if (base.includes(address.trim())) return base;
  return base ? `${base}\n주소: ${address.trim()}` : `주소: ${address.trim()}`;
}

/** 메모(비고)에 `주소: ...` 또는 도로명 주소가 있으면 추출한다. */
export function extractNoteAddress(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const road = extractWorkbookAddress(notes);
  if (road) return road;
  const tagged = notes.match(/주소\s*:\s*([^\n\r]+)/);
  const value = tagged?.[1]?.trim();
  return value && value.length >= 5 ? value : null;
}

export function normalizeProductKey(name: string) {
  return name.replace(/\s+/g, " ").trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

/** 목록에 없는 품명 (신규 보강 대상). */
export function missingProductNames(
  rows: ExcelDayRegisterRow[],
  knownNames: string[],
): string[] {
  const known = new Set(knownNames.map(normalizeProductKey).filter(Boolean));
  const missing = new Set<string>();
  for (const row of rows) {
    if (!row.productName) continue;
    if (!known.has(normalizeProductKey(row.productName))) missing.add(row.productName);
  }
  return [...missing].sort((a, b) => a.localeCompare(b, "ko"));
}

/** 목록에 없는 지역명. */
export function missingLocationNames(
  rows: ExcelDayRegisterRow[],
  knownLocations: string[],
): string[] {
  const known = new Set(knownLocations.map((name) => name.trim()).filter(Boolean));
  const missing = new Set<string>();
  for (const row of rows) {
    if (!row.locationName) continue;
    if (!known.has(row.locationName)) missing.add(row.locationName);
  }
  return [...missing].sort((a, b) => a.localeCompare(b, "ko"));
}

export { extractWorkbookAddress };
