import { DateSwitcher } from "@/components/date-switcher";
import { MapRouteWorkspace } from "@/components/map-route-workspace";
import { buildDispatchMapMarkers } from "@/lib/dispatch-map-markers";
import { formatSheetDate, todayISO } from "@/lib/format";
import { geocodingStatus } from "@/lib/geocoding";
import { prisma } from "@/lib/prisma";

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
  const mapMarkers = await buildDispatchMapMarkers(activeEntries);
  const geo = geocodingStatus();
  const boardHref = `/?date=${encodeURIComponent(date)}`;

  return (
    <div className="dispatch-page map-page">
      <header className="dispatch-page-head">
        <div>
          <p className="dispatch-eyebrow">ROUTE BOARD</p>
          <h1>경로 · 지도</h1>
          <p>{formatSheetDate(date)} 납품지를 지도에서 보고, OR-Tools로 방문 순서를 제안합니다.</p>
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

      <MapRouteWorkspace boardHref={boardHref} date={date} markers={mapMarkers} />
    </div>
  );
}
