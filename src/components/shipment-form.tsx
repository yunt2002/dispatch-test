"use client";

import { useMemo, useState } from "react";
import { computeTotalWeight } from "@/engine/dispatch";
import { FieldError, FieldHint } from "@/components/ui";

type CustomerOption = {
  id: string;
  customerName: string;
  customerCode: string;
  defaultRouteId: string | null;
};

type ProductOption = {
  id: string;
  productName: string;
  productCode: string;
  unitWeight: number | null;
  piecesPerBox?: number | null;
};

type RouteOption = {
  id: string;
  routeCode: string;
  routeName: string;
};

type ShipmentValues = {
  id?: string;
  deliveryDate?: string;
  customerId?: string;
  productId?: string;
  quantity?: number;
  unitWeight?: number | null;
  boxCount?: number | null;
  piecesPerBox?: number | null;
  palletCount?: number | null;
  actualLogistics?: string | null;
  routeId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
};

type FieldErrors = Partial<
  Record<"customerId" | "productId" | "quantity" | "unitWeight" | "routeId", string>
>;

function parsePositive(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function ShipmentForm({
  action,
  customers,
  products,
  routes,
  shipment,
  defaultDate,
}: {
  action: (formData: FormData) => void | Promise<void>;
  customers: CustomerOption[];
  products: ProductOption[];
  routes: RouteOption[];
  shipment?: ShipmentValues;
  defaultDate: string;
}) {
  const [customerId, setCustomerId] = useState(shipment?.customerId ?? "");
  const [productId, setProductId] = useState(shipment?.productId ?? "");
  const [quantity, setQuantity] = useState(shipment?.quantity?.toString() ?? "");
  const [unitWeight, setUnitWeight] = useState(
    shipment?.unitWeight != null ? String(shipment.unitWeight) : "",
  );
  const [boxCount, setBoxCount] = useState(
    shipment?.boxCount != null ? String(shipment.boxCount) : "",
  );
  const [routeId, setRouteId] = useState(shipment?.routeId ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  const selectedProduct = products.find((item) => item.id === productId);
  const qtyValue = parsePositive(quantity);
  const weightValue = unitWeight.trim() === "" ? null : parsePositive(unitWeight);
  const boxValue = boxCount.trim() === "" ? null : Number(boxCount.replace(/,/g, ""));
  const totalWeight = useMemo(
    () => computeTotalWeight(qtyValue, weightValue),
    [qtyValue, weightValue],
  );

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!customerId) next.customerId = "거래처를 선택하세요.";
    if (!productId) next.productId = "제품을 선택하세요.";
    if (qtyValue == null) next.quantity = "출하 수량은 0보다 큰 숫자여야 합니다.";
    const hasWeight = weightValue != null;
    const hasBoxes = boxValue != null && Number.isFinite(boxValue) && boxValue > 0;
    if (!hasWeight && !hasBoxes) {
      next.unitWeight = "단위 중량 또는 박스수량 중 하나는 필요합니다.";
    }
    if (!routeId) next.routeId = "배차 계산을 하려면 배송 루트가 필요합니다.";
    return next;
  }

  return (
    <form
      action={action}
      className="card p-4"
      noValidate
      onSubmit={(event) => {
        const next = validate();
        setErrors(next);
        if (Object.keys(next).length > 0) {
          event.preventDefault();
          const first = Object.keys(next)[0];
          document.getElementById(first)?.focus();
        }
      }}
    >
      {shipment?.id ? <input type="hidden" name="id" value={shipment.id} /> : null}
      <div className="grid-form">
        <div className="field">
          <label htmlFor="deliveryDate">배송일 *</label>
          <input
            id="deliveryDate"
            className="input"
            type="date"
            name="deliveryDate"
            defaultValue={shipment?.deliveryDate ?? defaultDate}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="customerId">거래처 *</label>
          <select
            id="customerId"
            className={`select ${errors.customerId ? "select-error" : ""}`}
            name="customerId"
            required
            value={customerId}
            aria-invalid={Boolean(errors.customerId)}
            onChange={(event) => {
              const next = event.target.value;
              setCustomerId(next);
              const customer = customers.find((item) => item.id === next);
              if (customer?.defaultRouteId) setRouteId(customer.defaultRouteId);
              setErrors((prev) => ({ ...prev, customerId: undefined }));
            }}
          >
            <option value="">선택</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.customerCode} / {customer.customerName}
              </option>
            ))}
          </select>
          <FieldError message={errors.customerId} />
        </div>
        <div className="field">
          <label htmlFor="productId">제품 *</label>
          <select
            id="productId"
            className={`select ${errors.productId ? "select-error" : ""}`}
            name="productId"
            required
            value={productId}
            aria-invalid={Boolean(errors.productId)}
            onChange={(event) => {
              const next = event.target.value;
              setProductId(next);
              const product = products.find((item) => item.id === next);
              if (product?.unitWeight != null) {
                setUnitWeight(String(product.unitWeight));
                setErrors((prev) => ({ ...prev, productId: undefined, unitWeight: undefined }));
              } else {
                setErrors((prev) => ({ ...prev, productId: undefined }));
              }
            }}
          >
            <option value="">선택</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.productCode} / {product.productName}
                {product.unitWeight == null ? " (중량 미등록)" : ""}
              </option>
            ))}
          </select>
          <FieldError message={errors.productId} />
          {selectedProduct && selectedProduct.unitWeight == null ? (
            <FieldHint>이 제품은 단위 중량이 없습니다. 아래에 직접 입력하세요.</FieldHint>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="quantity">출하 수량 *</label>
          <input
            id="quantity"
            className={`input ${errors.quantity ? "input-error" : ""}`}
            name="quantity"
            inputMode="decimal"
            value={quantity}
            aria-invalid={Boolean(errors.quantity)}
            onChange={(event) => {
              setQuantity(event.target.value);
              setErrors((prev) => ({ ...prev, quantity: undefined }));
            }}
            required
          />
          <FieldError message={errors.quantity} />
        </div>
        <div className="field">
          <label htmlFor="unitWeight">단위 중량(kg)</label>
          <input
            id="unitWeight"
            className={`input ${errors.unitWeight ? "input-error" : ""}`}
            name="unitWeight"
            inputMode="decimal"
            value={unitWeight}
            aria-invalid={Boolean(errors.unitWeight)}
            onChange={(event) => {
              setUnitWeight(event.target.value);
              setErrors((prev) => ({ ...prev, unitWeight: undefined }));
            }}
          />
          <FieldError message={errors.unitWeight} />
          <FieldHint>없으면 비우고 박스수량을 입력하세요.</FieldHint>
        </div>
        <div className="field">
          <label htmlFor="boxCount">박스수량</label>
          <input
            id="boxCount"
            className="input"
            name="boxCount"
            inputMode="decimal"
            value={boxCount}
            onChange={(event) => {
              setBoxCount(event.target.value);
              setErrors((prev) => ({ ...prev, unitWeight: undefined }));
            }}
          />
          <FieldHint>납품일정표 박스수량 컬럼</FieldHint>
        </div>
        <div className="field">
          <label htmlFor="piecesPerBox">박스당 수량</label>
          <input
            id="piecesPerBox"
            className="input"
            name="piecesPerBox"
            inputMode="decimal"
            defaultValue={
              shipment?.piecesPerBox ?? selectedProduct?.piecesPerBox ?? ""
            }
          />
        </div>
        <div className="field">
          <label htmlFor="palletCount">PLT (알 때만)</label>
          <input
            id="palletCount"
            className="input"
            name="palletCount"
            inputMode="decimal"
            defaultValue={shipment?.palletCount ?? ""}
          />
          <FieldHint>입력 시 차량 대수 계산에 반영됩니다.</FieldHint>
        </div>
        <div className="field">
          <label>총중량</label>
          <input
            className="input"
            readOnly
            value={totalWeight == null ? "중량 입력 시 자동 계산" : `${totalWeight} kg`}
          />
        </div>
        <div className="field">
          <label htmlFor="routeId">배송 루트 *</label>
          <select
            id="routeId"
            className={`select ${errors.routeId ? "select-error" : ""}`}
            name="routeId"
            value={routeId}
            aria-invalid={Boolean(errors.routeId)}
            onChange={(event) => {
              setRouteId(event.target.value);
              setErrors((prev) => ({ ...prev, routeId: undefined }));
            }}
          >
            <option value="">선택</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.routeCode} / {route.routeName}
              </option>
            ))}
          </select>
          <FieldError message={errors.routeId} />
          {!routeId ? (
            <FieldHint>루트가 없으면 배차 계산에서 제외됩니다.</FieldHint>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="actualLogistics">실배차(물류)</label>
          <input
            id="actualLogistics"
            className="input"
            name="actualLogistics"
            defaultValue={shipment?.actualLogistics ?? ""}
            placeholder="예: 2호 차량(3.5t)"
          />
          <FieldHint>엑셀 물류 컬럼. 추천 검증용으로 보관합니다.</FieldHint>
        </div>
        <div className="field">
          <label htmlFor="dueDate">납기</label>
          <input
            id="dueDate"
            className="input"
            type="date"
            name="dueDate"
            defaultValue={shipment?.dueDate ?? ""}
          />
        </div>
      </div>
      <div className="field mt-3">
        <label htmlFor="notes">비고</label>
        <textarea id="notes" className="textarea" name="notes" defaultValue={shipment?.notes ?? ""} />
      </div>
      <div className="mt-3">
        <button type="submit" className="btn btn-primary">
          {shipment?.id ? "출하 수정" : "출하 등록"}
        </button>
      </div>
    </form>
  );
}
