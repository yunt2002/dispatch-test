"use client";

import {
  changeScheduleGroupStatus, changeScheduleVehicle, deleteScheduleGroup,
  splitConsolidateSchedules, updateSchedule,
} from "@/app/schedule/actions";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ScheduleSelectCheckbox } from "@/components/schedule-selection";
import type { ScheduleVehicleOption } from "@/components/schedule-entry-row";
import { ScheduleTransportFee } from "@/components/schedule-transport-fee";

export type GroupCardItem = {
  id: string; locationName: string; customerName: string | null; productName: string | null;
  qtyLabel: string; quantity: number; qtyUnit: "box" | "plt";
  transportFee: string | null;
  vehicleId: string | null;
};

export function ScheduleGroupCard({ date, groupId, label, status, items, totalLabel, selectedVehicleId, vehicleName, vehicleCount, vehicles, warnings, returnTo = "request", allowConfirm = true }: {
  date: string; groupId: string; label: string; status: string; items: GroupCardItem[];
  totalLabel: string; selectedVehicleId: string | null; vehicleName: string | null; vehicleCount: number;
  vehicles: ScheduleVehicleOption[]; warnings: string[];
  returnTo?: "request" | "confirm"; allowConfirm?: boolean;
}) {
  const first = items[0];
  const done = status === "DONE";
  const operation = done ? "reopen" : status === "CONFIRMED" ? "done" : "confirm";
  const actionLabel = done ? "완료 취소" : status === "CONFIRMED" ? "완료 처리" : "배차 확정";
  const locations = [...new Set(items.map((item) => item.locationName))];
  const customers = [...new Set(items.map((item) => item.customerName || "거래처 미입력"))];
  return (
    <article className={`dispatch-job${done ? " dispatch-job-done" : ""}`}>
      <div className="dispatch-job-top">
        <div className="dispatch-job-top-main">
          <ScheduleSelectCheckbox id={first.id} ids={items.map((item) => item.id)} />
          <div><strong>{locations.join(" · ")}</strong><em className="dispatch-consolidate-badge">{label}</em></div>
        </div>
        <b>{totalLabel}</b>
      </div>
      <div className="dispatch-job-client">{customers.join(" · ")}</div>
      <ul className="dispatch-group-items">
        {items.map((item) => <li key={item.id}>
          <span>{customers.length > 1 ? `${item.customerName || "거래처 미입력"} · ` : ""}{item.productName || "품명 미입력"}</span>
          <b>{item.qtyLabel}</b>
        </li>)}
      </ul>
      <div className="dispatch-vehicle-row">
        <span className="dispatch-vehicle-badge" aria-hidden="true">{vehicleName === "스타리아" ? "S" : vehicleName?.replace("차", "") || "—"}</span>
        <div className="dispatch-vehicle-copy">{done ? <strong>{vehicleName || "차량 미지정"}</strong> : (
          <form action={changeScheduleVehicle}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="id" value={first.id} /><input type="hidden" name="date" value={date} />
            <AutoSubmitSelect aria-label="묶음 차량 변경" className="dispatch-vehicle-select" defaultValue={selectedVehicleId ?? ""} key={`${groupId}-${selectedVehicleId ?? "none"}`} name="vehicleTypeId">
              {!selectedVehicleId ? <option value="">차량 선택</option> : null}
              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicleName}</option>)}
            </AutoSubmitSelect>
          </form>
        )}{vehicleCount > 1 ? <span>{vehicleCount}대 필요 · 배차 확인</span> : null}</div>
      </div>
      {warnings.length ? <details className="dispatch-warning"><summary>확인 사항 {warnings.length}개</summary><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details> : null}
      {returnTo === "confirm" && items.some((item) => item.vehicleId) ? <details className="dispatch-group-edit"><summary>품목별 운송 금액</summary><p>운임을 한 번에 청구받은 묶음은 한 품목에만 금액을 입력하세요.</p>{items.map((item) => item.vehicleId ? <ScheduleTransportFee key={item.id} id={item.id} date={date} vehicleId={item.vehicleId} productName={item.productName} value={item.transportFee} /> : null)}</details> : null}
      {!done ? <details className="dispatch-group-edit"><summary>품목별 수정</summary>
        {items.map((item) => <form action={updateSchedule} key={item.id} className="dispatch-group-edit-form">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="id" value={item.id} /><input type="hidden" name="date" value={date} />
          <label>거래처<input className="dispatch-input" name="customerName" defaultValue={item.customerName ?? ""} /></label>
          <label>지역<input className="dispatch-input" name="locationName" defaultValue={item.locationName} required /></label>
          <label>품명<input className="dispatch-input" name="productName" defaultValue={item.productName ?? ""} /></label>
          <label>수량<div className="dispatch-quantity-row"><input className="dispatch-input" name="quantity" defaultValue={item.quantity} inputMode="decimal" required /><select className="dispatch-select" name="qtyUnit" defaultValue={item.qtyUnit}><option value="box">박스</option><option value="plt">PLT</option></select></div></label>
          <button className="dispatch-secondary-button dispatch-card-action" type="submit">이 품목 저장</button>
        </form>)}
      </details> : null}
      <div className="dispatch-card-actions">
        {operation !== "confirm" || allowConfirm ? <form action={changeScheduleGroupStatus}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="id" value={first.id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="operation" value={operation} />
          <button className="dispatch-flow-button dispatch-card-action" type="submit">{actionLabel} · {items.length}건</button>
        </form> : null}
        {!done ? <form action={splitConsolidateSchedules} onSubmit={(event) => { if (!confirm("묶음을 해제할까요? 차량은 그대로 둡니다.")) event.preventDefault(); }}>
          <input type="hidden" name="date" value={date} /><input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button className="dispatch-secondary-button dispatch-card-action" type="submit">묶음 해제</button>
        </form> : null}
        <ConfirmSubmit action={deleteScheduleGroup} buttonClassName="dispatch-delete-button dispatch-card-action" extraFields={{ date, returnTo }} id={first.id} message={`이 묶음의 ${items.length}건을 모두 삭제할까요?`} />
      </div>
    </article>
  );
}
