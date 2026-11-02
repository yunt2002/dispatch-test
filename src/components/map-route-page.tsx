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
import { DeliveryComparison } from "@/components/delivery-comparison";
import { AllConfirmedMap, type ConfirmedBatchView } from "@/components/all-confirmed-map";
import { confirmedRouteState } from "@/lib/confirmed-route-state";
import { routePalletLoad } from "@/lib/route-load";

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
  const allConfirmed = batchId === "all-confirmed";

  const [entries, batches, scope] = await Promise.all([prisma.scheduleEntry.findMany({
    where: { deliveryDate: date, status: { not: "CANCELLED" } },
    orderBy: [{ createdAt: "desc" }, { locationName: "asc" }],
  }), listDispatchBatches(date), allConfirmed ? Promise.resolve({ where: { deliveryDate: date, status: { in: ["CONFIRMED", "DONE"] } }, valid: true }) : resolveRouteScope(date, batchId)]);
  const activeEntries = await prisma.scheduleEntry.findMany({ where: scope.where, orderBy: [{ createdAt: "desc" }, { locationName: "asc" }] });
  const entryIds = new Set(entries.filter((entry) => entry.status === "CONFIRMED" || entry.status === "DONE").map((entry) => entry.id));
  const batchOptions = batches.map((batch, index) => {
    const time = new Date(batch.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
    const remaining = batch.entryIds.filter((id) => entryIds.has(id)).length;
    return { id: batch.id, label: `확정 배차 ${batches.length - index} · ${time} · ${remaining}/${batch.entryIds.length}건` };
  });
  const batchedIds = new Set(batches.flatMap((batch) => batch.entryIds));
  const batchByEntry = new Map(batches.flatMap((batch) => batch.entryIds.map((id) => [id, batch.id] as const)));
  const legacyCount = entries.filter((entry) => (entry.status === "CONFIRMED" || entry.status === "DONE") && !batchedIds.has(entry.id)).length;
  if (legacyCount) batchOptions.push({ id: "legacy", label: `이전 확정 배차 · ${legacyCount}건` });
  const rawMarkers = await buildDispatchMapMarkers(activeEntries);
  const entriesById = new Map(activeEntries.map((entry) => [entry.id, entry]));
  const mapMarkers = groupRouteStops(rawMarkers.map((marker) => {
    const entry = entriesById.get(marker.id)!;
    const selected = parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null) ??
      parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
    const groupId = entry.consolidateGroupId && allConfirmed ? `${batchByEntry.get(entry.id) ?? "legacy"}:${entry.consolidateGroupId}` : entry.consolidateGroupId;
    return { ...marker, consolidateGroupId: groupId, customerName: entry.customerName,
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
  const [snapshot, signature] = allConfirmed ? [null, "all-confirmed"] as const : await Promise.all([readRouteSnapshot(date, batchId), routeInputSignature(date, batchId)]);
  const scopeChanged = !!snapshot && !snapshotMatchesScope(snapshot.result, activeEntries.map((entry) => entry.id));
  const initialResult = snapshot && !scopeChanged ? { ...snapshot.result, routes: snapshot.result.routes.map((route) => ({ ...route, load: routePalletLoad(route, activeEntries) })), savedAt: snapshot.savedAt, stale: snapshot.signature !== signature || snapshot.result.routes.some((route) => !route.stopMemberIds) } : null;
  const nonemptyOptions = allConfirmed ? batchOptions.map((option) => ({ option, related: option.id === "legacy" ? activeEntries.filter((entry) => !batchedIds.has(entry.id)) : activeEntries.filter((entry) => batches.find((batch) => batch.id === option.id)?.entryIds.includes(entry.id)) })).filter(({ related }) => related.length > 0) : [];
  const allBatchViews: ConfirmedBatchView[] = allConfirmed ? await Promise.all(nonemptyOptions.map(async ({ option, related }, batchIndex) => {
    const [saved, currentSignature] = await Promise.all([readRouteSnapshot(date, option.id), routeInputSignature(date, option.id)]);
    const status = confirmedRouteState(saved, currentSignature, related.map((entry) => entry.id));
    const colors = ["#e85d04", "#1d4ed8", "#15803d", "#7c3aed", "#b45309", "#0f766e"];
    return { id: option.id, label: option.label, count: related.length, status, routes: status === "ready" ? saved!.result.routes.map((route, routeIndex) => ({ vehicleId: `${option.id}:${route.vehicleId}:${routeIndex}`, vehicleName: `${option.label.split(" · ")[0]} · ${route.vehicleName}`, color: colors[(batchIndex + routeIndex) % colors.length], path: route.path! })) : [] };
  })) : [];
  const visibleBatches = allBatchViews;
  const scopeLabel = allConfirmed ? `확정 배차 전체 · ${activeEntries.length}건 · ${visibleBatches.length}묶음` : !batchId ? `배차 신청 (미확정) · ${activeEntries.length}건` : `${batchOptions.find((option) => option.id === batchId)?.label ?? "확인할 수 없는 배차"} · 현재 ${activeEntries.length}건`;

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
      <p className="route-current-scope" aria-live="polite"><strong>현재 표시: {scopeLabel}</strong>{allConfirmed ? " · 완료된 납품 포함" : ""}</p>
      <p className="map-page-geo">{allConfirmed ? "확정·완료 납품과 각 묶음에 저장된 경로를 함께 표시합니다. 경로가 없는 묶음은 아래에서 개별적으로 계산하세요." : "확정 배차를 선택하면 해당 묶음의 호차별 경로를 볼 수 있습니다. 처음 선택한 배차는 경로 계산을 눌러 주세요."}</p>
      {batchId === "legacy" ? <p className="map-page-geo">이전 확정 건은 확정 당시의 묶음 정보가 없어 함께 표시됩니다.</p> : null}
      {scopeChanged ? <p className="dispatch-route-note-warn">표시할 납품 목록이 바뀌어 이전 경로를 숨겼습니다. 경로 계산을 눌러 다시 확인하세요.</p> : null}
      {!scope.valid ? <p className="dispatch-route-note-warn">선택한 확정 배차를 찾을 수 없습니다. 목록에서 다시 선택하세요.</p> : null}

      {allConfirmed ? <AllConfirmedMap key={`${date}:all-confirmed`} date={date} embedded={embedded} markers={mapMarkers} batches={visibleBatches} /> : <MapRouteWorkspace key={`${date}:${batchId ?? "pending"}:${signature}:${snapshot?.savedAt ?? ""}`} boardHref={boardHref} date={date} batchId={batchId} markers={mapMarkers} initialResult={initialResult} />}
      <DeliveryComparison key={date} initialDate={date} />
    </div>
  );
}
