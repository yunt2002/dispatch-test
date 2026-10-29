import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { RouteSolveResult } from "@/lib/route-solve";

export type RouteSnapshot = { result: RouteSolveResult; signature: string; savedAt: string };

export async function routeInputSignature(date: string): Promise<string> {
  const [entries, vehicles] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: { deliveryDate: date, status: { in: ["PLANNED", "CONFIRMED"] } },
      select: { id: true, updatedAt: true }, orderBy: { id: "asc" },
    }),
    prisma.vehicleType.findMany({ select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }),
  ]);
  return createHash("sha256").update(JSON.stringify({ entries, vehicles })).digest("hex");
}

export async function readRouteSnapshot(date: string): Promise<RouteSnapshot | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: `route_snapshot:${date}` } });
  if (!setting) return null;
  try {
    const value = JSON.parse(setting.value) as RouteSnapshot;
    if (!value.result?.ok || !Array.isArray(value.result.routes) || typeof value.signature !== "string" || typeof value.savedAt !== "string") return null;
    return value;
  } catch { return null; }
}

export async function writeRouteSnapshot(date: string, snapshot: RouteSnapshot) {
  const key = `route_snapshot:${date}`;
  const value = JSON.stringify(snapshot);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
