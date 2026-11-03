"use client";
import { useEffect, useState } from "react";
import type { PackingMode, SimulationItem, SimulationResult, SimulationRoute } from "@/lib/simulation";
import { isPackingMode } from "@/lib/simulation-packing";
import { estimateCharterTrips, charterDestinationKey, estimatedCharterGroupsCost, estimatedOriginalCharterCost, hasComparableRoutes, simulationCostIssues } from "@/lib/simulation-cost";

const money = (n: number | null) => n == null ? "확인 필요" : `${Math.round(n).toLocaleString("ko-KR")}원`;
function ComparisonBars({ title, original, proposed, regional, format, isCost = false, regionalProvisional = false }: { title: string; original: number; proposed: number; regional?: number | null; format: (n: number) => string; isCost?: boolean; regionalProvisional?: boolean }) {
  const max = Math.max(original, proposed, regional ?? 0, 1);
  const delta = proposed - original;
  const percent = original > 0 && delta !== 0 ? Math.abs(delta / original * 100) : null;
  const difference = delta === 0 ? "차이 없음" : `${format(Math.abs(delta))} ${delta < 0 ? (isCost ? "절감 예상" : "감소") : (isCost ? "증가 예상" : "증가")}`;
  const values: [string, number][] = [["기존 계획", original], ["AI 제안", proposed]];
  if (regional != null) values.push(["지방 집중", regional]);
  const ranked = [...values].sort((a, b) => a[1] - b[1]);
  return <div className="simulation-chart"><div className="simulation-chart-heading"><h4>{title}</h4><strong className={`simulation-chart-difference${delta > 0 ? " is-increase" : ""}`}>기존 대비 AI {difference}{percent != null ? ` · 약 ${Number(percent.toFixed(1))}% ${delta < 0 ? "감소" : "증가"}` : ""}</strong></div>
    <div className="simulation-ranking"><span className="simulation-ranking-caption">{isCost ? "예상 비용 낮은 순" : "운행 합계 짧은 순"}</span><div className="simulation-ranking-values">{ranked.map(([label, value], index) => <span className="simulation-ranking-part" key={label}>{index > 0 ? <span className="simulation-ranking-symbol" aria-label={value === ranked[index - 1][1] ? "같음" : "보다 작음"}>{value === ranked[index - 1][1] ? "=" : "<"}</span> : null}<span className={`simulation-ranking-item${label === "AI 제안" ? " is-ai" : label === "지방 집중" ? " is-regional" : ""}`}><span>{label}{label === "지방 집중" && regionalProvisional ? " (가배정)" : ""}</span><strong>{format(value)}</strong></span></span>)}</div>{regional == null ? <small>지방 집중안은 비교 가능한 값이 없어 순서에서 제외했습니다.</small> : null}</div>
    {values.map(([label, value]) => <div className="simulation-chart-row" key={label}>
    <span>{label}{label === "지방 집중" && regionalProvisional ? " (가배정)" : ""}</span><div className="simulation-chart-track" aria-hidden="true"><div className={`simulation-chart-bar ${label === "AI 제안" ? "simulation-chart-bar-ai" : ""}`} style={{ width: `${value / max * 100}%`, ...(label === "지방 집중" ? { backgroundColor: "#286895" } : {}) }} /></div><strong>{format(value)}<small>{label === "지방 집중" && regionalProvisional ? "주소·적재 확인 전 참고값 · " : ""}{label === "기존 계획" ? "비교 기준" : value === original ? "차이 없음" : `기존 대비 ${format(Math.abs(value - original))} ${value < original ? "감소" : "증가"}`}</small></strong>
  </div>)}</div>;
}

function difference(value: number | null, baseline: number | null, format: (n: number) => string) {
  if (value == null || baseline == null) return "확인 필요";
  const delta = value - baseline;
  return delta === 0 ? "차이 없음" : `${format(Math.abs(delta))} ${delta < 0 ? "감소" : "증가"}`;
}

function RegionalVehicleCharts({ routes, provisional }: { routes: SimulationRoute[]; provisional: boolean }) {
  const vehicles = ["1호차", "2호차"].map((name) => ({ name, route: routes.find((route) => route.vehicle === name) }));
  const minutes = (route?: SimulationRoute) => !route ? null : !route.items.length ? 0 : route.minutes;
  const expense = (route?: SimulationRoute) => !route ? null : !route.items.length ? 0 : route.fuel == null || route.toll == null ? null : route.fuel + route.toll;
  const metrics = [
    { title: "호차별 운행 시간", value: minutes, format: (value: number) => `${value.toLocaleString("ko-KR")}분` },
    { title: "호차별 경유비·통행료", value: expense, format: (value: number) => money(value) },
  ];
  return <section className="regional-vehicle-charts" aria-label="지방 집중안 호차별 비교">
    <h4>지방 집중안 · 호차별 비교{provisional ? " (가배정)" : ""}</h4>
    <p className="comparison-note">각 차량의 왕복 경로 기준입니다. 비용에는 용차비가 포함되지 않으며, 운행 시간에는 하차·대기 시간이 제외됩니다.</p>
    <div className="simulation-charts">{metrics.map((metric) => {
      const maximum = Math.max(1, ...vehicles.map(({ route }) => metric.value(route) ?? 0));
      return <div className="simulation-chart" key={metric.title}><h4>{metric.title}</h4>
        {vehicles.map(({ name, route }) => {
          const value = metric.value(route);
          const stops = route ? [...new Set(route.items.map((item) => item.customer || "거래처 미확인"))] : [];
          return <div className="regional-vehicle-row" key={name}>
            <div className="simulation-chart-row" title={`${name} · ${value == null ? "확인 필요" : metric.format(value)} · ${stops.length ? stops.join(" → ") : route ? "운행 품목 없음" : "경로 확인 필요"}`}><span>{name}</span><div className="simulation-chart-track" aria-hidden="true"><div className="regional-vehicle-bar" style={{ width: `${value == null ? 0 : value / maximum * 100}%` }} /></div><strong>{value == null ? "확인 필요" : metric.format(value)}</strong></div>
            {route ? <details className="regional-vehicle-detail"><summary>{name} 납품지 보기</summary><p>{stops.length ? stops.join(" → ") : "운행 품목 없음"}</p><p>왕복 {route.distance == null && route.items.length ? "거리 확인 필요" : `${(route.distance ?? 0).toLocaleString("ko-KR")}km`} · {route.items.length ? `${route.items.length}품목` : "운행 없음"}</p></details> : <p className="comparison-note">차량 경로 확인 필요</p>}
          </div>;
        })}
      </div>;
    })}</div>
  </section>;
}

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
      <p>선택한 별도 적재 {r.pallets} / 8 PLT · 확인된 중량 {r.weight.toLocaleString()} / {r.vehicle === "1호차" ? "4,000" : "3,500"}kg</p>
      {r.unknownPallets || r.unknownWeight ? <p className="dispatch-route-note-warn">적재 정보 미확인: PLT {r.unknownPallets}품목, 중량 {r.unknownWeight}품목</p> : null}
      {r.over ? <p className="dispatch-route-note-warn">알려진 적재량이 한도를 초과합니다.</p> : null}
      <p>왕복 {r.distance == null ? "거리 확인 필요" : `${r.distance}km`} · {r.minutes == null ? "시간 확인 필요" : `${r.minutes}분`} · 통행료 {money(r.toll)} · 경유비 {money(r.fuel)}</p>
      <details><summary>납품지 주소와 구간 보기</summary><ul>{r.items.filter((item, index, list) => list.findIndex((other) => other.customer === item.customer && other.address === item.address) === index).map((item) => <li key={item.rowNumber}>{item.customer || "업체 미확인"} · 엑셀 지역 {item.location || "미입력"} · {item.address || "주소 미확인"} ({item.addressSource || "출처 미확인"}){item.addressIssue ? ` · ${item.addressIssue}` : ""}</li>)}</ul>
        {r.legs?.length ? <><p>구간별 카카오 길찾기 (조회 시점 기준)</p><ol>{r.legs.map((leg, index) => <li key={`${index}-${leg.from}-${leg.to}`}>{leg.from} → {leg.to} · {leg.distanceKm == null ? "거리 확인 불가" : `${leg.distanceKm.toLocaleString("ko-KR")}km`} · {leg.minutes == null ? "시간 확인 불가" : `${leg.minutes.toLocaleString("ko-KR")}분`}</li>)}</ol></> : <p>구간별 정보가 없습니다. 배차안을 다시 만들거나 경로를 새로 조회하세요.</p>}
      </details>
      <details><summary>품목 보기 ({r.items.length}품목)</summary><ul>{r.items.map((i) => <li key={i.rowNumber}>{i.customer} · {i.product} · {i.transport || "방식 미확인"} {i.vehicle ? "" : "→ 자사 차량"}</li>)}</ul></details></>}
  </div>) : <p>AI 제안이 없습니다.</p>}{external ? <ExternalDeliveries items={external} /> : null}</div>;
}
export function DeliveryComparison({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate); const [file, setFile] = useState<File | null>(null);
  const [price, setPrice] = useState(""); const [priceSource, setPriceSource] = useState("경유 가격을 입력해 주세요.");
  const [result, setResult] = useState<SimulationResult | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState("");
  const [originalTrips, setOriginalTrips] = useState("");
  const [fares, setFares] = useState<Record<string, string>>({});
  const [packing, setPacking] = useState<Record<string, PackingMode>>({}); const [packingDirty, setPackingDirty] = useState(false);
  useEffect(() => { const controller = new AbortController(); fetch("/api/diesel-price", { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ price: number; date: string }>; }).then((d) => { setPrice((current) => current || String(d.price)); setPriceSource(`오피넷 전국 평균 ${d.date} 기준 · 수정 가능`); }).catch(() => { if (!controller.signal.aborted) setPriceSource("오피넷 조회 실패 · 경유 가격을 직접 입력해 주세요."); }); return () => controller.abort(); }, []);
  function savePreferences(f: File | null, d: string, values: { packing: Record<string, PackingMode>; originalTrips: string; price: string }) {
    if (!f || !d) return;
    try { localStorage.setItem(`simulation-input:v1:${f.name}:${f.size}:${f.lastModified}:${d}`, JSON.stringify(values)); } catch { /* Storage may be unavailable. */ }
  }
  function restorePreferences(f: File | null, d: string) {
    let saved: { packing?: Record<string, unknown>; originalTrips?: unknown; price?: unknown } = {};
    try { if (f && d) saved = JSON.parse(localStorage.getItem(`simulation-input:v1:${f.name}:${f.size}:${f.lastModified}:${d}`) || "{}"); } catch { /* Start with empty settings. */ }
    try { const raw = f && d ? JSON.parse(localStorage.getItem(`simulation-fares:v1:${f.name}:${f.size}:${f.lastModified}:${d}`) || "{}") : {}; setFares(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}); } catch { setFares({}); }
    setPacking(Object.fromEntries(Object.entries(saved?.packing || {}).filter(([key, value]) => /^\d+$/.test(key) && isPackingMode(value))) as Record<string, PackingMode>);
    setOriginalTrips(typeof saved?.originalTrips === "string" && /^\d*$/.test(saved.originalTrips) ? saved.originalTrips : "");
    if (typeof saved?.price === "string" && Number(saved.price) > 0) { setPrice(saved.price); setPriceSource("이 브라우저에 저장한 경유 가격 · 수정 가능"); }
  }
  async function run(mode: "load" | "regenerate" | "refresh" | "regional" = "load") {
    if (!file) { setError("납품 일정표 엑셀을 선택해 주세요."); return; }
    if (!date) { setError("납품일을 선택해 주세요."); return; }
    setLoading(true); setError(""); const form = new FormData(); form.set("file", file); form.set("date", date); form.set("price", price); form.set("packing", JSON.stringify(packing)); form.set("mode", mode);
    try { const response = await fetch("/api/route/compare", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "시뮬레이션에 실패했습니다."); const next = data as SimulationResult; const trips = originalTrips || String(estimateCharterTrips(next.items)); setOriginalTrips(trips); savePreferences(file, date, { packing, originalTrips: trips, price }); setPackingDirty(false); setResult(next); setLastAction(mode === "regional" ? "지방 집중안만 새로 생성" : mode === "refresh" ? "저장된 배차 유지 · 경로만 새로 조회" : next.restored ? "저장된 결과 불러옴" : "새 배차안 생성"); }
    catch (err) { setError(err instanceof Error ? err.message : "시뮬레이션에 실패했습니다."); } finally { setLoading(false); }
  }
  const moved = result?.proposed.flatMap((route) => route.items.filter((item) => !item.vehicle).map((item) => ({ ...item, target: route.vehicle }))) ?? [];
  const complete = !!result && hasComparableRoutes(result);
  const total = (routes: SimulationRoute[]) => routes.reduce((n, r) => n + (r.minutes ?? 0), 0);
  const cost = (routes: SimulationRoute[]) => routes.some((r) => r.items.length && (r.fuel == null || r.toll == null)) ? null : routes.reduce((n, r) => n + (r.fuel ?? 0) + (r.toll ?? 0), 0);
  const originalHasCharter = !!result?.items.some((item) => !item.vehicle && /용차/.test(item.transport));
  const proposedTrips = result?.charterGroups == null ? null : result.charterGroups.length;
  const destinations = result ? [...new Map([...result.items, ...(result.regional?.remaining ?? [])].map((item) => [charterDestinationKey(item), item])).entries()] : [];
  const originalGroups = result ? [...new Map(result.items.filter((item) => !item.vehicle && /용차/.test(item.transport)).map((item) => [charterDestinationKey(item), { items: [item] }])).values()] : [];
  const originalCharterCost = estimatedOriginalCharterCost(originalGroups, fares, originalTrips);
  const proposedCharterCost = result?.charterGroups ? estimatedCharterGroupsCost(result.charterGroups, fares) : null;
  const compare = (vehicle: number | null, charter: number | null) => {
    const base = result ? cost(result.original) : null;
    if (!complete || packingDirty || base == null || vehicle == null || originalCharterCost == null || charter == null) return null;
    const original = base + originalCharterCost; const proposed = vehicle + charter;
    return { original, proposed, saving: original - proposed };
  };
  const comparison = result ? compare(cost(result.proposed), proposedCharterCost) : null;
  const regional = result?.regional;
  const regionalTrips = regional && !regional.error ? regional.charterGroups.length : null;
  const regionalUncertain = !!regional && [...regional.routes.flatMap((route) => route.items), ...regional.remaining.filter((item) => item.region === 'regional' && /용차/.test(item.transport))].some((item) => item.pallets == null || item.weight == null || item.addressSource?.startsWith("카카오"));
  const regionalTime = regional && regional.routes.some((route) => route.items.length) && regional.routes.every((route) => !route.items.length || route.minutes != null) ? total(regional.routes) : null;
  const regionalCharterCost = regional && !regional.error ? estimatedCharterGroupsCost(regional.charterGroups, fares) : null;
  const regionalComparison = regional && !regional.error ? compare(cost(regional.routes), regionalCharterCost) : null;
  const baseTrips = /^\d+$/.test(originalTrips) && Number.isSafeInteger(Number(originalTrips)) && (originalHasCharter ? Number(originalTrips) > 0 : Number(originalTrips) === 0) ? Number(originalTrips) : null;
  const baseVehicleCost = result && complete && !packingDirty ? cost(result.original) : null;
  const costIssues = result ? simulationCostIssues([{ label: "기존 계획", routes: result.original }, { label: "AI 제안", routes: result.proposed }, ...(regional && !regional.error ? [{ label: "지방 집중안", routes: regional.routes }] : [])], originalTrips, originalHasCharter) : [];
  if (result && !complete) {
    const planned = new Set(result.original.flatMap((route) => route.items.map((item) => item.rowNumber)));
    const missing = result.items.filter((item) => item.vehicle && !planned.has(item.rowNumber));
    if (missing.length) costIssues.push(`기존 자사 납품 주소·경로 누락: ${missing.map((item) => `${item.rowNumber}행 ${item.customer}`).join(", ")}`);
  }
  return <section className="comparison-section" aria-labelledby="simulation-title"><h2 id="simulation-title">AI 배차 시뮬레이션</h2>
    <p>기존 계획과 AI 배차안, 1·2호차 지방 집중안을 비교합니다. 결과는 실제 일정에 반영되지 않습니다.</p>
    <div className="comparison-controls"><label>일정표 파일 <input type="file" accept=".xlsx" disabled={loading} onChange={(e) => { const selected = e.target.files?.[0] ?? null; setFile(selected); setResult(null); restorePreferences(selected, date); setPackingDirty(false); }} /></label>
      <label>납품일 <input type="date" value={date} disabled={loading} onChange={(e) => { const selected = e.target.value; setDate(selected); setResult(null); restorePreferences(file, selected); setPackingDirty(false); }} /></label>
      <label>경유 가격 (원/L) <input type="number" min="1" value={price} disabled={loading} onChange={(e) => { const value = e.target.value; setPrice(value); setPriceSource("직접 입력한 경유 가격 · 수정 가능"); setResult(null); savePreferences(file, date, { packing, originalTrips, price: value }); }} placeholder="직접 입력" /></label>
      <button type="button" className="dispatch-secondary-button" disabled={loading} onClick={() => void run("load")}>{loading ? "처리 중…" : "배차안 불러오기 / 만들기"}</button>
      {result ? <><button type="button" className="dispatch-secondary-button" disabled={loading || packingDirty} onClick={() => void run("refresh")}>현재 안의 경로 새로고침</button><button type="button" className="dispatch-secondary-button" disabled={loading || packingDirty} onClick={() => void run("regional")}>지방 집중안만 다시 만들기</button><button type="button" className="dispatch-secondary-button" disabled={loading} onClick={() => void run("regenerate")}>AI 배차안 다시 만들기</button></> : null}</div>
    <p className="comparison-note">{priceSource} · 사람 계획은 엑셀 행 순서 · 자사 차량 왕복, 임시 연비 7.1km/L</p>
    <p className="comparison-note">같은 조건은 저장된 안을 불러옵니다. 교통 정보만 갱신하려면 경로 새로고침을 누르세요.</p>
    {error ? <p className="dispatch-route-note-warn">{error}</p> : null}
    {result ? <><p>{result.items.length}품목 · {lastAction || (result.restored ? "저장된 배차안" : "새 배차안")}</p>
      <div className="simulation-run-info" aria-label="결과 기준">
        <strong>이 결과의 기준</strong>
        <p>파일 {file?.name || "확인 불가"} · 납품일 {date} · 경유 {price ? `${Number(price).toLocaleString("ko-KR")}원/L` : "미입력"} · 박스 적재 설정 {Object.keys(packing).length}품목{packingDirty ? " (변경 전 결과)" : ""} · 조건 식별번호 {result.inputFingerprint || "미확인"}</p>
        <p>기존·AI 배차안 생성 {result.savedAt ? new Date(result.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"} · 기존·AI 경로 조회 {result.routeUpdatedAt ? new Date(result.routeUpdatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"}</p>
        <p>지방 집중안 생성 {result.regional?.savedAt ? new Date(result.regional.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"} · 지방 집중 경로 조회 {result.regional?.routeUpdatedAt ? new Date(result.regional.routeUpdatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"}</p>
        <p>조건 식별번호는 파일 내용·납품일·경유 가격·적재 설정·주소・계산 버전을 구분합니다. 기존 용차 횟수는 화면에서 변경하며 식별번호에 포함되지 않습니다.</p>
      </div>
      {result.warnings.map((w) => <p className="dispatch-route-note-warn" key={w}>{w}</p>)}
      {packingDirty ? <p className="dispatch-route-note-warn">적재 방식을 변경했습니다. 아래는 이전 결과입니다. 배차안을 불러오거나 다시 만드세요.</p> : null}
      <div className="comparison-result" aria-label="예상 비용 비교">
        <h3>배차 결과 비교</h3>
        {result.comparisonNote ? <p className="comparison-note"><strong>일반 AI안 선택 과정:</strong> {result.comparisonNote}</p> : null}
        {result.note ? <p className="comparison-note"><strong>일반 AI안 생성:</strong> {result.note}</p> : null}
        {result.proposed.some((route) => route.over) ? <p className="dispatch-route-note-warn"><strong>AI 안은 적재 한도 초과로 실행할 수 없습니다. 아래 금액은 해당 안의 참고용 계산입니다.</strong></p> : null}
        {result.proposed.some((route) => route.unknownPallets || route.unknownWeight || route.items.some((item) => item.packing === "shared" || item.packing === "loose")) ? <p className="dispatch-route-note-warn">적재 방식·공간·중량 확인 전의 참고 비용입니다. 선택한 합적이나 별도 박스도 현장 확인이 필요합니다.</p> : null}
        <p className="comparison-note">부등호는 값의 크기 순서입니다. 낮은 비용이 실제 최적 배차를 뜻하지는 않습니다.</p>
        <div className="simulation-charts">
          {comparison ? <ComparisonBars title="예상 비용" original={comparison.original} proposed={comparison.proposed} regional={regionalComparison?.proposed} regionalProvisional={regionalUncertain} format={money} isCost /> : <div className="simulation-chart"><h4>예상 비용</h4><p className="dispatch-route-note-warn">비교 금액 확인 필요</p>{["기존 계획", "AI 제안", "지방 집중"].map((label) => <div className="simulation-chart-row" key={label}><span>{label}</span><div className="simulation-chart-track" aria-hidden="true" /><strong>확인 필요</strong></div>)}<p className="comparison-note">{packingDirty ? "적재 방식 변경을 적용하려면 배차안을 다시 만드세요." : costIssues.length ? costIssues.join(" / ") : originalCharterCost == null ? "기존 용차 횟수와 목적지별 운임을 확인하세요." : proposedCharterCost == null ? "AI 용차 묶음의 목적지별 운임을 확인하세요." : "주소와 경로·운임을 확인하세요."}</p></div>}
          {complete && !packingDirty ? <ComparisonBars title="자사 차량 운행 시간 합계" original={total(result.original)} proposed={total(result.proposed)} regional={regionalTrips != null ? regionalTime : null} regionalProvisional={regionalUncertain} format={(n) => `${n.toLocaleString("ko-KR")}분`} /> : <div className="simulation-chart"><h4>자사 차량 운행 시간 합계</h4><p className="dispatch-route-note-warn">주소·경로 또는 적재 설정을 확인하세요.</p></div>}
        </div>
        {comparison ? <>
          {proposedTrips != null && baseTrips != null && baseVehicleCost != null && cost(result.proposed) != null ? <p>AI 제안 비용 변화: 용차비 <strong>{difference(proposedCharterCost, originalCharterCost, money)}</strong> · 자사 경유비·통행료 <strong>{difference(cost(result.proposed), baseVehicleCost, money)}</strong></p> : null}
          {regionalComparison ? <p>지방 집중안의 포함 항목 비용: 기존 대비 <strong>{regionalComparison.saving === 0 ? "차이 없음" : `${money(Math.abs(regionalComparison.saving))} ${regionalComparison.saving > 0 ? "감소" : "증가"}`}</strong></p> : null}
          {regionalComparison && regional && regionalTrips != null && baseTrips != null && baseVehicleCost != null && cost(regional.routes) != null ? <p>지방 집중안 비용 변화: 용차비 <strong>{difference(regionalCharterCost, originalCharterCost, money)}</strong> · 자사 경유비·통행료 <strong>{difference(cost(regional.routes), baseVehicleCost, money)}</strong></p> : null}
          <p className="simulation-charter-summary">용차 운행: 기존 <strong>{originalTrips}회</strong> · AI 제안 <strong>{proposedTrips}회</strong> · 지방 집중 <strong>{regionalTrips == null ? "확인 필요" : `${regionalTrips}회`}</strong> · 미입력 운임은 1회 200,000원 가정</p>
          <p>자사 차량 경유비·통행료 + 용차비 기준입니다.</p></> : <p className="dispatch-route-note-warn">{packingDirty ? "적재 방식 변경을 적용하려면 배차안을 불러오거나 다시 만드세요." : "목적지별 운임·주소·경로 또는 운행 횟수가 미확인이라 비교 금액을 계산할 수 없습니다."}</p>}
        {!comparison && costIssues.length ? <p className="dispatch-route-note-warn">비용 확인 필요: {costIssues.join(" / ")}. 통행료는 경로가 여러 구간으로 나뉘면 중복을 피하기 위해 미확인으로 처리될 수 있습니다.</p> : null}
        {regional && !regional.error && !packingDirty ? <RegionalVehicleCharts routes={regional.routes} provisional={regionalUncertain} /> : null}
        <p className="comparison-note">시간은 자사 차량별 운행 시간의 합이며 하차·대기 및 용차·택배 시간은 제외됩니다. 용차비는 입력한 목적지별 운임과 미입력 시 1회 20만 원 가정을 사용합니다. 택배비와 인건비는 제외되어 전체 실제 비용이 아닙니다. 안마다 택배 물량이 달라질 수 있어 표시된 비용 차이만으로 전체 비용의 우열을 확정할 수 없습니다.</p>
        <p className="comparison-note">지방 집중안은 AI 후보 중 1·2호차 모두 지방 물량이 있고 알려진 적재 한도와 권역 조건을 만족하는 안을 검증합니다. AI 후보 생성에 실패하면 같은 조건을 통과한 규칙 기반 대체안을 별도로 표시할 수 있습니다. 경상권·전라권을 분리하고 비슷한 방향은 직선거리 기준으로 검토합니다. 적재 미확인 품목은 가배정이며 실제 적재와 도로 경로를 확인해야 합니다. 수도권의 기존 자사 물량은 용차, 기존 택배는 택배로 유지합니다.</p>
        {regionalUncertain ? <p className="dispatch-route-note-warn">지방 집중안은 적재 정보 또는 장소 검색 주소 확인이 필요한 가배정 참고값입니다. 실제 납품지·적재 가능 여부, 용차 횟수와 비용은 확인 후 달라질 수 있습니다.</p> : null}
        {regional?.error ? <p className="dispatch-route-note-warn">지방 집중안 계산 불가: {regional.error}</p> : null}
        {regional && !regional.error && regional.note ? <p className="dispatch-route-note-warn">{regional.note}</p> : null}
        <h4>목적지별 용차 운임 (1회)</h4>
        <p className="comparison-note">각 목적지의 실제 또는 예상 운임을 입력하세요. 입력하지 않은 목적지는 기존처럼 1회 20만 원으로 가정합니다. 같은 거래처·지역의 품목은 한 운행으로 가정합니다. 입력값은 이 브라우저에 파일·날짜별로 저장됩니다. AI 후보 선택은 기존 20만 원 가정을 사용하며 입력 금액으로 다시 선택하지 않습니다.</p>
        {destinations.map(([key, item]) => <label key={key} className="simulation-packing-row"><span>{item.customer || `거래처 미확인 · ${item.rowNumber}행`} · {item.location || "지역 미확인"}</span><input type="number" min="0" step="1" placeholder="운임 미입력" value={fares[key] ?? ""} onChange={(e) => { const next = { ...fares, [key]: e.target.value }; setFares(next); try { if (file && date) localStorage.setItem(`simulation-fares:v1:${file.name}:${file.size}:${file.lastModified}:${date}`, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ } }} aria-label={`${item.customer || item.rowNumber} ${item.location} 용차 운임`} /> 원</label>)}
        <div className="comparison-controls"><label>기존 용차 운행 횟수 <input type="number" min="0" step="1" value={originalTrips} onChange={(e) => { const value = e.target.value; setOriginalTrips(value); savePreferences(file, date, { packing, originalTrips: value, price }); }} /></label>
          <p>AI 제안 용차 운행: <strong>{proposedTrips == null ? "제안 없음" : `${proposedTrips}회`}</strong></p></div>
        <p className="comparison-note">기존 운행 횟수가 추정 묶음 수와 다르면 목적지별 운임을 적용할 수 없어 비교 금액이 표시되지 않을 수 있습니다. 운임을 입력하지 않은 경우에는 입력한 운행 횟수에 20만 원을 적용합니다.</p>
      </div>
      <details className="simulation-details"><summary>배차 결과 자세히 보기</summary>
      <p className="comparison-note">{result.note} · 납품 기한·긴급 여부·택배 마감·하차 시간은 미확인이므로 실제 운행 가능성을 확인해야 합니다.</p>
      {result.savedAt ? <p className="comparison-note">배차안 생성: {new Date(result.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · 경로 조회: {result.routeUpdatedAt ? new Date(result.routeUpdatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"} · 후보 {result.candidateCount ?? 0}개 · {result.planSource || "Groq"}</p> : null}
      {result.comparisonNote ? <p className="comparison-note">{result.comparisonNote}</p> : null}
      <details><summary>전체 품목의 주소 확인</summary><p>엑셀 도착지를 우선 사용하며, 주소가 없거나 엑셀 지역과 다르면 업체명과 지역이 일치하는 카카오 장소를 찾아 참고합니다. 검색 후보는 실제 납품지 확인이 필요합니다.</p><ul>{result.items.map((item) => <li key={item.rowNumber}>{item.rowNumber}행 · {item.customer || "업체 미확인"} · 엑셀 지역 {item.location || "미입력"} · {item.address || "주소 미확인"} ({item.addressSource || "출처 미확인"}){item.addressIssue ? ` · ${item.addressIssue} (경로 제외)` : item.lat == null ? " · 좌표 미확인 (경로 제외)" : ""}</li>)}</ul></details>
      <details><summary>품목별 박스 적재 방식 설정</summary><p>기본값은 확인 필요입니다. 합적·별도 박스를 선택해도 공간과 고정 가능 여부는 현장에서 확인해야 합니다. 변경 후 배차안을 불러오거나 다시 만드세요.</p>
        {result.items.map((item) => <label key={item.rowNumber} className="simulation-packing-row"><span>{item.rowNumber}행 · {item.customer || "업체 미확인"} · {item.product} · {item.boxes == null ? "박스 수 미확인" : `${item.boxes}박스`}</span><select disabled={loading} value={packing[String(item.rowNumber)] ?? "unknown"} onChange={(e) => { const next = { ...packing, [String(item.rowNumber)]: e.target.value as PackingMode }; setPacking(next); savePreferences(file, date, { packing: next, originalTrips, price }); setPackingDirty(true); }}><option value="unknown">확인 필요</option><option value="shared">기존 PLT에 합적</option><option value="loose">별도 박스 적재</option><option value="pallet">별도 PLT 필요</option></select></label>)}
      </details>
      <div className="comparison-plans"><Plan title="기존 배차 계획" routes={result.original} external={result.items.filter((item) => !item.vehicle)} /><Plan title="AI 시뮬레이션" routes={result.proposed} external={result.proposed.length ? result.remaining : undefined} />{regional?.routes.length ? <Plan title={regional.note.includes("규칙 기반 대체안") ? "지방 집중 규칙 기반 대체안" : "지방 집중 AI안"} routes={regional.routes} external={regional.remaining} /> : null}</div>
      {regional && !regional.error ? <><h3>지방 집중안 용차 제안 ({regional.charterGroups.length}회)</h3><ol>{regional.charterGroups.map((group, index) => <li key={index}>용차 {index + 1}회: {group.items.map((item) => `${item.customer || "업체 미확인"} (${item.rowNumber}행 · ${item.product})`).join(" / ")}</li>)}</ol>{regional.routes.some((route) => !route.items.length) ? <p className="dispatch-route-note-warn">물량 또는 조건에 따라 운행 품목이 없는 차량이 있습니다.</p> : null}</> : null}
      <h3>AI 용차 운행 제안 {proposedTrips == null ? "" : `(${proposedTrips}회)`}</h3>
      {result.charterGroups == null ? <p>AI 용차 묶음을 만들지 못했습니다. 다시 시도하세요.</p> : result.charterGroups.length === 0 ? <p>AI가 용차 운행 없이 처리하는 안을 제안했습니다.</p> : <ol>{result.charterGroups.map((group, index) => <li key={index}><strong>용차 {index + 1}회:</strong> {group.items.map((item) => `${item.customer || "업체 미확인"} (${item.rowNumber}행 · ${item.product})`).join(" / ")}</li>)}</ol>}
      <p className="dispatch-route-note-warn">AI가 묶은 용차는 차량 톤수·적재량, 납품 기한과 경유 가능 여부가 미확인인 후보입니다. 실제 운행과 1회 운임으로 확정된 결과가 아닙니다.</p>
      {complete ? <p><strong>자사 차량 운행 합계:</strong> 기존 {total(result.original)}분 / {money(cost(result.original))} · 제안 {total(result.proposed)}분 / {money(cost(result.proposed))} (경유비 + 통행료) · {total(result.proposed) === total(result.original) ? "시간 차이 없음" : `제안 ${Math.abs(total(result.proposed) - total(result.original))}분 ${total(result.proposed) > total(result.original) ? "증가" : "감소"}`}</p> : <p className="comparison-note">누락된 자사 납품이나 경로가 있으면 전체 자사 차량 운행 합계는 비교하지 않습니다.</p>}
      <h3>용차·택배에서 자사 차량으로 제안한 품목 ({moved.length})</h3>{moved.length ? <ul>{moved.map((i) => <li key={i.rowNumber}>{i.rowNumber}행 · {i.customer} · {i.product} · {i.transport} → {i.target}</li>)}</ul> : <p>제안된 이동 품목이 없습니다. 주소와 AI 응답 상태를 확인하세요.</p>}
      <p className="comparison-note">위 비용은 기존 횟수 가정과 AI가 제안한 용차 묶음 수를 기준으로 합니다. 택배비·기사 인건비 등은 포함하지 않습니다. 특히 택배 품목이 자사 차량으로 이동한 경우 택배비 절감은 반영되지 않아 전체 비용의 우열을 확정할 수 없습니다. <a href="https://kdexp.com/service/charge/package_standard.do" target="_blank" rel="noreferrer">경동택배 표준운임 기준</a></p>
      <p className="comparison-note">경로 시간·통행료는 조회 시점 기준이며 과거 운행 실적이 아닙니다. 운행 시간은 하차·대기 시간을 제외합니다. AI 제안은 최적해를 보장하지 않습니다.</p></details></> : null}
  </section>;
}
