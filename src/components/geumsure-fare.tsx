"use client";

import { useState, useSyncExternalStore } from "react";

const fares = {
  광주광역시: [[160000, 180000], [220000, 240000], [240000, 260000], [280000, 300000]],
  "경남 김해": [[180000, 200000], [260000, 280000], [280000, 300000], [320000, 340000]],
  "경남 창원 (부산신항)": [[180000, 200000], [260000, 280000], [280000, 300000], [320000, 340000]],
} as const;
const sizes = ["1톤~", "3.5톤", "5톤"];
const fareIndexes = [0, 2, 3];
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("geumsure-fare-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("geumsure-fare-change", callback);
  };
};

export function GeumsureFare({ date }: { date: string }) {
  const [region, setRegion] = useState<keyof typeof fares>("광주광역시");
  const [size, setSize] = useState(0);
  const key = `geumsure-fare:${date}:vehicle:${region}:${fareIndexes[size]}`;
  const actual = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
  }, () => "");

  const range = fares[region][fareIndexes[size]] ?? fares[region][0];
  const format = (amount: number) => amount.toLocaleString("ko-KR");
  return (
    <section className="dispatch-vehicle-panel geumsure-fare">
      <h2>배송 금액 · 금수레</h2>
      <p className="dispatch-side-meta">표준 운임 참고 · 실제 운임은 업체 확인</p>
      <label>도착지
        <select className="dispatch-select" value={region} onChange={(e) => setRegion(e.target.value as keyof typeof fares)}>
          {Object.keys(fares).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label>차량 톤수
        <select className="dispatch-select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {sizes.map((name, i) => <option key={name} value={i}>{name}</option>)}
        </select>
      </label>
      <p className="geumsure-fare-result">예상 운임 <strong>{`${format(range[0])}~${format(range[1])}`}원</strong></p>
      <label>실제 청구액 메모 (원)
        <input className="dispatch-input" inputMode="numeric" value={actual} placeholder="업체 확인 후 입력" onChange={(e) => {
          const value = e.target.value.replace(/[^0-9]/g, "");
          try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
          window.dispatchEvent(new Event("geumsure-fare-change"));
        }} />
      </label>
      <p className="dispatch-side-meta">청구액 메모는 이 브라우저에 날짜·선택 조건별로 저장됩니다. 여러 건을 구분하는 정산 내역은 아닙니다. 표에 없는 지역과 다중 경유 운임은 별도 확인하세요.</p>
    </section>
  );
}
