"use client";

import { useEffect, useMemo, useState } from "react";
import { registerSchedule } from "@/app/schedule/actions";
import { DELIVERY_CUSTOMERS } from "@/lib/delivery-customers";
import {
  listErpProductNames,
  resolveDefaultsFromProduct,
} from "@/lib/product-loading";

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
  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

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

  function resetFields() {
    setProductName("");
    setCustomerName("");
    setLocationName("");
    setSuggestNote(null);
  }

  function openDialog() {
    resetFields();
    setOpen(true);
  }

  /** 품명 → 거래처·지역 자동 추천 (사용자가 언제든 수정 가능) */
  function onProductChange(name: string) {
    setProductName(name);
    const defaults = resolveDefaultsFromProduct(name);
    if (!defaults.customerName && !defaults.locationName) {
      setSuggestNote(null);
      return;
    }
    if (defaults.customerName) setCustomerName(defaults.customerName);
    if (defaults.locationName) setLocationName(defaults.locationName);
    setSuggestNote(
      defaults.note
        ? `자동 추천: ${defaults.note} · 다르면 직접 바꾸세요`
        : "자동 추천이 채워졌습니다 · 다르면 직접 바꾸세요",
    );
  }

  return (
    <>
      <button className="dispatch-primary-button" onClick={openDialog} type="button">
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
                <p>품명을 고르면 거래처·지역이 추천됩니다. 틀리면 바꾸면 됩니다.</p>
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
                    onChange={(event) => onProductChange(event.target.value)}
                    placeholder="제품 정리 ERP 명"
                    value={productName}
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
                    onChange={(event) => {
                      setLocationName(event.target.value);
                      setSuggestNote((prev) =>
                        prev ? "자동 추천을 수정했습니다" : prev,
                      );
                    }}
                    placeholder="예: 인천, 평택, 부산항"
                    required
                    value={locationName}
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
                    onChange={(event) => {
                      setCustomerName(event.target.value);
                      setSuggestNote((prev) =>
                        prev ? "자동 추천을 수정했습니다" : prev,
                      );
                    }}
                    placeholder="납품 root 고객사"
                    value={customerName}
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
                {suggestNote ??
                  "품명을 고르면 거래처·지역이 채워집니다. 차량은 비우면 자동 추천입니다."}
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
