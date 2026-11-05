import { strict as assert } from "node:assert";
import { test } from "node:test";
import { comparisonDistribution, historyMetrics, markLegacyStariaRecord, validHistorySnapshot, type SimulationHistorySnapshot } from "./simulation-history";
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

test("비용 분포는 검토 완료된 비교 가능 AI 원안만 집계한다", () => {
  const metrics = historyMetrics(fixture());
  const row = (originalCost: number, proposedCost: number) => ({ review: "검토 완료" as const, metrics: { ...metrics, originalCost, proposedCost } });
  assert.deepEqual(comparisonDistribution([row(100, 90), row(100, 100), row(100, 110), { ...row(100, 80), metrics: { ...metrics, aiAdjusted: true } }, { ...row(100, 80), review: "확인 필요" }, { ...row(100, 80), metrics: { ...metrics, comparable: false } }]), { decrease: 1, equal: 1, increase: 1, excluded: 3 });
});

test("현장 검토는 예전 기록과 호환하고 상태 및 사유를 검증한다", () => {
  const snapshot = fixture();
  assert.equal(validHistorySnapshot(snapshot), true);
  snapshot.fieldReview = { status: "조건부 가능", reason: "하차 시간 확인" };
  assert.equal(validHistorySnapshot(snapshot), true);
  snapshot.fieldReview.reason = "x".repeat(2001);
  assert.equal(validHistorySnapshot(snapshot), false);
});

test("스타리아가 포함된 새 기록을 보관하고 시간과 비용을 합산한다", () => {
  const snapshot = fixture();
  const star = { ...snapshot.result.items[0], rowNumber: 3, customer: "스타리아 납품지", vehicle: "스타리아", transport: "스타리아" } as SimulationItem;
  const starRoute = { ...snapshot.result.original[0], vehicle: "스타리아", items: [star], minutes: 30, fuel: 3000, toll: 0, maxPallet: 1, maxWeight: 1000 };
  snapshot.result.items.push(star);
  snapshot.result.original.push(starRoute);
  snapshot.result.proposed.push(starRoute);
  assert.equal(validHistorySnapshot(snapshot), true);
  const metrics = historyMetrics(snapshot);
  assert.equal(metrics.originalCost, 83000);
  assert.equal(metrics.originalMinutes, 470);
});

test("스타리아가 기타로 처리된 과거 기록은 금액을 바꾸지 않고 비교 합계에서 제외한다", () => {
  const snapshot = fixture();
  const metrics = historyMetrics(snapshot);
  snapshot.result.items.push({ ...snapshot.result.items[1], rowNumber: 3, transport: "스타리아", vehicle: null });
  const record = markLegacyStariaRecord({ id: "test", savedAt: "2026-11-05T00:00:00.000Z", snapshot, metrics });
  assert.equal(record.metrics.originalCost, metrics.originalCost);
  assert.equal(record.metrics.comparable, false);
  assert.ok(record.metrics.warnings.some((warning) => /스타리아.*이전/.test(warning)));
});
