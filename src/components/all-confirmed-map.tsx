"use client";

import { useMemo, useState } from "react";
import { DispatchMap } from "@/components/kakao-map/dispatch-map";
import type { DispatchMapMarker, DispatchMapRoute } from "@/components/kakao-map/types";

export type ConfirmedBatchView = { id: string; label: string; count: number; status: "ready" | "missing" | "stale"; routes: DispatchMapRoute[] };
const ROUTE_COLORS = ["#e85d04", "#1d4ed8", "#15803d", "#7c3aed", "#b45309", "#0f766e"];

export function AllConfirmedMap({ date, embedded, markers, batches }: { date: string; embedded: boolean; markers: DispatchMapMarker[]; batches: ConfirmedBatchView[] }) {
  const [expanded, setExpanded] = useState(false);
  const routes = useMemo(() => batches.flatMap((batch) => batch.routes).map((route, index) => ({ ...route, color: ROUTE_COLORS[index % ROUTE_COLORS.length] })), [batches]);
  return <div className={`map-page-workspace${expanded ? " is-map-expanded" : ""}`}>
    <div className="map-page-map"><DispatchMap markers={markers} routes={routes} height="100%" expanded={expanded} onToggleExpand={() => setExpanded((value) => !value)} /></div>
    <aside className="map-page-side"><section className="dispatch-route-panel">
      <h2>확정 배차별 경로</h2>
      <p className="dispatch-route-note">각 묶음에서 저장한 경로만 표시합니다. 서로 다른 운행을 합쳐 계산하지 않습니다. 카카오 조회에 실패한 저장 경로는 직선 근사일 수 있으므로 상세 화면을 확인하세요.</p>
      {batches.length ? <ul className="confirmed-batch-list">{batches.map((batch) => {
        const params = new URLSearchParams({ date, batch: batch.id });
        const href = `${embedded ? "/" : "/map"}?${params.toString()}${embedded ? "#request-map" : ""}`;
        return <li key={batch.id}><div><strong>{batch.label}</strong><span>{batch.count}건 · {batch.status === "ready" ? "저장된 경로 표시 중" : batch.status === "stale" ? "일정 변경 · 경로 재확인 필요" : "저장된 경로 없음"}</span></div><a href={href} className="dispatch-secondary-button">{batch.status === "ready" ? "상세 보기" : "경로 확인"}</a></li>;
      })}</ul> : <p className="dispatch-route-note">선택한 날짜에 확정된 납품이 없습니다.</p>}
      <p className="dispatch-route-note">납품지 마커에는 용차·택배도 포함될 수 있으며, 자사 차량 경로에서는 제외됩니다. 경로 선이 없는 묶음은 해당 묶음을 열어 경로 계산을 눌러 주세요.</p>
    </section></aside>
  </div>;
}
