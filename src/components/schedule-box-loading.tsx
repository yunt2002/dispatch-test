"use client";

import { updateBoxLoading } from "@/app/schedule/actions";
import { boxLoadingLabel, type BoxLoadingMode } from "@/lib/schedule-box-loading";

export function ScheduleBoxLoading({ id, date, mode, pallets, target, returnTo }: { id: string; date: string; mode: BoxLoadingMode | null; pallets: number | null; target: string; returnTo: "request" | "confirm" }) {
  return <details className="dispatch-group-edit"><summary>박스 적재: {boxLoadingLabel(mode)}{mode === "pallet" && pallets != null ? ` · ${pallets} PLT` : ""}</summary>
    {!mode ? <p>기존 납품입니다. 기존 계산값 {pallets == null ? "미확인" : `${pallets} PLT`}을 유지 중입니다. 실제 적재 방식을 확인하고 저장해 주세요.</p> : null}
    <form action={updateBoxLoading} className="dispatch-group-edit-form">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="returnTo" value={returnTo} />
      <label>적재 방식<select className="dispatch-select" name="loadingMode" defaultValue={mode ?? "unknown"}>
        <option value="unknown">확인 필요 · 추가 0 PLT</option><option value="shared">기존 PLT 합적 · 추가 0 PLT</option><option value="loose">별도 박스 적재 · 추가 0 PLT</option><option value="pallet">별도 PLT 사용</option>
      </select></label>
      <label>별도 PLT 수량 (별도 PLT 사용 시)<input className="dispatch-input" type="number" name="extraPallets" min="1" step="1" defaultValue={mode === "pallet" && pallets ? pallets : ""} /></label>
      <label>합적 대상 (기존 PLT 합적 시, 선택)<input className="dispatch-input" name="loadingTarget" maxLength={120} defaultValue={target} placeholder="예: 만도브로제 A 제품 파렛트" /></label>
      <p>합적 대상은 확인용 메모이며 다른 납품에 자동 연결하지 않습니다. 0 PLT도 공간·고정과 중량 확인이 필요합니다.</p>
      <button type="submit" className="dispatch-secondary-button dispatch-card-action">적재 방식 저장</button>
    </form>
  </details>;
}
