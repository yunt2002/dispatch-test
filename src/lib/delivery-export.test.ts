import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { extractShipments, loadWorkbook } from "./delivery-excel";
import { parseExcelDayRegisterRows, recommendExcelDayRow } from "./excel-day-register";
import {
  DELIVERY_HEADERS,
  buildAllSheetsWorkbook,
  buildDeliveryWorkbook,
  formatSheetDate,
  logisticsFromEntry,
  monthSheetName,
  monthTitle,
} from "./delivery-export";

describe("delivery excel export", () => {
  it("uses the original month sheet name and title", () => {
    assert.equal(monthSheetName("2026-09-15"), "26년 09월");
    assert.equal(monthTitle("2026-09-15"), "9/1 ~ 9/30 납품 예상 일정표");
  });

  it("prints dates as 9/15(화) not Excel serial numbers", () => {
    assert.equal(formatSheetDate("2026-09-15"), "9/15(화)");
    assert.equal(formatSheetDate("2026-08-31"), "8/31(월)");
  });

  it("writes recommended vehicle into 물류 column", async () => {
    const buffer = await buildDeliveryWorkbook("2026-09-15", [
      {
        deliveryDate: "2026-09-15",
        customerName: "만도브로제",
        locationName: "인천",
        productCode: "P-001",
        productName: "로터",
        quantity: 5040,
        boxCount: 168,
        piecesPerBox: 30,
        recommendedVehicleJson: JSON.stringify({
          vehicleTypeId: "v2",
          vehicleName: "2호차",
          vehicleCount: 1,
          maxWeight: 3500,
        }),
      },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const sheet = wb.getWorksheet("26년 09월");
    assert.ok(sheet);
    assert.equal(sheet.getCell(1, 1).value, "9/1 ~ 9/30 납품 예상 일정표");
    DELIVERY_HEADERS.forEach((label, index) => {
      assert.equal(sheet.getRow(2).getCell(index + 1).value, label);
    });
    assert.equal(sheet.getRow(3).getCell(2).value, "만도브로제");
    assert.equal(sheet.getRow(3).getCell(12).value, "2호 차량(3.5t)");
    assert.equal(sheet.getRow(3).getCell(1).value, "9/15(화)");
    const headerFill = sheet.getRow(2).getCell(1).fill;
    assert.equal(headerFill.type === "pattern" ? headerFill.fgColor?.argb : undefined, "FFDBE5F1");
    const box = sheet.getRow(3).getCell(10).value;
    assert.ok(box && typeof box === "object" && "formula" in box);
    assert.equal((box as { formula: string }).formula, "I3/K3");
  });

  it("falls back to original logistics when no recommendation", () => {
    assert.equal(
      logisticsFromEntry({
        deliveryDate: "2026-09-15",
        customerName: "A",
        locationName: "울주",
        logistics: "용차",
      }),
      "용차",
    );
  });

  it("내보낸 엑셀을 바로 읽어 EA·박스·PLT의 숫자와 빈 값을 보존한다", async () => {
    const date = "2026-09-15";
    const base = { deliveryDate: date, customerName: "가상 거래처", locationName: "인천", logistics: "1호차" };
    const input = [
      { ...base, productCode: "PLT", productName: "PLT 품목", quantity: null, boxCount: null, palletCount: 3.5 },
      { ...base, productCode: "BOX", productName: "박스 품목", quantity: 120, boxCount: 12, piecesPerBox: 10, palletCount: 0 },
      { ...base, productCode: "EA", productName: "낱개 품목", quantity: 58000, boxCount: null, palletCount: null },
      { ...base, productCode: "MIX", productName: "실측 박스 품목", quantity: 100, boxCount: 13, piecesPerBox: 10, palletCount: null },
    ];
    const workbook = await loadWorkbook(await buildDeliveryWorkbook(date, input));
    const options = { vehicles: [], regions: new Map() };
    const home = parseExcelDayRegisterRows(workbook, date).map((row) => {
      const { quantity, boxCount, palletCount } = recommendExcelDayRow(row, options);
      return [quantity, boxCount, palletCount];
    });
    const plan = extractShipments(workbook.getWorksheet("26년 09월")!).rows.map((row) => [
      row.quantity, row.boxCount, row.palletCount,
    ]);
    const expected = input.map((row) => [row.quantity, row.boxCount, row.palletCount]);
    assert.deepEqual(home, expected);
    assert.deepEqual(plan, expected);
  });

  it("writes one original-style sheet per month", async () => {
    const buffer = await buildAllSheetsWorkbook(
      [
        {
          deliveryDate: "2026-09-16",
          customerName: "만도브로제",
          locationName: "인천",
          boxCount: 10,
        },
        {
          deliveryDate: "2026-10-02",
          customerName: "만도브로제",
          locationName: "인천",
          boxCount: 8,
        },
      ],
      "2026-09-16",
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    assert.deepEqual(
      wb.worksheets.map((sheet) => sheet.name),
      ["26년 09월", "26년 10월"],
    );
    assert.equal(wb.getWorksheet("26년 09월")?.getCell(1, 1).value, "9/1 ~ 9/30 납품 예상 일정표");
    assert.equal(wb.getWorksheet("26년 10월")?.getCell(1, 1).value, "10/1 ~ 10/31 납품 예상 일정표");
    assert.equal(wb.getWorksheet("26년 10월")?.getRow(3).getCell(1).value, "10/2(금)");
  });
});
