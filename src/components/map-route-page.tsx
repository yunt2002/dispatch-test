import { DateSwitcher } from "@/components/date-switcher";
import { MapRouteWorkspace } from "@/components/map-route-workspace";
import { buildDispatchMapMarkers } from "@/lib/dispatch-map-markers";
import { formatNumber, formatSheetDate, todayISO } from "@/lib/format";
import { geocodingStatus } from "@/lib/geocoding";
import { prisma } from "@/lib/prisma";
import { readRouteSnapshot, routeInputSignature } from "@/lib/route-snapshot";
import { groupRouteStops } from "@/lib/route-stop-groups";
import { parseJson } from "@/lib/format";
import type { VehicleRecommendation } from "@/lib/dispatch-group";
import { listDispatchBatches, resolveRouteScope } from "@/lib/dispatch-batches";
import { RouteBatchSelect } from "@/components/route-batch-select";
import { snapshotMatchesScope } from "@/lib/route-snapshot-scope";

export default async function MapRoutePage({
  searchParams,
  embedded = false,
}: {
  searchParams: Promise<{ date?: string; batch?: string }>;
  embedded?: boolean;
}) {
  const params = await searchParams;

  const scheduleDates = await prisma.scheduleEntry.findMany({
    distinct: ["deliveryDate"],
    select: { deliveryDate: true },
    orderBy: { deliveryDate: "desc" },
  });

  const knownDates = [...new Set(scheduleDates.map((item) => item.deliveryDate))].sort((a, b) =>
    b.localeCompare(a),
  );
  const today = todayISO();
  const date = params.date || (knownDates.includes(today) ? today : knownDates[0]) || today;
  const batchId = params.batch?.trim() || null;

  const [entries, batches, scope] = await Promise.all([prisma.scheduleEntry.findMany({
    where: { deliveryDate: date, status: { not: "CANCELLED" } },
    orderBy: [{ createdAt: "desc" }, { locationName: "asc" }],
  }), listDispatchBatches(date), resolveRouteScope(date, batchId)]);
  const activeEntries = await prisma.scheduleEntry.findMany({ where: scope.where, orderBy: [{ createdAt: "desc" }, { locationName: "asc" }] });
  const entryIds = new Set(entries.filter((entry) => entry.status === "CONFIRMED" || entry.status === "DONE").map((entry) => entry.id));
  const batchOptions = batches.map((batch, index) => {
    const time = new Date(batch.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
    const remaining = batch.entryIds.filter((id) => entryIds.has(id)).length;
    return { id: batch.id, label: `확정 배차 ${batches.length - index} · ${time} · ${remaining}/${batch.entryIds.length}건` };
  });
  const batchedIds = new Set(batches.flatMap((batch) => batch.entryIds));
  const legacyCount = entries.filter((entry) => (entry.status === "CONFIRMED" || entry.status === "DONE") && !batchedIds.has(entry.id)).length;
  if (legacyCount) batchOptions.push({ id: "legacy", label: `이전 확정 배차 · ${legacyCount}건` });
  const rawMarkers = await buildDispatchMapMarkers(activeEntries);
  const entriesById = new Map(activeEntries.map((entry) => [entry.id, entry]));
  const mapMarkers = groupRouteStops(rawMarkers.map((marker) => {
    const entry = entriesById.get(marker.id)!;
    const selected = parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null) ??
      parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
    return { ...marker, consolidateGroupId: entry.consolidateGroupId, customerName: entry.customerName,
      locationName: entry.locationName, vehicleId: selected?.vehicleTypeId ?? null };
  })).map(({ stop, memberIds }) => ({
    ...stop,
    title: memberIds.length > 1 ? `${stop.title} (${memberIds.length}품목)` : stop.title,
    items: memberIds.map((id) => {
      const entry = entriesById.get(id)!;
      const quantityLabel = [
        entry.boxCount != null ? `${formatNumber(entry.boxCount)} 박스` : null,
        entry.palletCount != null ? `${formatNumber(entry.palletCount)} PLT` : null,
      ].filter(Boolean).join(" · ") || "수량 미확인";
      return { id, productName: entry.productName?.trim() || "품명 미입력", quantityLabel };
    }),
  }));
  const geo = geocodingStatus();
  const boardHref = `/?date=${encodeURIComponent(date)}`;
  const [snapshot, signature] = await Promise.all([readRouteSnapshot(date, batchId), routeInputSignature(date, batchId)]);
  const scopeChanged = !!snapshot && !snapshotMatchesScope(snapshot.result, activeEntries.map((entry) => entry.id));
  const initialResult = snapshot && !scopeChanged ? { ...snapshot.result, savedAt: snapshot.savedAt, stale: snapshot.signature !== signature || snapshot.result.routes.some((route) => !route.stopMemberIds) } : null;

  return (
    <div className="dispatch-page map-page">
      {!embedded ? <header className="dispatch-page-head">
        <div>
          <p className="dispatch-eyebrow">ROUTE BOARD</p>
          <h1>경로 · 지도</h1>
          <p>
            {formatSheetDate(date)} 납품지를 지도에서 보고, 카카오 길찾기로 경로를 그립니다. 방문
            순서는 드래그로 조정할 수 있습니다.
          </p>
        </div>
        <div className="dispatch-head-actions">
          <a className="dispatch-secondary-button" href={boardHref}>
            배차 신청으로
          </a>
        </div>
      </header> : <header className="request-map-heading"><h2>경로 · 지도</h2><p>방문 순서와 예상 비용을 확인하세요.</p></header>}

      {!embedded ? <div className="dispatch-control-row">
        <DateSwitcher basePath="/map" dates={knownDates} value={date} />
        <div className="dispatch-summary" aria-label="지도 요약">
          <div><span>일정</span><strong>{entries.length}</strong></div>
          <div><span>좌표</span><strong>{mapMarkers.length}</strong></div>
          <div><span>활성</span><strong>{activeEntries.length}</strong></div>
        </div>
      </div> : null}

      <p className="map-page-geo">{geo.message}</p>
      <RouteBatchSelect date={date} batchId={batchId} options={batchOptions} embedded={embedded} />
      <p className="map-page-geo">확정 배차를 선택하면 해당 묶음의 호차별 경로를 볼 수 있습니다. 처음 선택한 배차는 경로 계산을 눌러 주세요.</p>
      {batchId === "legacy" ? <p className="map-page-geo">이전 확정 건은 확정 당시의 묶음 정보가 없어 함께 표시됩니다.</p> : null}
      {scopeChanged ? <p className="dispatch-route-note-warn">표시할 납품 목록이 바뀌어 이전 경로를 숨겼습니다. 경로 계산을 눌러 다시 확인하세요.</p> : null}
      {!scope.valid ? <p className="dispatch-route-note-warn">선택한 확정 배차를 찾을 수 없습니다. 목록에서 다시 선택하세요.</p> : null}

      <MapRouteWorkspace key={`${date}:${batchId ?? "pending"}:${signature}:${snapshot?.savedAt ?? ""}`} boardHref={boardHref} date={date} batchId={batchId} markers={mapMarkers} initialResult={initialResult} />
    </div>
  );
}
