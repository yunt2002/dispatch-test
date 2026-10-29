import { NextResponse } from "next/server";
import { readRouteSnapshot, routeInputSignature, writeRouteSnapshot } from "@/lib/route-snapshot";
import { isRoutePriorityId } from "@/lib/route-priority";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    date?: string; vehicleId?: string; option?: {
      priority?: string; label?: string; distanceKm?: number; durationMin?: number;
      tollWon?: number | null; path?: { lat: number; lng: number }[];
      legDurationsSec?: number[] | null;
    };
  } | null;
  const { date, vehicleId, option } = body ?? {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !vehicleId || !option ||
      !option.priority || !isRoutePriorityId(option.priority) || typeof option.label !== "string" || option.label.length > 40 ||
      typeof option.distanceKm !== "number" || !Number.isFinite(option.distanceKm) || option.distanceKm < 0 ||
      typeof option.durationMin !== "number" || !Number.isFinite(option.durationMin) || option.durationMin < 0 ||
      !(option.tollWon === null || (typeof option.tollWon === "number" && Number.isFinite(option.tollWon) && option.tollWon >= 0)) ||
      !(option.legDurationsSec === null || (Array.isArray(option.legDurationsSec) && option.legDurationsSec.length <= 1000 && option.legDurationsSec.every((duration) => typeof duration === "number" && Number.isFinite(duration) && duration >= 0))) ||
      !Array.isArray(option.path) || option.path.length < 2 || option.path.length > 100000 ||
      !option.path.every((p) => Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180)) {
    return NextResponse.json({ error: "경로 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const [snapshot, signature] = await Promise.all([readRouteSnapshot(date), routeInputSignature(date)]);
  if (!snapshot || snapshot.signature !== signature || !snapshot.result.routes.some((route) => route.vehicleId === vehicleId)) {
    return NextResponse.json({ error: "일정이 변경되었습니다. 경로를 다시 계산하세요." }, { status: 409 });
  }
  snapshot.result.routes = snapshot.result.routes.map((route) => route.vehicleId === vehicleId ? {
    ...route, totalDistanceKm: option.distanceKm!, totalTimeMin: option.durationMin!, tollWon: option.tollWon!,
    stopDurationsSec: option.legDurationsSec?.length && option.legDurationsSec.length >= route.stopIds.length ? option.legDurationsSec.slice(0, route.stopIds.length) : null,
    path: option.path!.map((point, index) => index === 0 ? { ...point, label: "출" } : point),
    priority: option.priority, priorityLabel: option.label,
  } : route);
  await writeRouteSnapshot(date, snapshot);
  return NextResponse.json({ ok: true });
}
