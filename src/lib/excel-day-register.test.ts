import { strict as assert } from "node:assert";
import { test } from "node:test";
import ExcelJS from "exceljs";
import {
  EXCEL_DAY_PRESERVED_STATUSES,
  logisticsVehicleHint,
  missingLocationNames,
  missingProductNames,
  notesWithWorkbookAddress,
  parseExcelDayRegisterRows,
  summarizeExcelDayRegisterRows,
} from "./excel-day-register";

test("물류 열을 자사 차량·용차·택배로 매핑한다", () => {
  assert.equal(logisticsVehicleHint("1호 차량(5t)"), "1호차");
  assert.equal(logisticsVehicleHint("2호차"), "2호차");
  assert.equal(logisticsVehicleHint("스타리아"), "스타리아");
  assert.equal(logisticsVehicleHint("용차"), "용차");
  assert.equal(logisticsVehicleHint("경동택배"), "택배");
  assert.equal(logisticsVehicleHint("택배"), "택배");
  assert.equal(logisticsVehicleHint(""), null);
  assert.equal(logisticsVehicleHint("미정"), null);
});

test("선택한 납품일 행만 추출한다", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("26년 11월");
  sheet.addRow(["일자", "업체명", "업체위치", "품명", "수량 합계", "박스수량", "물류", "비고 / 개별화물 도착지"]);
  sheet.addRow(["11/25", "거래처A", "안양", "품목A", 10, 2, "1호 차량", "경기도 안양시 만안구 덕천로152번길 25"]);
  sheet.addRow(["11/25", "거래처B", "김해", "품목B", 5, null, "용차", null]);
  sheet.addRow(["11/26", "거래처C", "대구", "품목C", 3, 1, "2호 차량", null]);
  const rows = parseExcelDayRegisterRows(workbook, "2026-11-25");
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.customerName),
    ["거래처A", "거래처B"],
  );
  assert.equal(rows[0].vehicleHint, "1호차");
  assert.equal(rows[0].address, "경기도 안양시 만안구 덕천로152번길 25");
  assert.equal(rows[1].vehicleHint, "용차");
});

test("요약·신규 품명·지역·주소 건수를 집계한다", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("26년 11월");
  sheet.addRow(["일자", "업체명", "업체위치", "품명", "박스수량", "물류"]);
  sheet.addRow(["11/25", "A", "안양", "기존품", 1, "1호 차량"]);
  sheet.addRow(["11/25", "B", "신규지역", "신규품", 2, "알수없음"]);
  const rows = parseExcelDayRegisterRows(workbook, "2026-11-25");
  const summary = summarizeExcelDayRegisterRows(rows);
  assert.equal(summary.count, 2);
  assert.equal(summary.byLogistics["1호 차량"], 1);
  assert.equal(summary.unrecognizedLogistics, 1);
  assert.deepEqual(missingProductNames(rows, ["기존품"]), ["신규품"]);
  assert.deepEqual(missingLocationNames(rows, ["안양"]), ["신규지역"]);
});

test("완료·취소 상태는 당일 덮어쓰기에서 보존한다", () => {
  assert.deepEqual([...EXCEL_DAY_PRESERVED_STATUSES], ["DONE", "CANCELLED"]);
});

test("비고 도로명을 notes 주소 형식으로 붙인다", () => {
  assert.equal(notesWithWorkbookAddress("김해시 상동로 504"), "주소: 김해시 상동로 504");
  assert.equal(notesWithWorkbookAddress("김해시 상동로 504", "긴급"), "긴급\n주소: 김해시 상동로 504");
  assert.equal(notesWithWorkbookAddress(null, "메모"), "메모");
});
