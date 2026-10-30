import type { Prisma } from "@prisma/client";

export type DispatchBatch = { id: string; date: string; createdAt: string; entryIds: string[] };

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
