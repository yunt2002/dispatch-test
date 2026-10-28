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

function moveIndex(ids: string[], from: number, to: number): string[] {
  if (to < 0 || to >= ids.length || from === to) return ids;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function RouteSolvePanel({ date, result: controlledResult, onResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [savingVehicleId, setSavingVehicleId] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<RouteSolveResult | null>(null);
  const result = controlledResult !== undefined ? controlledResult : localResult;

  function publish(data: RouteSolveResult) {
    if (!data.depot) data.depot = FALLBACK_DEPOT;
    setLocalResult(data);
    onResult?.(data);
  }

  async function fetchSolve(): Promise<RouteSolveResult> {
    const res = await fetch("/api/route/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    return (await res.json()) as RouteSolveResult;
  }

  async function runSolve() {
    setLoading(true);
    setOrderError(null);
    try {
      publish(await fetchSolve());
    } catch (error) {
      publish({
        ok: false,
        solverReachable: false,
        depot: FALLBACK_DEPOT,
        note: "요청 실패",
        routes: [],
        unassigned: [],
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }

  async function applyOrder(vehicleId: string, stopIds: string[]) {
    if (!result) return;
    setSavingVehicleId(vehicleId);
    setOrderError(null);

    const route = result.routes.find((item) => item.vehicleId === vehicleId);
    if (!route) {
      setSavingVehicleId(null);
      return;
    }

    const titleById = new Map(
      route.stopIds.map((id, index) => [id, route.titles[index] ?? id]),
    );
    const optimistic: RouteSolveResult = {
      ...result,
      routes: result.routes.map((item) =>
        item.vehicleId === vehicleId
          ? {
              ...item,
              stopIds,
              titles: stopIds.map((id) => titleById.get(id) ?? id),
            }
          : item,
      ),
    };
    publish(optimistic);

    try {
      const saveRes = await fetch("/api/route/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, vehicleId, stopIds }),
      });
      const saveData = (await saveRes.json()) as { ok?: boolean; error?: string };
      if (!saveRes.ok || !saveData.ok) {
        setOrderError(saveData.error ?? "순서 저장에 실패했습니다.");
        try {
          publish(await fetchSolve());
        } catch {
          /* keep optimistic list if refresh fails */
        }
        return;
      }

      publish(await fetchSolve());
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : String(error));
      try {
        publish(await fetchSolve());
      } catch {
        /* keep optimistic list if refresh fails */
      }
    } finally {
      setSavingVehicleId(null);
    }
  }

  function onMove(vehicleId: string, from: number, direction: -1 | 1) {
    if (!result || savingVehicleId || loading) return;
    const route = result.routes.find((item) => item.vehicleId === vehicleId);
    if (!route || route.stopIds.length < 2) return;
    const next = moveIndex(route.stopIds, from, from + direction);
    if (next === route.stopIds) return;
    void applyOrder(vehicleId, next);
  }

  const busy = loading || Boolean(savingVehicleId);

  return (
    <section className="dispatch-route-panel" aria-label="경로 제안">
      <div className="dispatch-route-head">
        <h2>경로 (카카오 길찾기)</h2>
        <button
          className="dispatch-secondary-button"
          disabled={busy}
          onClick={() => void runSolve()}
          type="button"
        >
          {loading && !savingVehicleId ? "계산 중…" : "경로 계산"}
        </button>
      </div>
      <p className="dispatch-side-meta">
        같은 차량 안 방문 순서를 ▲▼로 바꾸면 저장되고, 카카오 도로 경로를 다시 그립니다.
      </p>

      {!result ? (
        <p className="dispatch-route-hint">
          버튼을 누르면 카카오 길찾기로 차량별 도로 경로가 그려집니다. 순서는 나중에 ▲▼로
          조정할 수 있습니다.
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
          {orderError ? <p className="dispatch-route-note-warn">{orderError}</p> : null}
          {savingVehicleId ? (
            <p className="dispatch-route-meta">순서 저장 · 경로 다시 계산 중…</p>
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
              <ol className="dispatch-route-stops">
                {route.titles.map((title, index) => (
                  <li key={`${route.vehicleId}-${route.stopIds[index]}`}>
                    <span className="dispatch-route-stop-label">
                      {index + 1}. {title}
                    </span>
                    {route.stopIds.length > 1 ? (
                      <span className="dispatch-route-stop-actions">
                        <button
                          aria-label="위로"
                          className="dispatch-route-order-btn"
                          disabled={busy || index === 0}
                          onClick={() => onMove(route.vehicleId, index, -1)}
                          type="button"
                        >
                          ▲
                        </button>
                        <button
                          aria-label="아래로"
                          className="dispatch-route-order-btn"
                          disabled={busy || index === route.stopIds.length - 1}
                          onClick={() => onMove(route.vehicleId, index, 1)}
                          type="button"
                        >
                          ▼
                        </button>
                      </span>
                    ) : null}
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
