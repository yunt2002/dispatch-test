"use client";
import { useEffect, useMemo, useState } from "react";
import type { PackingMode, SimulationItem, SimulationResult, SimulationRoute } from "@/lib/simulation";
import { isPackingMode } from "@/lib/simulation-packing";
import { simulationTime, simulationTimeTotals } from "@/lib/simulation-time";
import { comparableCourierCosts, courierCost, courierTotal, type CourierChoice } from "@/lib/simulation-courier";
import type { HistoryReview, SimulationHistorySnapshot } from "@/lib/simulation-history";
import {
  addReturnCharterTrip,
  charterItemsFromPlan,
  charterGroupsSignature,
  estimatedTripsCost,
  hasComparableRoutes,
  mergeCharterTrips,
  parseCharterTrips,
  restoreEditedCharterTrips,
  simulationCostIssues,
  splitCharterTrip,
  syncOriginalCharterTrips,
  tripLabel,
  tripsFromCharterGroups,
  unpricedTransportItems,
  type CharterLeg,
  type CharterTrip,
} from "@/lib/simulation-cost";
import {
  compareManagerToRecommended,
  orderCompareSummary,
  orderStatusLabel,
  type OrderStop,
  type VehicleOrderCompare,
} from "@/lib/simulation-visit-order";
import { planHasOverLimit, planHasUnknownLoad, routeFieldReadiness, routeFieldReadinessLabel } from "@/lib/simulation-field-readiness";
import { simulationVehicleName } from "@/lib/simulation-vehicles";

type AddressCheckItem = {
  rowNumber: number;
  customer: string;
  product: string;
  location: string;
  transport: string;
  vehicle: "1호차" | "2호차" | "스타리아" | null;
  address: string | null;
  addressSource: string;
  addressIssue: string | null;
  addressWarning?: string | null;
  lat: number | null;
  lng: number | null;
};

function storageKey(prefix: string, f: File, d: string) {
  return `${prefix}:${f.name}:${f.size}:${f.lastModified}:${d}`;
}

const money = (n: number | null) => n == null ? "확인 필요" : `${Math.round(n).toLocaleString("ko-KR")}원`;
type CostParts = { vehicle: number; charter: number; courier: number | null };
type TimeParts = { driving: number; lunch: number; unloading: number };
function ComparisonBars({ title, original, proposed, format, isCost = false, costParts, timeParts }: {
  title: string; original: number; proposed: number; format: (n: number) => string; isCost?: boolean;
  costParts?: { original: CostParts; proposed: CostParts };
  timeParts?: { original: TimeParts; proposed: TimeParts };
}) {
  const max = Math.max(original, proposed, 1);
  const delta = proposed - original;
  const percent = original > 0 && delta !== 0 ? Math.abs(delta / original * 100) : null;
  const difference = delta === 0 ? "차이 없음" : `${format(Math.abs(delta))} ${delta < 0 ? (isCost ? "절감 예상" : "감소") : (isCost ? "증가 예상" : "증가")}`;
  const values: [string, number, CostParts | TimeParts | null | undefined][] = [
    ["기존 계획", original, costParts?.original ?? timeParts?.original],
    ["AI 제안", proposed, costParts?.proposed ?? timeParts?.proposed],
  ];
  const ranked = [...values].sort((a, b) => a[1] - b[1]);
  const partsNote = (parts: CostParts | TimeParts | null | undefined) =>
    !parts ? null : "vehicle" in parts ? `자사 ${format(parts.vehicle)} + 용차 ${format(parts.charter)}${parts.courier == null ? " · 택배비 제외" : ` + 택배 ${format(parts.courier)}`}` : `운전 ${format(parts.driving)} + 점심 ${format(parts.lunch)} + 하차 ${format(parts.unloading)}`;
  return <div className="simulation-chart"><div className="simulation-chart-heading"><h4>{title}</h4><strong className={`simulation-chart-difference${delta > 0 ? " is-increase" : ""}`}>기존 대비 AI {difference}{percent != null ? ` · 약 ${Number(percent.toFixed(1))}% ${delta < 0 ? "감소" : "증가"}` : ""}</strong></div>
    <div className="simulation-ranking"><span className="simulation-ranking-caption">{isCost ? "예상 비용 낮은 순" : "운행 합계 짧은 순"}</span><div className="simulation-ranking-values">{ranked.map(([label, value], index) => <span className="simulation-ranking-part" key={label}>{index > 0 ? <span className="simulation-ranking-symbol" aria-label={value === ranked[index - 1][1] ? "같음" : "보다 작음"}>{value === ranked[index - 1][1] ? "=" : "<"}</span> : null}<span className={`simulation-ranking-item${label === "AI 제안" ? " is-ai" : ""}`}><span>{label}</span><strong>{format(value)}</strong></span></span>)}</div></div>
    {values.map(([label, value, parts]) => {
      const note = partsNote(parts);
      return <div className="simulation-chart-row" key={label}>
      <span>{label}</span><div className="simulation-chart-track" aria-hidden="true"><div className={`simulation-chart-bar ${label === "AI 제안" ? "simulation-chart-bar-ai" : ""}`} style={{ width: `${value / max * 100}%` }} /></div><strong>{format(value)}<small>{note ? `${note} · ` : ""}{label === "기존 계획" ? "비교 기준" : value === original ? "차이 없음" : `기존 대비 ${format(Math.abs(value - original))} ${value < original ? "감소" : "증가"}`}</small></strong>
    </div>;
    })}</div>;
}

function difference(value: number | null, baseline: number | null, format: (n: number) => string) {
  if (value == null || baseline == null) return "확인 필요";
  const delta = value - baseline;
  return delta === 0 ? "차이 없음" : `${format(Math.abs(delta))} ${delta < 0 ? "감소" : "증가"}`;
}

function OrderList({ title, stops, accent }: { title: string; stops: OrderStop[] | null; accent?: "manager" | "recommend" }) {
  return <div className={`simulation-order-column${accent ? ` is-${accent}` : ""}`}>
    <strong>{title}</strong>
    {!stops ? <p className="comparison-note">좌표가 부족해 추천 순서를 만들 수 없습니다.</p>
      : !stops.length ? <p className="comparison-note">납품지 없음</p>
      : <ol>{stops.map((stop, index) => <li key={`${stop.id}-${index}`}>{stop.label}</li>)}</ol>}
  </div>;
}

function VisitOrderCompare({ routes }: { routes: SimulationRoute[] }) {
  const rows = useMemo(() => compareManagerToRecommended(routes), [routes]);
  const summary = orderCompareSummary(rows);
  if (!rows.length) return null;
  return <details className="simulation-details simulation-order-compare">
    <summary>
      <span className="simulation-closed-label">담당자 순서 · 추천 순서 비교 · {summary}</span>
      <span className="simulation-open-label">담당자 순서 · 추천 순서 접기</span>
    </summary>
    <p className="comparison-note">기존 계획의 방문 순서와 직선거리 기준 추천 순서를 나란히 봅니다. 실제 도로·제약과 다를 수 있으며 일정에는 반영되지 않습니다.</p>
    {rows.map((row: VehicleOrderCompare) => (
      <div className={`simulation-order-vehicle${row.status === "different" ? " is-different" : ""}`} key={row.vehicle}>
        <h5>{row.vehicle}<span>{orderStatusLabel(row.status)}</span></h5>
        <div className="simulation-order-columns">
          <OrderList title="담당자 순서" stops={row.manager} accent="manager" />
          <OrderList title="추천 순서" stops={row.recommended} accent="recommend" />
        </div>
      </div>
    ))}
  </details>;
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
  return <div className="comparison-plan"><h3>{title}</h3>{routes.length ? routes.map((r) => {
    const readiness = routeFieldReadiness(r);
    return <div className="comparison-route" key={r.vehicle}><strong>{r.vehicle}</strong>
    {!r.items.length ? <p>운행 품목 없음</p> : <><p>{r.items.map((i) => i.customer).filter((name, index, list) => list.indexOf(name) === index).join(" → ")}</p>
      <p>확인된 별도 적재 {r.pallets} / {r.maxPallet ?? (r.vehicle === "스타리아" ? 1 : 8)} PLT{r.unknownPallets ? ` · 미확인 ${r.unknownPallets}품목` : ""} · 확인된 중량 {r.weight.toLocaleString()} / {(r.maxWeight ?? (r.vehicle === "1호차" ? 4000 : r.vehicle === "스타리아" ? 1000 : 3500)).toLocaleString()}kg{r.unknownWeight ? ` · 미확인 ${r.unknownWeight}품목` : ""}</p>
      <p className={readiness === "ready" ? "comparison-note" : "dispatch-route-note-warn"}>{routeFieldReadinessLabel(readiness)}</p>
      {r.unknownPallets || r.unknownWeight ? <details><summary>미확인 적재 품목 보기</summary><ul>{r.items.filter((item) => item.pallets == null || item.weight == null).map((item) => <li key={item.rowNumber}>{item.rowNumber}행 · {item.customer} · {item.product} · PLT {item.pallets == null ? "미확인" : item.pallets} · 중량 {item.weight == null ? "미확인" : `${item.weight}kg`}</li>)}</ul></details> : null}
      {r.over ? <p className="dispatch-route-note-warn">알려진 적재량이 한도를 초과합니다.</p> : null}
      <p>왕복 {r.distance == null ? "거리 확인 필요" : `${r.distance}km`} · 총 소요 {simulationTime(r).total == null ? "확인 필요" : `${simulationTime(r).total}분`} (운전 {r.minutes == null ? "확인 필요" : `${r.minutes}분`} + 점심 {simulationTime(r).lunch}분 + 하차 {simulationTime(r).unloading}분) · 통행료 {money(r.toll)} · 경유비 {money(r.fuel)}</p>
      <details><summary>납품지 주소와 구간 보기</summary><ul>{r.items.filter((item, index, list) => list.findIndex((other) => other.customer === item.customer && other.address === item.address) === index).map((item) => <li key={item.rowNumber}>{item.customer || "업체 미확인"} · 엑셀 지역 {item.location || "미입력"} · {item.address || "주소 미확인"} ({item.addressSource || "출처 미확인"}){item.addressIssue ? ` · ${item.addressIssue}` : ""}</li>)}</ul>
        {r.legs?.length ? <><p>구간별 카카오 길찾기 (조회 시점 기준)</p><ol>{r.legs.map((leg, index) => <li key={`${index}-${leg.from}-${leg.to}`}>{leg.from} → {leg.to} · {leg.distanceKm == null ? "거리 확인 불가" : `${leg.distanceKm.toLocaleString("ko-KR")}km`} · {leg.minutes == null ? "시간 확인 불가" : `${leg.minutes.toLocaleString("ko-KR")}분`}</li>)}</ol></> : <p>구간별 정보가 없습니다. 배차안을 다시 만들거나 경로를 새로 조회하세요.</p>}
      </details>
      <details><summary>적재 품목 보기 ({r.items.length}품목)</summary><ul>{r.items.map((i) => <li key={i.rowNumber}>{i.customer} · {i.product} · {i.boxes == null ? "박스 미확인" : `${i.boxes}박스`} · {i.pallets == null ? "PLT 미확인" : `${i.pallets} PLT${i.packing === "auto" ? " (기준표 추정)" : ""}`} · {i.transport || "방식 미확인"} {i.vehicle ? "" : "→ 자사 차량"}</li>)}</ul></details></>}
  </div>;
  }) : <p>AI 제안이 없습니다.</p>}{external ? <ExternalDeliveries items={external} /> : null}</div>;
}
export function DeliveryComparison({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate); const [file, setFile] = useState<File | null>(null);
  const [price, setPrice] = useState(""); const [priceSource, setPriceSource] = useState("경유 가격을 입력해 주세요.");
  const [result, setResult] = useState<SimulationResult | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState("");
  const [historyReview, setHistoryReview] = useState<HistoryReview>("확인 필요");
  const [historyMemo, setHistoryMemo] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [historySaving, setHistorySaving] = useState(false);
  const [originalCharterTrips, setOriginalCharterTrips] = useState<CharterTrip[]>([]);
  const [proposedCharterTrips, setProposedCharterTrips] = useState<CharterTrip[]>([]);
  
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [selectedProposedTripIds, setSelectedProposedTripIds] = useState<string[]>([]);
  const [packing, setPacking] = useState<Record<string, PackingMode>>({}); const [packingDirty, setPackingDirty] = useState(false);
  const [courierChoices, setCourierChoices] = useState<Record<string, CourierChoice>>({});
  const [extraTrips, setExtraTrips] = useState<{ original: CharterTrip[]; proposed: CharterTrip[] }>({ original: [], proposed: [] });
  const [extraRows, setExtraRows] = useState<{ original: string; proposed: string }>({ original: "", proposed: "" });
  const [excludedRows, setExcludedRows] = useState<number[]>([]);
  const [addressOverrides, setAddressOverrides] = useState<Record<string, string>>({});
  const [addressDraft, setAddressDraft] = useState<Record<string, string>>({});
  const [addressAck, setAddressAck] = useState(false);
  const [addressRetry, setAddressRetry] = useState(0);
  const [addressCheck, setAddressCheck] = useState<{ key: string; items: AddressCheckItem[]; error?: string } | null>(null);
  const [preview, setPreview] = useState<{ key: string; items: { rowNumber: number; customer: string; product: string; location: string; transport: string }[]; error?: string } | null>(null);
  const previewKey = file && date ? storageKey("simulation-preview", file, date) : "";
  const addressCheckKey = file && date ? `${storageKey("simulation-addresses", file, date)}:${excludedRows.join(",")}:${JSON.stringify(addressOverrides)}:${addressRetry}` : "";
  useEffect(() => {
    if (!file || !date) return;
    const controller = new AbortController();
    const key = storageKey("simulation-preview", file, date);
    const form = new FormData(); form.set("file", file); form.set("date", date); form.set("mode", "preview");
    fetch("/api/route/compare", { method: "POST", body: form, signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "품목을 불러오지 못했습니다.");
      if (!controller.signal.aborted) setPreview({ key, items: data.items });
    }).catch((err) => { if (!controller.signal.aborted) setPreview({ key, items: [], error: err instanceof Error ? err.message : "품목을 불러오지 못했습니다." }); });
    return () => controller.abort();
  }, [file, date]);
  useEffect(() => {
    if (!file || !date || preview?.key !== previewKey || preview.error) return;
    const controller = new AbortController();
    const key = addressCheckKey;
    const form = new FormData();
    form.set("file", file); form.set("date", date); form.set("mode", "addresses");
    form.set("excludedRows", JSON.stringify(excludedRows));
    form.set("addressOverrides", JSON.stringify(addressOverrides));
    fetch("/api/route/compare", { method: "POST", body: form, signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "주소를 확인하지 못했습니다.");
      if (!controller.signal.aborted) setAddressCheck({ key, items: data.items });
    }).catch((err) => { if (!controller.signal.aborted) setAddressCheck({ key, items: [], error: err instanceof Error ? err.message : "주소를 확인하지 못했습니다." }); });
    return () => controller.abort();
  }, [file, date, preview, previewKey, excludedRows, addressOverrides, addressCheckKey]);
  useEffect(() => { const controller = new AbortController(); fetch("/api/diesel-price", { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ price: number; date: string }>; }).then((d) => { setPrice((current) => current || String(d.price)); setPriceSource(`오피넷 전국 평균 ${d.date} 기준 · 수정 가능`); }).catch(() => { if (!controller.signal.aborted) setPriceSource("오피넷 조회 실패 · 경유 가격을 직접 입력해 주세요."); }); return () => controller.abort(); }, []);

  function savePreferences(f: File | null, d: string, values: { packing: Record<string, PackingMode>; price: string }) {
    if (!f || !d) return;
    try { localStorage.setItem(storageKey("simulation-input:v2", f, d), JSON.stringify(values)); } catch { /* Storage may be unavailable. */ }
  }
  function saveCharterTrips(f: File | null, d: string, trips: { original: CharterTrip[]; proposed: CharterTrip[]; regional: CharterTrip[] }, proposedSignature = result?.charterGroups ? charterGroupsSignature(result.charterGroups) : null) {
    if (!f || !d) return;
    try { localStorage.setItem(storageKey("simulation-charter-trips:v1", f, d), JSON.stringify({ ...trips, proposedSignature })); } catch { /* Storage may be unavailable. */ }
  }
  function loadSavedTrips(f: File | null, d: string) {
    try {
      if (!f || !d) return { original: [] as CharterTrip[], proposed: [] as CharterTrip[], regional: [] as CharterTrip[], proposedSignature: null };
      const raw = JSON.parse(localStorage.getItem(storageKey("simulation-charter-trips:v1", f, d)) || "{}");
      return {
        original: parseCharterTrips(raw?.original),
        proposed: parseCharterTrips(raw?.proposed),
        regional: parseCharterTrips(raw?.regional),
        proposedSignature: raw?.proposedSignature,
      };
    } catch {
      return { original: [] as CharterTrip[], proposed: [] as CharterTrip[], regional: [] as CharterTrip[], proposedSignature: null };
    }
  }
  function restorePreferences(f: File | null, d: string) {
    let saved: { packing?: Record<string, unknown>; price?: unknown } = {};
    try { if (f && d) saved = JSON.parse(localStorage.getItem(storageKey("simulation-input:v2", f, d)) || localStorage.getItem(`simulation-input:v1:${f.name}:${f.size}:${f.lastModified}:${d}`) || "{}"); } catch { /* Start with empty settings. */ }
    const trips = loadSavedTrips(f, d);
    try {
      const saved = f && d ? JSON.parse(localStorage.getItem(storageKey("simulation-courier:v1", f, d)) || "{}") : {};
      setCourierChoices(Object.fromEntries(Object.entries(saved).filter(([key, value]) => /^\d+$/.test(key) && value && typeof value === "object" && ["box", "pallet"].includes((value as CourierChoice).mode) && ((value as CourierChoice).quantity === undefined || (Number.isSafeInteger((value as CourierChoice).quantity) && (value as CourierChoice).quantity! >= 0)))) as Record<string, CourierChoice>);
    } catch { setCourierChoices({}); }
    try {
      const saved = f && d ? JSON.parse(localStorage.getItem(storageKey("simulation-extra:v1", f, d)) || "{}") : {};
      setExtraTrips({ original: parseCharterTrips(saved.original), proposed: parseCharterTrips(saved.proposed) });
    } catch { setExtraTrips({ original: [], proposed: [] }); }
    setExtraRows({ original: "", proposed: "" });
    try { const rows = f && d ? JSON.parse(localStorage.getItem(storageKey("simulation-excluded:v1", f, d)) || "[]") : []; setExcludedRows(Array.isArray(rows) ? rows.filter((row) => Number.isSafeInteger(row)) : []); } catch { setExcludedRows([]); }
    try {
      const saved = f && d ? JSON.parse(localStorage.getItem(storageKey("simulation-addresses:v1", f, d)) || "{}") : {};
      const next = Object.fromEntries(Object.entries(saved).filter(([key, value]) => /^\d+$/.test(key) && typeof value === "string" && value.trim() && value.trim().length <= 300).map(([key, value]) => [key, (value as string).trim()]));
      setAddressOverrides(next);
      setAddressDraft(next);
    } catch { setAddressOverrides({}); setAddressDraft({}); }
    setAddressAck(false);
    setAddressCheck(null);
    setOriginalCharterTrips(trips.original);
    setProposedCharterTrips(trips.proposed);
    setSelectedTripIds([]);
    setSelectedProposedTripIds([]);
    setPacking(Object.fromEntries(Object.entries(saved?.packing || {}).filter(([key, value]) => /^\d+$/.test(key) && isPackingMode(value))) as Record<string, PackingMode>);
    if (typeof saved?.price === "string" && Number(saved.price) > 0) { setPrice(saved.price); setPriceSource("이 브라우저에 저장한 경유 가격 · 수정 가능"); }
  }
  function applyTripsFromResult(next: SimulationResult, f: File, d: string, regenerate: boolean) {
    const saved = loadSavedTrips(f, d);
    const charterItems = charterItemsFromPlan(next.items);
    const original = syncOriginalCharterTrips(charterItems, saved.original);
    const proposed = next.charterGroups ? regenerate ? tripsFromCharterGroups(next.charterGroups, "proposed") : restoreEditedCharterTrips(next.charterGroups, saved.proposed, saved.proposedSignature) : [];
    const regional = saved.regional;
    setOriginalCharterTrips(original);
    setProposedCharterTrips(proposed);
    setSelectedTripIds([]);
    setSelectedProposedTripIds([]);
    saveCharterTrips(f, d, { original, proposed, regional }, next.charterGroups ? charterGroupsSignature(next.charterGroups) : null);
  }
  function persistTrips(next: { original?: CharterTrip[]; proposed?: CharterTrip[]; regional?: CharterTrip[] }) {
    const original = next.original ?? originalCharterTrips;
    const proposed = next.proposed ?? proposedCharterTrips;
    const regional = next.regional ?? loadSavedTrips(file, date).regional;
    if (next.original) setOriginalCharterTrips(original);
    if (next.proposed) setProposedCharterTrips(proposed);
    setHistoryReview("확인 필요"); setHistoryMessage("");
    saveCharterTrips(file, date, { original, proposed, regional });
  }
  function updateTripList(
    kind: "original" | "proposed",
    tripId: string,
    patch: Partial<Pick<CharterTrip, "leg" | "fare" | "excluded">>,
  ) {
    const map = (trips: CharterTrip[]) => trips.map((trip) => trip.id === tripId ? { ...trip, ...patch } : trip);
    if (kind === "original") persistTrips({ original: map(originalCharterTrips) });
    if (kind === "proposed") persistTrips({ proposed: map(proposedCharterTrips) });
  }
  function saveExtra(kind: "original" | "proposed", trips: CharterTrip[]) {
    const next = { ...extraTrips, [kind]: trips };
    setExtraTrips(next);
    setHistoryReview("확인 필요"); setHistoryMessage("");
    try { if (file && date) localStorage.setItem(storageKey("simulation-extra:v1", file, date), JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
  }
  function updateCourier(row: number, choice: CourierChoice | null) {
    const next = { ...courierChoices };
    if (choice) next[String(row)] = choice; else delete next[String(row)];
    setCourierChoices(next);
    setHistoryReview("확인 필요"); setHistoryMessage("");
    try { if (file && date) localStorage.setItem(storageKey("simulation-courier:v1", file, date), JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
  }
  function renderExtraTrips(kind: "original" | "proposed", items: SimulationItem[], trips: CharterTrip[]) {
    return <div className="simulation-extra-trips">
      <p className="comparison-note">추가 운행은 선택 품목의 운송 배정을 바꾸지 않고 비용만 더합니다. 기존 운행과 중복 여부를 확인하세요.</p>
      <div className="comparison-controls"><label>추가 운행 품목 <select value={extraRows[kind]} onChange={(event) => setExtraRows((current) => ({ ...current, [kind]: event.target.value }))}><option value="">품목 선택</option>{items.map((item) => <option key={item.rowNumber} value={item.rowNumber}>{item.rowNumber}행 · {item.customer || "거래처 미확인"} · {item.product}</option>)}</select></label><button type="button" className="dispatch-secondary-button" disabled={!items.some((item) => String(item.rowNumber) === extraRows[kind])} onClick={() => { const row = Number(extraRows[kind]); if (!items.some((item) => item.rowNumber === row)) return; saveExtra(kind, [...trips, { id: `extra:${Date.now()}:${Math.random().toString(36).slice(2)}`, leg: "one_way", rowNumbers: [row], fare: "" }]); setExtraRows((current) => ({ ...current, [kind]: "" })); }}>용차 운행 추가</button></div>
      {trips.map((trip) => <div className="simulation-trip-row" key={trip.id}><div className="simulation-trip-body"><strong>추가 운행 · {tripLabel(trip, new Map(items.map((item) => [item.rowNumber, item])))}</strong><div className="simulation-trip-fields"><label>운행<select value={trip.leg} onChange={(event) => saveExtra(kind, trips.map((entry) => entry.id === trip.id ? { ...entry, leg: event.target.value as CharterLeg } : entry))}><option value="one_way">편도</option><option value="round_trip">왕복</option></select></label><label>운임<input type="number" min="0" step="1" placeholder="미입력 시 20만" value={trip.fare} onChange={(event) => saveExtra(kind, trips.map((entry) => entry.id === trip.id ? { ...entry, fare: event.target.value } : entry))} /> 원</label><button type="button" className="dispatch-secondary-button" onClick={() => saveExtra(kind, trips.filter((entry) => entry.id !== trip.id))}>추가 운행 삭제</button></div></div></div>)}
    </div>;
  }
  function saveAddressOverrides(next: Record<string, string>) {
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
    setAddressOverrides(cleaned);
    setAddressDraft(cleaned);
    setAddressAck(false);
    setResult(null);
    setError("");
    try { if (file && date) localStorage.setItem(storageKey("simulation-addresses:v1", file, date), JSON.stringify(cleaned)); } catch { /* Storage may be unavailable. */ }
  }
  const unresolvedOwnAddresses = useMemo(() => {
    if (!addressCheck || addressCheck.key !== addressCheckKey) return [];
    return addressCheck.items.filter((item) => {
      const vehicle = item.vehicle ?? simulationVehicleName(item.transport);
      return !!vehicle && (item.addressIssue != null || item.lat == null);
    });
  }, [addressCheck, addressCheckKey]);
  const differingAddresses = addressCheck?.key === addressCheckKey ? addressCheck.items.filter((item) => item.addressWarning) : [];
  const portReferences = addressCheck?.key === addressCheckKey ? addressCheck.items.filter((item) => item.addressSource.includes("대표 지점")) : [];
  const unresolvedExternalAddresses = addressCheck?.key === addressCheckKey ? addressCheck.items.filter((item) => !(item.vehicle ?? simulationVehicleName(item.transport)) && (item.addressIssue != null || item.lat == null)) : [];
  async function run(mode: "load" | "regenerate" | "refresh" = "load") {
    if (!file) { setError("납품 일정표 엑셀을 선택해 주세요."); return; }
    if (!date) { setError("납품일을 선택해 주세요."); return; }
    if (mode !== "refresh" && (addressCheck?.key !== addressCheckKey || addressCheck.error)) { setError("납품 주소 확인을 완료한 뒤 다시 진행하세요."); return; }
    if (mode !== "refresh" && unresolvedOwnAddresses.length && !addressAck) {
      setError("자사 납품 주소 미확인 건을 먼저 확인하거나, 아래 안내에서 확인 후 분석을 진행하세요.");
      return;
    }
    setLoading(true); setError(""); const form = new FormData(); form.set("file", file); form.set("date", date); form.set("price", price); form.set("packing", JSON.stringify(packing)); form.set("excludedRows", JSON.stringify(excludedRows)); form.set("addressOverrides", JSON.stringify(addressOverrides)); form.set("mode", mode);
    try {
      const response = await fetch("/api/route/compare", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "시뮬레이션에 실패했습니다.");
      const next = data as SimulationResult;
      applyTripsFromResult(next, file, date, mode === "regenerate");
      savePreferences(file, date, { packing, price });
      setPackingDirty(false);
      setResult(next);
      setHistoryReview("확인 필요"); setHistoryMemo(""); setHistoryMessage("");
      setLastAction(mode === "refresh" ? "저장된 배차 유지 · 경로만 새로 조회" : next.restored ? "저장된 결과 불러옴" : "새 배차안 생성");
    } catch (err) { setError(err instanceof Error ? err.message : "시뮬레이션에 실패했습니다."); } finally { setLoading(false); }
  }
  const moved = result?.proposed.flatMap((route) => route.items.filter((item) => !item.vehicle).map((item) => ({ ...item, target: route.vehicle }))) ?? [];
  const courierItems = (items: SimulationItem[]) => items.filter((item) => !item.vehicle && !/용차/.test(item.transport) && /택배|경동/.test(item.transport));
  const originalCourier = result ? courierItems(result.items) : [];
  const proposedCourier = result?.proposed.length ? courierItems(result.remaining) : null;
  const originalCourierCost = courierTotal(originalCourier, courierChoices);
  const proposedCourierCost = proposedCourier ? courierTotal(proposedCourier, courierChoices) : null;
  const comparableCourier = comparableCourierCosts(originalCourierCost, proposedCourierCost);
  const courierCostsComplete = comparableCourier.included;
  const unpricedTransport = result ? unpricedTransportItems(result.items) : [];
  const availableRows = new Set(result?.items.map((item) => item.rowNumber) ?? []);
  const originalExtras = extraTrips.original.filter((trip) => trip.rowNumbers.every((row) => availableRows.has(row)));
  const proposedExtras = extraTrips.proposed.filter((trip) => trip.rowNumbers.every((row) => availableRows.has(row)));
  const complete = !!result && hasComparableRoutes(result);
  const total = (routes: SimulationRoute[]) => simulationTimeTotals(routes)?.total ?? 0;
  const cost = (routes: SimulationRoute[]) => routes.some((r) => r.items.length && (r.fuel == null || r.toll == null)) ? null : routes.reduce((n, r) => n + (r.fuel ?? 0) + (r.toll ?? 0), 0);
  const originalHasCharter = !!result?.items.some((item) => !item.vehicle && /용차/.test(item.transport));
  const excludedProposedTrips = proposedCharterTrips.filter((trip) => trip.excluded);
  const proposedTrips = result?.charterGroups == null ? null : proposedCharterTrips.length - excludedProposedTrips.length + proposedExtras.length;
  const proposedGroupingEdited = !!result?.charterGroups && charterGroupsSignature(result.charterGroups) !== charterGroupsSignature(proposedCharterTrips.map((trip) => ({ items: trip.rowNumbers.map((rowNumber) => ({ rowNumber })) })));
  const itemsByRow = useMemo(() => {
    const map = new Map<number, SimulationItem>();
    for (const item of result?.items ?? []) map.set(item.rowNumber, item);
    return map;
  }, [result]);
  const originalCharterCost = estimatedTripsCost([...originalCharterTrips, ...originalExtras]);
  const excludedOriginalTrips = originalCharterTrips.filter((trip) => trip.excluded);
  const activeOriginalTrips = originalCharterTrips.length - excludedOriginalTrips.length + originalExtras.length;
  const proposedCharterCost = result?.charterGroups == null ? null : estimatedTripsCost([...proposedCharterTrips, ...proposedExtras]);
  const compare = (vehicle: number | null, charter: number | null) => {
    const base = result ? cost(result.original) : null;
    if (!complete || packingDirty || base == null || vehicle == null || originalCharterCost == null || charter == null) return null;
    const original = base + originalCharterCost + comparableCourier.original; const proposed = vehicle + charter + comparableCourier.proposed;
    return { original, proposed, saving: original - proposed };
  };
  const comparison = result ? compare(cost(result.proposed), proposedCharterCost) : null;
  const originalTime = result ? simulationTimeTotals(result.original) : null;
  const proposedTime = result ? simulationTimeTotals(result.proposed) : null;
  const baseTrips = activeOriginalTrips;
  const baseVehicleCost = result && complete && !packingDirty ? cost(result.original) : null;
  const costIssues = result ? simulationCostIssues([{ label: "기존 계획", routes: result.original }, { label: "AI 제안", routes: result.proposed }], activeOriginalTrips, (originalHasCharter && (activeOriginalTrips > 0 || excludedOriginalTrips.length === 0)) || originalExtras.length > 0) : [];
  async function saveHistory() {
    if (!result || !file || packingDirty || loading) return;
    const excludedItems = excludedRows.map((rowNumber) => {
      const item = preview?.key === previewKey ? preview.items.find((row) => row.rowNumber === rowNumber) : undefined;
      return { rowNumber, customer: item?.customer ?? "미확인", product: item?.product ?? "미확인" };
    });
    const snapshot: SimulationHistorySnapshot = { version: 1, date, fileName: file.name, dieselPrice: price, excludedItems, result, originalTrips: originalCharterTrips, proposedTrips: proposedCharterTrips, originalExtras, proposedExtras, courierChoices, packing, review: historyReview, memo: historyMemo.trim() };
    setHistorySaving(true); setHistoryMessage("");
    try {
      const response = await fetch("/api/simulation/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", snapshot }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "분석 기록을 저장하지 못했습니다.");
      setHistoryMessage("분석 기록을 저장했습니다. 분석 기록에서 확인하세요.");
    } catch (err) { setHistoryMessage(err instanceof Error ? err.message : "분석 기록을 저장하지 못했습니다."); }
    finally { setHistorySaving(false); }
  }
  if (result && !complete) {
    const planned = new Set(result.original.flatMap((route) => route.items.map((item) => item.rowNumber)));
    const missing = result.items.filter((item) => item.vehicle && !planned.has(item.rowNumber));
    if (missing.length) costIssues.push(`기존 자사 납품 주소·경로 누락: ${missing.map((item) => `${item.rowNumber}행 ${item.customer}`).join(", ")}`);
  }
  return <section className="comparison-section" aria-labelledby="simulation-title"><h1 id="simulation-title">AI 배차 시뮬레이션</h1>
    <p>기존 계획과 AI 배차안을 비교합니다. 결과는 실제 일정에 반영되지 않습니다.</p>
    <p><a href="/simulation/history" className="dispatch-secondary-button">분석 기록 보기</a></p>
    <div className="comparison-controls"><label>일정표 파일 <input type="file" accept=".xlsx" disabled={loading} onChange={(e) => { const selected = e.target.files?.[0] ?? null; setFile(selected); setResult(null); restorePreferences(selected, date); setPackingDirty(false); }} /></label>
      <label>납품일 <input type="date" value={date} disabled={loading} onChange={(e) => { const selected = e.target.value; setDate(selected); setResult(null); restorePreferences(file, selected); setPackingDirty(false); }} /></label>
      <label>경유 가격 (원/L) <input type="number" min="1" value={price} disabled={loading} onChange={(e) => { const value = e.target.value; setPrice(value); setPriceSource("직접 입력한 경유 가격 · 수정 가능"); setResult(null); savePreferences(file, date, { packing, price: value }); }} placeholder="직접 입력" /></label>
      <button type="button" className="dispatch-secondary-button" disabled={loading || (!!file && (!!date && (preview?.key !== previewKey || !!preview.error || addressCheck?.key !== addressCheckKey || !!addressCheck?.error)))} onClick={() => void run("load")}>{loading ? "처리 중…" : "배차안 불러오기 / 만들기"}</button>
      {result ? <><button type="button" className="dispatch-secondary-button" disabled={loading || packingDirty} onClick={() => void run("refresh")}>현재 안의 경로 새로고침</button><button type="button" className="dispatch-secondary-button" disabled={loading || (unresolvedOwnAddresses.length > 0 && !addressAck)} onClick={() => void run("regenerate")}>AI 배차안 다시 만들기</button></> : null}</div>
    <p className="comparison-note">{priceSource} · 사람 계획은 엑셀 행 순서 · 자사 차량 왕복 · 1·2호차 연비 7.1km/L, 스타리아 11.6km/L(디젤 사양 참고, 실제 연료·사양 확인 필요)</p>
    <p className="comparison-note">같은 조건은 저장된 안을 불러옵니다. 교통 정보만 갱신하려면 경로 새로고침을 누르세요.</p>
    {file && date ? preview?.key !== previewKey ? <p className="comparison-note">선택한 날짜의 품목을 불러오는 중입니다.</p> : preview.error ? <p className="dispatch-route-note-warn">{preview.error}</p> : <details className="simulation-details"><summary>분석 제외 품목 선택 · {excludedRows.length}건 제외</summary><p className="comparison-note">샘플 등 제외할 품목에 체크하세요. 기존 계획과 AI안에서 모두 제외하며 원본 엑셀은 바뀌지 않습니다.</p>{preview.items.map((item) => <label key={item.rowNumber} className="simulation-packing-row"><input type="checkbox" disabled={loading} checked={excludedRows.includes(item.rowNumber)} onChange={(event) => { const next = event.target.checked ? [...excludedRows, item.rowNumber] : excludedRows.filter((row) => row !== item.rowNumber); setExcludedRows(next); setAddressAck(false); setResult(null); setError(""); try { localStorage.setItem(storageKey("simulation-excluded:v1", file, date), JSON.stringify(next)); } catch { /* Storage may be unavailable. */ } }} /> <span>{item.rowNumber}행 · {item.customer || "거래처 미확인"} · {item.location || "지역 미확인"} · {item.product} · {item.transport || "운송 미확인"}</span></label>)}</details> : null}
    {file && date && preview?.key === previewKey && !preview.error ? addressCheck?.key !== addressCheckKey ? <p className="comparison-note">납품 주소를 확인하는 중입니다.</p> : addressCheck.error ? <div><p className="dispatch-route-note-warn">{addressCheck.error}</p><button type="button" className="dispatch-secondary-button" disabled={loading} onClick={() => setAddressRetry((current) => current + 1)}>주소 확인 다시 시도</button></div> : <details className="simulation-details" open={unresolvedOwnAddresses.length > 0 || unresolvedExternalAddresses.length > 0 || differingAddresses.length > 0 || portReferences.length > 0}>
      <summary>분석 전 주소 확인 · 자사 미확인 {unresolvedOwnAddresses.length}건 · 외부 운송 미확인 {unresolvedExternalAddresses.length}건{differingAddresses.length ? ` · 입력 주소 지역 확인 ${differingAddresses.length}건` : ""}{portReferences.length ? ` · 항만 대표 지점 ${portReferences.length}건` : ""}</summary>
      <p className="comparison-note">주소가 확인되지 않은 자사 납품은 경로에서 빠지므로 공정한 비용 비교가 어렵습니다. 확인된 주소를 입력한 뒤 다시 분석하세요. 입력값은 이 브라우저에만 저장됩니다.</p>
      {unresolvedOwnAddresses.length ? <p className="dispatch-route-note-warn">미확인 주소가 있으면 기본으로 분석을 막습니다. 주소를 보완하거나, 아래 확인 후 진행을 선택하세요.</p> : <p className="comparison-note">현재 자사 납품 주소는 경로 계산에 사용할 수 있습니다. 실제 납품지와 일치하는지는 확인하세요.</p>}
      {differingAddresses.length ? <p className="dispatch-route-note-warn">입력 주소가 엑셀 지역과 다른 납품이 있습니다. 엑셀 지역 오류일 수도 있으니 실제 납품지를 확인하세요.</p> : null}
      {portReferences.length ? <p className="dispatch-route-note-warn">항만 대표 지점은 임시 비교용입니다. 실제 부두·터미널 주소가 있으면 아래에 입력하세요. 반입지에 따라 거리·시간·비용이 달라질 수 있습니다.</p> : null}
      {unresolvedExternalAddresses.length ? <p className="comparison-note">외부 운송 주소가 미확인이면 해당 품목의 자사 차량 전환을 검토할 수 없습니다. 해외 납품 등은 실제 운송 방식을 확인하세요.</p> : null}
      <ul className="simulation-address-list">{addressCheck.items.map((item) => {
        const unresolved = item.addressIssue != null || item.lat == null;
        return <li key={item.rowNumber} className={unresolved ? "is-unresolved" : undefined}>
          <div><strong>{item.rowNumber}행 · {item.customer || "거래처 미확인"}</strong><span> · {item.location || "지역 미입력"} · {item.transport || "운송 미확인"}</span>
            <p>{item.address || "주소 미확인"} ({item.addressSource}){item.addressIssue ? ` · ${item.addressIssue}` : item.lat == null ? " · 좌표 미확인" : ""}{item.addressWarning ? ` · 입력 주소 확인 필요: ${item.addressWarning}` : ""}</p></div>
          <label>확인 주소 <input type="text" maxLength={300} disabled={loading} placeholder="도로명 주소 입력 후 포커스를 벗어나면 적용" value={addressDraft[String(item.rowNumber)] ?? ""} onChange={(event) => setAddressDraft((current) => ({ ...current, [String(item.rowNumber)]: event.target.value }))} onBlur={() => {
            const value = addressDraft[String(item.rowNumber)] ?? "";
            const next = { ...addressOverrides };
            if (value.trim()) next[String(item.rowNumber)] = value.trim();
            else delete next[String(item.rowNumber)];
            if ((addressOverrides[String(item.rowNumber)] ?? "") === (next[String(item.rowNumber)] ?? "")) return;
            saveAddressOverrides(next);
          }} /></label>
        </li>;
      })}</ul>
      {unresolvedOwnAddresses.length ? <label className="simulation-packing-row"><input type="checkbox" checked={addressAck} disabled={loading} onChange={(event) => setAddressAck(event.target.checked)} /> 주소 미확인 상태로도 분석을 진행합니다. 해당 납품은 경로·비용 비교에서 빠질 수 있습니다.</label> : null}
    </details> : null}
    {error ? <p className="dispatch-route-note-warn">{error}</p> : null}
    {result ? <><p>{result.items.length}품목 · {lastAction || (result.restored ? "저장된 배차안" : "새 배차안")}</p>
      {result.warnings.length ? <p className="dispatch-route-note-warn">주소·경로 등 확인 사항 {result.warnings.length}건이 있습니다. 분석 리포트에서 확인하세요.</p> : null}
      {packingDirty ? <p className="dispatch-route-note-warn">적재 방식을 변경했습니다. 아래는 이전 결과입니다. 배차안을 불러오거나 다시 만드세요.</p> : null}
      <div className="comparison-result" aria-label="예상 비용 비교">
        <h3>배차 결과 비교</h3>
        {!result.candidateCountVerified && result.candidateCount != null ? <p className="dispatch-route-note-warn">저장된 결과의 후보 수 확인이 필요합니다. 분석 리포트를 확인하세요.</p> : null}
        {/실패|오류|한도 초과|시간 초과/.test(`${result.note} ${result.comparisonNote ?? ""}`) ? <p className="dispatch-route-note-warn">AI 분석 과정에 확인 사항이 있습니다. 분석 리포트를 확인하세요.</p> : null}
        {planHasOverLimit(result.proposed) ? <p className="dispatch-route-note-warn"><strong>AI 안은 알려진 적재 한도 초과로 운행 가능으로 보지 않습니다. 아래 금액은 참고용입니다.</strong></p> : null}
        {planHasUnknownLoad(result.original) || planHasUnknownLoad(result.proposed) ? <p className="dispatch-route-note-warn"><strong>미확인 적재 품목이 있는 안은 현장 확인 전까지 운행 가능으로 판단하지 마세요.</strong> 차량별 확인된 PLT·중량과 미확인 품목을 함께 확인하세요.</p> : null}
        {result.proposed.some((route) => route.items.some((item) => item.packing === "shared" || item.packing === "loose")) ? <p className="dispatch-route-note-warn">적재 방식·공간 확인이 필요합니다.</p> : null}
        {excludedOriginalTrips.length ? <p className="dispatch-route-note-warn"><strong>기존 용차 {excludedOriginalTrips.length}회 비용 제외 중: AI안과 납품 비용을 같은 조건으로 비교할 수 없습니다.</strong></p> : null}
        {excludedProposedTrips.length ? <p className="dispatch-route-note-warn"><strong>AI 용차 {excludedProposedTrips.length}회 비용 제외 중: 납품 비용을 같은 조건으로 비교할 수 있는지 확인하세요.</strong></p> : null}
        {proposedGroupingEdited ? <p className="dispatch-route-note-warn"><strong>AI 제안의 용차 묶음을 사용자가 직접 변경했습니다. AI 제안 비용은 수정된 운행 기준이며 실제 경유·운임 확인이 필요합니다.</strong></p> : null}
        {originalExtras.length || proposedExtras.length ? <p className="dispatch-route-note-warn">추가 용차는 운송 배정을 바꾸지 않고 비용에만 반영됩니다. 기존 운행과 중복되지 않는지 확인하세요.</p> : null}
        {!courierCostsComplete ? <p className="dispatch-route-note-warn"><strong>택배 출고 방식 또는 수량이 미확인이라 양쪽 비용에서 택배비 전체를 제외했습니다. 전체 배송비나 실제 절감액으로 판단하지 마세요.</strong></p> : null}
        {unpricedTransport.length ? <p className="dispatch-route-note-warn"><strong>운송 방식 미확인 또는 기타 운송 {unpricedTransport.length}품목의 비용이 양쪽에서 빠져 있습니다.</strong> {unpricedTransport.map((item) => `${item.rowNumber}행 ${item.customer || "거래처 미확인"}`).join(" · ")}의 운송 방식과 비용을 확인하세요.</p> : null}
        <div className="simulation-charts">
          {comparison && baseVehicleCost != null && originalCharterCost != null && proposedCharterCost != null && cost(result.proposed) != null ? <ComparisonBars title={courierCostsComplete ? "예상 비용" : "예상 비용 (택배비 제외)"} original={comparison.original} proposed={comparison.proposed} format={money} isCost costParts={{
            original: { vehicle: baseVehicleCost, charter: originalCharterCost, courier: courierCostsComplete ? originalCourierCost : null },
            proposed: { vehicle: cost(result.proposed)!, charter: proposedCharterCost, courier: courierCostsComplete ? proposedCourierCost : null },
          }} /> : <div className="simulation-chart"><h4>예상 비용</h4><p className="dispatch-route-note-warn">비교 금액 확인 필요</p>{["기존 계획", "AI 제안"].map((label) => <div className="simulation-chart-row" key={label}><span>{label}</span><div className="simulation-chart-track" aria-hidden="true" /><strong>확인 필요</strong></div>)}<p className="comparison-note">{packingDirty ? "적재 방식 변경을 적용하려면 배차안을 다시 만드세요." : originalCourierCost == null || proposedCourierCost == null ? "택배 품목의 박스·파렛트 출고 방식과 수량을 확인하세요." : costIssues.length ? costIssues.join(" / ") : originalCharterCost == null ? "기존 용차 운행·운임을 확인하세요." : proposedCharterCost == null ? "AI 용차 운행·운임을 확인하세요." : "주소와 경로·운임을 확인하세요."}</p></div>}
          {complete && !packingDirty && originalTime && proposedTime ? <ComparisonBars title="자사 차량 총 소요 시간 합계" original={originalTime.total} proposed={proposedTime.total} timeParts={{ original: originalTime, proposed: proposedTime }} format={(n) => `${n.toLocaleString("ko-KR")}분`} /> : <div className="simulation-chart"><h4>자사 차량 총 소요 시간 합계</h4><p className="dispatch-route-note-warn">주소·경로 또는 적재 설정을 확인하세요.</p></div>}
        </div>
        <VisitOrderCompare routes={result.original} />
        <details className="simulation-details"><summary>그래프의 차량별 경로·적재 품목 보기</summary><p className="comparison-note">각 차량을 확인하세요. PLT 미확인 품목은 합계에 포함되지 않습니다.</p><div className="comparison-plans"><Plan title="기존 계획" routes={result.original} /><Plan title="AI 제안" routes={result.proposed} /></div></details>
        {comparison ? <>
          {proposedTrips != null && baseTrips != null && baseVehicleCost != null && cost(result.proposed) != null ? <p>AI 제안 비용 변화: 용차비 <strong>{difference(proposedCharterCost, originalCharterCost, money)}</strong> · 자사 경유비·통행료 <strong>{difference(cost(result.proposed), baseVehicleCost, money)}</strong> · 택배비 <strong>{difference(proposedCourierCost, originalCourierCost, money)}</strong></p> : null}
          <p className="simulation-charter-summary">용차 운행: 기존 <strong>{activeOriginalTrips}회</strong> · AI 제안 <strong>{proposedTrips}회</strong> · 미입력 운임은 1회 200,000원 가정</p>
          </> : <p className="dispatch-route-note-warn">{packingDirty ? "적재 방식 변경을 적용하려면 배차안을 불러오거나 다시 만드세요." : "택배 출고 방식·수량, 용차 운임 또는 주소·경로를 확인하세요."}</p>}
        {!comparison && costIssues.length ? <p className="dispatch-route-note-warn">비용 확인 필요: {costIssues.join(" / ")}. 통행료는 경로가 여러 구간으로 나뉘면 중복을 피하기 위해 미확인으로 처리될 수 있습니다.</p> : null}
        {proposedCourier && originalCourier.length !== proposedCourier.length ? <p className="dispatch-route-note-warn">기존안과 AI안의 택배 품목이 다릅니다. AI 후보 선택에는 택배비가 반영되지 않았습니다.</p> : null}
        <details className="simulation-details"><summary>택배 품목: 기존 {originalCourier.length}건 · AI 제안 {proposedCourier == null ? "확인 필요" : `${proposedCourier.length}건`} 보기</summary>
          <p className="comparison-note">박스당 7,000원, 파렛트당 50,000원입니다. 출고 방식이 불명확하면 직접 선택하세요. 제품 기준표의 PLT는 추정값이며 합적된 다른 행은 실제 PLT를 0으로 입력해 중복 계산을 피할 수 있습니다.</p>
          {[{ label: "기존 계획", items: originalCourier }, { label: "AI 제안", items: proposedCourier }].map(({ label, items }) => <div key={label}><strong>{label} 택배 · {items == null ? "확인 필요" : money(courierTotal(items, courierChoices))}</strong>{items == null ? <p>AI 제안을 확인해 주세요.</p> : items.length ? <ul>{items.map((item) => { const choice = courierChoices[String(item.rowNumber)]; const estimate = courierCost(item, choice); return <li key={item.rowNumber}>{item.rowNumber}행 · {item.customer || "거래처 미확인"} · {item.product} · {item.location || "지역 미확인"} · {estimate ? `${estimate.quantity}${estimate.mode === "box" ? "박스" : "PLT"} / ${money(estimate.amount)}` : "출고 방식·수량 확인 필요"} <label>출고 방식 <select value={choice?.mode ?? "auto"} onChange={(event) => updateCourier(item.rowNumber, event.target.value === "auto" ? null : { mode: event.target.value as "box" | "pallet" })}><option value="auto">엑셀 자동 확인</option><option value="box">박스</option><option value="pallet">파렛트</option></select></label>{choice ? <label> {choice.mode === "box" ? "실제 박스 수" : "실제 PLT"} <input type="number" min={choice.mode === "box" ? "1" : "0"} step="1" placeholder={choice.mode === "box" ? (item.boxes != null && Number.isSafeInteger(item.boxes) && item.boxes > 0 ? `엑셀 ${item.boxes}` : "박스 수 입력") : (item.pallets == null ? "PLT 입력" : `추정 ${item.pallets}`)} value={choice.quantity ?? ""} onChange={(event) => { const value = event.target.value; const number = Number(value); const valid = value !== "" && Number.isSafeInteger(number) && (choice.mode === "box" ? number > 0 : number >= 0); updateCourier(item.rowNumber, valid ? { mode: choice.mode, quantity: number } : { mode: choice.mode }); }} /></label> : null}</li>; })}</ul> : <p>택배 품목 없음</p>}</div>)}
        </details>
        <p className="comparison-note">시간은 자사 차량별 운전 + 점심 60분 + 업체별 하차 40분(현담산업 180분)의 합입니다. 용차·택배·기타 대기 시간은 제외됩니다. 비용에는 인건비가 빠져 있으며 AI 후보 선택에는 택배비와 수동 추가 용차가 반영되지 않습니다.</p>
        <details className="simulation-details"><summary><span className="simulation-closed-label">용차 운행·운임 조정</span><span className="simulation-open-label">용차 운행·운임 접기</span></summary>
        <p className="comparison-note">운행 1건에 운임 1금액입니다. 편도는 납품 또는 회수, 왕복은 납품(+경유) 후 P박스 회수까지 패키지 총액입니다. 여러 목적지를 묶어 한 용차로 처리할 수 있습니다. 미입력 운임은 1회 20만 원으로 가정합니다. 입력값은 이 브라우저에 파일·날짜별로 저장됩니다.</p>
        <div className="simulation-trip-columns">
          <section className="simulation-trip-column" aria-label="기존 계획 용차">
            <h5 className="simulation-trip-heading">기존 계획 용차 · {activeOriginalTrips}회{excludedOriginalTrips.length ? ` · 비용 제외 ${excludedOriginalTrips.length}회` : ""}</h5>
            {renderExtraTrips("original", result.items, originalExtras)}
            {excludedOriginalTrips.length ? <p className="dispatch-route-note-warn">기존 계획에서 용차 비용을 제외했습니다. 해당 납품은 AI안에 남아 있어 안별 비용을 같은 조건으로 비교할 수 없습니다. 실제 납품 일정은 변경되지 않습니다.</p> : null}
            {!originalCharterTrips.length ? <p className="comparison-note">기존 계획에 용차 품목이 없습니다.</p> : null}
            <div className="comparison-controls">
              <button type="button" className="dispatch-secondary-button" disabled={selectedTripIds.length < 2} onClick={() => { persistTrips({ original: mergeCharterTrips(originalCharterTrips, selectedTripIds) }); setSelectedTripIds([]); }}>선택 운행 묶기</button>
              <p className="comparison-note">체크한 기존 운행을 한 용차로 합칩니다. 예: DIC + GMB.</p>
            </div>
            {originalCharterTrips.map((trip) => (
              <div key={trip.id} className="simulation-trip-row">
                <label className="simulation-trip-select"><input type="checkbox" disabled={trip.excluded} checked={selectedTripIds.includes(trip.id)} onChange={(e) => setSelectedTripIds((ids) => e.target.checked ? [...ids, trip.id] : ids.filter((id) => id !== trip.id))} aria-label={`${tripLabel(trip, itemsByRow)} 선택`} /></label>
                <div className="simulation-trip-body">
                  <strong>{tripLabel(trip, itemsByRow)}{trip.excluded ? " · 비용 제외" : ""}</strong>
                  <div className="simulation-trip-fields">
                    <label>운행<select value={trip.leg} onChange={(e) => updateTripList("original", trip.id, { leg: e.target.value as CharterLeg })}><option value="one_way">편도</option><option value="round_trip">왕복</option></select></label>
                    <label>운임<input type="number" min="0" step="1" placeholder="미입력 시 20만" value={trip.fare} onChange={(e) => updateTripList("original", trip.id, { fare: e.target.value })} /> 원</label>
                    <button type="button" className="dispatch-secondary-button" disabled={trip.excluded || trip.rowNumbers.length < 2} onClick={() => persistTrips({ original: [...originalCharterTrips.filter((row) => row.id !== trip.id), ...splitCharterTrip(trip, charterItemsFromPlan(result.items))] })}>분리</button>
                    {trip.id.includes(":return:") ? <button type="button" className="dispatch-secondary-button" onClick={() => { persistTrips({ original: originalCharterTrips.filter((row) => row.id !== trip.id) }); setSelectedTripIds((ids) => ids.filter((id) => id !== trip.id)); }}>회수 운행 삭제</button> : <><button type="button" className="dispatch-secondary-button" disabled={trip.excluded} onClick={() => persistTrips({ original: [...originalCharterTrips, addReturnCharterTrip(trip)] })}>회수 편도 추가</button><button type="button" className="dispatch-secondary-button" onClick={() => { updateTripList("original", trip.id, { excluded: !trip.excluded }); setSelectedTripIds((ids) => ids.filter((id) => id !== trip.id)); }}>{trip.excluded ? "비용에 다시 포함" : "비용에서 제외"}</button></>}
                  </div>
                </div>
              </div>
            ))}
          </section>
          <section className="simulation-trip-column" aria-label="AI 제안 용차">
            <h5 className="simulation-trip-heading">AI 제안 용차 · {proposedTrips ?? 0}회{excludedProposedTrips.length ? ` · 비용 제외 ${excludedProposedTrips.length}회` : ""}</h5>
            {renderExtraTrips("proposed", result.items, proposedExtras)}
            {excludedProposedTrips.length ? <p className="dispatch-route-note-warn">AI 제안에서 선택한 용차 비용만 제외했습니다. 납품 품목은 그대로이며 실제 운행 및 양쪽 비교 조건을 확인하세요.</p> : null}
            <p className="comparison-note">목적지별로 분리하거나 묶고 회수 편도를 추가할 수 있습니다. 변경한 운행의 운임을 다시 입력하세요. 미입력 시 20만 원을 가정합니다. 실제 경유·적재 가능 여부를 확인하세요. 원래 묶음으로 되돌리거나 AI 배차안을 다시 만들면 AI 용차 운임 입력값도 초기화됩니다.</p>
            <div className="comparison-controls"><button type="button" className="dispatch-secondary-button" disabled={selectedProposedTripIds.length < 2} onClick={() => { const merged = mergeCharterTrips(proposedCharterTrips, selectedProposedTripIds); persistTrips({ proposed: merged.map((trip) => trip.id.startsWith("original:merged:") && !proposedCharterTrips.some((old) => old.id === trip.id) ? { ...trip, fare: "" } : trip) }); setSelectedProposedTripIds([]); }}>선택 운행 묶기</button><button type="button" className="dispatch-secondary-button" disabled={!result.charterGroups} onClick={() => { persistTrips({ proposed: tripsFromCharterGroups(result.charterGroups ?? [], "proposed") }); setSelectedProposedTripIds([]); }}>AI 원래 묶음으로 되돌리기</button></div>
            {!proposedCharterTrips.length ? <p className="comparison-note">{proposedTrips == null ? "AI 용차 묶음이 없습니다." : "AI가 용차 없이 처리하는 안입니다."}</p> : null}
            {proposedCharterTrips.map((trip) => (
              <div key={trip.id} className="simulation-trip-row">
                {!trip.id.includes(":return:") ? <label className="simulation-trip-select"><input type="checkbox" disabled={trip.excluded} checked={selectedProposedTripIds.includes(trip.id)} onChange={(e) => setSelectedProposedTripIds((ids) => e.target.checked ? [...ids, trip.id] : ids.filter((id) => id !== trip.id))} aria-label={`AI 제안 ${tripLabel(trip, itemsByRow)} 선택`} /></label> : null}
                <div className="simulation-trip-body">
                  <strong>{tripLabel(trip, itemsByRow)}{trip.excluded ? " · 비용 제외" : ""}</strong>
                  <div className="simulation-trip-fields">
                    <label>운행<select value={trip.leg} disabled={trip.id.includes(":return:")} onChange={(e) => updateTripList("proposed", trip.id, { leg: e.target.value as CharterLeg })}><option value="one_way">편도</option><option value="round_trip">왕복</option></select></label>
                    <label>운임<input type="number" min="0" step="1" placeholder="미입력 시 20만" value={trip.fare} onChange={(e) => updateTripList("proposed", trip.id, { fare: e.target.value })} /> 원</label>
                    {trip.id.includes(":return:") ? <button type="button" className="dispatch-secondary-button" onClick={() => persistTrips({ proposed: proposedCharterTrips.filter((row) => row.id !== trip.id) })}>회수 운행 삭제</button> : <><button type="button" className="dispatch-secondary-button" disabled={trip.excluded || splitCharterTrip(trip, result.items).length < 2} onClick={() => { const parts = splitCharterTrip(trip, result.items).map((part) => ({ ...part, id: `proposed:split:${trip.id}:${part.id}`, fare: "" })); persistTrips({ proposed: [...proposedCharterTrips.filter((row) => row.id !== trip.id), ...parts] }); setSelectedProposedTripIds((ids) => ids.filter((id) => id !== trip.id)); }}>목적지별 분리</button><button type="button" className="dispatch-secondary-button" disabled={trip.excluded} onClick={() => persistTrips({ proposed: [...proposedCharterTrips, addReturnCharterTrip(trip)] })}>회수 편도 추가</button><button type="button" className="dispatch-secondary-button" onClick={() => { updateTripList("proposed", trip.id, { excluded: !trip.excluded }); setSelectedProposedTripIds((ids) => ids.filter((id) => id !== trip.id)); }}>{trip.excluded ? "비용에 다시 포함" : "비용에서 제외"}</button></>}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div></details>
      </div>
      <section className="simulation-run-info" aria-label="분석 기록 저장"><h3>분석 결과 저장</h3><p className="comparison-note">현재 분석과 용차·택배 조정값을 별도 기록으로 저장합니다. 같은 날짜도 여러 번 저장할 수 있습니다.</p><div className="comparison-controls"><label>검토 상태 <select value={historyReview} onChange={(event) => setHistoryReview(event.target.value as HistoryReview)}><option>확인 필요</option><option>검토 완료</option><option>실행 곤란</option></select></label><label>검토 메모 <input type="text" maxLength={2000} value={historyMemo} onChange={(event) => setHistoryMemo(event.target.value)} placeholder="확인한 사항이나 미확인 사항" /></label><button type="button" className="dispatch-secondary-button" disabled={historySaving || loading || packingDirty} onClick={() => void saveHistory()}>{historySaving ? "저장 중…" : "분석 결과 저장"}</button><a href="/simulation/history" className="dispatch-secondary-button">분석 기록 보기</a></div>{packingDirty ? <p className="dispatch-route-note-warn">변경한 적재 설정을 적용한 뒤 저장하세요.</p> : null}{historyMessage ? <p role="status">{historyMessage}</p> : null}</section>
      <details className="simulation-details"><summary><span className="simulation-closed-label">분석 리포트 보기</span><span className="simulation-open-label">분석 리포트 접기</span></summary>
      <div className="simulation-run-info" aria-label="결과 기준">
        <strong>이 결과의 기준</strong>
        <p>파일 {file?.name || "확인 불가"} · 납품일 {date} · 경유 {price ? `${Number(price).toLocaleString("ko-KR")}원/L` : "미입력"} · 박스 적재 설정 {Object.keys(packing).length}품목{packingDirty ? " (변경 전 결과)" : ""} · 조건 식별번호 {result.inputFingerprint || "미확인"}</p>
        <p>기존·AI 배차안 생성 {result.savedAt ? new Date(result.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"} · 기존·AI 경로 조회 {result.routeUpdatedAt ? new Date(result.routeUpdatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"}</p>
        <p>조건 식별번호는 파일 내용·납품일·경유 가격·적재 설정·주소·계산 버전을 구분합니다. 화면에서 변경한 용차 운행·운임과 택배 출고 방식·수량은 포함되지 않습니다.</p>
      </div>
      {result.warnings.map((w) => <p className="dispatch-route-note-warn" key={w}>{w}</p>)}
      {!result.candidateCountVerified && result.candidateCount != null ? <p className="dispatch-route-note-warn">이전에 저장된 결과의 후보 수에는 적재 한도 초과 후보가 포함됐을 수 있습니다. 정확한 유효 후보 수는 AI 배차안을 다시 만들면 확인할 수 있습니다.</p> : null}
      {result.items.some((item) => item.packing === "auto" && item.pallets != null) ? <p className="comparison-note">별도 설정이 없는 품목은 제품 기준표의 1PLT당 박스 수로 PLT를 추정합니다. 실제 합적·적재 방식은 확인이 필요합니다.</p> : null}
      <p className="comparison-note">부등호는 값의 크기 순서입니다. 낮은 비용이 실제 최적 배차를 뜻하지는 않습니다.</p>
      <p className="comparison-note">시간은 자사 차량별 운전·점심·하차 시간의 합이며 기타 대기 및 용차·택배 시간은 제외됩니다. 점심은 운행 차량당 60분, 하차는 거래처·주소별 40분(현담산업 180분)입니다. 용차비 미입력 시 1회 20만 원을 가정합니다. 택배비는 박스당 7,000원 또는 파렛트당 50,000원으로 계산하며 인건비는 제외됩니다.</p>
      {excludedRows.length ? <p className="comparison-note">분석에서 제외: {preview?.key === previewKey ? preview.items.filter((item) => excludedRows.includes(item.rowNumber)).map((item) => `${item.rowNumber}행 ${item.customer} · ${item.product}`).join(" / ") : `${excludedRows.length}품목`}</p> : null}
      <p className="comparison-note">{result.note} · 납품 기한·긴급 여부·택배 마감·실제 하차 시간은 미확인이므로 실제 운행 가능성을 확인해야 합니다.</p>
      {result.savedAt ? <p className="comparison-note">배차안 생성: {new Date(result.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · 경로 조회: {result.routeUpdatedAt ? new Date(result.routeUpdatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"} · 후보 {result.candidateCount ?? 0}개 · {result.planSource || "Groq"}</p> : null}
      {result.comparisonNote ? <p className="comparison-note">{result.comparisonNote}</p> : null}
      <details><summary>전체 품목의 주소 확인</summary><p>엑셀 도착지를 우선 사용하며, 주소가 없거나 엑셀 지역과 다르면 업체명과 지역이 일치하는 카카오 장소를 찾아 참고합니다. 검색 후보는 실제 납품지 확인이 필요합니다.</p><ul>{result.items.map((item) => <li key={item.rowNumber}>{item.rowNumber}행 · {item.customer || "업체 미확인"} · 엑셀 지역 {item.location || "미입력"} · {item.address || "주소 미확인"} ({item.addressSource || "출처 미확인"}){item.addressIssue ? ` · ${item.addressIssue} (경로 제외)` : item.lat == null ? " · 좌표 미확인 (경로 제외)" : ""}</li>)}</ul></details>
      <details><summary>품목별 박스 적재 방식 설정</summary><p>기본값은 제품 기준표로 PLT를 추정합니다. 기준이나 박스 수가 없으면 확인 필요로 표시합니다. 합적·별도 박스를 선택해도 공간과 고정 가능 여부는 현장에서 확인해야 합니다. 변경 후 배차안을 불러오거나 다시 만드세요.</p>
        {result.items.map((item) => <label key={item.rowNumber} className="simulation-packing-row"><span>{item.rowNumber}행 · {item.customer || "업체 미확인"} · {item.product} · {item.boxes == null ? "박스 수 미확인" : `${item.boxes}박스`} · {item.pallets == null ? "PLT 확인 필요" : `${item.pallets} PLT${item.packing === "auto" ? " (기준표 추정)" : ""}`}</span><select disabled={loading} value={packing[String(item.rowNumber)] ?? "auto"} onChange={(e) => { const next = { ...packing, [String(item.rowNumber)]: e.target.value as PackingMode }; setPacking(next); savePreferences(file, date, { packing: next, price }); setPackingDirty(true); }}><option value="auto">제품 기준표 적용</option><option value="unknown">확인 필요</option><option value="shared">기존 PLT에 합적</option><option value="loose">별도 박스 적재</option><option value="pallet">별도 PLT 필요</option></select></label>)}
      </details>
      <div className="comparison-plans"><Plan title="기존 배차 계획" routes={result.original} external={result.items.filter((item) => !item.vehicle)} /><Plan title="AI 시뮬레이션" routes={result.proposed} external={result.proposed.length ? result.remaining : undefined} /></div>
      <h3>AI가 처음 제안한 용차 운행 {result.charterGroups == null ? "" : `(${result.charterGroups.length}회)`}</h3><p className="comparison-note">위에서 직접 조정한 용차 묶음과 다를 수 있습니다.</p>
      {result.charterGroups == null ? <p>AI 용차 묶음을 만들지 못했습니다. 다시 시도하세요.</p> : result.charterGroups.length === 0 ? <p>AI가 용차 운행 없이 처리하는 안을 제안했습니다.</p> : <ol>{result.charterGroups.map((group, index) => <li key={index}><strong>용차 {index + 1}회:</strong> {group.items.map((item) => `${item.customer || "업체 미확인"} (${item.rowNumber}행 · ${item.product})`).join(" / ")}</li>)}</ol>}
      <p className="dispatch-route-note-warn">AI가 묶은 용차는 차량 톤수·적재량, 납품 기한과 경유 가능 여부가 미확인인 후보입니다. 실제 운행과 1회 운임으로 확정된 결과가 아닙니다.</p>
      {complete ? <p><strong>자사 차량 총 소요 합계:</strong> 기존 {total(result.original)}분 / {money(cost(result.original))} · 제안 {total(result.proposed)}분 / {money(cost(result.proposed))} (운전·점심·하차 시간 / 경유비·통행료) · {total(result.proposed) === total(result.original) ? "시간 차이 없음" : `제안 ${Math.abs(total(result.proposed) - total(result.original))}분 ${total(result.proposed) > total(result.original) ? "증가" : "감소"}`}</p> : <p className="comparison-note">누락된 자사 납품이나 경로가 있으면 전체 자사 차량 소요 합계는 비교하지 않습니다.</p>}
      <h3>용차·택배에서 자사 차량으로 제안한 품목 ({moved.length})</h3>{moved.length ? <ul>{moved.map((i) => <li key={i.rowNumber}>{i.rowNumber}행 · {i.customer} · {i.product} · {i.transport} → {i.target}</li>)}</ul> : <p>제안된 이동 품목이 없습니다. 주소와 AI 응답 상태를 확인하세요.</p>}
      <p className="comparison-note">위 비용은 입력한 용차 운임과 택배 출고 방식·수량을 기준으로 합니다. 택배비는 후보 선택에는 반영되지 않으며 기사 인건비 등은 포함하지 않습니다. <a href="https://kdexp.com/service/charge/package_standard.do" target="_blank" rel="noreferrer">경동택배 표준운임 기준</a></p>
      <p className="comparison-note">경로 시간·통행료는 조회 시점 기준이며 과거 운행 실적이 아닙니다. 하차·점심은 고정 가정이며 기타 대기는 제외합니다. AI 제안은 최적해를 보장하지 않습니다.</p></details></> : null}
  </section>;
}
