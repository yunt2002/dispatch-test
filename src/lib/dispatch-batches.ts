import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { routeScopeWhere, type DispatchBatch } from "@/lib/dispatch-batch-scope";

const batchPrefix = (date: string) => `dispatch_batch:${date}:`;

export async function listDispatchBatches(date: string): Promise<DispatchBatch[]> {
  const prefix = batchPrefix(date);
  const settings = await prisma.appSetting.findMany({ where: { key: { startsWith: prefix } }, select: { key: true, value: true } });
  return settings.flatMap(({ key, value }) => {
    try {
      const batch = JSON.parse(value) as DispatchBatch;
      if (batch.id !== key.slice(prefix.length) || batch.date !== date || typeof batch.createdAt !== "string" || !Array.isArray(batch.entryIds) || !batch.entryIds.every((id) => typeof id === "string")) return [];
      return [batch];
    } catch { return []; }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 실제로 확정된 일정과 배차 묶음을 한 트랜잭션으로 기록한다. */
export async function confirmDispatchBatch(date: string, where: Prisma.ScheduleEntryWhereInput): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const entries = await tx.scheduleEntry.findMany({ where: { AND: [where, { deliveryDate: date, status: "PLANNED" }] }, select: { id: true }, orderBy: { id: "asc" } });
    const confirmedIds: string[] = [];
    for (const entry of entries) {
      const updated = await tx.scheduleEntry.updateMany({ where: { id: entry.id, deliveryDate: date, status: "PLANNED" }, data: { status: "CONFIRMED" } });
      if (updated.count) confirmedIds.push(entry.id);
    }
    if (confirmedIds.length) {
      const batch: DispatchBatch = { id: randomUUID(), date, createdAt: new Date().toISOString(), entryIds: confirmedIds };
      await tx.appSetting.create({ data: { key: batchPrefix(date) + batch.id, value: JSON.stringify(batch) } });
    }
    return confirmedIds.length;
  });
}

export async function resolveRouteScope(date: string, batchId?: string | null): Promise<{ where: Prisma.ScheduleEntryWhereInput; valid: boolean }> {
  return routeScopeWhere(date, batchId, batchId ? await listDispatchBatches(date) : []);
}
