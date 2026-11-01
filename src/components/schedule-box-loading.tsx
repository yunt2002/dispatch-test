"use client";

import { updateBoxLoading } from "@/app/schedule/actions";
import { boxLoadingLabel, type BoxLoadingMode } from "@/lib/schedule-box-loading";

export function ScheduleBoxLoading({ id, date, mode, pallets, returnTo }: { id: string; date: string; mode: BoxLoadingMode | null; pallets: number | null; returnTo: "request" | "confirm" }) {
  return <details className="dispatch-group-edit"><summary>박스 적재: {boxLoadingLabel(mode)}</summary>
    {!mode ? <p>기존 납품입니다. 기존 PLT 수량을 유지 중이며 실제 적재 방식을 확인해 주세요.</p> : null}
    <form action={updateBoxLoading} className="dispatch-group-edit-form">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="returnTo" value={returnTo} />
      <label>적재 방식<select className="dispatch-select" name="loadingMode" defaultValue={mode ?? "unknown"}>
        <option value="unknown">확인 필요 · 추가 0 PLT</option><option value="shared">기존 PLT 합적 · 추가 0 PLT</option><option value="loose">별도 박스 적재 · 추가 0 PLT</option><option value="pallet">별도 PLT 사용</option>
      </select></label>
      <label>별도 PLT 수량 (별도 PLT 사용 시)<input className="dispatch-input" type="number" name="extraPallets" min="1" step="1" defaultValue={mode === "pallet" && pallets ? pallets : ""} /></label>
      <p>0 PLT는 공간 확보를 뜻하지 않습니다. 박스의 공간·고정과 중량을 확인하세요.</p>
      <button type="submit" className="dispatch-secondary-button dispatch-card-action">적재 방식 저장</button>
    </form>
  </details>;
}
