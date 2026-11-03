import { strict as assert } from "node:assert";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { extractComparisonShipments, extractWorkbookAddress, findComparisonSheet } from "./comparison-workbook";

test("비고에 주소와 담당자가 섞여 있으면 도로명 주소만 추출한다", () => {
  assert.equal(extractWorkbookAddress("김해시 상동로 504번지 한신물류 담당자 010-1234-5678"), "김해시 상동로 504번지");
  assert.equal(extractWorkbookAddress("대전광역시 유성구 테크노2로 334 업체 담당자"), "대전광역시 유성구 테크노2로 334");
  assert.equal(extractWorkbookAddress("담당자 010-1234-5678"), null);
});

test("엑셀의 병합된 비고 도착지 주소를 각 품목에 반영한다", () => {
  const sheet = new ExcelJS.Workbook().addWorksheet("26년 10월");
  sheet.addRow(["일자", "업체명", "업체위치", "품명", "물류", "비고 / 개별화물 도착지"]);
  sheet.addRow(["10/14", "업체", "김해", "품목 A", "용차", "김해시 상동로 504번지 물류 담당자"]);
  sheet.addRow(["10/14", "업체", "김해", "품목 B", "용차", null]);
  sheet.mergeCells("F2:F3");
  const rows = extractComparisonShipments(sheet, "2026-10-14");
  assert.deepEqual(rows.map((row) => row.workbookAddress), ["김해시 상동로 504번지", "김해시 상동로 504번지"]);
});

test("엑셀 순서와 운송 방식을 유지하고 빈 위치는 앞 행의 위치를 상속하지 않는다", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("26년 10월");
  sheet.addRow(["일자", "업체명", "업체위치", "품명", "수량 합계", "박스수량", "물류"]);
  sheet.addRow(["10/15", "업체 A", "광주", "품목 A", 120, 2, "경동택배"]);
  sheet.addRow(["10/15", "업체 B", "", "품목 B", 5, null, "경동택배"]);
  sheet.addRow(["10/14", "업체 C", "아산", "품목 C", 10, 1, "용차"]);
  const rows = extractComparisonShipments(sheet, "2026-10-15");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.customer), ["업체 A", "업체 B"]);
  assert.equal(rows[1].location, "");
  assert.equal(rows[1].transport, "경동택배");
});
test("선택한 연월에 맞는 시트를 앞자리 0 유무와 관계없이 찾는다", () => {
  const workbook = new ExcelJS.Workbook();
  const september = workbook.addWorksheet("26년 09월");
  const october = workbook.addWorksheet("26년 10월");
  assert.equal(findComparisonSheet(workbook, "2026-09-14"), september);
  assert.equal(findComparisonSheet(workbook, "2026-10-15"), october);
  assert.equal(findComparisonSheet(workbook, "2026-11-15"), null);
  assert.equal(findComparisonSheet(workbook, "2026-00-15"), null);
});
test("병합된 날짜와 업체·운송 방식은 각 품목에 반영한다", () => {
  const sheet = new ExcelJS.Workbook().addWorksheet("26년 10월");
  sheet.addRow(["일자", "업체명", "업체위치", "품명", "물류"]);
  sheet.addRow(["10/14", "업체", "평택", "품목 A", "2호 차량(3.5t)"]);
  sheet.addRow([null, null, null, "품목 B", null]);
  for (const col of ["A", "B", "C", "E"]) sheet.mergeCells(`${col}2:${col}3`);
  const rows = extractComparisonShipments(sheet, "2026-10-14");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].customer, "업체");
  assert.equal(rows[1].transport, "2호 차량(3.5t)");
});
