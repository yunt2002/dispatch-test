import { NextResponse } from "next/server";
import { solveRoutesForDate } from "@/lib/route-solve";
import { todayISO } from "@/lib/format";
import { routeInputSignature, writeRouteSnapshot } from "@/lib/route-snapshot";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { date?: string; tripMode?: string };
  const date = body.date?.trim() || todayISO();
  const before = await routeInputSignature(date);
  const result = await solveRoutesForDate(date, body.tripMode === "oneway" ? "oneway" : "roundtrip");
  const after = await routeInputSignature(date);
  if (result.ok && before === after) {
    const savedAt = new Date().toISOString();
    try {
      await writeRouteSnapshot(date, { result, signature: after, savedAt });
      return NextResponse.json({ ...result, savedAt, stale: false });
    } catch {
      return NextResponse.json({ ...result, stale: false, snapshotError: true });
    }
  }
  return NextResponse.json({ ...result, stale: before !== after });
}
