"use client";

import { useMemo, useState } from "react";
import { DispatchMap } from "@/components/kakao-map/dispatch-map";
import type { DispatchMapMarker, DispatchMapRoute } from "@/components/kakao-map/types";
import { RouteSolvePanel, type RouteSolveResult } from "@/components/route-solve-panel";

const ROUTE_COLORS = ["#2456db", "#138278", "#d65b22", "#8047d8", "#b45309", "#0f766e"];

type Props = {
  date: string;
  markers: DispatchMapMarker[];
  boardHref: string;
  initialResult: RouteSolveResult | null;
  batchId: string | null;
};

export function MapRouteWorkspace({ date, markers, boardHref, initialResult, batchId }: Props) {
  const [result, setResult] = useState<RouteSolveResult | null>(initialResult);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const activeVehicle = selectedVehicle && result?.routes.some((route) => route.vehicleId === selectedVehicle) ? selectedVehicle : null;

  const routes: DispatchMapRoute[] = useMemo(() => {
    if (!result?.ok || !result.routes.length) return [];
    const byId = new Map(markers.map((m) => [m.id, m]));

    return result.routes.map((route, index) => {
      const color = ROUTE_COLORS[index % ROUTE_COLORS.length];

      // 카카오 도로 폴리라인 (방문 순서는 사이드 패널·마커 참고)
      if (route.path && route.path.length >= 2) {
        return {
          vehicleId: route.vehicleId,
          vehicleName: route.vehicleName,
          color,
          path: route.path.map((p, i) =>
            i === 0 ? { ...p, label: "출" } : { lat: p.lat, lng: p.lng },
          ),
        };
      }

      const path: DispatchMapRoute["path"] = [
        { lat: result.depot.lat, lng: result.depot.lng, label: "출" },
      ];
      route.stopIds.forEach((stopId, stopIndex) => {
        const marker = byId.get(stopId);
        if (!marker) return;
        path.push({
          lat: marker.lat,
          lng: marker.lng,
          label: String(stopIndex + 1),
        });
      });
      if (result.tripMode !== "oneway") path.push({ lat: result.depot.lat, lng: result.depot.lng });

      return {
        vehicleId: route.vehicleId,
        vehicleName: route.vehicleName,
        color,
        path,
      };
    }).filter((route) => !activeVehicle || route.vehicleId === activeVehicle);
  }, [markers, result, activeVehicle]);

  const visibleMarkers = useMemo(() => {
    if (!activeVehicle || !result) return markers;
    const route = result.routes.find((item) => item.vehicleId === activeVehicle);
    const ids = new Set(route?.stopIds ?? []);
    return markers.filter((marker) => ids.has(marker.id));
  }, [activeVehicle, markers, result]);

  return (
    <>
    {result?.ok && result.routes.length ? <div className="route-vehicle-tabs" aria-label="차량별 경로 보기">
      <button type="button" className={!activeVehicle ? "is-selected" : ""} aria-pressed={!activeVehicle} onClick={() => setSelectedVehicle(null)}><strong>전체 차량</strong><small>{result.routes.length}대 경로</small></button>
      {result.routes.map((route, index) => <button type="button" key={route.vehicleId} className={activeVehicle === route.vehicleId ? "is-selected" : ""} aria-pressed={activeVehicle === route.vehicleId} onClick={() => setSelectedVehicle(route.vehicleId)}><strong><i style={{ background: ROUTE_COLORS[index % ROUTE_COLORS.length] }} />{route.vehicleName}</strong><small>{route.load}/{route.capacity} PLT · {route.stopIds.length}곳 · {route.totalDistanceKm}km · {route.totalTimeMin}분</small></button>)}
    </div> : null}
    <div className={`map-page-workspace${mapExpanded ? " is-map-expanded" : ""}`}>
      <div className="map-page-map">
        <DispatchMap
          expanded={mapExpanded}
          height="100%"
          markers={visibleMarkers}
          onToggleExpand={() => setMapExpanded((open) => !open)}
          routes={routes}
        />
      </div>
      <aside className="map-page-side">
        <RouteSolvePanel
          date={date}
          batchId={batchId}
          markers={markers}
          selectedVehicleId={activeVehicle}
          onResult={setResult}
          result={result}
        />
        <section className="dispatch-export-note">
          추천 순서·드래그로 같은 차량 안 순서를 저장합니다. 변경 후 경로 새로고침을 눌러 갱신하세요.
          실패 시 직선 근사로 폴백합니다. 일정은 <a href={boardHref}>배차 신청</a>에서 등록합니다.
        </section>
      </aside>
    </div>
    </>
  );
}
