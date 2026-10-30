import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { RouteSolveResult } from "@/lib/route-solve";
import { resolveRouteScope } from "@/lib/dispatch-batches";

export type RouteSnapshot = { result: RouteSolveResult; signature: string; savedAt: string };

export async function routeInputSignature(date: string, batchId?: string | null): Promise<string> {
  const scope = await resolveRouteScope(date, batchId);
  const [entries, vehicles] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: scope.where,
      select: { id: true, updatedAt: true }, orderBy: { id: "asc" },
    }),
    prisma.vehicleType.findMany({ select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }),
  ]);
  return createHash("sha256").update(JSON.stringify({ entries, vehicles })).digest("hex");
}

function snapshotKey(date: string, batchId?: string | null) { return `route_snapshot:v2:${date}:${batchId || "pending"}`; }

export async function readRouteSnapshot(date: string, batchId?: string | null): Promise<RouteSnapshot | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: snapshotKey(date, batchId) } });
  if (!setting) return null;
  try {
    const value = JSON.parse(setting.value) as RouteSnapshot;
    if (!value.result?.ok || !Array.isArray(value.result.routes) || typeof value.signature !== "string" || typeof value.savedAt !== "string") return null;
    return value;
  } catch { return null; }
}

export async function writeRouteSnapshot(date: string, snapshot: RouteSnapshot, batchId?: string | null) {
  const key = snapshotKey(date, batchId);
  const value = JSON.stringify(snapshot);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
