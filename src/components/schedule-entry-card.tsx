"use client";

import { useMemo, useState } from "react";
import {
  changeScheduleVehicle,
  confirmSchedule,
  deleteSchedule,
  markScheduleDone,
  reopenSchedule,
  updateSchedule,
} from "@/app/schedule/actions";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ConfirmSubmit } from "@/components/confirm-submit";
import type { ScheduleVehicleOption } from "@/components/schedule-entry-row";
import { ScheduleSelectCheckbox } from "@/components/schedule-selection";
import {
  DELIVERY_CUSTOMERS,
  resolveLocationFromCustomer,
} from "@/lib/delivery-customers";

export function ScheduleEntryCard({
  id,
  date,
  locationName,
  regionTypeLabel,
  customerName,
  productName,
  qtyLabel,
  quantity,
  qtyUnit,
  status,
  selectedName,
  selectedCount,
  selectedVehicleTypeId,
  recommendedName,
  recommendedVehicleTypeId,
  logistics,
  reason,
  warnings,
  vehicles,
}: {
  id: string;
  date: string;
  locationName: string;
  regionTypeLabel: string;
  customerName: string | null;
  productName: string | null;
  qtyLabel: string;
  quantity: number;
  qtyUnit: "box" | "plt";
  status: string;
  selectedName: string | null;
  selectedCount: number;
  selectedVehicleTypeId: string | null;
  recommendedName: string | null;
  recommendedVehicleTypeId: string | null;
  logistics: string | null;
  reason: string | null;
  warnings: string[];
  vehicles: ScheduleVehicleOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [editCustomer, setEditCustomer] = useState(customerName ?? "");
  const [editLocation, setEditLocation] = useState(locationName);
  const customerOptions = useMemo(
    () => DELIVERY_CUSTOMERS.map((c) => c.name),
    [],
  );
  const done = status === "DONE";
  const confirmed = status === "CONFIRMED";
  const changed = Boolean(
    selectedVehicleTypeId &&
      recommendedVehicleTypeId &&
      selectedVehicleTypeId !== recommendedVehicleTypeId,
  );
  const vehicleLabel = selectedName
    ? `${selectedName}${selectedCount > 1 ? ` ×${selectedCount}` : ""}`
    : logistics || "차량 미지정";
  const vehicleShort = selectedName === "스타리아" ? "S" : selectedName?.replace("차", "") || "—";

  if (editing) {
    return (
      <article className="dispatch-job dispatch-job-editing">
        <form action={updateSchedule} id={`edit-${id}`}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="date" value={date} />
          <div className="dispatch-edit-grid">
            <div className="dispatch-field">
              <label htmlFor={`customer-${id}`}>거래처</label>
              <input
                className="dispatch-input"
                id={`customer-${id}`}
                list={`customer-options-${id}`}
                name="customerName"
                onChange={(event) => {
                  const next = event.target.value;
                  setEditCustomer(next);
                  const mapped = resolveLocationFromCustomer(next);
                  if (mapped) setEditLocation(mapped);
                }}
                value={editCustomer}
              />
              <datalist id={`customer-options-${id}`}>
                {customerOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="dispatch-field">
              <label htmlFor={`location-${id}`}>지역</label>
              <input
                className="dispatch-input"
                id={`location-${id}`}
                list="location-options"
                name="locationName"
                onChange={(event) => setEditLocation(event.target.value)}
                required
                value={editLocation}
              />
            </div>
            <div className="dispatch-field dispatch-field-wide">
              <label htmlFor={`product-${id}`}>품명</label>
              <input
                className="dispatch-input"
                defaultValue={productName ?? ""}
                id={`product-${id}`}
                name="productName"
              />
            </div>
            <div className="dispatch-field dispatch-field-wide">
              <label htmlFor={`quantity-${id}`}>수량</label>
              <div className="dispatch-quantity-row">
                <input
                  className="dispatch-input"
                  defaultValue={quantity}
                  id={`quantity-${id}`}
                  inputMode="decimal"
                  name="quantity"
                  required
                />
                <select className="dispatch-select" defaultValue={qtyUnit} name="qtyUnit">
                  <option value="box">박스</option>
                  <option value="plt">PLT</option>
                </select>
              </div>
            </div>
          </div>
          <div className="dispatch-card-actions">
            <button className="dispatch-primary-button dispatch-card-action" type="submit">저장</button>
            <button
              className="dispatch-secondary-button dispatch-card-action"
              onClick={() => setEditing(false)}
              type="button"
            >
              취소
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className={`dispatch-job${done ? " dispatch-job-done" : ""}`}>
      <div className="dispatch-job-top">
        <div className="dispatch-job-top-main">
          <ScheduleSelectCheckbox id={id} />
          <div>
            <strong>{locationName}</strong>
            <span>{regionTypeLabel}</span>
          </div>
        </div>
        <b>{qtyLabel}</b>
      </div>
      <div className="dispatch-job-client">{customerName || "거래처 미입력"}</div>
      <div className="dispatch-job-product">{productName || "품명 미입력"}</div>

      <div className="dispatch-vehicle-row">
        <span className="dispatch-vehicle-badge" aria-hidden="true">{vehicleShort}</span>
        <div className="dispatch-vehicle-copy">
          {done ? (
            <strong>{vehicleLabel}</strong>
          ) : (
            <form action={changeScheduleVehicle}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="date" value={date} />
              <AutoSubmitSelect
                aria-label="차량 변경"
                className="dispatch-vehicle-select"
                defaultValue={selectedVehicleTypeId ?? ""}
                key={`${id}-${selectedVehicleTypeId ?? "none"}`}
                name="vehicleTypeId"
              >
                {!selectedVehicleTypeId ? <option value="">차량 선택</option> : null}
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicleName}</option>
                ))}
              </AutoSubmitSelect>
            </form>
          )}
          {changed && recommendedName ? <span>원래 추천 {recommendedName}</span> : null}
          {reason ? <span title={reason}>{reason}</span> : null}
        </div>
      </div>

      {warnings.length ? (
        <details className="dispatch-warning">
          <summary>확인 사항 {warnings.length}개</summary>
          <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      ) : null}

      <div className="dispatch-card-actions">
        {!done ? (
          <button
            className="dispatch-secondary-button dispatch-card-action"
            onClick={() => {
              setEditCustomer(customerName ?? "");
              setEditLocation(locationName);
              setEditing(true);
            }}
            type="button"
          >
            수정
          </button>
        ) : null}
        {done ? (
          <form action={reopenSchedule}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="date" value={date} />
            <button className="dispatch-secondary-button dispatch-card-action" type="submit">완료 취소</button>
          </form>
        ) : confirmed ? (
          <form action={markScheduleDone}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="date" value={date} />
            <button className="dispatch-flow-button dispatch-flow-button-blue" type="submit">완료 처리</button>
          </form>
        ) : (
          <form action={confirmSchedule}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="date" value={date} />
            <button className="dispatch-flow-button" type="submit">배차 확정</button>
          </form>
        )}
        <ConfirmSubmit
          action={deleteSchedule}
          buttonClassName="dispatch-delete-button dispatch-card-action"
          extraFields={{ date }}
          id={id}
          message="이 일정을 삭제할까요?"
        />
      </div>
    </article>
  );
}
