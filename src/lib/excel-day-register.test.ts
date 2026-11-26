import { strict as assert } from "node:assert";
import { test } from "node:test";
import ExcelJS from "exceljs";
import {
  EXCEL_DAY_PRESERVED_STATUSES,
  extractNoteAddress,
  logisticsVehicleHint,
  missingLocationNames,
  missingProductNames,
  extractNoteCharterFare,
  notesWithCharterFare,
  notesWithExcelDayMeta,
  notesWithWorkbookAddress,
  parseExcelDayRegisterRows,
  recommendExcelDayRow,
  summarizeExcelDayRegisterRows,
} from "./excel-day-register";
import { excelUploadError } from "./excel-upload";
import { explicitScheduleVehicleReason } from "./schedule-vehicle-source";

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
  const options = { vehicles: [], regions: new Map() };
  const noBox = recommendExcelDayRow(rows[1], options);
  assert.deepEqual([noBox.quantity, noBox.boxCount, noBox.palletCount], [5, null, null]);
  const withBox = recommendExcelDayRow(rows[0], options);
  assert.deepEqual([withBox.quantity, withBox.boxCount, withBox.palletCount], [10, 2, 0]);
});

test("개정안 PLT·용차비용 헤더에서 PLT만 읽고 수량합계는 PLT로 쓰지 않는다", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("26년 11월");
  sheet.addRow([
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
    "박스/개입",
    "PLT",
    "물류",
    "납품직원",
    "용차비용",
    "비고 / 개별화물 도착지",
  ]);
  sheet.addRow(["11/26", "DY AUTO", "창원", "P1", "AY/QY", null, null, null, 704700, 243, null, 5, "용차 (동해화물)", null, 500000, null]);
  sheet.addRow(["11/26", "현담산업", "아산", "P2", "DM 4545", null, null, null, 4800, 48, null, null, "2호 차량(3.5t)", null, null, null]);
  sheet.addRow(["11/26", "만도 평택공장", "평택", "P3", "MPS", null, null, null, 6912, 144, null, 1.5, "2호 차량(3.5t)", null, "MR438A0100", null]);
  const rows = parseExcelDayRegisterRows(workbook, "2026-11-26");
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => [row.quantity, row.boxCount, row.palletCount, row.charterFare, row.vehicleHint]),
    [
      [704700, 243, 5, 500000, "용차"],
      [4800, 48, null, null, "2호차"],
      [6912, 144, 1.5, null, "2호차"],
    ],
  );
  const options = { vehicles: [], regions: new Map() };
  assert.deepEqual(
    rows.map((row) => {
      const { quantity, boxCount, palletCount } = recommendExcelDayRow(row, options);
      return [quantity, boxCount, palletCount];
    }),
    [
      [704700, 243, 5],
      [4800, 48, null],
      [6912, 144, 1.5],
    ],
  );
  assert.equal(
    notesWithExcelDayMeta({ address: "창원시 진해구 신항10로 12", charterFare: rows[0].charterFare }),
    "주소: 창원시 진해구 신항10로 12\n용차비: 500000",
  );
});

test("음수 수량·박스 조정행은 PLT를 적재 합산에 넣지 않는다", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("26년 11월");
  sheet.addRow(["일자", "업체명", "업체위치", "품명", "수량 합계", "박스수량", "PLT", "물류"]);
  sheet.addRow(["11/27", "현대엘리베이터", "충주", "GA160-N극", 2400, 50, 2, "1호 차량(4t)"]);
  sheet.addRow(["11/27", "현대엘리베이터", "충주", "GA160-N극", -2400, -50, 2, "1호 차량(4t)"]);
  const rows = parseExcelDayRegisterRows(workbook, "2026-11-27");
  const options = { vehicles: [], regions: new Map() };
  assert.deepEqual(
    rows.map((row) => {
      const { quantity, boxCount, palletCount } = recommendExcelDayRow(row, options);
      return [quantity, boxCount, palletCount];
    }),
    [
      [2400, 50, 2],
      [-2400, null, null],
    ],
  );
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

test("엑셀 지정과 AI 반영을 배차 재추천에서 고정한다", () => {
  const reason = "엑셀 물류 그대로 · 2호차";
  const simulation = "AI 시뮬 배정 (AI)";
  assert.equal(explicitScheduleVehicleReason({ source: "EXCEL", recommendationReason: `${reason}\n권역 추천` }), reason);
  assert.equal(explicitScheduleVehicleReason({ source: "EXCEL", recommendationReason: "권역 추천" }), null);
  assert.equal(explicitScheduleVehicleReason({ source: "MANUAL", recommendationReason: reason }), null);
  assert.equal(explicitScheduleVehicleReason({ source: "EXCEL", recommendationReason: `${simulation}\n${reason}` }), simulation);
  assert.equal(explicitScheduleVehicleReason({ source: "MANUAL", recommendationReason: `기존 추천\n${simulation}` }), simulation);
});

test("엑셀 업로드는 내용이 있는 4 MB 이하 .xlsx 파일을 허용한다", () => {
  assert.equal(excelUploadError({ name: "일정.XLSX", size: 4_000_000 }), null);
  assert.match(excelUploadError({ name: "일정.xlsx", size: 4_000_001 }) ?? "", /4 MB/);
  assert.match(excelUploadError({ name: "일정.xlsx", size: 0 }) ?? "", /내용/);
  assert.match(excelUploadError({ name: "일정.xls", size: 100 }) ?? "", /\.xlsx/);
});

test("비고 도로명을 notes 주소 형식으로 붙인다", () => {
  assert.equal(notesWithWorkbookAddress("김해시 상동로 504"), "주소: 김해시 상동로 504");
  assert.equal(notesWithWorkbookAddress("김해시 상동로 504", "긴급"), "긴급\n주소: 김해시 상동로 504");
  assert.equal(notesWithWorkbookAddress(null, "메모"), "메모");
  assert.equal(extractNoteAddress("주소: 경상남도 창원시 진해구 신항10로 12"), "경상남도 창원시 진해구 신항10로 12");
  assert.equal(extractNoteAddress("긴급\n주소: 세종특별자치시 연서면 공단로 117"), "세종특별자치시 연서면 공단로 117");
  assert.equal(extractNoteAddress("일반 메모"), null);
});

test("용차비 메모를 붙이고 읽는다", () => {
  assert.equal(notesWithCharterFare(250000), "용차비: 250000");
  assert.equal(notesWithCharterFare(250000, "주소: 충주시 용탄동"), "주소: 충주시 용탄동\n용차비: 250000");
  assert.equal(notesWithCharterFare(null, "메모"), "메모");
  assert.equal(extractNoteCharterFare("용차비: 250000"), 250000);
  assert.equal(extractNoteCharterFare("주소: A\n용차비: 500,000"), 500000);
  assert.equal(extractNoteCharterFare("일반 메모"), null);
});
