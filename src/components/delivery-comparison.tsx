"use client";

import { useEffect, useState } from "react";
import type { ComparisonResult, ComparisonRoute } from "@/lib/comparison-types";

const won = (value: number | null) => value == null ? "확인 필요" : `${Math.round(value).toLocaleString("ko-KR")}원`;

function Routes({ title, routes }: { title: string; routes: ComparisonRoute[] }) {
  return <div className="comparison-plan"><h3>{title}</h3>{routes.length ? routes.map((route) => <div key={route.vehicle} className="comparison-route">
    <strong>{route.vehicle}</strong><p>{route.stops.join(" → ")}</p><p>{route.distance}km · {route.minutes}분 · 통행료 {won(route.toll)} · 경유비 {won(route.fuel)}</p>
  </div>) : <p>계산된 자사 차량 경로가 없습니다.</p>}</div>;
}

export function DeliveryComparison() {
  const [date, setDate] = useState("2026-10-14");
  const [file, setFile] = useState<File | null>(null);
  const [price, setPrice] = useState("");
  const [charterTrips, setCharterTrips] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [priceSource, setPriceSource] = useState("경유 가격을 입력해 주세요.");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/diesel-price", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<{ price: number; date: string }>;
    }).then((data) => {
      setPrice((current) => current || String(data.price));
      setPriceSource(`오피넷 전국 평균 ${data.date} 기준 · 수정 가능`);
    }).catch(() => { if (!controller.signal.aborted) setPriceSource("오피넷 조회 실패 · 경유 가격을 직접 입력해 주세요."); });
    return () => controller.abort();
  }, []);
  async function compare() {
    if (!file) { setError("납품 일정표 엑셀을 선택해 주세요."); return; }
    setLoading(true); setError(""); setResult(null);
    const form = new FormData(); form.set("file", file); form.set("date", date); form.set("price", price);
    try {
      const response = await fetch("/api/route/compare", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "비교에 실패했습니다.");
      setResult(data as ComparisonResult);
    } catch (err) { setError(err instanceof Error ? err.message : "비교에 실패했습니다."); }
    finally { setLoading(false); }
  }
  const outsourced = result?.rows.filter((row) => !/[12]호\s*차량/.test(row.transport)) ?? [];
  const charter = outsourced.filter((row) => /용차/.test(row.transport));
  const courier = outsourced.filter((row) => /택배|경동/.test(row.transport));
  const bothComplete = !!result && !result.warnings.length && result.human.length > 0 && result.human.length === result.ai.length && result.human.every((route) => result.ai.some((ai) => ai.vehicle === route.vehicle));
  const sum = (routes: ComparisonRoute[], field: "minutes" | "distance") => routes.reduce((total, route) => total + route[field], 0);
  const cost = (routes: ComparisonRoute[]) => routes.every((route) => route.toll != null && route.fuel != null) ? routes.reduce((total, route) => total + route.toll! + route.fuel!, 0) : null;
  const difference = (human: number, ai: number, unit: string) => human === ai ? "차이 없음" : `AI ${Math.abs(human - ai).toLocaleString("ko-KR")}${unit} ${ai < human ? "적음" : "많음"}`;
  const validTrips = /^\d+$/.test(charterTrips) && Number(charterTrips) > 0;
  return <section className="comparison-section" aria-labelledby="comparison-title">
    <h2 id="comparison-title">납품 예상 일정 비교</h2>
    <p>엑셀에 적힌 계획과 AI 방문 순서를 같은 왕복 조건으로 비교합니다. 비교 결과는 배차 일정에 반영되지 않습니다.</p>
    <div className="comparison-controls">
      <label>일정표 파일 <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} /></label>
      <label>납품일 <select value={date} onChange={(e) => { setDate(e.target.value); setResult(null); }}><option value="2026-10-14">2026-10-14</option><option value="2026-10-15">2026-10-15</option></select></label>
      <label>경유 가격 (원/L) <input type="number" min="1" value={price} onChange={(e) => { setPrice(e.target.value); setResult(null); }} placeholder="입력 시 경유비 계산" /></label>
      <button type="button" className="dispatch-secondary-button" disabled={loading} onClick={() => void compare()}>{loading ? "비교 중…" : "일정 비교하기"}</button>
    </div>
    <p className="comparison-note">{priceSource}</p>
    <p className="comparison-note">사람 계획은 엑셀 행 순서입니다. AI는 1·2호차의 기존 배정을 유지하고 방문 순서를 제안합니다. 적재 중량·납품 시간 제약이 없어 차량 간 재배정은 하지 않습니다.</p>
    <p className="comparison-note">카카오 결과는 조회 시점의 교통 기준이며 당시 실제 교통·운행 실적이 아닙니다. 자사 차량 연비는 7.1km/L 임시 추정치입니다. 시간은 차량별 운행 시간의 합계이며 하차·대기 시간은 제외됩니다.</p>
    {error ? <p className="dispatch-route-note-warn">{error}</p> : null}
    {result ? <>
      <p>{result.rows.length}품목 · {result.aiNote}</p>
      {result.warnings.map((warning) => <p className="dispatch-route-note-warn" key={warning}>{warning}</p>)}
      <div className="comparison-plans"><Routes title="사람 계획" routes={result.human} /><Routes title="AI 제안" routes={result.ai} /></div>
      {bothComplete ? <><p><strong>자사 차량 비교:</strong> 사람 {sum(result.human, "minutes")}분 / {won(cost(result.human))} · AI {sum(result.ai, "minutes")}분 / {won(cost(result.ai))}</p>
        <p>시간: {difference(sum(result.human, "minutes"), sum(result.ai, "minutes"), "분")} · 비용: {cost(result.human) != null && cost(result.ai) != null ? difference(cost(result.human)!, cost(result.ai)!, "원") : "확인 필요"}</p></> : <p className="dispatch-route-note-warn">누락된 차량이나 주소가 있어 전체 자사 차량 비교를 확정할 수 없습니다.</p>}
      <h3>용차 · 택배 등 나머지 내역</h3>
      <p>용차 {charter.length}품목 · 택배 {courier.length}품목 · 기타 {outsourced.length - charter.length - courier.length}품목. 운송 방식은 두 계획에서 동일하게 유지합니다.</p>
      {charter.length ? <label>용차 운행 횟수 (확인 후 입력) <input type="number" min="0" step="1" value={charterTrips} onChange={(e) => setCharterTrips(e.target.value)} placeholder="미확인" /> · 1회 예시 200,000원 · 합계 {validTrips ? won(Number(charterTrips) * 200000) : "확인 필요"}</label> : null}
      <p className="comparison-note">택배비와 소요 시간은 미확인입니다. 용차 횟수도 엑셀에서 알 수 없어 직접 입력해야 합니다. 따라서 전체 비용·시간의 우열은 확정할 수 없습니다. <a href="https://kdexp.com/service/charge/package_standard.do" target="_blank" rel="noreferrer">경동택배 표준운임 기준</a></p>
      <details><summary>용차·택배 품목 보기</summary><ul>{outsourced.map((row) => <li key={row.rowNumber}>{row.rowNumber}행 · {row.customer || "업체 미확인"} · {row.location || "위치 미확인"} · {row.product} · {row.transport || "운송 방식 미확인"}</li>)}</ul></details>
    </> : null}
  </section>;
}
