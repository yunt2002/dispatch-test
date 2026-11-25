import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readStoredRouteSnapshot, routeInputSignatures, writeRouteSnapshot } from "@/lib/route-snapshot";
import { isRoutePriorityId } from "@/lib/route-priority";
import { hasStaleCharterGrouping, matchesRouteInputSignature } from "@/lib/confirmed-route-state";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    date?: string; batchId?: string | null; vehicleId?: string; expectedRevision?: string; option?: {
      priority?: string; label?: string; distanceKm?: number; durationMin?: number;
      tollWon?: number | null; path?: { lat: number; lng: number }[];
      legDurationsSec?: number[] | null;
    };
  } | null;
  const { date, vehicleId, option, expectedRevision } = body ?? {};
  const batchId = typeof body?.batchId === "string" ? body.batchId : null;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof vehicleId !== "string" || !vehicleId || !option ||
      !option.priority || !isRoutePriorityId(option.priority) || typeof option.label !== "string" || option.label.length > 40 ||
      typeof option.distanceKm !== "number" || !Number.isFinite(option.distanceKm) || option.distanceKm < 0 ||
      typeof option.durationMin !== "number" || !Number.isFinite(option.durationMin) || option.durationMin < 0 ||
      !(option.tollWon === null || (typeof option.tollWon === "number" && Number.isFinite(option.tollWon) && option.tollWon >= 0)) ||
      !(option.legDurationsSec === null || (Array.isArray(option.legDurationsSec) && option.legDurationsSec.length <= 1000 && option.legDurationsSec.every((duration) => typeof duration === "number" && Number.isFinite(duration) && duration >= 0))) ||
      !Array.isArray(option.path) || option.path.length < 2 || option.path.length > 100000 ||
      !option.path.every((p) => p && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180)) {
    return NextResponse.json({ error: "경로 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof expectedRevision !== "string" || !expectedRevision || expectedRevision.length > 80) {
    return NextResponse.json({ error: "저장된 최신 경로를 불러온 뒤 다시 시도하세요." }, { status: 409 });
  }
  const { distanceKm, durationMin, tollWon, legDurationsSec, priority, label } = option;
  const path = option.path.map(({ lat, lng }, index) => index === 0 ? { lat, lng, label: "출" } : { lat, lng });
  const revision = randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    const [stored, signatures] = await Promise.all([
      readStoredRouteSnapshot(date, batchId), routeInputSignatures(date, batchId),
    ]);
    const snapshot = stored?.snapshot;
    if (!stored || !snapshot || !matchesRouteInputSignature(snapshot.signature, signatures)) {
      return NextResponse.json({ error: "일정이 변경되었습니다. 경로를 다시 계산하세요." }, { status: 409 });
    }
    if (hasStaleCharterGrouping(snapshot)) {
      return NextResponse.json({ error: "용차 경로를 다시 계산한 뒤 저장해 주세요." }, { status: 409 });
    }
    const route = snapshot.result.routes.find((item) => item.vehicleId === vehicleId);
    if (!route || (route.revision ?? snapshot.savedAt) !== expectedRevision) {
      return NextResponse.json({ error: "이 차량의 저장 경로가 변경되었습니다. 최신 저장 경로를 먼저 확인하세요." }, { status: 409 });
    }
    snapshot.result.routes = snapshot.result.routes.map((item) => item === route ? {
      ...item, revision, totalDistanceKm: distanceKm, totalTimeMin: durationMin, tollWon,
      stopDurationsSec: legDurationsSec?.length && legDurationsSec.length >= route.stopIds.length ? legDurationsSec.slice(0, route.stopIds.length) : null,
      path, priority, priorityLabel: label,
    } : item);
    if (await writeRouteSnapshot(date, { ...snapshot, signature: signatures.current }, batchId, stored.value)) {
      return NextResponse.json({ ok: true, revision });
    }
  }
  return NextResponse.json({ error: "경로 저장이 겹쳤습니다. 최신 저장 경로를 불러온 뒤 다시 시도하세요." }, { status: 409 });
}
