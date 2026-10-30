"use client";
import { useEffect, useState } from "react";
import type { SimulationResult, SimulationRoute } from "@/lib/simulation";

const money = (n: number | null) => n == null ? "확인 필요" : `${Math.round(n).toLocaleString("ko-KR")}원`;
function Plan({ title, routes }: { title: string; routes: SimulationRoute[] }) {
  return <div className="comparison-plan"><h3>{title}</h3>{routes.length ? routes.map((r) => <div className="comparison-route" key={r.vehicle}><strong>{r.vehicle}</strong>
    {!r.items.length ? <p>운행 품목 없음</p> : <><p>{r.items.map((i) => i.customer).filter((name, index, list) => list.indexOf(name) === index).join(" → ")}</p>
      <p>알려진 적재량 {r.pallets} / 8 PLT · {r.weight.toLocaleString()} / {r.vehicle === "1호차" ? "4,000" : "3,500"}kg</p>
      {r.unknownPallets || r.unknownWeight ? <p className="dispatch-route-note-warn">적재 정보 미확인: PLT {r.unknownPallets}품목, 중량 {r.unknownWeight}품목</p> : null}
      {r.over ? <p className="dispatch-route-note-warn">알려진 적재량이 한도를 초과합니다.</p> : null}
      <p>왕복 {r.distance == null ? "거리 확인 필요" : `${r.distance}km`} · {r.minutes == null ? "시간 확인 필요" : `${r.minutes}분`} · 통행료 {money(r.toll)} · 경유비 {money(r.fuel)}</p>
      <details><summary>품목 보기 ({r.items.length}품목)</summary><ul>{r.items.map((i) => <li key={i.rowNumber}>{i.customer} · {i.product} · {i.transport || "방식 미확인"} {i.vehicle ? "" : "→ 자사 차량"}</li>)}</ul></details></>}
  </div>) : <p>AI 제안이 없습니다.</p>}</div>;
}
export function DeliveryComparison() {
  const [date, setDate] = useState("2026-10-14"); const [file, setFile] = useState<File | null>(null);
  const [price, setPrice] = useState(""); const [priceSource, setPriceSource] = useState("경유 가격을 입력해 주세요.");
  const [result, setResult] = useState<SimulationResult | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => { const controller = new AbortController(); fetch("/api/diesel-price", { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ price: number; date: string }>; }).then((d) => { setPrice((current) => current || String(d.price)); setPriceSource(`오피넷 전국 평균 ${d.date} 기준 · 수정 가능`); }).catch(() => { if (!controller.signal.aborted) setPriceSource("오피넷 조회 실패 · 경유 가격을 직접 입력해 주세요."); }); return () => controller.abort(); }, []);
  async function run() {
    if (!file) { setError("납품 일정표 엑셀을 선택해 주세요."); return; }
    setLoading(true); setError(""); setResult(null); const form = new FormData(); form.set("file", file); form.set("date", date); form.set("price", price);
    try { const response = await fetch("/api/route/compare", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "시뮬레이션에 실패했습니다."); setResult(data as SimulationResult); }
    catch (err) { setError(err instanceof Error ? err.message : "시뮬레이션에 실패했습니다."); } finally { setLoading(false); }
  }
  const moved = result?.proposed.flatMap((route) => route.items.filter((item) => !item.vehicle).map((item) => ({ ...item, target: route.vehicle }))) ?? [];
  const complete = !!result && result.proposed.length === 2 && !result.warnings.length && [...result.original, ...result.proposed].every((route) => !route.items.length || route.minutes != null);
  const total = (routes: SimulationRoute[]) => routes.reduce((n, r) => n + (r.minutes ?? 0), 0);
  const cost = (routes: SimulationRoute[]) => routes.some((r) => r.items.length && (r.fuel == null || r.toll == null)) ? null : routes.reduce((n, r) => n + (r.fuel ?? 0) + (r.toll ?? 0), 0);
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
      <div className="comparison-plans"><Plan title="기존 자사 차량 계획" routes={result.original} /><Plan title="AI 시뮬레이션" routes={result.proposed} /></div>
      {complete ? <p><strong>자사 차량 운행 합계:</strong> 기존 {total(result.original)}분 / {money(cost(result.original))} · 제안 {total(result.proposed)}분 / {money(cost(result.proposed))} (경유비 + 통행료)</p> : <p className="comparison-note">누락된 자사 납품이나 경로가 있으면 전체 자사 차량 운행 합계는 비교하지 않습니다.</p>}
      <h3>용차·택배에서 자사 차량으로 제안한 품목 ({moved.length})</h3>{moved.length ? <ul>{moved.map((i) => <li key={i.rowNumber}>{i.rowNumber}행 · {i.customer} · {i.product} · {i.transport} → {i.target}</li>)}</ul> : <p>제안된 이동 품목이 없습니다. 주소와 AI 응답 상태를 확인하세요.</p>}
      <h3>외부 운송으로 남은 품목 ({result.remaining.length})</h3><details><summary>품목 보기</summary><ul>{result.remaining.map((i) => <li key={i.rowNumber}>{i.rowNumber}행 · {i.customer || "업체 미확인"} · {i.product} · {i.transport || "운송 방식 미확인"}{i.lat == null ? " · 주소 미확인" : ""}</li>)}</ul></details>
      <p className="comparison-note">용차 예시 운임은 1회 200,000원입니다. 품목이 이동해도 기존 용차 한 대를 없앨 수 있는지 확인되지 않아 절감액에는 반영하지 않습니다. 택배비와 배송시간은 미확인입니다. 따라서 전체 비용·시간의 우열을 확정할 수 없습니다. <a href="https://kdexp.com/service/charge/package_standard.do" target="_blank" rel="noreferrer">경동택배 표준운임 기준</a></p>
      <p className="comparison-note">경로 시간·통행료는 조회 시점 기준이며 과거 운행 실적이 아닙니다. 운행 시간은 하차·대기 시간을 제외합니다. AI 제안은 최적해를 보장하지 않습니다.</p></> : null}
  </section>;
}
