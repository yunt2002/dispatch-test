import { DateSwitcher } from "@/components/date-switcher";
import { MapRouteWorkspace } from "@/components/map-route-workspace";
import { buildDispatchMapMarkers } from "@/lib/dispatch-map-markers";
import { formatSheetDate, todayISO } from "@/lib/format";
import { geocodingStatus } from "@/lib/geocoding";
import { prisma } from "@/lib/prisma";
import { readRouteSnapshot, routeInputSignature } from "@/lib/route-snapshot";
import { groupRouteStops } from "@/lib/route-stop-groups";
import { parseJson } from "@/lib/format";
import type { VehicleRecommendation } from "@/lib/dispatch-group";

export default async function MapRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
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

  const entries = await prisma.scheduleEntry.findMany({
    where: { deliveryDate: date, status: { not: "CANCELLED" } },
    orderBy: [{ createdAt: "desc" }, { locationName: "asc" }],
  });
  const activeEntries = entries.filter((entry) => entry.status !== "DONE");
  const rawMarkers = await buildDispatchMapMarkers(activeEntries);
  const entriesById = new Map(activeEntries.map((entry) => [entry.id, entry]));
  const mapMarkers = groupRouteStops(rawMarkers.map((marker) => {
    const entry = entriesById.get(marker.id)!;
    const selected = parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null) ??
      parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
    return { ...marker, consolidateGroupId: entry.consolidateGroupId, customerName: entry.customerName,
      locationName: entry.locationName, vehicleId: selected?.vehicleTypeId ?? null };
  })).map(({ stop, memberIds }) => ({ ...stop, title: memberIds.length > 1 ? `${stop.title} (${memberIds.length}품목)` : stop.title }));
  const geo = geocodingStatus();
  const boardHref = `/?date=${encodeURIComponent(date)}`;
  const [snapshot, signature] = await Promise.all([readRouteSnapshot(date), routeInputSignature(date)]);
  const initialResult = snapshot ? { ...snapshot.result, savedAt: snapshot.savedAt, stale: snapshot.signature !== signature || snapshot.result.routes.some((route) => !route.stopMemberIds) } : null;

  return (
    <div className="dispatch-page map-page">
      <header className="dispatch-page-head">
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
            일정 · 배차로
          </a>
        </div>
      </header>

      <div className="dispatch-control-row">
        <DateSwitcher basePath="/map" dates={knownDates} value={date} />
        <div className="dispatch-summary" aria-label="지도 요약">
          <div><span>일정</span><strong>{entries.length}</strong></div>
          <div><span>좌표</span><strong>{mapMarkers.length}</strong></div>
          <div><span>활성</span><strong>{activeEntries.length}</strong></div>
        </div>
      </div>

      <p className="map-page-geo">{geo.message}</p>

      <MapRouteWorkspace key={date} boardHref={boardHref} date={date} markers={mapMarkers} initialResult={initialResult} />
    </div>
  );
}
