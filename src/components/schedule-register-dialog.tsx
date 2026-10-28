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
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

  const erpNames = useMemo(() => listErpProductNames(), []);
  const customerNames = useMemo(
    () => DELIVERY_CUSTOMERS.map((c) => c.name),
    [],
  );
  const locationOptions = useMemo(() => {
    const names = regions.map((region) => region.locationName);
    for (const hint of ["인천항", "부산항", "진해항"] as const) {
      if (!names.includes(hint)) names.push(hint);
    }
    return names;
  }, [regions]);

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
    setSuggestNote(null);
  }

  function openDialog() {
    resetFields();
    setOpen(true);
  }

  /** 품명 → 지역·거래처 자동 추천 안내 (배차와 같이 select는 「자동 추천」 유지) */
  function onProductChange(name: string) {
    setProductName(name);
    const defaults = resolveDefaultsFromProduct(name);
    if (!defaults.customerName && !defaults.locationName) {
      setSuggestNote(null);
      return;
    }
    const parts = [
      defaults.locationName ? `지역 ${defaults.locationName}` : null,
      defaults.customerName ? `거래처 ${defaults.customerName}` : null,
    ].filter(Boolean);
    setSuggestNote(
      parts.length
        ? `자동 추천 예정: ${parts.join(" · ")} · 다르면 목록에서 고르세요`
        : null,
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
                <p>
                  지역·거래처·차량은 기본이 자동 추천입니다. 목록을 내려 직접 고를 수
                  있습니다.
                </p>
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
                  <label htmlFor="locationName">지역(위치)</label>
                  <select
                    className="dispatch-select"
                    defaultValue=""
                    id="locationName"
                    name="locationName"
                  >
                    <option value="">자동 추천</option>
                    {locationOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="dispatch-field">
                  <label htmlFor="customerName">거래처</label>
                  <select
                    className="dispatch-select"
                    defaultValue=""
                    id="customerName"
                    name="customerName"
                  >
                    <option value="">자동 추천</option>
                    {customerNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
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
                  "비워 두면 품명·수량 기준으로 지역·거래처·차량을 자동 추천합니다."}
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
