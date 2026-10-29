"use client";

import { useMemo, useState } from "react";
import type { DispatchMapMarker } from "@/components/kakao-map/types";
import { DEFAULT_DEPOT } from "@/lib/depot";
import type { OrderConstraint, VehicleOrderHint } from "@/lib/route-constraints";
import {
  applyOrderConstraints,
  findOrderHintForVehicle,
  resolveExplicitOrder,
} from "@/lib/route-constraints";
import { sameOrder, suggestVisitOrder } from "@/lib/visit-order-suggest";

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
  markers: DispatchMapMarker[];
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

export function RouteSolvePanel({
  date,
  markers,
  result: controlledResult,
  onResult,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [savingVehicleId, setSavingVehicleId] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<RouteSolveResult | null>(null);
  const [dragFrom, setDragFrom] = useState<{ vehicleId: string; index: number } | null>(
    null,
  );
  const [dragOver, setDragOver] = useState<{ vehicleId: string; index: number } | null>(
    null,
  );
  const [constraintText, setConstraintText] = useState("");
  const [constraints, setConstraints] = useState<OrderConstraint[]>([]);
  const [orderHints, setOrderHints] = useState<VehicleOrderHint[]>([]);
  const [constraintNotes, setConstraintNotes] = useState<string[]>([]);
  const [constraintSummary, setConstraintSummary] = useState<string | null>(null);
  const [parsingConstraints, setParsingConstraints] = useState(false);
  const result = controlledResult !== undefined ? controlledResult : localResult;

  const allStopLabels = useMemo(() => {
    if (!result?.routes.length) return [];
    const labels = new Set<string>();
    for (const route of result.routes) {
      for (const title of route.titles) labels.add(title);
    }
    for (const marker of markers) {
      labels.add(marker.title);
      if (marker.subtitle) labels.add(marker.subtitle);
    }
    return [...labels];
  }, [markers, result]);

  const vehicleNames = useMemo(
    () => result?.routes.map((route) => route.vehicleName) ?? [],
    [result],
  );

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

  function labeledStopsForRoute(route: RouteSolveResult["routes"][number]) {
    const markerById = new Map(markers.map((marker) => [marker.id, marker]));
    return route.stopIds
      .map((id, index) => {
        const marker = markerById.get(id);
        if (!marker) return null;
        return {
          id,
          lat: marker.lat,
          lng: marker.lng,
          label: route.titles[index] || marker.title,
        };
      })
      .filter(
        (
          stop,
        ): stop is { id: string; lat: number; lng: number; label: string } => Boolean(stop),
      );
  }

  function buildSuggestedOrder(
    route: RouteSolveResult["routes"][number],
    nextConstraints: OrderConstraint[],
    nextOrders: VehicleOrderHint[],
  ): string[] | null {
    const stops = labeledStopsForRoute(route);
    if (stops.length < 2) return null;

    const hint = findOrderHintForVehicle(nextOrders, route.vehicleName);
    if (hint) {
      const explicit = resolveExplicitOrder(
        stops.map((stop) => ({ id: stop.id, label: stop.label })),
        hint.sequence,
      );
      if (explicit) return explicit;
    }

    const depot = result?.depot ?? FALLBACK_DEPOT;
    const base = suggestVisitOrder(depot, stops);
    return applyOrderConstraints(
      base,
      stops.map((stop) => ({ id: stop.id, label: stop.label })),
      nextConstraints,
      route.vehicleName,
    );
  }

  async function applyOrder(
    vehicleId: string,
    stopIds: string[],
    baseResult: RouteSolveResult = result!,
    opts?: { skipSolve?: boolean },
  ): Promise<RouteSolveResult | null> {
    if (!baseResult) return null;
    setSavingVehicleId(vehicleId);
    setOrderError(null);

    const route = baseResult.routes.find((item) => item.vehicleId === vehicleId);
    if (!route) {
      setSavingVehicleId(null);
      return baseResult;
    }

    const titleById = new Map(
      route.stopIds.map((id, index) => [id, route.titles[index] ?? id]),
    );
    const optimistic: RouteSolveResult = {
      ...baseResult,
      routes: baseResult.routes.map((item) =>
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
          const refreshed = await fetchSolve();
          publish(refreshed);
          return refreshed;
        } catch {
          return optimistic;
        }
      }

      if (opts?.skipSolve) return optimistic;
      const refreshed = await fetchSolve();
      publish(refreshed);
      return refreshed;
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : String(error));
      try {
        const refreshed = await fetchSolve();
        publish(refreshed);
        return refreshed;
      } catch {
        return optimistic;
      }
    } finally {
      setSavingVehicleId(null);
    }
  }

  async function applySuggestionsToRoutes(
    nextConstraints: OrderConstraint[],
    nextOrders: VehicleOrderHint[],
    baseResult: RouteSolveResult,
  ) {
    let working = baseResult;
    let changed = 0;
    for (const route of baseResult.routes) {
      if (route.stopIds.length < 2) continue;
      const suggested = buildSuggestedOrder(route, nextConstraints, nextOrders);
      if (!suggested || sameOrder(suggested, route.stopIds)) continue;
      const next = await applyOrder(route.vehicleId, suggested, working, {
        skipSolve: true,
      });
      if (next) working = next;
      changed += 1;
    }
    if (changed > 0) {
      try {
        publish(await fetchSolve());
      } catch {
        /* optimistic already published */
      }
    }
    return changed;
  }

  function clearDrag() {
    setDragFrom(null);
    setDragOver(null);
  }

  function onDropReorder(vehicleId: string, toIndex: number) {
    if (!result || !dragFrom || busy) {
      clearDrag();
      return;
    }
    if (dragFrom.vehicleId !== vehicleId) {
      clearDrag();
      return;
    }
    const route = result.routes.find((item) => item.vehicleId === vehicleId);
    if (!route || route.stopIds.length < 2) {
      clearDrag();
      return;
    }
    const next = moveIndex(route.stopIds, dragFrom.index, toIndex);
    clearDrag();
    if (next === route.stopIds) return;
    void applyOrder(vehicleId, next);
  }

  function onSuggestOrder(vehicleId: string) {
    if (!result || busy) return;
    const route = result.routes.find((item) => item.vehicleId === vehicleId);
    if (!route || route.stopIds.length < 2) return;

    const suggested = buildSuggestedOrder(route, constraints, orderHints);
    if (!suggested) {
      setOrderError("좌표가 있는 납품이 부족해 추천 순서를 만들 수 없습니다.");
      return;
    }
    if (sameOrder(suggested, route.stopIds)) {
      setOrderError(null);
      return;
    }
    void applyOrder(vehicleId, suggested);
  }

  async function onParseConstraints() {
    if (!constraintText.trim() || busy || !result) return;
    setParsingConstraints(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/route/constraints/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: constraintText,
          stopLabels: allStopLabels,
          vehicleNames,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        constraints?: OrderConstraint[];
        orders?: VehicleOrderHint[];
        notes?: string[];
        summary?: string;
        source?: string;
        warning?: string;
        groqConfigured?: boolean;
      };
      if (!res.ok || !data.ok) {
        setOrderError(data.error ?? "제약 해석에 실패했습니다.");
        return;
      }
      const nextConstraints = data.constraints ?? [];
      const nextOrders = data.orders ?? [];
      setConstraints(nextConstraints);
      setOrderHints(nextOrders);
      setConstraintNotes(data.notes ?? []);
      const sourceLabel =
        data.source === "groq"
          ? "Groq"
          : data.groqConfigured === false
            ? "규칙(키 없음)"
            : "규칙 폴백";

      const changed = await applySuggestionsToRoutes(
        nextConstraints,
        nextOrders,
        result,
      );

      setConstraintSummary(
        [
          data.summary ?? "해석 완료",
          sourceLabel,
          data.warning,
          changed > 0 ? `${changed}개 호차 순서 적용` : "적용할 순서 변화 없음",
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : String(error));
    } finally {
      setParsingConstraints(false);
    }
  }

  const busy = loading || Boolean(savingVehicleId) || parsingConstraints;

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
        「제약 해석」하면 해당 호차 순서를 바로 바꾸고 경로를 다시 계산합니다. 최종은 드래그로
        고칠 수 있습니다.
      </p>

      {!result ? (
        <p className="dispatch-route-hint">
          버튼을 누르면 카카오 길찾기로 차량별 도로 경로가 그려집니다. 이후 제약·추천 순서·드래그로
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

          <div className="dispatch-route-constraint">
            <label htmlFor="route-constraint-text">현장 제약 (자연어)</label>
            <textarea
              disabled={busy}
              id="route-constraint-text"
              onChange={(event) => setConstraintText(event.target.value)}
              placeholder={"예: 인천항 먼저, 만도는 나중에"}
              rows={2}
              value={constraintText}
            />
            <div className="dispatch-route-constraint-actions">
              <button
                className="dispatch-route-suggest-btn"
                disabled={busy || !constraintText.trim()}
                onClick={() => void onParseConstraints()}
                type="button"
              >
                {parsingConstraints ? "해석 중…" : "제약 해석"}
              </button>
              {constraints.length || constraintNotes.length ? (
                <button
                  className="dispatch-route-suggest-btn"
                  disabled={busy}
                  onClick={() => {
                    setConstraints([]);
                    setOrderHints([]);
                    setConstraintNotes([]);
                    setConstraintSummary(null);
                  }}
                  type="button"
                >
                  제약 지우기
                </button>
              ) : null}
            </div>
            {constraintSummary ? (
              <p className="dispatch-route-meta">{constraintSummary}</p>
            ) : null}
            {constraintNotes.length ? (
              <p className="dispatch-route-note-warn">
                메모(자동 미반영): {constraintNotes.join(" · ")}
              </p>
            ) : null}
          </div>

          {orderError ? <p className="dispatch-route-note-warn">{orderError}</p> : null}
          {savingVehicleId ? (
            <p className="dispatch-route-meta">순서 저장 · 경로 다시 계산 중…</p>
          ) : null}

          {result.routes.map((route) => (
            <div className="dispatch-route-card" key={route.vehicleId}>
              <div className="dispatch-route-card-head">
                <strong>
                  {route.vehicleName}
                  <span>
                    {route.load}/{route.capacity} PLT · {route.totalDistanceKm}km ·{" "}
                    {route.totalTimeMin}분
                  </span>
                </strong>
                {route.stopIds.length > 1 ? (
                  <button
                    className="dispatch-route-suggest-btn"
                    disabled={busy}
                    onClick={() => onSuggestOrder(route.vehicleId)}
                    type="button"
                  >
                    추천 순서
                  </button>
                ) : null}
              </div>
              <ol className="dispatch-route-stops">
                {route.titles.map((title, index) => {
                  const canDrag = route.stopIds.length > 1 && !busy;
                  const isDragging =
                    dragFrom?.vehicleId === route.vehicleId && dragFrom.index === index;
                  const isOver =
                    dragOver?.vehicleId === route.vehicleId && dragOver.index === index;
                  return (
                    <li
                      key={`${route.vehicleId}-${route.stopIds[index]}`}
                      className={[
                        "dispatch-route-stop",
                        canDrag ? "is-draggable" : "",
                        isDragging ? "is-dragging" : "",
                        isOver && !isDragging ? "is-drop-target" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      draggable={canDrag}
                      onDragStart={(event) => {
                        if (!canDrag) return;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(index));

                        const ghost = document.createElement("div");
                        ghost.className = "dispatch-route-drag-ghost";
                        ghost.textContent = `${index + 1}. ${title}`;
                        document.body.appendChild(ghost);
                        const rect = event.currentTarget.getBoundingClientRect();
                        event.dataTransfer.setDragImage(
                          ghost,
                          Math.min(24, rect.width / 4),
                          Math.min(16, rect.height / 2),
                        );
                        window.setTimeout(() => ghost.remove(), 0);

                        setDragFrom({ vehicleId: route.vehicleId, index });
                      }}
                      onDragEnd={clearDrag}
                      onDragOver={(event) => {
                        if (!dragFrom || dragFrom.vehicleId !== route.vehicleId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (dragOver?.index !== index) {
                          setDragOver({ vehicleId: route.vehicleId, index });
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOver?.vehicleId === route.vehicleId && dragOver.index === index) {
                          setDragOver(null);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        onDropReorder(route.vehicleId, index);
                      }}
                    >
                      {isDragging ? (
                        <span className="dispatch-route-stop-placeholder">이동 중…</span>
                      ) : (
                        <>
                          {canDrag ? (
                            <span aria-hidden="true" className="dispatch-route-drag-handle">
                              ⋮⋮
                            </span>
                          ) : null}
                          <span className="dispatch-route-stop-label">
                            {index + 1}. {title}
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
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
