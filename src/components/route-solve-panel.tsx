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
import type { RoutePriorityId } from "@/lib/route-priority";
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
    tollWon: number | null;
    carType: number;
    load: number;
    capacity: number;
    path?: { lat: number; lng: number; label?: string }[];
    priority?: RoutePriorityId;
    priorityLabel?: string;
  }[];
  unassigned: string[];
  unassignedDetails?: { id: string; title: string; reason: string }[];
  solverReachable: boolean;
  error?: string;
};

type RouteAlternativeOption = {
  priority: RoutePriorityId;
  label: string;
  hint: string;
  distanceKm: number;
  durationMin: number;
  tollWon: number | null;
  path: { lat: number; lng: number }[];
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
  const [dieselPrice, setDieselPrice] = useState("");
  const [efficiencies, setEfficiencies] = useState<Record<string, string>>({});
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
  const [altVehicleId, setAltVehicleId] = useState<string | null>(null);
  const [altLoadingId, setAltLoadingId] = useState<string | null>(null);
  const [altError, setAltError] = useState<string | null>(null);
  const [altOptionsByVehicle, setAltOptionsByVehicle] = useState<
    Record<string, RouteAlternativeOption[]>
  >({});
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
    setAltVehicleId(null);
    setAltOptionsByVehicle({});
    setAltError(null);
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
    setAltOptionsByVehicle((prev) => {
      if (!(vehicleId in prev)) return prev;
      const next = { ...prev };
      delete next[vehicleId];
      return next;
    });
    if (altVehicleId === vehicleId) setAltVehicleId(null);

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

  function buildRoutePoints(route: RouteSolveResult["routes"][number]) {
    const depot = result?.depot ?? FALLBACK_DEPOT;
    const markerById = new Map(markers.map((marker) => [marker.id, marker]));
    const stops = route.stopIds
      .map((id) => markerById.get(id))
      .filter((marker): marker is DispatchMapMarker => Boolean(marker));
    if (!stops.length) return null;
    return [
      { lat: depot.lat, lng: depot.lng },
      ...stops.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
      { lat: depot.lat, lng: depot.lng },
    ];
  }

  async function onOpenAlternatives(vehicleId: string) {
    if (!result || busy) return;
    if (altVehicleId === vehicleId) {
      setAltVehicleId(null);
      return;
    }

    const route = result.routes.find((item) => item.vehicleId === vehicleId);
    if (!route) return;
    const points = buildRoutePoints(route);
    if (!points) {
      setAltError("좌표가 없어 다른 경로를 만들 수 없습니다.");
      return;
    }

    setAltVehicleId(vehicleId);
    setAltError(null);
    if (altOptionsByVehicle[vehicleId]?.length) return;

    setAltLoadingId(vehicleId);
    try {
      const res = await fetch("/api/route/alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, carType: route.carType }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        options?: RouteAlternativeOption[];
        error?: string;
      };
      if (!data.ok || !data.options?.length) {
        setAltError(data.error ?? "다른 경로를 가져오지 못했습니다.");
        return;
      }
      setAltOptionsByVehicle((prev) => ({ ...prev, [vehicleId]: data.options! }));
    } catch (error) {
      setAltError(error instanceof Error ? error.message : String(error));
    } finally {
      setAltLoadingId(null);
    }
  }

  function onApplyAlternative(vehicleId: string, option: RouteAlternativeOption) {
    if (!result) return;
    const next: RouteSolveResult = {
      ...result,
      routes: result.routes.map((route) =>
        route.vehicleId === vehicleId
          ? {
              ...route,
              totalDistanceKm: option.distanceKm,
              totalTimeMin: option.durationMin,
              tollWon: option.tollWon,
              path: option.path.map((point, index) =>
                index === 0 ? { ...point, label: "출" } : point,
              ),
              priority: option.priority,
              priorityLabel: option.label,
            }
          : route,
      ),
      note: `${result.note.split(" · ")[0]} · ${option.label} 경로 적용`,
    };
    publish(next);
    setAltVehicleId(null);
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
          {altError ? <p className="dispatch-route-note-warn">{altError}</p> : null}
          {savingVehicleId ? (
            <p className="dispatch-route-meta">순서 저장 · 경로 다시 계산 중…</p>
          ) : null}

          <label className="route-fuel-price">경유 가격 (원/L)
            <input className="dispatch-input" type="number" min="0" step="1" value={dieselPrice} onChange={(e) => setDieselPrice(e.target.value)} placeholder="주유 가격 입력" />
          </label>
          <p className="dispatch-route-meta">왕복 경로 기준 예상액 · 통행료 차종은 톤수에 따른 잠정 분류이며 실제 차종과 요금을 확인하세요. 경유 가격과 연비는 이 화면에서 입력합니다.</p>

          {result.routes.map((route) => (
            <div className="dispatch-route-card" key={route.vehicleId}>
              <div className="dispatch-route-card-head">
                <strong>
                  {route.vehicleName}
                  <span>
                    {route.load}/{route.capacity} PLT · {route.totalDistanceKm}km ·{" "}
                    {route.totalTimeMin}분
                    {route.priorityLabel ? ` · ${route.priorityLabel}` : ""}
                  </span>
                </strong>
                <div className="dispatch-route-card-actions">
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
                  <button
                    className="dispatch-route-suggest-btn"
                    disabled={busy || altLoadingId === route.vehicleId}
                    onClick={() => void onOpenAlternatives(route.vehicleId)}
                    type="button"
                  >
                    {altLoadingId === route.vehicleId
                      ? "경로…"
                      : altVehicleId === route.vehicleId
                        ? "닫기"
                        : "다른 경로"}
                  </button>
                </div>
              </div>
              <div className="route-costs">
                <span>예상 통행료: <b>{route.tollWon == null ? "확인 불가" : `${route.tollWon.toLocaleString("ko-KR")}원`}</b></span>
                <label>연비 (km/L)
                  <input className="dispatch-input" type="number" min="0" step="0.1" value={efficiencies[route.vehicleId] ?? ""} placeholder="입력" onChange={(e) => setEfficiencies((prev) => ({ ...prev, [route.vehicleId]: e.target.value }))} />
                </label>
                <span>예상 경유비: <b>{Number(dieselPrice) > 0 && Number(efficiencies[route.vehicleId]) > 0 ? `${Math.round(route.totalDistanceKm / Number(efficiencies[route.vehicleId]) * Number(dieselPrice)).toLocaleString("ko-KR")}원` : "가격·연비 입력 필요"}</b></span>
              </div>
              {altVehicleId === route.vehicleId ? (
                <div className="dispatch-route-alts">
                  <p className="dispatch-route-alts-title">경로 우선순위</p>
                  {altLoadingId === route.vehicleId ? (
                    <p className="dispatch-route-meta">4가지 경로 조회 중…</p>
                  ) : null}
                  {(altOptionsByVehicle[route.vehicleId] ?? []).map((option) => {
                    const selected =
                      route.priority === option.priority ||
                      (!route.priority && option.priority === "RECOMMEND");
                    return (
                      <button
                        className={`dispatch-route-alt-btn${selected ? " is-selected" : ""}`}
                        disabled={busy}
                        key={option.priority}
                        onClick={() => onApplyAlternative(route.vehicleId, option)}
                        type="button"
                      >
                        <span className="dispatch-route-alt-label">
                          {option.label}
                          <small>{option.hint}</small>
                        </span>
                        <span className="dispatch-route-alt-meta">
                          {option.distanceKm}km · {option.durationMin}분 · 통행료 {option.tollWon == null ? "확인 불가" : `${option.tollWon.toLocaleString("ko-KR")}원`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
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
            <div className="dispatch-route-note-warn">
              <p>경로 제외 {result.unassigned.length}건</p>
              <ul className="dispatch-route-unassigned-list">
                {(
                  result.unassignedDetails ??
                  result.unassigned.map((id) => {
                    const marker = markers.find((m) => m.id === id);
                    return {
                      id,
                      title: marker?.title ?? "납품지",
                      reason: marker ? "차량 미배정" : "좌표 없음",
                    };
                  })
                ).map((item) => (
                  <li key={item.id}>
                    {item.title} · {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
