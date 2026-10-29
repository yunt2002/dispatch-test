import { NextResponse } from "next/server";
import { fetchRouteAlternatives } from "@/lib/route-alternatives";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    points?: { lat?: number; lng?: number }[];
    carType?: number;
  };

  const points = (body.points ?? [])
    .map((point) => ({
      lat: Number(point.lat),
      lng: Number(point.lng),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (points.length < 2) {
    return NextResponse.json(
      { ok: false, options: [], error: "출발·도착 좌표가 필요합니다." },
      { status: 400 },
    );
  }

  const carType = body.carType === 2 ? 2 : 1;
  const result = await fetchRouteAlternatives(points, carType);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
