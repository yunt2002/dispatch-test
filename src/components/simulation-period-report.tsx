"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultFieldReview, fieldReviewStatuses, type FieldReview, type SimulationHistoryRecord, type HistoryMetrics, type HistoryReview } from "@/lib/simulation-history";
import { periodDistribution, periodRecords } from "@/lib/simulation-period-report";
import { tripLabel } from "@/lib/simulation-cost";

type Summary = { id: string; date: string; savedAt: string; fileName: string; review: HistoryReview; planSource: string; metrics: HistoryMetrics; fieldReview?: FieldReview };
type Page = { records: Summary[]; nextCursor: string | null; error?: string };
const money = (value: number | null) => value == null ? "확인 필요" : `${value.toLocaleString("ko-KR")}원`;
const minutes = (value: number | null) => value == null ? "확인 필요" : `${value.toLocaleString("ko-KR")}분`;
const stamp = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

function dateBefore(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function SimulationPeriodReport({ revision }: { revision: number }) {
  const [records, setRecords] = useState<Summary[] | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [detailState, setDetailState] = useState<{ key: string; records: Record<string, SimulationHistoryRecord>; error: string }>({ key: "", records: {}, error: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const all: Summary[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      do {
        const url = `/api/simulation/history${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`;
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const page = await response.json() as Page;
        if (!response.ok) throw new Error(page.error || "보고서 기록을 불러오지 못했습니다.");
        all.push(...page.records);
        cursor = page.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error("보고서 기록을 모두 불러오지 못했습니다. 새로고침해 주세요.");
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (controller.signal.aborted) return;
      setRecords(all);
      setError("");
      const latest = all.reduce((max, record) => record.date > max ? record.date : max, "");
      if (latest) { setStart((current) => current || dateBefore(latest, 6)); setEnd((current) => current || latest); }
    })().catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "보고서 기록을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [revision]);

  const selected = useMemo(() => periodRecords(records ?? [], start, end, choices), [records, start, end, choices]);
  const selectedIds = selected.map((record) => record.id).join("|");
  const detailKey = `${revision}:${selectedIds}`;
  const loadingDetails = !!selectedIds && detailState.key !== detailKey;
  const detailError = detailState.key === detailKey ? detailState.error : "";
  const details = detailState.key === detailKey ? detailState.records : {};
  useEffect(() => {
    if (!selectedIds) return;
    const controller = new AbortController();
    const ids = selectedIds.split("|");
    Promise.all(ids.map(async (id) => {
      const response = await fetch(`/api/simulation/history?id=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
      const record = await response.json();
      if (!response.ok) throw new Error(record.error || "상세 기록을 불러오지 못했습니다.");
      return [id, record] as const;
    })).then((values) => { if (!controller.signal.aborted) setDetailState({ key: detailKey, records: Object.fromEntries(values), error: "" }); })
      .catch((err) => { if (!controller.signal.aborted) setDetailState({ key: detailKey, records: {}, error: err instanceof Error ? err.message : "상세 기록을 불러오지 못했습니다." }); });
    return () => controller.abort();
  }, [selectedIds, detailKey]);

  const distribution = periodDistribution(selected);
  const maximum = Math.max(1, ...selected.flatMap((record) => [record.metrics.originalCost ?? 0, record.metrics.proposedCost ?? 0]));
  return <section className="period-report" aria-label="기간별 종합 비교 보고서">
    <div className="period-report-heading"><div><h2>기간별 종합 비교</h2><p>저장된 날짜별 결과를 모아 AI 배차의 가능성을 살펴봅니다.</p></div><button type="button" className="dispatch-secondary-button period-no-print" disabled={!selected.length || loadingDetails || !!detailError || !!error} onClick={() => window.print()}>보고서 인쇄 · PDF 저장</button></div>
    <div className="comparison-controls period-no-print"><label>시작일 <input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>종료일 <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
    <p className="period-print-only">기간: {start} ~ {end}</p>
    <p className="dispatch-route-note-warn"><strong>현장 확인 전 예상 비교입니다.</strong> 비용은 기록별 입력과 가정이 다를 수 있으며 실제 운행 실적이나 확정 절감액이 아닙니다.</p>
    {error ? <p role="alert" className="dispatch-route-note-warn">{error}</p> : !records ? <p>전체 분석 기록을 불러오는 중입니다.</p> : start > end ? <p role="alert" className="dispatch-route-note-warn">시작일은 종료일보다 늦을 수 없습니다.</p> : !selected.length ? <p>선택한 기간에 저장된 기록이 없습니다.</p> : <>
      <div className="period-summary"><strong>{selected.length}일 비교</strong><span>AI 예상 비용 감소 {distribution.decrease}일</span><span>동일 {distribution.equal}일</span><span>증가 {distribution.increase}일</span><span>금액 확인 필요 {distribution.unknown}일</span><span>조건 확인 필요 {distribution.needsReview}일</span></div>
      <p className="comparison-note">감소·동일·증가는 각 날짜에 표시된 참고 금액 기준입니다. 확인이 필요한 기록과 담당자 조정안도 포함하며, 금액 확인 필요는 별도로 셉니다. 날짜별 최신 기록을 기본으로 표시하며 위에서 선택한 기록은 아래 비교 요약의 선택과 별도입니다.</p>
      <div className="simulation-run-info" aria-label="담당자 현장 판단 요약"><strong>담당자 현장 판단</strong><p>{fieldReviewStatuses.map((status) => `${status} ${selected.filter((record) => (record.fieldReview ?? defaultFieldReview).status === status).length}일`).join(" · ")}</p><p className="comparison-note">각 날짜에서 선택한 기록에 담당자가 남긴 판단입니다. 미검토는 운행 가능 여부를 판단하지 않은 상태입니다. 판단과 사유는 분석 기록 목록의 ‘현장 검토’에서 수정할 수 있습니다.</p></div>
      {loadingDetails ? <p>선택한 기록의 상세 내용을 불러오는 중입니다.</p> : null}{detailError ? <p role="alert" className="dispatch-route-note-warn">{detailError}</p> : null}
      <div className="period-days">{selected.map((record) => {
        const alternatives = (records ?? []).filter((row) => row.date === record.date).sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
        const detail = details[record.id];
        const m = record.metrics;
        const reference = record.review !== "검토 완료" || !m.comparable || m.aiAdjusted;
        return <article className="period-day" key={record.date}>
          <div className="period-day-heading"><h3>{record.date}</h3><strong className={reference ? "dispatch-route-note-warn" : ""}>{reference ? "참고 · 조건 확인 필요" : "비교 조건 확인됨"}</strong></div>
          <label className="period-no-print">비교할 기록 <select value={record.id} onChange={(event) => setChoices((current) => ({ ...current, [record.date]: event.target.value }))}>{alternatives.map((item, index) => <option key={item.id} value={item.id}>{index === 0 ? "최신 · " : ""}{stamp(item.savedAt)} · {item.fileName}</option>)}</select></label>
          <p className="comparison-note">저장 {stamp(record.savedAt)} · {record.planSource} · {m.aiAdjusted ? "담당자 조정안" : "AI 원안"}{!m.courierIncluded ? " · 택배비 양쪽 제외" : ""}</p>
          <p><strong>담당자 현장 판단: {(record.fieldReview ?? defaultFieldReview).status}</strong> · 사유: {(record.fieldReview ?? defaultFieldReview).reason || "미입력"}</p>
          {detail ? <ComparisonConditions record={detail} /> : null}
          {([["기존 계획", m.originalCost], ["AI 제안", m.proposedCost]] as const).map(([label, value]) => <div className="simulation-chart-row" key={label}><span>{label}</span><div className="simulation-chart-track" aria-hidden="true"><div className={`simulation-chart-bar ${label === "AI 제안" ? "simulation-chart-bar-ai" : ""}`} style={{ width: `${value == null ? 0 : value / maximum * 100}%` }} /></div><strong>{money(value)}</strong></div>)}
          <p>자사 소요 시간: 기존 {minutes(m.originalMinutes)} · AI {minutes(m.proposedMinutes)} / 용차: 기존 {m.originalCharters}회 · AI {m.proposedCharters}회</p>
          {m.warnings.length ? <p className="dispatch-route-note-warn">{m.warnings.join(" / ")}</p> : null}
          {detail ? <><details className="period-no-print"><summary>차량별 경로·적재 품목 보기</summary><PeriodDetail record={detail} /></details><div className="period-print-only"><PeriodDetail record={detail} /></div></> : null}
        </article>;
      })}</div>
    </>}
  </section>;
}

function ComparisonConditions({ record }: { record: SimulationHistoryRecord }) {
  const s = record.snapshot;
  const original = [...s.originalTrips, ...s.originalExtras];
  const proposed = [...s.proposedTrips, ...s.proposedExtras];
  const excluded = (trips: typeof original) => trips.filter((trip) => trip.excluded).length;
  const assumed = (trips: typeof original) => trips.filter((trip) => !trip.excluded && !trip.fare.trim()).length;
  return <div className="simulation-run-info" aria-label="비교 조건">
    <strong>비교 조건</strong>
    <p>분석 제외 품목: {s.excludedItems.length}건{ s.excludedItems.length ? ` (${s.excludedItems.map((item) => `${item.rowNumber}행 ${item.customer} · ${item.product}`).join(" / ")})` : ""} · 경유 {s.dieselPrice ? `${s.dieselPrice}원/L` : "미입력"}</p>
    <p>용차 비용 제외: 기존 {excluded(original)}회 · AI {excluded(proposed)}회 / 운임 미입력(회당 20만 원 가정): 기존 {assumed(original)}회 · AI {assumed(proposed)}회</p>
    <p>택배비: {record.metrics.courierIncluded ? "비교 금액에 포함" : "양쪽 금액에서 제외"} · 검토 상태: {s.review}{s.memo ? ` · 검토 메모: ${s.memo}` : ""}</p>
    <p className="comparison-note">제외 품목은 두 안에서 함께 제외됩니다. 운임과 납품 가능 여부 등 입력 내용은 별도 확인이 필요합니다.</p>
  </div>;
}

function PeriodDetail({ record }: { record: SimulationHistoryRecord }) {
  const lookup = new Map(record.snapshot.result.items.map((item) => [item.rowNumber, item]));
  return <div className="period-detail"><p>제외 품목: {record.snapshot.excludedItems.length ? record.snapshot.excludedItems.map((item) => `${item.rowNumber}행 ${item.customer} · ${item.product}`).join(" / ") : "없음"}</p>{record.snapshot.result.warnings.map((warning, index) => <p key={index} className="dispatch-route-note-warn">{warning}</p>)}{([["기존 계획", record.snapshot.result.original, [...record.snapshot.originalTrips, ...record.snapshot.originalExtras]], ["AI 제안", record.snapshot.result.proposed, [...record.snapshot.proposedTrips, ...record.snapshot.proposedExtras]]] as const).map(([title, routes, trips]) => <div key={title}><strong>{title}</strong>{routes.map((route) => <div key={route.vehicle}><p>{route.vehicle}: {route.items.length ? [...new Set(route.items.map((item) => item.customer || "거래처 미확인"))].join(" → ") : "운행 없음"} · 확인된 적재 {route.pallets} / {route.maxPallet ?? "미확인"} PLT{route.unknownPallets ? ` · 미확인 ${route.unknownPallets}품목` : ""}</p>{route.items.length ? <ul>{route.items.map((item) => <li key={item.rowNumber}>{item.rowNumber}행 · {item.customer} · {item.product} · {item.pallets == null ? "PLT 미확인" : `${item.pallets} PLT`}</li>)}</ul> : null}</div>)}<p>용차: {trips.length ? trips.map((trip) => `${tripLabel(trip, lookup)}${trip.excluded ? " (비용 제외)" : ""}`).join(" / ") : "없음"}</p></div>)}</div>;
}
