import ExcelJS from "exceljs";
import type { VehicleRecommendation } from "@/lib/dispatch-group";
import { formatSheetDate } from "@/lib/format";

export { formatSheetDate };

export const DELIVERY_HEADERS = [
  "일자",
  "업체명",
  "업체위치",
  "품번",
  "품명",
  "거래명세서",
  "FCL",
  "상세 Lot, 수량",
  "수량 합계",
  "박스수량",
  "박스ㅊ",
  "물류",
  "납품직원",
  "ERP 현재고",
  "비고 / 개별화물 도착지",
  "성적서",
] as const;

const FONT = { name: "Malgun Gothic", family: 3, charset: 129, size: 12 } as const;
const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const CENTER = { horizontal: "center" as const, vertical: "middle" as const };
const COL_WIDTHS = [13.1, 24.4, 12, 32.2, 58.6, 12.1, 12.4, 0.1, 13.5, 15.7, 14.1, 15.6, 15.6, 18.1, 51.5, 10.7];

export type DeliveryExportRow = {
  deliveryDate: string;
  customerName: string | null;
  locationName: string;
  productCode?: string | null;
  productName?: string | null;
  quantity?: number | null;
  boxCount?: number | null;
  piecesPerBox?: number | null;
  palletCount?: number | null;
  logistics?: string | null;
  recommendedVehicleJson?: string | null;
  selectedVehicleJson?: string | null;
  staff?: string | null;
  notes?: string | null;
};

export function monthSheetName(date: string): string {
  const [year, month] = date.split("-");
  return `${year.slice(2)}년 ${month}월`;
}

export function monthTitle(date: string): string {
  const month = Number(date.slice(5, 7));
  const last = new Date(Number(date.slice(0, 4)), month, 0).getDate();
  return `${month}/1 ~ ${month}/${last} 납품 예상 일정표`;
}

export function monthRange(date: string): { start: string; end: string } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(last).padStart(2, "0")}`,
  };
}

export function logisticsFromEntry(row: DeliveryExportRow): string {
  const selected = parseVehicle(row.selectedVehicleJson);
  const recommended = parseVehicle(row.recommendedVehicleJson);
  const pick = selected ?? recommended;
  if (pick) return formatVehicleLogistics(pick);
  return row.logistics?.trim() || "";
}

export function formatVehicleLogistics(pick: {
  vehicleName: string;
  vehicleCount: number;
  maxWeight?: number | null;
}): string {
  let label = pick.vehicleName;
  const ho = pick.vehicleName.match(/^(\d+)호차$/);
  if (ho) {
    const tons = pick.maxWeight && pick.maxWeight > 0 ? pick.maxWeight / 1000 : null;
    label = tons
      ? `${ho[1]}호 차량(${trimNum(tons)}t)`
      : `${ho[1]}호 차량`;
  }
  return pick.vehicleCount > 1 ? `${label} ×${pick.vehicleCount}` : label;
}

function trimNum(n: number): string {
  return String(Number(n.toFixed(1)));
}

function parseVehicle(raw?: string | null): VehicleRecommendation | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VehicleRecommendation;
  } catch {
    return null;
  }
}

function applyCell(
  cell: ExcelJS.Cell,
  extra?: { font?: Partial<ExcelJS.Font>; fill?: string; numFmt?: string; wrap?: boolean },
) {
  cell.font = { ...FONT, ...extra?.font };
  cell.alignment = { ...CENTER, wrapText: extra?.wrap ?? true };
  cell.border = BORDER;
  if (extra?.fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: extra.fill },
      bgColor: { argb: extra.fill },
    };
  }
  if (extra?.numFmt) cell.numFmt = extra.numFmt;
}

function mergeRuns(
  sheet: ExcelJS.Worksheet,
  startExcelRow: number,
  rows: DeliveryExportRow[],
  col: number,
  keyOf: (row: DeliveryExportRow) => string,
) {
  let runStart = 0;
  const flush = (end: number) => {
    if (end - runStart < 2) return;
    sheet.mergeCells(startExcelRow + runStart, col, startExcelRow + end - 1, col);
  };
  for (let i = 1; i <= rows.length; i++) {
    const prev = keyOf(rows[i - 1]);
    const cur = i < rows.length ? keyOf(rows[i]) : null;
    if (!prev || cur !== prev) {
      flush(i);
      runStart = i;
    }
  }
}

function addMonthSheet(workbook: ExcelJS.Workbook, dateInMonth: string, rows: DeliveryExportRow[]) {
  const sheet = workbook.addWorksheet(monthSheetName(dateInMonth), {
    views: [
      {
        state: "frozen",
        ySplit: 2,
        showGridLines: false,
        zoomScale: 70,
        zoomScaleNormal: 70,
      },
    ],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      verticalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    properties: { defaultRowHeight: 25.2 },
  });

  COL_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  sheet.mergeCells(1, 1, 1, 15);
  const titleRow = sheet.getRow(1);
  titleRow.height = 51.75;
  for (let c = 1; c <= 16; c++) {
    applyCell(titleRow.getCell(c), { font: { bold: true, size: c === 1 ? 26 : 11 } });
  }
  titleRow.getCell(1).value = monthTitle(dateInMonth);

  const header = sheet.getRow(2);
  header.height = 32.1;
  DELIVERY_HEADERS.forEach((label, index) => {
    const cell = header.getCell(index + 1);
    cell.value = label;
    applyCell(cell, { font: { bold: true }, fill: "FFDBE5F1" });
    if (index + 1 === 9 || index + 1 === 10 || index + 1 === 11) {
      cell.numFmt = "#,##0_);[Red](#,##0)";
    }
  });

  const sorted = [...rows].sort((a, b) => {
    const byDate = a.deliveryDate.localeCompare(b.deliveryDate);
    if (byDate !== 0) return byDate;
    const byCustomer = (a.customerName || "").localeCompare(b.customerName || "");
    if (byCustomer !== 0) return byCustomer;
    return (a.locationName || "").localeCompare(b.locationName || "");
  });

  sorted.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 3);
    excelRow.height = 25.2;
    const r = index + 3;
    const qty = row.quantity ?? null;
    const perBox = row.piecesPerBox ?? null;

    const values: Array<string | number | null> = [
      formatSheetDate(row.deliveryDate),
      row.customerName || null,
      row.locationName || null,
      row.productCode || null,
      row.productName || null,
      null,
      null,
      null,
      qty,
      perBox && perBox > 0 && qty != null ? null : (row.boxCount ?? null),
      perBox,
      logisticsFromEntry(row) || null,
      row.staff || null,
      null,
      row.notes || null,
      null,
    ];

    values.forEach((value, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const isDate = colIndex === 0;
      const isQty = colIndex === 8 || colIndex === 9 || colIndex === 10;
      applyCell(cell, {
        font: { bold: colIndex <= 2 || isQty },
        fill: isDate ? "FFEEECE1" : colIndex === 15 ? "FF00B050" : undefined,
        numFmt: isDate ? "@" : isQty ? "#,##0_ ;[Red]-#,##0 " : undefined,
      });
      cell.value = value as ExcelJS.CellValue;
    });

    if (perBox && perBox > 0 && qty != null) {
      excelRow.getCell(10).value = { formula: `I${r}/K${r}` };
    }
  });

  mergeRuns(sheet, 3, sorted, 1, (row) => row.deliveryDate);
  mergeRuns(sheet, 3, sorted, 2, (row) => `${row.deliveryDate}|${row.customerName}`);
  mergeRuns(sheet, 3, sorted, 3, (row) => `${row.deliveryDate}|${row.customerName}|${row.locationName}`);
  mergeRuns(
    sheet,
    3,
    sorted,
    12,
    (row) => `${row.deliveryDate}|${row.customerName}|${logisticsFromEntry(row)}`,
  );
  mergeRuns(
    sheet,
    3,
    sorted,
    13,
    (row) => `${row.deliveryDate}|${row.customerName}|${row.staff ?? ""}`,
  );
}

function groupRowsByMonth(rows: DeliveryExportRow[]): Map<string, DeliveryExportRow[]> {
  const groups = new Map<string, DeliveryExportRow[]>();
  for (const row of rows) {
    const key = row.deliveryDate.slice(0, 7);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export async function buildDeliveryWorkbook(
  dateInMonth: string,
  rows: DeliveryExportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "네오마그네틱 배차";
  addMonthSheet(workbook, dateInMonth, rows);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** 일정이 있는 달을 원본처럼 월별 시트로 모두 넣는다. */
export async function buildAllSheetsWorkbook(
  rows: DeliveryExportRow[],
  fallbackDate: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "네오마그네틱 배차";
  const groups = groupRowsByMonth(rows);
  if (groups.size === 0) {
    addMonthSheet(workbook, fallbackDate, []);
  } else {
    for (const [month, monthRows] of groups) {
      addMonthSheet(workbook, `${month}-01`, monthRows);
    }
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
