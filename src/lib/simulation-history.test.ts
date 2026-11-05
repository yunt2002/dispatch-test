import { strict as assert } from "node:assert";
import { test } from "node:test";
import { historyMetrics, validHistorySnapshot, type SimulationHistorySnapshot } from "./simulation-history";
import type { SimulationItem, SimulationResult, SimulationRoute } from "./simulation";

function fixture(): SimulationHistorySnapshot {
  const own = { rowNumber: 1, customer: "현담산업", location: "아산", product: "A", transport: "1호 차량", vehicle: "1호차", address: "주소", boxes: 1, pallets: 1 } as SimulationItem;
  const parcel = { rowNumber: 2, customer: "업체", location: "세종", product: "B", transport: "택배", vehicle: null, boxes: 10, pallets: 1 } as SimulationItem;
  const route = { vehicle: "1호차", items: [own], minutes: 100, fuel: 8000, toll: 2000, pallets: 1, weight: 10, unknownPallets: 0, unknownWeight: 0, over: false } as SimulationRoute;
  const empty = { ...route, vehicle: "2호차", items: [], minutes: 0, fuel: 0, toll: 0 };
  const result = { items: [own, parcel], original: [route, empty], proposed: [route, empty], remaining: [parcel], warnings: [], charterGroups: [], note: "Groq", candidateCountVerified: true } as SimulationResult;
  return { version: 1, date: "2026-10-15", fileName: "일정.xlsx", dieselPrice: "1800", excludedItems: [], result, originalTrips: [], proposedTrips: [], originalExtras: [], proposedExtras: [], courierChoices: { "2": { mode: "box" } }, packing: {}, review: "검토 완료", memo: "확인" };
}

test("저장 기록은 택배·용차·차량 비용과 점심·하차 시간을 서버에서 합산한다", () => {
  const snapshot = fixture();
  assert.equal(validHistorySnapshot(snapshot), true);
  const metrics = historyMetrics(snapshot);
  assert.equal(metrics.originalCost, 80000);
  assert.equal(metrics.proposedCost, 80000);
  assert.equal(metrics.originalMinutes, 340);
  assert.equal(metrics.comparable, true);
});

test("택배 미확인 또는 임의 용차는 합계 적격 기록으로 표시하지 않는다", () => {
  const snapshot = fixture();
  snapshot.courierChoices = {};
  const partial = historyMetrics(snapshot);
  assert.equal(partial.originalCost, 10000);
  assert.equal(partial.courierIncluded, false);
  assert.equal(partial.comparable, false);
  snapshot.courierChoices = { "2": { mode: "box" } };
  snapshot.originalExtras = [{ id: "extra:1", leg: "one_way", rowNumbers: [1], fare: "300000" }];
  const extra = historyMetrics(snapshot);
  assert.equal(extra.originalCost, 380000);
  assert.equal(extra.comparable, false);
  snapshot.originalExtras = [];
  snapshot.proposedExtras = [{ id: "extra:2", leg: "one_way", rowNumbers: [1], fare: "300000" }];
  assert.equal(historyMetrics(snapshot).aiAdjusted, true);
});

test("잘못된 기록 형식은 저장하지 않는다", () => {
  assert.equal(validHistorySnapshot(null), false);
  const snapshot = fixture();
  snapshot.memo = "x".repeat(2001);
  assert.equal(validHistorySnapshot(snapshot), false);
});
