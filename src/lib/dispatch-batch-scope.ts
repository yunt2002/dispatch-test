import type { Prisma } from "@prisma/client";

export type DispatchBatch = { id: string; date: string; createdAt: string; entryIds: string[] };

/** 현재 남아 있는 확정·완료 납품이 있는 묶음만 표시한다. 번호는 원래 확정 순서를 유지한다. */
export function visibleDispatchBatches(batches: DispatchBatch[], activeIds: ReadonlySet<string>): { batch: DispatchBatch; number: number; remaining: number }[] {
  return batches.flatMap((batch, index) => {
    const remaining = batch.entryIds.filter((id) => activeIds.has(id)).length;
    return remaining ? [{ batch, number: batches.length - index, remaining }] : [];
  });
}

export function routeScopeWhere(date: string, batchId: string | null | undefined, batches: DispatchBatch[]): { where: Prisma.ScheduleEntryWhereInput; valid: boolean } {
  if (!batchId) return { where: { deliveryDate: date, status: "PLANNED" }, valid: true };
  const dateBatches = batches.filter((batch) => batch.date === date);
  if (batchId === "legacy") {
    return { where: { deliveryDate: date, status: { in: ["CONFIRMED", "DONE"] }, id: { notIn: dateBatches.flatMap((batch) => batch.entryIds) } }, valid: true };
  }
  const batch = dateBatches.find((item) => item.id === batchId);
  return batch
    ? { where: { deliveryDate: date, status: { in: ["CONFIRMED", "DONE"] }, id: { in: batch.entryIds } }, valid: true }
    : { where: { id: { in: [] } }, valid: false };
}
