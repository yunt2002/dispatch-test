import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RouteSolveResult } from "@/lib/route-solve";
import { resolveRouteScope } from "@/lib/dispatch-batches";
import { loadDispatchCustomerAddresses } from "@/lib/dispatch-map-markers";
import { buildRouteInputSignatures, ROUTE_INPUT_SIGNATURE_PREFIX, type RouteInputSignatures } from "@/lib/route-input-signature";
import { hasStaleCharterGrouping } from "@/lib/confirmed-route-state";

export type RouteSnapshot = {
  result: RouteSolveResult;
  signature: string;
  savedAt: string;
  charterGroupingVersion?: number;
};

export async function routeInputSignatures(date: string, batchId?: string | null): Promise<RouteInputSignatures> {
  const scope = await resolveRouteScope(date, batchId);
  const [entries, vehicles, addresses] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: scope.where,
      select: {
        id: true, updatedAt: true, createdAt: true, visitOrder: true, consolidateGroupId: true,
        customerName: true, locationName: true, notes: true, selectedVehicleJson: true, recommendedVehicleJson: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.vehicleType.findMany({
      select: { id: true, updatedAt: true, isActive: true, vehicleName: true, maxPallet: true, maxWeight: true },
      orderBy: { id: "asc" },
    }),
    loadDispatchCustomerAddresses(),
  ]);
  return buildRouteInputSignatures(entries, vehicles, addresses);
}

const snapshotPrefix = (date: string) => `route_snapshot:v2:${date}:`;
function snapshotKey(date: string, batchId?: string | null) { return snapshotPrefix(date) + (batchId || "pending"); }

function parseRouteSnapshot(value: string): RouteSnapshot | null {
  try {
    const snapshot = JSON.parse(value) as RouteSnapshot;
    if (!snapshot.result?.ok || !Array.isArray(snapshot.result.routes) || typeof snapshot.signature !== "string" || typeof snapshot.savedAt !== "string") return null;
    return snapshot;
  } catch { return null; }
}

export async function readRouteSnapshot(date: string, batchId?: string | null): Promise<RouteSnapshot | null> {
  return (await readStoredRouteSnapshot(date, batchId))?.snapshot ?? null;
}

export async function readStoredRouteSnapshot(date: string, batchId?: string | null) {
  const setting = await prisma.appSetting.findUnique({
    where: { key: snapshotKey(date, batchId) }, select: { value: true },
  });
  return setting ? { value: setting.value, snapshot: parseRouteSnapshot(setting.value) } : null;
}

/** 완료 상태로 updatedAt이 바뀌기 전에 유효한 기존 경로를 새 기준으로 옮긴다. */
export async function preserveConfirmedRouteSnapshots(date: string) {
  try {
    const prefix = snapshotPrefix(date);
    const settings = await prisma.appSetting.findMany({
      where: {
        key: { startsWith: prefix, not: snapshotKey(date) },
        NOT: { value: { contains: `"signature":"${ROUTE_INPUT_SIGNATURE_PREFIX}` } },
      },
      select: { key: true, value: true },
    });
    await Promise.all(settings.map(async ({ key, value }) => {
      const snapshot = parseRouteSnapshot(value);
      if (!snapshot || hasStaleCharterGrouping(snapshot)) return;
      const signatures = await routeInputSignatures(date, key.slice(prefix.length));
      if (snapshot.signature !== signatures.legacy) return;
      await prisma.appSetting.updateMany({
        where: { key, value },
        data: { value: JSON.stringify({ ...snapshot, signature: signatures.current }) },
      });
    }));
  } catch (error) {
    console.error("완료 상태 변경 전 기존 경로 갱신 실패", date, error);
  }
}

export async function writeRouteSnapshot(
  date: string,
  snapshot: RouteSnapshot,
  batchId: string | null,
  expectedValue: string | null,
): Promise<boolean> {
  const key = snapshotKey(date, batchId);
  const value = JSON.stringify(snapshot);
  if (expectedValue !== null) {
    const updated = await prisma.appSetting.updateMany({ where: { key, value: expectedValue }, data: { value } });
    return updated.count === 1;
  }
  try {
    await prisma.appSetting.create({ data: { key, value } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}
