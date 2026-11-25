"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { registerSchedule } from "@/app/schedule/actions";
import {
  previewExcelDay,
  registerExcelDay,
  type ExcelDayPreviewResult,
} from "@/app/schedule/register-excel-day";
import { ProductCombobox } from "@/components/product-combobox";
import { findCustomProduct, type CustomProductInfo } from "@/lib/custom-product";
import { EXTERNAL_TRANSPORTS } from "@/lib/external-transport";
import type { ExcelDayRegisterSummary } from "@/lib/excel-day-register";
import { resolveRegistrationProductFields } from "@/lib/registration-product-defaults";
import {
  DELIVERY_CUSTOMERS,
  resolveLocationFromCustomer,
} from "@/lib/delivery-customers";
import {
  listErpProductNames,
  resolveDefaultsFromProduct,
} from "@/lib/product-loading";

function ExcelSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="dispatch-primary-button"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "등록 중…" : "이 날짜로 등록"}
    </button>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExcelFile(file: File) {
  return /\.(xlsx|xls)$/i.test(file.name);
}

export function ScheduleRegisterDialog({
  date,
  regions,
  vehicles,
  customProducts,
  hiddenProductNames,
}: {
  date: string;
  regions: { id: string; locationName: string }[];
  vehicles: { id: string; vehicleName: string }[];
  customProducts: CustomProductInfo[];
  hiddenProductNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "excel">("manual");
  const [productName, setProductName] = useState("");
  const [qtyUnit, setQtyUnit] = useState<"box" | "plt">("box");
  const [extraProducts, setExtraProducts] = useState<number[]>([]);
  const [nextProductId, setNextProductId] = useState(1);
  const [extraUnits, setExtraUnits] = useState<Record<number, "box" | "plt">>({});
  const [customerName, setCustomerName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [customerManual, setCustomerManual] = useState(false);
  const [locationManual, setLocationManual] = useState(false);
  const [excelDate, setExcelDate] = useState(date);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelDragActive, setExcelDragActive] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [excelPreview, setExcelPreview] = useState<{
    summary: ExcelDayRegisterSummary;
    newProducts: string[];
    newLocations: string[];
  } | null>(null);
  const [excelError, setExcelError] = useState("");
  const [previewPending, startPreview] = useTransition();

  const erpNames = useMemo(() => {
    const hidden = new Set(hiddenProductNames);
    return [
      ...new Set([
        ...listErpProductNames().filter((name) => !hidden.has(name)),
        ...customProducts.map((product) => product.productName),
      ]),
    ].sort((a, b) => a.localeCompare(b, "ko"));
  }, [customProducts, hiddenProductNames]);
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

  useEffect(() => {
    if (open) setExcelDate(date);
  }, [open, date]);

  useEffect(() => {
    if (!excelFile || !excelDate) {
      setExcelPreview(null);
      setExcelError("");
      return;
    }
    let cancelled = false;
    startPreview(() => {
      void (async () => {
        const form = new FormData();
        form.set("deliveryDate", excelDate);
        form.set("file", excelFile);
        const result: ExcelDayPreviewResult = await previewExcelDay(form);
        if (cancelled) return;
        if ("error" in result) {
          setExcelPreview(null);
          setExcelError(result.error);
          return;
        }
        setExcelPreview({
          summary: result.summary,
          newProducts: result.newProducts,
          newLocations: result.newLocations,
        });
        setExcelError("");
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [excelFile, excelDate]);

  function resetFields() {
    setProductName("");
    setQtyUnit("box");
    setExtraProducts([]);
    setExtraUnits({});
    setNextProductId(1);
    setCustomerName("");
    setLocationName("");
    setSuggestNote(null);
    setCustomerManual(false);
    setLocationManual(false);
    setMode("manual");
    setExcelFile(null);
    setExcelDragActive(false);
    if (excelInputRef.current) excelInputRef.current.value = "";
    setExcelPreview(null);
    setExcelError("");
    setExcelDate(date);
  }

  function applyExcelFile(file: File | null, syncInput = false) {
    if (!file) {
      setExcelFile(null);
      setExcelPreview(null);
      setExcelError("");
      if (excelInputRef.current) excelInputRef.current.value = "";
      return;
    }
    if (!isExcelFile(file)) {
      setExcelFile(null);
      setExcelPreview(null);
      setExcelError("엑셀 파일(.xlsx, .xls)만 올릴 수 있습니다.");
      if (excelInputRef.current) excelInputRef.current.value = "";
      return;
    }
    if (syncInput && excelInputRef.current) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        excelInputRef.current.files = dt.files;
      } catch {
        // DataTransfer 미지원 환경에서는 상태만 갱신
      }
    }
    setExcelError("");
    setExcelFile(file);
  }

  function openDialog() {
    resetFields();
    setOpen(true);
  }

  /** 사용자가 직접 지정한 값은 유지하고 나머지 값만 품명에 맞춘다. */
  function onProductChange(name: string) {
    setProductName(name);
    const custom = findCustomProduct(customProducts, name);
    const defaults = custom ?? resolveDefaultsFromProduct(name);
    setQtyUnit(custom?.defaultUnit ?? "box");
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
      const defaults = findCustomProduct(customProducts, productName) ?? resolveDefaultsFromProduct(productName);
      const mapped = name ? resolveLocationFromCustomer(name, locationOptions) : defaults.locationName;
      setLocationName(mapped ?? "");
      setSuggestNote(mapped ? `지역 ${mapped} 자동 추천` : null);
    }
  }

  const logisticsSummary = excelPreview
    ? Object.entries(excelPreview.summary.byLogistics)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
        .map(([name, count]) => `${name} ${count}건`)
        .join(" · ")
    : "";

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
                  수기로 한 건씩 넣거나, 납품예상 일정표 엑셀로 하루치를 물류 열 그대로 등록합니다.
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
            <div className="dispatch-register-modes" role="tablist" aria-label="등록 방식">
              <button
                aria-selected={mode === "manual"}
                className={mode === "manual" ? "dispatch-register-mode is-active" : "dispatch-register-mode"}
                onClick={() => setMode("manual")}
                role="tab"
                type="button"
              >
                수기 등록
              </button>
              <button
                aria-selected={mode === "excel"}
                className={mode === "excel" ? "dispatch-register-mode is-active" : "dispatch-register-mode"}
                onClick={() => setMode("excel")}
                role="tab"
                type="button"
              >
                엑셀 자동 등록
              </button>
            </div>
            {mode === "manual" ? (
            <form action={registerSchedule} autoComplete="off" className="dispatch-modal-body">
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
                      value={qtyUnit}
                      onChange={(event) => setQtyUnit(event.target.value === "plt" ? "plt" : "box")}
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
                    {EXTERNAL_TRANSPORTS.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.vehicleName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {extraProducts.map((productId, index) => (
                <div className="dispatch-form-grid" key={productId}>
                  <div className="dispatch-field">
                    <label htmlFor={`productName-${productId}`}>추가 품명 {index + 2} *</label>
                    <ProductCombobox id={`productName-${productId}`} names={erpNames} onValueChange={(name) => setExtraUnits((units) => ({ ...units, [productId]: findCustomProduct(customProducts, name)?.defaultUnit ?? "box" }))} required />
                  </div>
                  <div className="dispatch-field">
                    <label htmlFor={`quantity-${productId}`}>수량 *</label>
                    <div className="dispatch-quantity-row">
                      <input className="dispatch-input" id={`quantity-${productId}`} inputMode="decimal" name="quantity" placeholder="예: 64" required />
                      <select className="dispatch-select" value={extraUnits[productId] ?? "box"} onChange={(event) => setExtraUnits((units) => ({ ...units, [productId]: event.target.value === "plt" ? "plt" : "box" }))} name="qtyUnit" aria-label={`추가 품목 ${index + 2} 수량 단위`}>
                        <option value="box">박스</option><option value="plt">PLT</option>
                      </select>
                    </div>
                  </div>
                  <button className="dispatch-secondary-button" type="button" onClick={() => setExtraProducts((items) => items.filter((id) => id !== productId))}>품목 삭제</button>
                </div>
              ))}
              <button className="dispatch-secondary-button dispatch-add-product" type="button" onClick={() => { setExtraProducts((items) => [...items, nextProductId]); setNextProductId((id) => id + 1); }}>+ 품목 추가</button>
              {extraProducts.length > 0 ? <p className="dispatch-form-note">같은 거래처의 품목을 한 카드로 묶어 등록합니다. 차량과 총 적재량을 확인하세요.</p> : null}
              <p className="dispatch-form-note">
                {suggestNote ??
                  "거래처를 고르면 지역이 매핑됩니다. 비워 두면 품명 기준으로도 추천합니다."}
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
            ) : (
            <form
              action={registerExcelDay}
              className="dispatch-modal-body"
              encType="multipart/form-data"
              onSubmit={(event) => {
                if (excelFile && excelInputRef.current && !excelInputRef.current.files?.length) {
                  try {
                    const dt = new DataTransfer();
                    dt.items.add(excelFile);
                    excelInputRef.current.files = dt.files;
                  } catch {
                    event.preventDefault();
                    setExcelError("브라우저에서 드롭 파일을 전송하지 못했습니다. 클릭해 파일을 선택해 주세요.");
                  }
                }
              }}
            >
              <div className="dispatch-form-grid">
                <div className="dispatch-field">
                  <label htmlFor="excelDeliveryDate">납품일 *</label>
                  <input
                    className="dispatch-input"
                    id="excelDeliveryDate"
                    name="deliveryDate"
                    onChange={(event) => setExcelDate(event.target.value)}
                    required
                    type="date"
                    value={excelDate}
                  />
                </div>
                <div className="dispatch-field dispatch-field-full">
                  <label htmlFor="excelFile">납품예상 일정표 (.xlsx) *</label>
                  <input
                    ref={excelInputRef}
                    accept=".xlsx,.xls"
                    className="dispatch-file-hidden"
                    id="excelFile"
                    name="file"
                    onChange={(event) => applyExcelFile(event.target.files?.[0] ?? null, false)}
                    tabIndex={-1}
                    type="file"
                  />
                  <div
                    aria-label="납품예상 일정표 엑셀 드래그 앤 드롭 영역"
                    className={`dispatch-dropzone${excelDragActive ? " is-dragover" : ""}${excelFile ? " has-file" : ""}`}
                    onClick={() => excelInputRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setExcelDragActive(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setExcelDragActive(false);
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!excelDragActive) setExcelDragActive(true);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setExcelDragActive(false);
                      const dropped = event.dataTransfer.files?.[0] ?? null;
                      applyExcelFile(dropped, true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        excelInputRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {excelFile ? (
                      <div className="dispatch-dropzone-file">
                        <div className="dispatch-dropzone-meta">
                          <strong>{excelFile.name}</strong>
                          <span>{formatFileSize(excelFile.size)} · 다른 파일을 끌어다 놓아 교체할 수 있습니다</span>
                        </div>
                        <div className="dispatch-dropzone-actions">
                          <button
                            className="dispatch-secondary-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              excelInputRef.current?.click();
                            }}
                            type="button"
                          >
                            파일 변경
                          </button>
                          <button
                            className="dispatch-secondary-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              applyExcelFile(null, false);
                            }}
                            type="button"
                          >
                            지우기
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="dispatch-dropzone-empty">
                        <strong>
                          {excelDragActive
                            ? "여기에 파일을 놓으세요"
                            : "엑셀 파일을 여기에 끌어다 놓거나 클릭해 선택하세요"}
                        </strong>
                        <span>납품예상 일정표 (.xlsx, .xls)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <p className="dispatch-form-note dispatch-route-note-warn">
                선택한 납품일의 신청·확정 일정을 전부 지우고 엑셀 행으로 다시 등록합니다. 완료·취소 건만 남습니다. 차량은 엑셀 물류 열을 그대로 씁니다(AI 재배정 없음).
              </p>
              {previewPending ? <p className="dispatch-form-note">미리보기 읽는 중…</p> : null}
              {excelError ? <p className="dispatch-form-note dispatch-route-note-warn" role="alert">{excelError}</p> : null}
              {excelPreview ? (
                <div className="dispatch-excel-preview" aria-live="polite">
                  <p>
                    <strong>{excelPreview.summary.count}건</strong>
                    {logisticsSummary ? ` · ${logisticsSummary}` : null}
                  </p>
                  <p>
                    신규 품명 {excelPreview.newProducts.length}개
                    {excelPreview.newProducts.length
                      ? ` (${excelPreview.newProducts.slice(0, 5).join(", ")}${excelPreview.newProducts.length > 5 ? "…" : ""})`
                      : ""}
                    {" · "}
                    신규 지역 {excelPreview.newLocations.length}개
                    {excelPreview.newLocations.length
                      ? ` (${excelPreview.newLocations.slice(0, 5).join(", ")}${excelPreview.newLocations.length > 5 ? "…" : ""})`
                      : ""}
                    {" · "}
                    주소 추출 {excelPreview.summary.addressCount}건
                    {excelPreview.summary.unrecognizedLogistics
                      ? ` · 물류 미인식 ${excelPreview.summary.unrecognizedLogistics}건(등록 시 추천 대체)`
                      : ""}
                  </p>
                </div>
              ) : null}
              <div className="dispatch-modal-actions">
                <button
                  className="dispatch-secondary-button"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  취소
                </button>
                <ExcelSubmitButton
                  disabled={!excelFile || !!excelError || !excelPreview?.summary.count}
                />
              </div>
            </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
