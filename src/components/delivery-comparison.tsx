"use client";
import { useEffect, useState } from "react";
import type { SimulationItem, SimulationResult, SimulationRoute } from "@/lib/simulation";
import { estimateCharterTrips, estimateSimulationCost } from "@/lib/simulation-cost";

const money = (n: number | null) => n == null ? "확인 필요" : `${Math.round(n).toLocaleString("ko-KR")}원`;
function ExternalDeliveries({ items }: { items: SimulationItem[] }) {
  const groups = [
    { label: "용차", items: items.filter((item) => /용차/.test(item.transport)) },
    { label: "택배", items: items.filter((item) => !/용차/.test(item.transport) && /택배|경동/.test(item.transport)) },
    { label: "기타·운송 방식 미확인", items: items.filter((item) => !/용차|택배|경동/.test(item.transport)) },
  ];
  return <div className="comparison-route"><strong>외부 운송</strong>{groups.map((group) => <div key={group.label}>
    <p><strong>{group.label} · {group.items.length}품목</strong>{group.items.length ? ` — ${[...new Set(group.items.map((item) => item.customer || "업체 미확인"))].join(", ")}` : ""}</p>
    {group.items.length ? <details><summary>{group.label} 품목 보기</summary><ul>{group.items.map((item) => <li key={item.rowNumber}>{item.rowNumber}행 · {item.customer || "업체 미확인"} · {item.product}{item.lat == null ? " · 주소 미확인" : ""}</li>)}</ul></details> : null}
  </div>)}</div>;
}
function Plan({ title, routes, external }: { title: string; routes: SimulationRoute[]; external?: SimulationItem[] }) {
  return <div className="comparison-plan"><h3>{title}</h3>{routes.length ? routes.map((r) => <div className="comparison-route" key={r.vehicle}><strong>{r.vehicle}</strong>
    {!r.items.length ? <p>운행 품목 없음</p> : <><p>{r.items.map((i) => i.customer).filter((name, index, list) => list.indexOf(name) === index).join(" → ")}</p>
      <p>알려진 적재량 {r.pallets} / 8 PLT · {r.weight.toLocaleString()} / {r.vehicle === "1호차" ? "4,000" : "3,500"}kg</p>
      {r.unknownPallets || r.unknownWeight ? <p className="dispatch-route-note-warn">적재 정보 미확인: PLT {r.unknownPallets}품목, 중량 {r.unknownWeight}품목</p> : null}
      {r.over ? <p className="dispatch-route-note-warn">알려진 적재량이 한도를 초과합니다.</p> : null}
      <p>왕복 {r.distance == null ? "거리 확인 필요" : `${r.distance}km`} · {r.minutes == null ? "시간 확인 필요" : `${r.minutes}분`} · 통행료 {money(r.toll)} · 경유비 {money(r.fuel)}</p>
      <details><summary>품목 보기 ({r.items.length}품목)</summary><ul>{r.items.map((i) => <li key={i.rowNumber}>{i.customer} · {i.product} · {i.transport || "방식 미확인"} {i.vehicle ? "" : "→ 자사 차량"}</li>)}</ul></details></>}
  </div>) : <p>AI 제안이 없습니다.</p>}{external ? <ExternalDeliveries items={external} /> : null}</div>;
}
export function DeliveryComparison() {
  const [date, setDate] = useState("2026-10-14"); const [file, setFile] = useState<File | null>(null);
  const [price, setPrice] = useState(""); const [priceSource, setPriceSource] = useState("경유 가격을 입력해 주세요.");
  const [result, setResult] = useState<SimulationResult | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [originalTrips, setOriginalTrips] = useState(""); const [proposedTrips, setProposedTrips] = useState("");
  useEffect(() => { const controller = new AbortController(); fetch("/api/diesel-price", { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ price: number; date: string }>; }).then((d) => { setPrice((current) => current || String(d.price)); setPriceSource(`오피넷 전국 평균 ${d.date} 기준 · 수정 가능`); }).catch(() => { if (!controller.signal.aborted) setPriceSource("오피넷 조회 실패 · 경유 가격을 직접 입력해 주세요."); }); return () => controller.abort(); }, []);
  async function run() {
    if (!file) { setError("납품 일정표 엑셀을 선택해 주세요."); return; }
    setLoading(true); setError(""); setResult(null); setOriginalTrips(""); setProposedTrips(""); const form = new FormData(); form.set("file", file); form.set("date", date); form.set("price", price);
    try { const response = await fetch("/api/route/compare", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "시뮬레이션에 실패했습니다."); const next = data as SimulationResult; setOriginalTrips(String(estimateCharterTrips(next.items))); setProposedTrips(String(estimateCharterTrips(next.remaining))); setResult(next); }
    catch (err) { setError(err instanceof Error ? err.message : "시뮬레이션에 실패했습니다."); } finally { setLoading(false); }
  }
  const moved = result?.proposed.flatMap((route) => route.items.filter((item) => !item.vehicle).map((item) => ({ ...item, target: route.vehicle }))) ?? [];
  const complete = !!result && result.proposed.length === 2 && !result.warnings.length && [...result.original, ...result.proposed].every((route) => !route.items.length || route.minutes != null);
  const total = (routes: SimulationRoute[]) => routes.reduce((n, r) => n + (r.minutes ?? 0), 0);
  const cost = (routes: SimulationRoute[]) => routes.some((r) => r.items.length && (r.fuel == null || r.toll == null)) ? null : routes.reduce((n, r) => n + (r.fuel ?? 0) + (r.toll ?? 0), 0);
  const originalHasCharter = !!result?.items.some((item) => !item.vehicle && /용차/.test(item.transport));
  const proposedHasCharter = !!result?.remaining.some((item) => /용차/.test(item.transport));
  const comparison = result && complete ? estimateSimulationCost({ originalVehicle: cost(result.original), proposedVehicle: cost(result.proposed), originalTrips, proposedTrips, originalHasCharter, proposedHasCharter }) : null;
  return <section className="comparison-section" aria-labelledby="simulation-title"><h2 id="simulation-title">AI 배차 시뮬레이션</h2>
    <p>용차·택배 물량을 자사 차량에 함께 실을 수 있는지 검토합니다. 결과는 실제 일정에 반영되지 않습니다.</p>
    <div className="comparison-controls"><label>일정표 파일 <input type="file" accept=".xlsx" disabled={loading} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} /></label>
      <label>납품일 <select value={date} disabled={loading} onChange={(e) => { setDate(e.target.value); setResult(null); }}><option value="2026-10-14">2026-10-14</option><option value="2026-10-15">2026-10-15</option></select></label>
      <label>경유 가격 (원/L) <input type="number" min="1" value={price} disabled={loading} onChange={(e) => { setPrice(e.target.value); setResult(null); }} placeholder="직접 입력" /></label>
      <button type="button" className="dispatch-secondary-button" disabled={loading} onClick={() => void run()}>{loading ? "시뮬레이션 중…" : "시뮬레이션 실행"}</button></div>
    <p className="comparison-note">{priceSource} · 사람 계획은 엑셀 행 순서 · 자사 차량 왕복, 임시 연비 7.1km/L</p>
    <p className="comparison-note">AI는 자사 차량 사이 및 용차·택배에서 자사 차량으로 재배정할 수 있습니다. 적재량은 품목 기준표와 박스 수를 이용한 추정치입니다. 납품 기한·긴급 여부·택배 마감·하차 시간은 확인되지 않아 제안의 실행 가능성을 확정할 수 없습니다.</p>
    {error ? <p className="dispatch-route-note-warn">{error}</p> : null}
    {result ? <><p>{result.items.length}품목 · {result.note}</p>{result.warnings.map((w) => <p className="dispatch-route-note-warn" key={w}>{w}</p>)}
      <div className="comparison-result" aria-label="예상 비용 비교">
        <h3>예상 비용 비교</h3>
        {comparison ? <><div className="comparison-result-totals"><p>기존 계획 <strong>{money(comparison.original)}</strong></p><p>AI 제안 <strong>{money(comparison.proposed)}</strong></p><p>차이 <strong>{comparison.saving > 0 ? `${money(comparison.saving)} 절감 예상` : comparison.saving < 0 ? `${money(-comparison.saving)} 증가 예상` : "차이 없음"}</strong></p></div>
          <p>자사 차량 경유비·통행료 + 용차비 기준 · 기존 {originalTrips}회 / AI {proposedTrips}회 × 200,000원</p></> : <p className="dispatch-route-note-warn">주소·경로·운행 횟수 또는 비용이 미확인이라 비교 금액을 계산할 수 없습니다.</p>}
        <p className="comparison-note">용차 횟수는 거래처·지역별 1회로 가정한 예시이며 실제 운행 횟수와 다를 수 있습니다. 택배비와 인건비는 제외되어 전체 실제 비용이 아닙니다.</p>
        <div className="comparison-controls"><label>기존 용차 운행 횟수 <input type="number" min="0" step="1" value={originalTrips} onChange={(e) => setOriginalTrips(e.target.value)} /></label>
          <label>AI 제안 용차 운행 횟수 <input type="number" min="0" step="1" value={proposedTrips} onChange={(e) => setProposedTrips(e.target.value)} /></label></div>
        <p className="comparison-note">확인된 횟수로 수정할 수 있습니다. 용차가 남은 계획은 1회 이상, 없는 계획은 0회를 입력하세요.</p>
      </div>
      <div className="comparison-plans"><Plan title="기존 배차 계획" routes={result.original} external={result.items.filter((item) => !item.vehicle)} /><Plan title="AI 시뮬레이션" routes={result.proposed} external={result.proposed.length ? result.remaining : undefined} /></div>
      {complete ? <p><strong>자사 차량 운행 합계:</strong> 기존 {total(result.original)}분 / {money(cost(result.original))} · 제안 {total(result.proposed)}분 / {money(cost(result.proposed))} (경유비 + 통행료) · {total(result.proposed) === total(result.original) ? "시간 차이 없음" : `제안 ${Math.abs(total(result.proposed) - total(result.original))}분 ${total(result.proposed) > total(result.original) ? "증가" : "감소"}`}</p> : <p className="comparison-note">누락된 자사 납품이나 경로가 있으면 전체 자사 차량 운행 합계는 비교하지 않습니다.</p>}
      <h3>용차·택배에서 자사 차량으로 제안한 품목 ({moved.length})</h3>{moved.length ? <ul>{moved.map((i) => <li key={i.rowNumber}>{i.rowNumber}행 · {i.customer} · {i.product} · {i.transport} → {i.target}</li>)}</ul> : <p>제안된 이동 품목이 없습니다. 주소와 AI 응답 상태를 확인하세요.</p>}
      <p className="comparison-note">위 비용은 입력한 용차 운행 횟수에 따른 가정입니다. 택배비·기사 인건비 등은 포함하지 않습니다. 특히 택배 품목이 자사 차량으로 이동한 경우 택배비 절감은 반영되지 않아 전체 비용의 우열을 확정할 수 없습니다. <a href="https://kdexp.com/service/charge/package_standard.do" target="_blank" rel="noreferrer">경동택배 표준운임 기준</a></p>
      <p className="comparison-note">경로 시간·통행료는 조회 시점 기준이며 과거 운행 실적이 아닙니다. 운행 시간은 하차·대기 시간을 제외합니다. AI 제안은 최적해를 보장하지 않습니다.</p></> : null}
  </section>;
}
