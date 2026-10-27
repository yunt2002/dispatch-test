"use client";

import { useState } from "react";
import {
  changeScheduleVehicle,
  deleteSchedule,
  markScheduleDone,
  reopenSchedule,
  updateSchedule,
} from "@/app/schedule/actions";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { StatusBadge } from "@/components/ui";

export type ScheduleVehicleOption = {
  id: string;
  vehicleName: string;
};

export function ScheduleEntryRow({
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
  vehicles: ScheduleVehicleOption[];
}) {
  const [editing, setEditing] = useState(false);
  const done = status === "DONE";
  const changed = Boolean(
    selectedVehicleTypeId &&
      recommendedVehicleTypeId &&
      selectedVehicleTypeId !== recommendedVehicleTypeId,
  );
  const vehicleLabel = selectedName
    ? `${selectedName}${selectedCount > 1 ? ` ×${selectedCount}` : ""}`
    : logistics || "없음";

  return (
    <tr className={done ? "opacity-60" : ""}>
      <td>
        {editing ? (
          <input
            aria-label="지역"
            className="input"
            defaultValue={locationName}
            form={`edit-${id}`}
            list="location-options"
            name="locationName"
            required
          />
        ) : (
          <>
            <div className="font-medium">{locationName}</div>
            <div className="muted text-xs">{regionTypeLabel}</div>
          </>
        )}
      </td>
      <td>
        {editing ? (
          <div>
            <input
              aria-label="거래처"
              className="input"
              defaultValue={customerName ?? ""}
              form={`edit-${id}`}
              name="customerName"
              placeholder="거래처"
            />
            <input
              aria-label="품명"
              className="input mt-2"
              defaultValue={productName ?? ""}
              form={`edit-${id}`}
              name="productName"
              placeholder="품명 (선택)"
            />
          </div>
        ) : (
          <>
            {customerName || "-"}
            {productName ? <div className="muted text-xs">{productName}</div> : null}
          </>
        )}
      </td>
      <td>
        {editing ? (
          <div className="flex gap-2">
            <input
              aria-label="수량"
              className="input"
              defaultValue={quantity}
              form={`edit-${id}`}
              inputMode="decimal"
              name="quantity"
              required
            />
            <select
              aria-label="단위"
              className="select max-w-[88px]"
              defaultValue={qtyUnit}
              form={`edit-${id}`}
              name="qtyUnit"
            >
              <option value="box">박스</option>
              <option value="plt">PLT</option>
            </select>
          </div>
        ) : (
          qtyLabel
        )}
      </td>
      <td>
        {done || editing ? (
          <span className="font-bold text-blue-800">{vehicleLabel}</span>
        ) : (
          <form action={changeScheduleVehicle} className="flex items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="date" value={date} />
            <AutoSubmitSelect
              key={`${id}-${selectedVehicleTypeId ?? "none"}`}
              aria-label="차량 변경"
              className="select max-w-[160px] font-bold text-blue-800"
              defaultValue={selectedVehicleTypeId ?? ""}
              name="vehicleTypeId"
            >
              {!selectedVehicleTypeId ? <option value="">차 선택</option> : null}
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.vehicleName}
                </option>
              ))}
            </AutoSubmitSelect>
            {selectedCount > 1 ? (
              <span className="font-bold text-blue-800">×{selectedCount}</span>
            ) : null}
          </form>
        )}
        {changed && recommendedName ? (
          <div className="muted text-xs">추천 {recommendedName}</div>
        ) : null}
        {reason ? (
          <p className="muted mt-1 max-w-[280px] truncate text-xs" title={reason}>
            {reason}
          </p>
        ) : null}
      </td>
      <td>
        <StatusBadge tone={done ? "ok" : "info"}>{done ? "완료" : "예정"}</StatusBadge>
      </td>
      <td>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <form action={updateSchedule} id={`edit-${id}`}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="date" value={date} />
                <button className="btn btn-primary" type="submit">
                  저장
                </button>
              </form>
              <button className="btn" onClick={() => setEditing(false)} type="button">
                취소
              </button>
            </>
          ) : (
            <>
              {done ? (
                <form action={reopenSchedule}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="date" value={date} />
                  <button className="btn" type="submit">
                    완료 취소
                  </button>
                </form>
              ) : (
                <>
                  <button className="btn" onClick={() => setEditing(true)} type="button">
                    수정
                  </button>
                  <form action={markScheduleDone}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="date" value={date} />
                    <button className="btn" type="submit">
                      완료
                    </button>
                  </form>
                </>
              )}
              <ConfirmSubmit
                action={deleteSchedule}
                extraFields={{ date }}
                id={id}
                message="이 일정을 삭제할까요?"
              />
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
