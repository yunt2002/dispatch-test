import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import {
  computePallets,
  extractShipments,
  isMonthSheetName,
  listMonthSheets,
} from "./delivery-excel";

describe("delivery excel parser", () => {
  it("recognizes YY년 MM월 sheet names", () => {
    assert.equal(isMonthSheetName("26년 09월"), true);
    assert.equal(isMonthSheetName("26년 9월"), true);
    assert.equal(isMonthSheetName("복구됨_Sheet1"), false);
  });

  it("lists month sheets from workbook", () => {
    const wb = new ExcelJS.Workbook();
    const a = wb.addWorksheet("26년 09월");
    a.getRow(2).values = ["일자", "업체명"];
    a.getRow(3).values = ["2026-09-01", "A"];
    wb.addWorksheet("XXXXXXXXX");
    assert.deepEqual(listMonthSheets(wb), ["26년 09월"]);
  });

  it("forward-fills date/customer/location but not logistics", () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("26년 09월");
    sheet.getRow(2).values = [
      ,
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
      "ERP",
      "비고 / 개별화물 도착지",
    ];
    sheet.getRow(3).values = [
      ,
      new Date("2026-09-01"),
      "만도브로제",
      "인천",
      "P-001",
      "품목A",
      ,
      ,
      ,
      100,
      10,
      10,
      "2호 차량(3.5t)",
      "강명석",
      ,
      "",
    ];
    sheet.getRow(4).values = [
      ,
      ,
      ,
      ,
      "P-002",
      "품목B",
      ,
      ,
      ,
      50,
      5,
      10,
      ,
      ,
      ,
      "",
    ];

    const parsed = extractShipments(sheet);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].deliveryDate, "2026-09-01");
    assert.equal(parsed.rows[1].deliveryDate, "2026-09-01");
    assert.equal(parsed.rows[1].customerName, "만도브로제");
    assert.equal(parsed.rows[1].location, "인천");
    assert.equal(parsed.rows[1].logistics, "");
    assert.ok(parsed.rows[1].issues.some((issue) => issue.includes("물류 빈칸")));
  });

  it("normalizes weekday dates like 1/2(금) using the sheet year", () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("26년 09월");
    sheet.getRow(2).values = [, "일자", "업체명", "업체위치", "품번", "품명", , , , "수량 합계", "박스수량"];
    sheet.getRow(3).values = [, "9/15(화)", "만도브로제", "인천", "P-001", "품목A", , , , 100, 10];
    const parsed = extractShipments(sheet);
    assert.equal(parsed.rows[0]?.deliveryDate, "2026-09-15");
    assert.equal(parsed.rows[0]?.location, "인천");
  });

  it("never invents PLT from boxes without master", () => {
    const missing = computePallets({ boxCount: 20, boxesPerPallet: null });
    assert.equal(missing.pallets, null);
    assert.ok(missing.warning?.includes("PLT") || missing.warning?.includes("환산"));
    const ok = computePallets({ boxCount: 20, boxesPerPallet: 8 });
    assert.equal(ok.pallets, 3);
    assert.equal(ok.source, "boxes");
  });

  it("estimates PLT from weight when kg/PLT is known", () => {
    const fromWeight = computePallets({
      boxCount: 20,
      boxesPerPallet: null,
      totalWeight: 1400,
      kgPerPallet: 700,
    });
    assert.equal(fromWeight.pallets, 2);
    assert.equal(fromWeight.source, "weight");
  });
});
