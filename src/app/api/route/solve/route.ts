import { NextResponse } from "next/server";
import { solveRoutesForDate } from "@/lib/route-solve";
import { todayISO } from "@/lib/format";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const date = body.date?.trim() || todayISO();
  const result = await solveRoutesForDate(date);
  return NextResponse.json(result);
}
