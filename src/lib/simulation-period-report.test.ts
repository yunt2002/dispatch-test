import { strict as assert } from "node:assert";
import { test } from "node:test";
import { periodDistribution, periodRecords, type PeriodRecord } from "./simulation-period-report";
import type { HistoryMetrics } from "./simulation-history";

const metrics = { originalCost: 100, proposedCost: 80, comparable: false, aiAdjusted: false } as HistoryMetrics;
const row = (id: string, date: string, savedAt: string, values: Partial<HistoryMetrics> = {}): PeriodRecord => ({ id, date, savedAt, review: "확인 필요", metrics: { ...metrics, ...values } });
test("기간 내 날짜별 최신 기록을 택하고 사용자의 선택을 반영한다", () => {
  const rows = [row("old", "2026-11-02", "2026-11-02T01:00:00Z"), row("new", "2026-11-02", "2026-11-02T02:00:00Z"), row("three", "2026-11-03", "2026-11-03T01:00:00Z"), row("other", "2026-11-04", "2026-11-04T01:00:00Z")];
  assert.deepEqual(periodRecords(rows, "2026-11-02", "2026-11-03", {}).map((r) => r.id), ["new", "three"]);
  assert.deepEqual(periodRecords(rows, "2026-11-02", "2026-11-03", { "2026-11-02": "old" }).map((r) => r.id), ["old", "three"]);
  assert.deepEqual(periodRecords(rows, "2026-11-04", "2026-11-02", {}), []);
});
test("비용 결과는 참고와 미확인을 구분한다", () => {
  const rows = [row("a", "2026-11-02", "1"), row("b", "2026-11-03", "2", { proposedCost: null }), row("c", "2026-11-04", "3", { proposedCost: 120 })];
  assert.deepEqual(periodDistribution(rows), { decrease: 1, equal: 0, increase: 1, unknown: 1, needsReview: 3 });
});
