"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DispatchMapMarker, DispatchMapRoute } from "@/components/kakao-map/types";
import { getKakaoMapAppKey, loadKakaoMaps } from "@/lib/kakao-maps-loader";

import { DEFAULT_DEPOT } from "@/lib/depot";

const DEFAULT_CENTER = { lat: DEFAULT_DEPOT.lat, lng: DEFAULT_DEPOT.lng };

type Props = {
  markers: DispatchMapMarker[];
  routes?: DispatchMapRoute[];
  height?: string;
};

export function DispatchMap({ markers, routes = [], height = "220px" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const mapsRef = useRef<typeof kakao.maps | null>(null);
  const overlaysRef = useRef<kakao.maps.Marker[]>([]);
  const polylinesRef = useRef<kakao.maps.Polyline[]>([]);
  const labelsRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const markersKey = useMemo(
    () => markers.map((m) => `${m.id}:${m.lat}:${m.lng}`).join("|"),
    [markers],
  );
  const routesKey = useMemo(
    () =>
      routes
        .map(
          (r) =>
            `${r.vehicleId}:${r.path.map((p) => `${p.lat},${p.lng}`).join(">")}`,
        )
        .join("|"),
    [routes],
  );

  // SDK·지도 인스턴스는 한 번만 만든다. 경로 재계산 때 다시 load 하지 않는다.
  useEffect(() => {
    if (!getKakaoMapAppKey()) {
      setStatus("no-key");
      return;
    }

    let active = true;
    setStatus("loading");
    setErrorMessage(null);

    (async () => {
      try {
        const maps = await loadKakaoMaps();
        if (!active) return;

        const el = containerRef.current;
        if (!el) {
          setStatus("error");
          setErrorMessage("지도 컨테이너를 찾을 수 없습니다.");
          return;
        }

        mapsRef.current = maps;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(el, {
            center: new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
            level: 7,
          });
        }

        setStatus("ready");
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "지도 로드 실패");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // 마커·경로만 갱신
  useEffect(() => {
    if (status !== "ready") return;
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;

    for (const marker of overlaysRef.current) marker.setMap(null);
    overlaysRef.current = [];
    for (const line of polylinesRef.current) line.setMap(null);
    polylinesRef.current = [];
    for (const label of labelsRef.current) label.setMap(null);
    labelsRef.current = [];

    const bounds = new maps.LatLngBounds();
    const center = markers[0]
      ? new maps.LatLng(markers[0].lat, markers[0].lng)
      : new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);

    for (const item of markers) {
      const position = new maps.LatLng(item.lat, item.lng);
      bounds.extend(position);
      const marker = new maps.Marker({
        position,
        map,
        title: item.title,
      });
      const info = new maps.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;line-height:1.4;white-space:nowrap;">
          <strong>${escapeHtml(item.title)}</strong>
          ${item.subtitle ? `<br/><span style="color:#666">${escapeHtml(item.subtitle)}</span>` : ""}
        </div>`,
      });
      maps.event.addListener(marker, "click", () => {
        info.open(map, marker);
      });
      overlaysRef.current.push(marker);
    }

    for (const route of routes) {
      if (route.path.length < 2) continue;
      const path = route.path.map((p) => new maps.LatLng(p.lat, p.lng));
      for (const point of path) bounds.extend(point);

      const line = new maps.Polyline({
        path,
        strokeWeight: 5,
        strokeColor: route.color,
        strokeOpacity: 0.85,
        strokeStyle: "solid",
        map,
      });
      polylinesRef.current.push(line);

      route.path.forEach((point, index) => {
        if (!point.label) return;
        const overlay = new maps.CustomOverlay({
          position: new maps.LatLng(point.lat, point.lng),
          content: `<div class="map-route-badge" style="background:${route.color}">${escapeHtml(point.label)}</div>`,
          yAnchor: 2.1,
          zIndex: 10 + index,
          map,
        });
        labelsRef.current.push(overlay);
      });
    }

    const hasBoundsPoints = markers.length > 0 || routes.some((r) => r.path.length > 0);
    if (hasBoundsPoints) {
      try {
        map.setBounds(bounds);
      } catch {
        map.setCenter(center);
      }
    } else {
      map.setCenter(center);
    }

    requestAnimationFrame(() => {
      map.relayout();
    });
  }, [status, markers, markersKey, routes, routesKey]);

  if (status === "no-key") {
    return (
      <section className="dispatch-map-panel" aria-label="배차 지도">
        <h2>납품지 지도</h2>
        <p className="dispatch-map-placeholder">
          `NEXT_PUBLIC_KAKAO_MAP_KEY`(JavaScript 키)를 설정하면 지도가 표시됩니다.
          주소 좌표 변환은 서버의 `KAKAO_REST_API_KEY`를 사용합니다.
        </p>
      </section>
    );
  }

  return (
    <section className="dispatch-map-panel" aria-label="배차 지도">
      <div className="dispatch-map-head">
        <h2>납품지 지도</h2>
        <span>
          {markers.length > 0 ? `좌표 ${markers.length}곳` : "표시할 좌표 없음"}
          {routes.length ? ` · 경로 ${routes.length}대` : ""}
        </span>
      </div>
      {status === "error" ? (
        <p className="dispatch-map-placeholder">{errorMessage}</p>
      ) : null}
      {status === "loading" ? (
        <p className="dispatch-map-placeholder">지도 불러오는 중…</p>
      ) : null}
      {!markers.length && status === "ready" ? (
        <p className="dispatch-map-hint">
          고객 주소 또는 지역명이 Geocoding되면 마커가 표시됩니다.
        </p>
      ) : null}
      {routes.length && status === "ready" ? (
        <ul className="map-route-legend">
          {routes.map((route) => (
            <li key={route.vehicleId}>
              <i style={{ background: route.color }} />
              {route.vehicleName}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="dispatch-map-canvas" ref={containerRef} style={{ height }} />
    </section>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
