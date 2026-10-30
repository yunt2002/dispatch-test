import { NextResponse } from "next/server";
import { saveVehicleVisitOrder } from "@/lib/route-order";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    date?: string;
    vehicleId?: string;
    stopIds?: unknown;
    batchId?: string | null;
  };

  const stopIds = Array.isArray(body.stopIds)
    ? body.stopIds.filter((id): id is string => typeof id === "string")
    : [];

  const result = await saveVehicleVisitOrder({
    date: body.date ?? "",
    vehicleId: body.vehicleId ?? "",
    stopIds,
    batchId: typeof body.batchId === "string" ? body.batchId : null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
