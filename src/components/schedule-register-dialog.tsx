"use client";

import { useEffect, useMemo, useState } from "react";
import { registerSchedule } from "@/app/schedule/actions";
import { ProductCombobox } from "@/components/product-combobox";
import { EXTERNAL_TRANSPORTS } from "@/lib/external-transport";
import { resolveRegistrationProductFields } from "@/lib/registration-product-defaults";
import {
  DELIVERY_CUSTOMERS,
  resolveLocationFromCustomer,
} from "@/lib/delivery-customers";
import {
  listErpProductNames,
  resolveDefaultsFromProduct,
} from "@/lib/product-loading";

export function ScheduleRegisterDialog({
  date,
  regions,
  vehicles,
  inline = false,
}: {
  date: string;
  regions: { id: string; locationName: string }[];
  vehicles: { id: string; vehicleName: string }[];
  inline?: boolean;
}) {
  const [open, setOpen] = useState(inline);
  const [productName, setProductName] = useState("");
  const [extraProducts, setExtraProducts] = useState<number[]>([]);
  const [nextProductId, setNextProductId] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [customerManual, setCustomerManual] = useState(false);
  const [locationManual, setLocationManual] = useState(false);

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
    if (!open || inline) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, inline]);

  function resetFields() {
    setProductName("");
    setExtraProducts([]);
    setNextProductId(1);
    setCustomerName("");
    setLocationName("");
    setSuggestNote(null);
    setCustomerManual(false);
    setLocationManual(false);
  }

  function openDialog() {
    resetFields();
    setOpen(true);
  }

  /** 사용자가 직접 지정한 값은 유지하고 나머지 값만 품명에 맞춘다. */
  function onProductChange(name: string) {
    setProductName(name);
    const defaults = resolveDefaultsFromProduct(name);
    const { customerName: nextCustomer, locationName: nextLocation } = resolveRegistrationProductFields({
      current: { customerName, locationName }, customerManual, locationManual,
      suggestedCustomer: defaults.customerName, suggestedLocation: defaults.locationName,
      locationForCustomer: (customer) => resolveLocationFromCustomer(customer, locationOptions),
    });
    if (!customerManual) setCustomerName(nextCustomer);
    if (!locationManual) setLocationName(nextLocation);
    const parts = [!customerManual && nextCustomer ? `거래처 ${nextCustomer}` : null, !locationManual && nextLocation ? `지역 ${nextLocation}` : null].filter(Boolean);
    setSuggestNote(parts.length ? `자동 추천 적용: ${parts.join(" · ")}` : customerManual || locationManual ? "직접 선택한 거래처·지역을 유지합니다." : null);
  }

  function onCustomerChange(name: string) {
    setCustomerManual(Boolean(name));
    setCustomerName(name);
    if (!locationManual) {
      const defaults = resolveDefaultsFromProduct(productName);
      const mapped = name ? resolveLocationFromCustomer(name, locationOptions) : defaults.locationName;
      setLocationName(mapped ?? "");
      setSuggestNote(mapped ? `지역 ${mapped} 자동 추천` : null);
    }
  }

  return (
    <>
      {!inline ? <button className="dispatch-primary-button" onClick={openDialog} type="button">
        <span aria-hidden="true">＋</span> 새 납품 등록
      </button> : null}
      {open ? (
        <div
          className={inline ? "dispatch-inline-register-wrap" : "dispatch-modal-backdrop"}
          onMouseDown={(event) => {
            if (!inline && event.currentTarget === event.target) setOpen(false);
          }}
          role="presentation"
        >
          <section
            aria-labelledby="schedule-register-title"
            aria-modal={inline ? undefined : "true"}
            className={inline ? "dispatch-inline-register" : "dispatch-modal"}
            role={inline ? undefined : "dialog"}
          >
            <div className="dispatch-modal-head">
              <div>
                <h2 id="schedule-register-title">새 납품 등록</h2>
                <p>
                  거래처를 고르면 지역이 자동으로 맞춰집니다. 차량은 기본이 자동
                  추천입니다.
                </p>
              </div>
              {!inline ? <button
                aria-label="닫기"
                className="dispatch-modal-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button> : null}
            </div>
            <form action={registerSchedule} autoComplete="off" className="dispatch-modal-body">
              <div className="dispatch-form-grid">
                <div className="dispatch-field">
                  <label htmlFor="deliveryDate">납품일 *</label>
                  <input
                    autoFocus={!inline}
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
                  <ProductCombobox id="productName" names={erpNames} value={productName} onValueChange={onProductChange} required={extraProducts.length > 0} />
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
                  <label htmlFor="customerName">거래처</label>
                  <select
                    className="dispatch-select"
                    id="customerName"
                    name="customerName"
                    onChange={(event) => onCustomerChange(event.target.value)}
                    value={customerName}
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
                  <label htmlFor="locationName">지역(위치)</label>
                  <select
                    className="dispatch-select"
                    id="locationName"
                    name="locationName"
                    onChange={(event) => {
                      setLocationName(event.target.value);
                      setLocationManual(Boolean(event.target.value));
                    }}
                    value={locationName}
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
                    {EXTERNAL_TRANSPORTS.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicleName}</option>)}
                  </select>
                </div>
              </div>
              {extraProducts.map((productId, index) => (
                <div className="dispatch-form-grid" key={productId}>
                  <div className="dispatch-field">
                    <label htmlFor={`productName-${productId}`}>추가 품명 {index + 2} *</label>
                    <ProductCombobox id={`productName-${productId}`} names={erpNames} required />
                  </div>
                  <div className="dispatch-field">
                    <label htmlFor={`quantity-${productId}`}>수량 *</label>
                    <div className="dispatch-quantity-row">
                      <input className="dispatch-input" id={`quantity-${productId}`} inputMode="decimal" name="quantity" placeholder="예: 64" required />
                      <select className="dispatch-select" defaultValue="box" name="qtyUnit" aria-label={`추가 품목 ${index + 2} 수량 단위`}>
                        <option value="box">박스</option><option value="plt">PLT</option>
                      </select>
                    </div>
                  </div>
                  <button className="dispatch-secondary-button" type="button" onClick={() => setExtraProducts((items) => items.filter((id) => id !== productId))}>품목 삭제</button>
                </div>
              ))}
              <button className="dispatch-secondary-button" type="button" onClick={() => { setExtraProducts((items) => [...items, nextProductId]); setNextProductId((id) => id + 1); }}>+ 품목 추가</button>
              {extraProducts.length > 0 ? <p className="dispatch-form-note">같은 거래처의 품목을 한 카드로 묶어 등록합니다. 차량과 총 적재량을 확인하세요.</p> : null}
              <p className="dispatch-form-note">
                {suggestNote ??
                  "거래처를 고르면 지역이 매핑됩니다. 비워 두면 품명 기준으로도 추천합니다."}
              </p>
              <div className="dispatch-modal-actions">
                {!inline ? <button
                  className="dispatch-secondary-button"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  취소
                </button> : null}
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
