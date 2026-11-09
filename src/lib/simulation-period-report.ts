import type { HistoryMetrics, HistoryReview } from "./simulation-history";

export type PeriodRecord = { id: string; date: string; savedAt: string; review: HistoryReview; metrics: HistoryMetrics };

/** 기간에 속한 각 날짜에서 사용자가 고른 기록 또는 가장 최근 기록 하나를 사용한다. */
export function periodRecords<T extends PeriodRecord>(records: T[], start: string, end: string, choices: Record<string, string>): T[] {
  if (!start || !end || start > end) return [];
  const dates = new Map<string, T[]>();
  for (const record of records) {
    if (record.date < start || record.date > end) continue;
    dates.set(record.date, [...(dates.get(record.date) ?? []), record]);
  }
  return [...dates.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => {
    entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
    return entries.find((record) => record.id === choices[date]) ?? entries[0];
  });
}

/** 미확인·조정안도 참고 건수로 포함하며 금액이 없는 건은 별도로 센다. */
export function periodDistribution(records: PeriodRecord[]) {
  const result = { decrease: 0, equal: 0, increase: 0, unknown: 0, needsReview: 0 };
  for (const record of records) {
    const { originalCost, proposedCost } = record.metrics;
    if (record.review !== "검토 완료" || !record.metrics.comparable || record.metrics.aiAdjusted) result.needsReview++;
    if (originalCost == null || proposedCost == null || !Number.isFinite(originalCost) || !Number.isFinite(proposedCost)) result.unknown++;
    else if (proposedCost < originalCost) result.decrease++;
    else if (proposedCost > originalCost) result.increase++;
    else result.equal++;
  }
  return result;
}
