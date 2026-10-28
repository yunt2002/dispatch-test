"use client";

import { useEffect, useMemo, useState } from "react";
import { registerSchedule } from "@/app/schedule/actions";
import { DELIVERY_CUSTOMERS } from "@/lib/delivery-customers";
import { listErpProductNames } from "@/lib/product-loading";

export function ScheduleRegisterDialog({
  date,
  regions,
  vehicles,
}: {
  date: string;
  regions: { id: string; locationName: string }[];
  vehicles: { id: string; vehicleName: string }[];
}) {
  const [open, setOpen] = useState(false);

  const erpNames = useMemo(() => listErpProductNames(), []);
  const customerNames = useMemo(
    () => DELIVERY_CUSTOMERS.map((c) => c.name),
    [],
  );

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        className="dispatch-primary-button"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span aria-hidden="true">＋</span> 새 납품 등록
      </button>
      {open ? (
        <div
          className="dispatch-modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
          role="presentation"
        >
          <section
            aria-labelledby="schedule-register-title"
            aria-modal="true"
            className="dispatch-modal"
            role="dialog"
          >
            <div className="dispatch-modal-head">
              <div>
                <h2 id="schedule-register-title">새 납품 등록</h2>
                <p>품명·지역·거래처·차량은 각각 선택합니다. 차량을 비우면 자동 추천합니다.</p>
              </div>
              <button
                aria-label="닫기"
                className="dispatch-modal-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form action={registerSchedule} className="dispatch-modal-body">
              <div className="dispatch-form-grid">
                <div className="dispatch-field">
                  <label htmlFor="deliveryDate">납품일 *</label>
                  <input
                    autoFocus
                    className="dispatch-input"
                    defaultValue={date}
                    id="deliveryDate"
                    name="deliveryDate"
                    required
                    type="date"
                  />
                </div>
                <div className="dispatch-field">
                  <label htmlFor="productName">품명 (ERP)</label>
                  <input
                    className="dispatch-input"
                    id="productName"
                    list="erp-product-names"
                    name="productName"
                    placeholder="제품 정리 ERP 명"
                  />
                  <datalist id="erp-product-names">
                    {erpNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="dispatch-field">
                  <label htmlFor="quantity">수량 *</label>
                  <div className="dispatch-quantity-row">
                    <input
                      className="dispatch-input"
                      id="quantity"
                      inputMode="decimal"
                      name="quantity"
                      placeholder="예: 64"
                      required
                    />
                    <select
                      className="dispatch-select"
                      defaultValue="box"
                      id="qtyUnit"
                      name="qtyUnit"
                    >
                      <option value="box">박스</option>
                      <option value="plt">PLT</option>
                    </select>
                  </div>
                </div>
                <div className="dispatch-field">
                  <label htmlFor="locationName">지역(위치) *</label>
                  <input
                    className="dispatch-input"
                    id="locationName"
                    list="register-location-options"
                    name="locationName"
                    placeholder="예: 인천, 평택, 부산항"
                    required
                  />
                  <datalist id="register-location-options">
                    {regions.map((region) => (
                      <option key={region.id} value={region.locationName} />
                    ))}
                  </datalist>
                </div>
                <div className="dispatch-field">
                  <label htmlFor="customerName">거래처</label>
                  <input
                    className="dispatch-input"
                    id="customerName"
                    list="delivery-customer-names"
                    name="customerName"
                    placeholder="납품 root 고객사"
                  />
                  <datalist id="delivery-customer-names">
                    {customerNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="dispatch-field">
                  <label htmlFor="vehicleTypeId">차량</label>
                  <select
                    className="dispatch-select"
                    defaultValue=""
                    id="vehicleTypeId"
                    name="vehicleTypeId"
                  >
                    <option value="">자동 추천</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.vehicleName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="dispatch-form-note">
                품명·지역·거래처 목록은 각각 고릅니다. 차량을 직접 고르면 그 차로 등록되고, 비우면
                권역·잔여 PLT로 추천합니다.
              </p>
              <div className="dispatch-modal-actions">
                <button
                  className="dispatch-secondary-button"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  취소
                </button>
                <button className="dispatch-primary-button" type="submit">
                  등록
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
