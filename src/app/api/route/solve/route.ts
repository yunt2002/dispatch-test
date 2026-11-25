import { NextResponse } from "next/server";
import { solveRoutesForDate } from "@/lib/route-solve";
import { todayISO } from "@/lib/format";
import { routeInputSignatures, writeRouteSnapshot } from "@/lib/route-snapshot";
import { resolveRouteScope } from "@/lib/dispatch-batches";
import { CHARTER_GROUPING_VERSION } from "@/lib/confirmed-route-state";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { date?: string; tripMode?: string; batchId?: string | null };
  const date = body.date?.trim() || todayISO();
  const batchId = typeof body.batchId === "string" ? body.batchId : null;
  if (!(await resolveRouteScope(date, batchId)).valid) return NextResponse.json({ error: "확정 배차를 찾을 수 없습니다." }, { status: 404 });
  const before = (await routeInputSignatures(date, batchId)).current;
  const result = await solveRoutesForDate(date, body.tripMode === "oneway" ? "oneway" : "roundtrip", batchId);
  const after = (await routeInputSignatures(date, batchId)).current;
  if (before !== after) {
    return NextResponse.json({ ...result, ok: false, routes: [], unassigned: [], stale: true, note: "경로를 계산하는 동안 납품 목록이 바뀌었습니다. 다시 계산해 주세요." });
  }
  if (result.ok && before === after) {
    const savedAt = new Date().toISOString();
    try {
      await writeRouteSnapshot(date, { result, signature: after, savedAt, charterGroupingVersion: CHARTER_GROUPING_VERSION }, batchId);
      return NextResponse.json({ ...result, savedAt, stale: false });
    } catch {
      return NextResponse.json({ ...result, stale: false, snapshotError: true });
    }
  }
  return NextResponse.json({ ...result, stale: before !== after });
}
