"use client";

import { useState } from "react";
import { DEFAULT_DEPOT } from "@/lib/depot";

export type RouteSolveResult = {
  ok: boolean;
  note: string;
  matrixNote?: string;
  depot: { lat: number; lng: number; title: string };
  routes: {
    vehicleId: string;
    vehicleName: string;
    stopIds: string[];
    titles: string[];
    totalDistanceKm: number;
    totalTimeMin: number;
    load: number;
    capacity: number;
    path?: { lat: number; lng: number; label?: string }[];
  }[];
  unassigned: string[];
  solverReachable: boolean;
  error?: string;
};

const FALLBACK_DEPOT = {
  lat: DEFAULT_DEPOT.lat,
  lng: DEFAULT_DEPOT.lng,
  title: DEFAULT_DEPOT.title,
};

type Props = {
  date: string;
  result?: RouteSolveResult | null;
  onResult?: (result: RouteSolveResult) => void;
};

export function RouteSolvePanel({ date, result: controlledResult, onResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [localResult, setLocalResult] = useState<RouteSolveResult | null>(null);
  const result = controlledResult !== undefined ? controlledResult : localResult;

  async function runSolve() {
    setLoading(true);
    try {
      const res = await fetch("/api/route/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = (await res.json()) as RouteSolveResult;
      if (!data.depot) data.depot = FALLBACK_DEPOT;
      setLocalResult(data);
      onResult?.(data);
    } catch (error) {
      const failed: RouteSolveResult = {
        ok: false,
        solverReachable: false,
        depot: FALLBACK_DEPOT,
        note: "요청 실패",
        routes: [],
        unassigned: [],
        error: error instanceof Error ? error.message : String(error),
      };
      setLocalResult(failed);
      onResult?.(failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="dispatch-route-panel" aria-label="경로 제안">
      <div className="dispatch-route-head">
        <h2>경로 (카카오 길찾기)</h2>
        <button
          className="dispatch-secondary-button"
          disabled={loading}
          onClick={runSolve}
          type="button"
        >
          {loading ? "계산 중…" : "경로 계산"}
        </button>
      </div>
      <p className="dispatch-side-meta">
        보드 차량 배정·등록 순서 유지 · 카카오 도로 거리/시간 (순서 편집은 예정)
      </p>

      {!result ? (
        <p className="dispatch-route-hint">
          버튼을 누르면 카카오 길찾기로 차량별 도로 경로가 그려집니다. 별도 솔버는 필요 없습니다.
        </p>
      ) : null}

      {result ? (
        <div className="dispatch-route-body">
          <p className={result.ok ? "dispatch-route-note" : "dispatch-route-note-warn"}>
            {result.note}
          </p>
          {result.matrixNote ? (
            <p className="dispatch-route-meta">{result.matrixNote}</p>
          ) : null}
          {result.error && !result.solverReachable ? (
            <p className="dispatch-route-note-warn">{result.error}</p>
          ) : null}

          {result.routes.map((route) => (
            <div className="dispatch-route-card" key={route.vehicleId}>
              <strong>
                {route.vehicleName}
                <span>
                  {route.load}/{route.capacity} PLT · {route.totalDistanceKm}km ·{" "}
                  {route.totalTimeMin}분
                </span>
              </strong>
              <ol>
                {route.titles.map((title, index) => (
                  <li key={`${route.vehicleId}-${route.stopIds[index]}`}>
                    {index + 1}. {title}
                  </li>
                ))}
              </ol>
            </div>
          ))}

          {result.unassigned.length ? (
            <p className="dispatch-route-note-warn">
              미할당 {result.unassigned.length}건 (용량·좌표 확인)
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
