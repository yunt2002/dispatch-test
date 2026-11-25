"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DispatchMapMarker, DispatchMapRoute } from "@/components/kakao-map/types";
import {
  getKakaoMapAppKey,
  loadKakaoMaps,
  resetKakaoMapsLoader,
} from "@/lib/kakao-maps-loader";
import { DEFAULT_DEPOT } from "@/lib/depot";
import {
  offsetMapPath,
  resolveMapRouteStyle,
} from "@/lib/map-route-style";

const DEFAULT_CENTER = { lat: DEFAULT_DEPOT.lat, lng: DEFAULT_DEPOT.lng };

type Props = {
  markers: DispatchMapMarker[];
  routes?: DispatchMapRoute[];
  height?: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
};

export function DispatchMap({
  markers,
  routes = [],
  height = "220px",
  expanded = false,
  onToggleExpand,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.Marker[]>([]);
  const polylinesRef = useRef<kakao.maps.Polyline[]>([]);
  const labelsRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const activeInfoRef = useRef<kakao.maps.InfoWindow | null>(null);
  const lastBoundsKeyRef = useRef<string>("");
  const mapsRef = useRef<typeof kakao.maps | null>(null);
  const autoRetryDoneRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">(() =>
    getKakaoMapAppKey() ? "loading" : "no-key",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [hiddenRouteIds, setHiddenRouteIds] = useState<string[]>([]);

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
  const styledLegend = useMemo(
    () =>
      routes.map((route, index) => ({
        route,
        style: resolveMapRouteStyle(route.vehicleName, index),
      })),
    [routes],
  );
  const hiddenSet = useMemo(() => {
    const routeIds = new Set(routes.map((route) => route.vehicleId));
    return new Set(hiddenRouteIds.filter((id) => routeIds.has(id)));
  }, [hiddenRouteIds, routes]);
  const hasOwn = styledLegend.some((item) => item.style.kind === "own");
  const hasCharter = styledLegend.some((item) => item.style.kind === "charter");

  function toggleRoute(vehicleId: string) {
    setHiddenRouteIds((prev) =>
      prev.includes(vehicleId) ? prev.filter((id) => id !== vehicleId) : [...prev, vehicleId],
    );
  }

  function showOnlyKind(kind: "all" | "own" | "charter") {
    if (kind === "all") {
      setHiddenRouteIds([]);
      return;
    }
    setHiddenRouteIds(
      styledLegend
        .filter((item) => item.style.kind !== kind)
        .map((item) => item.route.vehicleId),
    );
  }

  function retryLoad(manual = false) {
    if (manual) autoRetryDoneRef.current = false;
    resetKakaoMapsLoader();
    mapsRef.current = null;
    mapRef.current = null;
    lastBoundsKeyRef.current = "";
    setStatus("loading");
    setErrorMessage(null);
    setRetryToken((n) => n + 1);
  }

  // SDK + 지도 인스턴스 로드 (마커와 분리 — 데이터 바뀔 때마다 재로드하지 않음)
  useEffect(() => {
    if (!getKakaoMapAppKey()) return;

    let active = true;
    (async () => {
      try {
        const maps = await loadKakaoMaps();
        if (!active) return;

        let el = containerRef.current;
        if (!el) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          el = containerRef.current;
        }
        if (!el) {
          setStatus("error");
          setErrorMessage("지도 컨테이너를 찾을 수 없습니다.");
          return;
        }

        mapsRef.current = maps;
        el.innerHTML = "";
        const center = new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
        const map = new maps.Map(el, { center, level: 7 });
        maps.event.addListener(map, "click", () => {
          activeInfoRef.current?.close();
          activeInfoRef.current = null;
        });
        mapRef.current = map;
        overlaysRef.current = [];
        polylinesRef.current = [];
        labelsRef.current = [];
        lastBoundsKeyRef.current = "";
        setStatus("ready");
        setErrorMessage(null);
        autoRetryDoneRef.current = false;
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "지도 로드 실패";
        setStatus("error");
        setErrorMessage(message);

        if (!autoRetryDoneRef.current) {
          autoRetryDoneRef.current = true;
          window.setTimeout(() => {
            if (active) retryLoad(false);
          }, 1200);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [retryToken]);

  // 마커·경로 갱신
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || status !== "ready") return;

    activeInfoRef.current?.close();
    activeInfoRef.current = null;
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
        activeInfoRef.current?.close();
        info.open(map, marker);
        activeInfoRef.current = info;
      });
      overlaysRef.current.push(marker);
    }

    const visibleRoutes = routes
      .map((route, index) => ({ route, index }))
      .filter(({ route }) => !hiddenSet.has(route.vehicleId));

    const styledRoutes = visibleRoutes.map(({ route, index }) => {
      const style = resolveMapRouteStyle(route.vehicleName, index);
      return {
        ...route,
        color: style.color,
        strokeStyle: style.strokeStyle,
        strokeWeight: style.strokeWeight,
        strokeOpacity: style.strokeOpacity,
        kind: style.kind,
        path: offsetMapPath(route.path, index, routes.length),
      };
    });
    // 용차를 먼저 그려 자사 실선이 위에 오게 한다.
    const drawOrder = [...styledRoutes].sort((a, b) => {
      const rank = (kind: string | undefined) => (kind === "charter" ? 0 : kind === "other" ? 1 : 2);
      return rank(a.kind) - rank(b.kind);
    });

    // 같은 좌표에 여러 차량 배지가 겹칠 때 좌우로 살짝 벌린다.
    const stopSlotCount = new Map<string, number>();

    for (const route of drawOrder) {
      if (route.path.length < 2) continue;
      const path = route.path.map((p) => new maps.LatLng(p.lat, p.lng));
      for (const point of path) bounds.extend(point);

      const line = new maps.Polyline({
        path,
        strokeWeight: route.strokeWeight ?? 5,
        strokeColor: route.color,
        strokeOpacity: route.strokeOpacity ?? 0.85,
        strokeStyle: route.strokeStyle ?? "solid",
        map,
        zIndex: route.kind === "own" ? 20 : route.kind === "charter" ? 5 : 10,
      });
      polylinesRef.current.push(line);

      const badgeStops: { lat: number; lng: number; label: string; title?: string }[] = route.stops?.length
        ? route.stops
        : route.path
            .filter((p): p is { lat: number; lng: number; label: string } => Boolean(p.label))
            .map((p) => ({ lat: p.lat, lng: p.lng, label: p.label }));

      badgeStops.forEach((point, index) => {
        if (!point.label) return;
        const coordKey = `${point.lat.toFixed(4)}:${point.lng.toFixed(4)}`;
        const slot = stopSlotCount.get(coordKey) ?? 0;
        // 출발지("출")는 한 번만 찍어 중복 방지
        if (point.label === "출" && slot > 0) return;
        stopSlotCount.set(coordKey, slot + 1);
        const shiftPx = slot === 0 ? 0 : slot % 2 === 1 ? Math.ceil(slot / 2) * 22 : -Math.ceil(slot / 2) * 22;
        const dashedClass = route.kind === "charter" ? " is-charter" : "";
        const titleAttr = point.title
          ? ` title="${escapeHtml(`${route.vehicleName} · ${point.label} ${point.title}`)}"`
          : ` title="${escapeHtml(`${route.vehicleName} · ${point.label}`)}"`;
        const overlay = new maps.CustomOverlay({
          position: new maps.LatLng(point.lat, point.lng),
          content: `<div class="map-route-badge${dashedClass}"${titleAttr} style="background:${route.color};transform:translateX(${shiftPx}px)">${escapeHtml(point.label)}</div>`,
          yAnchor: 2.1,
          zIndex: (route.kind === "own" ? 40 : 30) + index,
          map,
        });
        labelsRef.current.push(overlay);
      });
    }

    const boundsKey = `${markersKey}##${routesKey}`;
    if (boundsKey !== lastBoundsKeyRef.current) {
      lastBoundsKeyRef.current = boundsKey;
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
    }

    requestAnimationFrame(() => map.relayout());
  }, [status, markers, markersKey, routes, routesKey, hiddenSet]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || status !== "ready") return;
    const relayout = () => {
      mapRef.current?.relayout();
    };
    relayout();
    const ro = new ResizeObserver(() => relayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [status, expanded, height]);

  useEffect(() => {
    if (!expanded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onToggleExpand?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onToggleExpand]);

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

  const allVisible = hiddenSet.size === 0;
  const ownOnly =
    hasOwn &&
    hasCharter &&
    styledLegend.every((item) =>
      item.style.kind === "own"
        ? !hiddenSet.has(item.route.vehicleId)
        : hiddenSet.has(item.route.vehicleId),
    );
  const charterOnly =
    hasOwn &&
    hasCharter &&
    styledLegend.every((item) =>
      item.style.kind === "charter"
        ? !hiddenSet.has(item.route.vehicleId)
        : hiddenSet.has(item.route.vehicleId),
    );

  return (
    <section
      className={`dispatch-map-panel${expanded ? " is-expanded" : ""}`}
      aria-label="배차 지도"
    >
      <div className="dispatch-map-head">
        <div className="dispatch-map-head-text">
          <h2>납품지 지도</h2>
          <span>
            {markers.length > 0 ? `좌표 ${markers.length}곳` : "표시할 좌표 없음"}
            {routes.length
              ? ` · 경로 ${routes.length - hiddenSet.size}/${routes.length}대`
              : ""}
          </span>
        </div>
        {onToggleExpand ? (
          <button
            className="dispatch-map-expand-btn"
            onClick={onToggleExpand}
            type="button"
          >
            {expanded ? "닫기" : "크게 보기"}
          </button>
        ) : null}
      </div>
      {status === "error" ? (
        <div className="dispatch-map-placeholder">
          <p>{errorMessage}</p>
          <button
            className="dispatch-map-expand-btn"
            onClick={() => retryLoad(true)}
            type="button"
            style={{ marginTop: 8 }}
          >
            다시 시도
          </button>
        </div>
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
        <div className="map-route-legend-bar">
          {hasOwn && hasCharter ? (
            <div className="map-route-filter-row" role="group" aria-label="차량 유형 필터">
              <button
                className={allVisible ? "map-route-filter-btn is-active" : "map-route-filter-btn"}
                onClick={() => showOnlyKind("all")}
                type="button"
              >
                전체
              </button>
              <button
                className={ownOnly ? "map-route-filter-btn is-active" : "map-route-filter-btn"}
                onClick={() => showOnlyKind("own")}
                type="button"
              >
                자사만
              </button>
              <button
                className={charterOnly ? "map-route-filter-btn is-active" : "map-route-filter-btn"}
                onClick={() => showOnlyKind("charter")}
                type="button"
              >
                용차만
              </button>
            </div>
          ) : null}
          <ul className="map-route-legend" aria-label="경로 범례 · 클릭하여 표시 전환">
            {styledLegend.map(({ route, style }) => {
              const dashed = style.strokeStyle !== "solid";
              const hidden = hiddenSet.has(route.vehicleId);
              return (
                <li key={route.vehicleId}>
                  <button
                    aria-pressed={!hidden}
                    className={hidden ? "map-route-legend-btn is-hidden" : "map-route-legend-btn"}
                    onClick={() => toggleRoute(route.vehicleId)}
                    title={hidden ? "클릭해서 표시" : "클릭해서 숨기기"}
                    type="button"
                  >
                    <i
                      className={dashed ? "is-dashed" : undefined}
                      style={
                        dashed
                          ? {
                              backgroundImage: `repeating-linear-gradient(90deg, ${style.color} 0 6px, transparent 6px 10px)`,
                              backgroundColor: "transparent",
                            }
                          : { background: style.color }
                      }
                    />
                    <span>
                      {route.vehicleName}
                      {style.kind === "charter" ? " · 점선" : style.kind === "own" ? " · 실선" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div
        className="dispatch-map-canvas"
        ref={containerRef}
        style={expanded ? undefined : { height }}
      />
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
