"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HistoryMetrics, HistoryReview, SimulationHistoryRecord } from "@/lib/simulation-history";
import type { SimulationItem, SimulationRoute } from "@/lib/simulation";
import { courierCost } from "@/lib/simulation-courier";
import { tripLabel, type CharterTrip } from "@/lib/simulation-cost";
import { simulationTime } from "@/lib/simulation-time";

type Summary = { id: string; date: string; fileName: string; savedAt: string; review: HistoryReview; planSource: string; metrics: HistoryMetrics };
type Listing = { records: Summary[]; selected: Record<string, string>; nextCursor: string | null };
const won = (value: number | null) => value == null ? "확인 필요" : `${Math.round(value).toLocaleString("ko-KR")}원`;
const minutes = (value: number | null) => value == null ? "확인 필요" : `${value.toLocaleString("ko-KR")}분`;
const stamp = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

function Routes({ title, routes }: { title: string; routes: SimulationRoute[] }) {
  return <section className="comparison-plan"><h3>{title}</h3>{routes.map((route) => {
    const time = simulationTime(route);
    return <div className="comparison-route" key={route.vehicle}><strong>{route.vehicle}</strong>{route.items.length ? <><p>{route.items.map((item) => item.customer || "거래처 미확인").filter((name, index, all) => all.indexOf(name) === index).join(" → ")}</p><p>확인된 별도 적재 {route.pallets} / 8 PLT · 미확인 {route.unknownPallets}품목 · 중량 {route.weight.toLocaleString("ko-KR")}kg</p><p>총 {minutes(time.total)} · 운전 {minutes(time.driving)} · 점심 {time.lunch}분 · 하차 {time.unloading}분</p><details><summary>납품 주소·구간 보기</summary><ul>{route.items.filter((item, index, all) => all.findIndex((other) => other.customer === item.customer && other.address === item.address) === index).map((item) => <li key={item.rowNumber}>{item.customer} · {item.address || "주소 미확인"} {item.addressIssue ? `· ${item.addressIssue}` : ""}</li>)}</ul>{route.legs?.length ? <ol>{route.legs.map((leg, index) => <li key={index}>{leg.from} → {leg.to} · {leg.distanceKm == null ? "거리 미확인" : `${leg.distanceKm}km`} · {minutes(leg.minutes)}</li>)}</ol> : null}</details><details><summary>적재 품목 보기 ({route.items.length}품목)</summary><ul>{route.items.map((item) => <li key={item.rowNumber}>{item.rowNumber}행 · {item.customer} · {item.product} · {item.boxes == null ? "박스 미확인" : `${item.boxes}박스`} · {item.pallets == null ? "PLT 미확인" : `${item.pallets} PLT`}</li>)}</ul></details></> : <p>운행 품목 없음</p>}</div>;
  })}</section>;
}

function TripList({ title, trips, items }: { title: string; trips: CharterTrip[]; items: SimulationItem[] }) {
  const lookup = new Map(items.map((item) => [item.rowNumber, item]));
  return <div><strong>{title}</strong>{trips.length ? <ul>{trips.map((trip, index) => <li key={`${trip.id}-${index}`}>{tripLabel(trip, lookup)} · {trip.leg === "round_trip" ? "왕복" : "편도"} · {trip.excluded ? "비용 제외" : trip.fare === "" ? "미입력: 200,000원 가정" : won(Number(trip.fare))}</li>)}</ul> : <p>없음</p>}</div>;
}

function Detail({ record }: { record: SimulationHistoryRecord }) {
  const { snapshot: s, metrics: m } = record;
  const rows = new Map(s.result.items.map((item) => [item.rowNumber, item]));
  const parcelRows = s.result.items.filter((item) => !item.vehicle && !/용차/.test(item.transport) && /택배|경동/.test(item.transport));
  return <div className="simulation-run-info"><h3>{s.date} 분석 상세</h3><p>저장 {stamp(record.savedAt)} · 파일 {s.fileName} · 경유 {s.dieselPrice || "미입력"}원/L · 검토 {s.review}</p><p>AI 출처: {s.result.planSource || "미확인"} · 생성 {s.result.savedAt ? stamp(s.result.savedAt) : "미확인"} · 경로 조회 {s.result.routeUpdatedAt ? stamp(s.result.routeUpdatedAt) : "미확인"}</p><p>용차 배정: <strong>{m.aiAdjusted ? "담당자 조정안" : "AI 원안"}</strong></p><p>검토 메모: {s.memo || "없음"}</p><p>조건 식별번호 {s.result.inputFingerprint || "미확인"} · 비교 결과 {m.comparable ? "조건 확인됨" : "확인 필요"} · 택배비 {m.courierIncluded ? "포함" : "양쪽 제외"}</p>
    <p>제외 품목: {s.excludedItems.length ? s.excludedItems.map((item) => `${item.rowNumber}행 ${item.customer} · ${item.product}`).join(" / ") : "없음"}</p>
    {m.warnings.map((warning) => <p className="dispatch-route-note-warn" key={warning}>{warning}</p>)}{s.result.warnings.map((warning, index) => <p className="dispatch-route-note-warn" key={index}>{warning}</p>)}
    <p>AI 선택 과정: {s.result.comparisonNote || "미확인"}</p><p>AI 결과: {s.result.note}</p>
    <div className="comparison-plans"><Routes title="기존 계획" routes={s.result.original} /><Routes title="AI 제안" routes={s.result.proposed} /></div>
    <h3>용차 운행·운임</h3><TripList title="기존 계획 · 조정 후" trips={[...s.originalTrips, ...s.originalExtras]} items={s.result.items} /><TripList title="AI 제안 · 조정 후" trips={[...s.proposedTrips, ...s.proposedExtras]} items={s.result.items} />
    <details><summary>AI가 처음 제안한 용차 묶음</summary>{s.result.charterGroups == null ? <p>미확인</p> : <ol>{s.result.charterGroups.map((group, index) => <li key={index}>{group.items.map((item) => `${item.customer} (${item.rowNumber}행 · ${item.product})`).join(" / ")}</li>)}</ol>}</details>
    <details><summary>택배 출고 방식·운임</summary>{parcelRows.length ? <ul>{parcelRows.map((item) => { const choice = s.courierChoices[String(item.rowNumber)]; const cost = courierCost(item, choice); const moved = s.result.proposed.some((route) => route.items.some((entry) => entry.rowNumber === item.rowNumber)); return <li key={item.rowNumber}>{item.rowNumber}행 · {rows.get(item.rowNumber)?.customer} · {item.product} · {cost ? `${cost.quantity}${cost.mode === "box" ? "박스" : "PLT"} · ${won(cost.amount)}` : "출고 방식·수량 미확인"} · AI안 {moved ? "자사 차량 제안" : "택배 유지"}</li>; })}</ul> : <p>택배 품목 없음</p>}</details>
    <p className="comparison-note">저장 당시의 입력값과 조회 시점 기준 경로입니다. 실제 운행 실적이 아닙니다.</p>
  </div>;
}

export function SimulationHistoryPage() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<SimulationHistoryRecord | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/simulation/history", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "분석 기록을 불러오지 못했습니다.");
      if (!controller.signal.aborted) { setListing(data); setError(""); }
    }).catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "분석 기록을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, []);
  async function select(record: Summary, selected: boolean) {
    setBusy(true); setError("");
    try { const response = await fetch("/api/simulation/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select", date: record.date, id: selected ? null : record.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setListing((current) => current ? { ...current, selected: { ...current.selected, [record.date]: selected ? "" : record.id } } : current); }
    catch (err) { setError(err instanceof Error ? err.message : "선택을 저장하지 못했습니다."); } finally { setBusy(false); }
  }
  async function loadMore() {
    if (!listing?.nextCursor) return;
    setBusy(true); setError("");
    try { const response = await fetch(`/api/simulation/history?before=${encodeURIComponent(listing.nextCursor)}`, { cache: "no-store" }); const data = await response.json() as Listing & { error?: string }; if (!response.ok) throw new Error(data.error || "이전 기록을 불러오지 못했습니다."); setListing((current) => current ? { records: [...current.records, ...data.records].sort((a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt)), selected: data.selected, nextCursor: data.nextCursor } : data); }
    catch (err) { setError(err instanceof Error ? err.message : "이전 기록을 불러오지 못했습니다."); } finally { setBusy(false); }
  }
  async function open(record: Summary) {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/simulation/history?id=${encodeURIComponent(record.id)}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setDetail(data); }
    catch (err) { setError(err instanceof Error ? err.message : "기록을 불러오지 못했습니다."); } finally { setBusy(false); }
  }
  const selected = listing?.records.filter((record) => listing.selected[record.date] === record.id) ?? [];
  const verified = selected.filter((record) => record.review === "검토 완료" && record.metrics.comparable && !record.metrics.aiAdjusted);
  const original = verified.reduce((sum, record) => sum + (record.metrics.originalCost ?? 0), 0);
  const proposed = verified.reduce((sum, record) => sum + (record.metrics.proposedCost ?? 0), 0);
  const maximum = Math.max(1, ...selected.flatMap((record) => [record.metrics.originalCost ?? 0, record.metrics.proposedCost ?? 0]));
  return <div className="dispatch-page"><section className="comparison-section"><h1>AI 배차 분석 기록</h1><p>날짜마다 비교에 사용할 기록을 하나씩 선택하세요. 저장한 결과는 실제 운행 실적이 아닌 시뮬레이션입니다.</p><p><Link className="dispatch-secondary-button" href="/simulation">시뮬레이션으로</Link></p>
    {error ? <p className="dispatch-route-note-warn" role="alert">{error}</p> : null}
    {!listing && !error ? <p>분석 기록을 불러오는 중입니다.</p> : null}
    {listing?.nextCursor ? <p className="dispatch-route-note-warn">이전 기록이 더 있습니다. 전체 기록을 불러올 때까지 총합은 표시하지 않습니다.</p> : null}
    {listing ? <><div className="simulation-run-info"><strong>비교 요약</strong><p>불러온 기록에서 선택 {selected.length}일 · 합계 포함 {verified.length}일 · 합계 제외 {selected.length - verified.length}일</p>{listing.nextCursor ? null : <p>기존안 합계 <strong>{won(original)}</strong> · AI 원안 합계 <strong>{won(proposed)}</strong> · {verified.length ? original === proposed ? "차이 없음" : `${won(Math.abs(original - proposed))} ${original > proposed ? "절감 예상" : "증가 예상"}` : "합산할 검토 완료 기록 없음"}</p>}<p className="comparison-note">검토 완료이면서 택배·경로·적재 등 비교 조건이 확인된 AI 원안만 합산합니다. 담당자가 용차 배정을 조정한 안은 개별 그래프에서만 확인합니다. 같은 날짜는 선택한 한 건만 포함합니다.</p></div>
      <h2>날짜별 비용 비교</h2>{selected.length ? selected.map((record) => <div className="simulation-chart" key={record.id}><div className="simulation-chart-heading"><strong>{record.date} · {record.review}</strong><span>{record.metrics.comparable ? "비교 조건 확인" : "확인 필요"}</span></div>{record.metrics.aiAdjusted ? <p className="dispatch-route-note-warn">담당자가 용차를 조정한 안 · AI 원안 합계에서 제외</p> : null}{!record.metrics.courierIncluded ? <p className="dispatch-route-note-warn">양쪽 택배비 제외</p> : null}{([['기존 계획', record.metrics.originalCost], ['AI 제안', record.metrics.proposedCost]] as const).map(([label, value]) => <div className="simulation-chart-row" key={label}><span>{label}</span><div className="simulation-chart-track" aria-hidden="true"><div className={`simulation-chart-bar ${label === "AI 제안" ? "simulation-chart-bar-ai" : ""}`} style={{ width: `${value == null ? 0 : value / maximum * 100}%` }} /></div><strong>{won(value)}</strong></div>)}<p className="comparison-note">자사 소요: 기존 {minutes(record.metrics.originalMinutes)} · AI {minutes(record.metrics.proposedMinutes)} / 용차: 기존 {record.metrics.originalCharters}회 · AI {record.metrics.proposedCharters}회</p></div>) : <p>아래 목록에서 날짜별 기록을 선택하면 그래프가 표시됩니다.</p>}
      <h2>저장된 기록</h2>{listing.records.length ? listing.records.map((record) => { const isSelected = listing.selected[record.date] === record.id; return <div className="simulation-run-info" key={record.id}><strong>{record.date} · {record.review} · {record.metrics.aiAdjusted ? "담당자 조정안" : "AI 원안"}{isSelected ? " · 비교 선택" : ""}</strong><p>저장 {stamp(record.savedAt)} · {record.fileName} · {record.planSource}</p><p>기존 {won(record.metrics.originalCost)} · AI {won(record.metrics.proposedCost)}{record.metrics.courierIncluded ? "" : " · 택배비 제외"}</p>{record.metrics.warnings.length ? <p className="dispatch-route-note-warn">{record.metrics.warnings.join(" / ")}</p> : null}<div className="comparison-controls"><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => void open(record)}>상세 보기</button><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => void select(record, isSelected)}>{isSelected ? "비교 선택 해제" : "이 날짜의 비교 기록으로 선택"}</button></div></div>; }) : <p>아직 저장된 분석 기록이 없습니다. 시뮬레이션에서 검토 후 분석 결과를 저장하세요.</p>}
      {listing.nextCursor ? <p><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => void loadMore()}>이전 기록 더 보기</button></p> : null}{detail ? <Detail record={detail} /> : null}</> : null}
  </section></div>;
}
