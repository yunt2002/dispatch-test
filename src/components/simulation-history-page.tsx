"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { comparisonDistribution, defaultFieldReview, defaultWorkReview, fieldReviewStatuses, summarizeWorkReviews, validWorkReview, workChangeLevels, workChangeTypes, type FieldReview, type HistoryMetrics, type HistoryReview, type SimulationHistoryRecord, type WorkReview } from "@/lib/simulation-history";
import type { SimulationItem, SimulationRoute } from "@/lib/simulation";
import { courierCost } from "@/lib/simulation-courier";
import { tripLabel, type CharterTrip } from "@/lib/simulation-cost";
import { simulationTime } from "@/lib/simulation-time";
import { SimulationPeriodReport } from "@/components/simulation-period-report";

type Summary = { id: string; date: string; fileName: string; savedAt: string; review: HistoryReview; fieldReview: FieldReview; workReview: WorkReview; planSource: string; metrics: HistoryMetrics };
type Listing = { records: Summary[]; selected: Record<string, string>; nextCursor: string | null };
const won = (value: number | null) => value == null ? "확인 필요" : `${Math.round(value).toLocaleString("ko-KR")}원`;
const minutes = (value: number | null) => value == null ? "확인 필요" : `${value.toLocaleString("ko-KR")}분`;
const stamp = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

function WorkReviewEditor({ value, onChange, onSave, busy }: { value: WorkReview; onChange: (review: WorkReview) => void; onSave: () => void; busy: boolean }) {
  const fields = [["humanMinutes", "사람이 배차한 시간"], ["aiGenerationMinutes", "AI 생성 대기 시간"], ["aiReviewMinutes", "AI안 검토·수정 시간"]] as const;
  return <div className="simulation-run-info"><p className="comparison-note">직접 측정하거나 확인한 시간을 분 단위로 입력하세요. 모르면 비워두고, 실제 0분은 0을 입력합니다. AI 총 시간은 생성 대기와 검토·수정 시간의 합입니다.</p><div className="comparison-controls">{fields.map(([key, label]) => <label key={key}>{label} (분) <input type="number" min="0" max="10080" step="1" disabled={busy} value={value[key] ?? ""} onChange={(event) => { const raw = event.target.value; onChange({ ...value, [key]: raw === "" ? null : Number(raw) }); }} /></label>)}</div><div className="comparison-controls"><label>AI안 수정 정도 <select disabled={busy} value={value.changeLevel} onChange={(event) => onChange({ ...value, changeLevel: event.target.value as WorkReview["changeLevel"] })}>{workChangeLevels.map((level) => <option key={level}>{level}</option>)}</select></label></div><p>수정한 항목 (담당자 기록)</p><div className="comparison-controls">{workChangeTypes.map((type) => <label key={type}><input type="checkbox" disabled={busy} checked={value.changes.includes(type)} onChange={(event) => onChange({ ...value, changes: event.target.checked ? [...value.changes, type] : value.changes.filter((item) => item !== type) })} /> {type}</label>)}</div><label>수정 사유·메모 <input type="text" maxLength={2000} disabled={busy} value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} placeholder="예: 납품 시간 때문에 용차 재배정" /></label><p><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={onSave}>작업 기록 저장</button></p></div>;
}

function Routes({ title, routes }: { title: string; routes: SimulationRoute[] }) {
  return <section className="comparison-plan"><h3>{title}</h3>{routes.map((route) => {
    const time = simulationTime(route);
    return <div className="comparison-route" key={route.vehicle}><strong>{route.vehicle}</strong>{route.items.length ? <><p>{route.items.map((item) => item.customer || "거래처 미확인").filter((name, index, all) => all.indexOf(name) === index).join(" → ")}</p><p>확인된 별도 적재 {route.pallets} / {route.maxPallet ?? (route.vehicle === "스타리아" ? 1 : 8)} PLT · 미확인 {route.unknownPallets}품목 · 중량 {route.weight.toLocaleString("ko-KR")}kg</p><p>총 {minutes(time.total)} · 운전 {minutes(time.driving)} · 점심 {time.lunch}분 · 하차 {time.unloading}분</p><details><summary>납품 주소·구간 보기</summary><ul>{route.items.filter((item, index, all) => all.findIndex((other) => other.customer === item.customer && other.address === item.address) === index).map((item) => <li key={item.rowNumber}>{item.customer} · {item.address || "주소 미확인"} {item.addressIssue ? `· ${item.addressIssue}` : ""}</li>)}</ul>{route.legs?.length ? <ol>{route.legs.map((leg, index) => <li key={index}>{leg.from} → {leg.to} · {leg.distanceKm == null ? "거리 미확인" : `${leg.distanceKm}km`} · {minutes(leg.minutes)}</li>)}</ol> : null}</details><details><summary>적재 품목 보기 ({route.items.length}품목)</summary><ul>{route.items.map((item) => <li key={item.rowNumber}>{item.rowNumber}행 · {item.customer} · {item.product} · {item.boxes == null ? "박스 미확인" : `${item.boxes}박스`} · {item.pallets == null ? "PLT 미확인" : `${item.pallets} PLT`}</li>)}</ul></details></> : <p>운행 품목 없음</p>}</div>;
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
  return <div className="simulation-run-info"><h3>{s.date} 분석 상세</h3><p>저장 {stamp(record.savedAt)} · 파일 {s.fileName} · 경유 {s.dieselPrice || "미입력"}원/L · 검토 {s.review}</p><p>AI 출처: {s.result.planSource || "미확인"} · 생성 {s.result.savedAt ? stamp(s.result.savedAt) : "미확인"} · 경로 조회 {s.result.routeUpdatedAt ? stamp(s.result.routeUpdatedAt) : "미확인"}</p><p>용차 배정: <strong>{m.aiAdjusted ? "담당자 조정안" : "AI 원안"}</strong></p><p>검토 메모: {s.memo || "없음"}</p><p>현장 검토: {(s.fieldReview ?? defaultFieldReview).status} · 사유: {(s.fieldReview ?? defaultFieldReview).reason || "없음"}</p><p>작업 시간 (담당자 입력): 사람 {minutes((s.workReview ?? defaultWorkReview).humanMinutes)} · AI 생성 대기 {minutes((s.workReview ?? defaultWorkReview).aiGenerationMinutes)} · AI 검토·수정 {minutes((s.workReview ?? defaultWorkReview).aiReviewMinutes)}</p><p>AI안 수정 정도: {(s.workReview ?? defaultWorkReview).changeLevel} · 수정 항목: {(s.workReview ?? defaultWorkReview).changes.join(", ") || "없음 또는 미입력"} · 메모: {(s.workReview ?? defaultWorkReview).note || "없음"}</p><p>조건 식별번호 {s.result.inputFingerprint || "미확인"} · 비교 결과 {m.comparable ? "조건 확인됨" : "확인 필요"} · 택배비 {m.courierIncluded ? "포함" : "양쪽 제외"}</p>
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
  const [reportRevision, setReportRevision] = useState(0);
  const [detail, setDetail] = useState<SimulationHistoryRecord | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [fieldEdit, setFieldEdit] = useState<{ id: string; review: FieldReview } | null>(null);
  const [workEdit, setWorkEdit] = useState<{ id: string; review: WorkReview } | null>(null);
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
  async function saveFieldReview() {
    if (!fieldEdit) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/simulation/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "field-review", id: fieldEdit.id, fieldReview: fieldEdit.review }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "현장 검토를 저장하지 못했습니다.");
      setListing((current) => current ? { ...current, records: current.records.map((record) => record.id === fieldEdit.id ? { ...record, fieldReview: data.fieldReview } : record) } : current);
      setDetail((current) => current?.id === fieldEdit.id ? { ...current, snapshot: { ...current.snapshot, fieldReview: data.fieldReview } } : current);
      setFieldEdit(null);
      setReportRevision((current) => current + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "현장 검토를 저장하지 못했습니다."); } finally { setBusy(false); }
  }
  async function saveWorkReview() {
    if (!workEdit) return;
    if (!validWorkReview(workEdit.review)) { setError("작업 시간은 0~10080 사이의 정수로 입력하고, '수정 없음'일 때는 수정 항목 선택을 해제하세요."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/simulation/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "work-review", id: workEdit.id, workReview: workEdit.review }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "작업 기록을 저장하지 못했습니다.");
      setListing((current) => current ? { ...current, records: current.records.map((record) => record.id === workEdit.id ? { ...record, workReview: data.workReview } : record) } : current);
      setDetail((current) => current?.id === workEdit.id ? { ...current, snapshot: { ...current.snapshot, workReview: data.workReview } } : current);
      setWorkEdit(null);
      setReportRevision((current) => current + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "작업 기록을 저장하지 못했습니다."); } finally { setBusy(false); }
  }
  async function removeRecords(all: boolean) {
    if (!all && deleteIds.length === 0) return;
    const message = all ? "공유된 분석 기록 전체를 삭제할까요? 아직 불러오지 않은 이전 기록도 모두 삭제되며 복구할 수 없습니다." : `선택한 공유 분석 기록 ${deleteIds.length}건을 삭제할까요? 삭제한 기록은 복구할 수 없습니다.`;
    if (!window.confirm(message)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/simulation/history", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(all ? { all: true } : { ids: deleteIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "분석 기록을 삭제하지 못했습니다.");
      setListing((current) => current ? all ? { records: [], selected: {}, nextCursor: null } : { ...current, records: current.records.filter((record) => !deleteIds.includes(record.id)), selected: Object.fromEntries(Object.entries(current.selected).filter(([, id]) => !deleteIds.includes(id))) } : current);
      setDeleteIds([]); setDetail(null); setFieldEdit(null); setWorkEdit(null);
      setReportRevision((current) => current + 1);
      const refreshed = await fetch("/api/simulation/history", { cache: "no-store" });
      const next = await refreshed.json();
      if (!refreshed.ok) throw new Error(next.error || "기록을 다시 불러오지 못했습니다.");
      setListing(next);
    } catch (err) { setError(err instanceof Error ? err.message : "분석 기록을 삭제하지 못했습니다."); } finally { setBusy(false); }
  }
  const selected = listing?.records.filter((record) => listing.selected[record.date] === record.id) ?? [];
  const distribution = comparisonDistribution(selected);
  const workSummary = summarizeWorkReviews(selected);
  const changeCount = (level: WorkReview["changeLevel"]) => workSummary.changes[level];
  const verified = selected.filter((record) => record.review === "검토 완료" && record.metrics.comparable && !record.metrics.aiAdjusted);
  const original = verified.reduce((sum, record) => sum + (record.metrics.originalCost ?? 0), 0);
  const proposed = verified.reduce((sum, record) => sum + (record.metrics.proposedCost ?? 0), 0);
  const maximum = Math.max(1, ...selected.flatMap((record) => [record.metrics.originalCost ?? 0, record.metrics.proposedCost ?? 0]));
  return <div className="dispatch-page"><section className="comparison-section"><h1>AI 배차 분석 기록</h1><p>날짜마다 비교에 사용할 기록을 하나씩 선택하세요. 저장한 결과는 실제 운행 실적이 아닌 시뮬레이션입니다.</p><p><Link className="dispatch-secondary-button" href="/simulation">시뮬레이션으로</Link></p>
    <SimulationPeriodReport revision={reportRevision} />
    {error ? <p className="dispatch-route-note-warn" role="alert">{error}</p> : null}
    {!listing && !error ? <p>분석 기록을 불러오는 중입니다.</p> : null}
    {listing?.nextCursor ? <p className="dispatch-route-note-warn">이전 기록이 더 있습니다. 전체 기록을 불러올 때까지 총합은 표시하지 않습니다.</p> : null}
    {listing ? <><div className="simulation-run-info"><strong>비교 요약</strong><p>불러온 기록에서 선택 {selected.length}일 · 합계 포함 {verified.length}일 · 합계 제외 {selected.length - verified.length}일</p>{listing.nextCursor ? null : <p>기존안 합계 <strong>{won(original)}</strong> · AI 원안 합계 <strong>{won(proposed)}</strong> · {verified.length ? original === proposed ? "차이 없음" : `${won(Math.abs(original - proposed))} ${original > proposed ? "절감 예상" : "증가 예상"}` : "합산할 검토 완료 기록 없음"}</p>}<p className="comparison-note">검토 완료이면서 택배·경로·적재 등 비교 조건이 확인된 AI 원안만 합산합니다. 담당자가 용차 배정을 조정한 안은 개별 그래프에서만 확인합니다. 같은 날짜는 선택한 한 건만 포함합니다.</p></div>
      <div className="simulation-run-info" aria-label="비용 결과 분포"><strong>선택한 날짜의 비용 결과</strong><p>AI 비용 감소 <strong>{distribution.decrease}일</strong> · 동일 <strong>{distribution.equal}일</strong> · 증가 <strong>{distribution.increase}일</strong> · 집계 제외 <strong>{distribution.excluded}일</strong></p><p className="comparison-note">{listing.nextCursor ? "현재 불러온 기록에서 선택한 날짜 기준입니다. " : ""}검토 완료이고 비교 조건이 확인된 AI 원안만 집계합니다. 담당자 조정안과 확인이 필요한 기록은 제외합니다. 현장 운행 가능 여부는 별도 검토 결과입니다.</p></div><div className="simulation-run-info" aria-label="배차 작업 비교"><strong>배차 작업 시간과 AI안 수정</strong><p>선택한 {selected.length}일 중 양쪽 시간이 모두 기록된 날짜 {workSummary.pairedCount}일{workSummary.pairedCount ? <> · 사람 합계 <strong>{minutes(workSummary.humanMinutes)}</strong> · AI 생성 대기 + 검토·수정 합계 <strong>{minutes(workSummary.aiMinutes)}</strong></> : null}</p><p>수정 없음 {changeCount("수정 없음")}일 · 일부 수정 {changeCount("일부 수정")}일 · 대부분 수정 {changeCount("대부분 수정")}일 · 전면 재작성 {changeCount("전면 재작성")}일 · 미확인 {changeCount("미확인")}일</p><p className="comparison-note">담당자가 직접 입력한 참고 기록입니다. 사람 배차와 AI 검토의 업무 범위를 맞춰 기록하세요. {listing.nextCursor ? "현재 불러온 기록 기준입니다. " : ""}운행 시간과는 별도입니다.</p></div><h2>날짜별 비용 비교</h2>{selected.length ? selected.map((record) => <div className="simulation-chart" key={record.id}><div className="simulation-chart-heading"><strong>{record.date} · {record.review}</strong><span>{record.metrics.comparable ? "비교 조건 확인" : "확인 필요"}</span></div>{record.metrics.aiAdjusted ? <p className="dispatch-route-note-warn">담당자가 용차를 조정한 안 · AI 원안 합계에서 제외</p> : null}{record.metrics.warnings.map((warning) => <p className="dispatch-route-note-warn" key={warning}>{warning}</p>)}{!record.metrics.courierIncluded ? <p className="dispatch-route-note-warn">양쪽 택배비 제외</p> : null}{([['기존 계획', record.metrics.originalCost], ['AI 제안', record.metrics.proposedCost]] as const).map(([label, value]) => <div className="simulation-chart-row" key={label}><span>{label}</span><div className="simulation-chart-track" aria-hidden="true"><div className={`simulation-chart-bar ${label === "AI 제안" ? "simulation-chart-bar-ai" : ""}`} style={{ width: `${value == null ? 0 : value / maximum * 100}%` }} /></div><strong>{won(value)}</strong></div>)}<p className="comparison-note">자사 소요: 기존 {minutes(record.metrics.originalMinutes)} · AI {minutes(record.metrics.proposedMinutes)} / 용차: 기존 {record.metrics.originalCharters}회 · AI {record.metrics.proposedCharters}회</p></div>) : <p>아래 목록에서 날짜별 기록을 선택하면 그래프가 표시됩니다.</p>}
      <h2>저장된 기록</h2><div className="comparison-controls"><button type="button" className="dispatch-secondary-button" disabled={busy || deleteIds.length === 0} onClick={() => void removeRecords(false)}>선택 삭제 ({deleteIds.length})</button><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => void removeRecords(true)}>전체 삭제</button></div><p className="comparison-note">삭제할 기록을 체크하세요. 비교 기록 선택과는 별도입니다.</p>{listing.records.length ? listing.records.map((record) => { const isSelected = listing.selected[record.date] === record.id; return <div className="simulation-run-info" key={record.id}><label><input type="checkbox" disabled={busy} checked={deleteIds.includes(record.id)} onChange={(event) => { const checked = event.target.checked; setDeleteIds((current) => checked ? [...current, record.id] : current.filter((id) => id !== record.id)); }} /> 삭제 선택</label> <strong>{record.date} · {record.review} · {record.metrics.aiAdjusted ? "담당자 조정안" : "AI 원안"}{isSelected ? " · 비교 선택" : ""}</strong><p>저장 {stamp(record.savedAt)} · {record.fileName} · {record.planSource}</p><p>작업 시간: 사람 {minutes((record.workReview ?? defaultWorkReview).humanMinutes)} · AI 생성 대기 {minutes((record.workReview ?? defaultWorkReview).aiGenerationMinutes)} + 검토·수정 {minutes((record.workReview ?? defaultWorkReview).aiReviewMinutes)} · AI안 {(record.workReview ?? defaultWorkReview).changeLevel}</p><p>현장 검토: <strong>{(record.fieldReview ?? defaultFieldReview).status}</strong>{(record.fieldReview ?? defaultFieldReview).reason ? ` · ${(record.fieldReview ?? defaultFieldReview).reason}` : ""}</p><p>기존 {won(record.metrics.originalCost)} · AI {won(record.metrics.proposedCost)}{record.metrics.courierIncluded ? "" : " · 택배비 제외"}</p>{record.metrics.warnings.length ? <p className="dispatch-route-note-warn">{record.metrics.warnings.join(" / ")}</p> : null}<div className="comparison-controls"><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => void open(record)}>상세 보기</button><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => setWorkEdit((current) => current?.id === record.id ? null : { id: record.id, review: { ...(record.workReview ?? defaultWorkReview), changes: [...(record.workReview ?? defaultWorkReview).changes] } })}>작업 시간·수정 {workEdit?.id === record.id ? "닫기" : "기록"}</button><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => setFieldEdit((current) => current?.id === record.id ? null : { id: record.id, review: { ...(record.fieldReview ?? defaultFieldReview) } })}>현장 검토 {fieldEdit?.id === record.id ? "닫기" : "수정"}</button><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => void select(record, isSelected)}>{isSelected ? "비교 선택 해제" : "이 날짜의 비교 기록으로 선택"}</button></div>{workEdit?.id === record.id ? <WorkReviewEditor value={workEdit.review} busy={busy} onChange={(review) => setWorkEdit({ id: record.id, review })} onSave={() => void saveWorkReview()} /> : null}{fieldEdit?.id === record.id ? <div className="simulation-run-info"><p className="comparison-note">AI 제안의 실제 운행 가능 여부를 기록합니다. 비용 집계용 검토 상태와 별도입니다.</p><div className="comparison-controls"><label>현장 검토 <select value={fieldEdit.review.status} disabled={busy} onChange={(event) => { const status = event.target.value as FieldReview["status"]; setFieldEdit((current) => current ? { ...current, review: { ...current.review, status } } : current); }}>{fieldReviewStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>사유 <input type="text" maxLength={2000} disabled={busy} value={fieldEdit.review.reason} onChange={(event) => { const reason = event.target.value; setFieldEdit((current) => current ? { ...current, review: { ...current.review, reason } } : current); }} placeholder="예: 거래처 하차 시간 확인 필요" /></label><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => void saveFieldReview()}>현장 검토 저장</button></div></div> : null}</div>; }) : <p>아직 저장된 분석 기록이 없습니다. 시뮬레이션에서 검토 후 분석 결과를 저장하세요.</p>}
      {listing.nextCursor ? <p><button type="button" className="dispatch-secondary-button" disabled={busy} onClick={() => void loadMore()}>이전 기록 더 보기</button></p> : null}{detail ? <Detail record={detail} /> : null}</> : null}
  </section></div>;
}
