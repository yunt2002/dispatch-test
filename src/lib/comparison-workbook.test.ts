import { strict as assert } from "node:assert";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { extractComparisonShipments } from "./comparison-workbook";

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
