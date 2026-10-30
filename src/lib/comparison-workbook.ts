import ExcelJS from "exceljs";
import { cellNumber, cellText, normalizeDate, yearFromSheetName } from "@/lib/delivery-excel";

export type ComparisonShipment = {
  rowNumber: number;
  date: string;
  customer: string;
  location: string;
  product: string;
  quantity: number | null;
  boxes: number | null;
  transport: string;
};

/** 비교용 원본은 빈 지역과 운송 방식을 다른 행에서 임의로 상속하지 않는다. */
export function extractComparisonShipments(sheet: ExcelJS.Worksheet, date: string): ComparisonShipment[] {
  let headerRow = 0;
  const columns: Record<string, number> = {};
  for (let n = 1; n <= Math.min(sheet.rowCount, 20); n++) {
    const row = sheet.getRow(n);
    const labels = new Map<string, number>();
    row.eachCell((cell, col) => labels.set(cellText(cell.value).replace(/\s/g, ""), col));
    if (labels.has("일자") && labels.has("업체명") && labels.has("품명")) {
      headerRow = n;
      for (const name of ["일자", "업체명", "업체위치", "품명", "수량합계", "박스수량", "물류"]) columns[name] = labels.get(name) ?? 0;
      break;
    }
  }
  if (!headerRow || !columns.물류) throw new Error("일자·업체명·품명·물류 열이 있는 일정표를 찾지 못했습니다.");
  const value = (row: ExcelJS.Row, column: number) => column ? row.getCell(column).value : null;
  const shipments: ComparisonShipment[] = [];
  for (let n = headerRow + 1; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    const rowDate = normalizeDate(value(row, columns.일자), yearFromSheetName(sheet.name));
    if (rowDate !== date) continue;
    const customer = cellText(value(row, columns.업체명));
    const product = cellText(value(row, columns.품명));
    if (!customer && !product) continue;
    shipments.push({ rowNumber: n, date: rowDate, customer, location: cellText(value(row, columns.업체위치)), product,
      quantity: cellNumber(value(row, columns.수량합계)), boxes: cellNumber(value(row, columns.박스수량)), transport: cellText(value(row, columns.물류)) });
  }
  return shipments;
}
