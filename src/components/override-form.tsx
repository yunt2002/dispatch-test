"use client";

import { useMemo, useState } from "react";
import type { VehicleCombination } from "@/engine/types";
import { formatCost } from "@/lib/format";
import { FieldError, FieldHint } from "@/components/ui";

function comboLabel(combo: VehicleCombination): string {
  return `${combo.vehicleName} × ${combo.vehicleCount}`;
}

function sameCombo(a: VehicleCombination | null, b: VehicleCombination | null): boolean {
  if (!a || !b) return false;
  return a.vehicleTypeId === b.vehicleTypeId && a.vehicleCount === b.vehicleCount;
}

export function OverrideForm({
  action,
  date,
  routeId,
  resultId,
  recommendedJson,
  recommended,
  selected,
  options,
  defaultReason,
}: {
  action: (formData: FormData) => void | Promise<void>;
  date: string;
  routeId: string;
  resultId: string;
  recommendedJson: string;
  recommended: VehicleCombination | null;
  selected: VehicleCombination | null;
  options: VehicleCombination[];
  defaultReason?: string | null;
}) {
  const [comboJson, setComboJson] = useState(JSON.stringify(selected ?? recommended));
  const [reason, setReason] = useState(defaultReason ?? "");
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(() => {
    try {
      return JSON.parse(comboJson) as VehicleCombination;
    } catch {
      return null;
    }
  }, [comboJson]);

  const isOverride = Boolean(recommended && chosen && !sameCombo(recommended, chosen));

  return (
    <form
      action={action}
      className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end"
      onSubmit={(event) => {
        if (isOverride && !reason.trim()) {
          event.preventDefault();
          setError("추천과 다른 안을 고르면 변경 사유를 입력해야 합니다.");
          return;
        }
        setError(null);
      }}
    >
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="recommendedJson" value={recommendedJson} />
      <div className="field">
        <label htmlFor={`combo-${resultId}`}>최종 선택</label>
        <select
          id={`combo-${resultId}`}
          className={`select ${error ? "select-error" : ""}`}
          name="combinationJson"
          value={comboJson}
          onChange={(event) => {
            setComboJson(event.target.value);
            setError(null);
          }}
        >
          {options.map((combo) => (
            <option key={`${combo.vehicleTypeId}-${combo.vehicleCount}`} value={JSON.stringify(combo)}>
              {comboLabel(combo)} / {formatCost(combo.estimatedCost)}
            </option>
          ))}
        </select>
        {isOverride ? (
          <FieldHint>추천과 다릅니다. 사유 입력 후 저장하세요.</FieldHint>
        ) : (
          <FieldHint>추천안을 그대로 두면 사유는 필요 없습니다.</FieldHint>
        )}
      </div>
      <div className="field">
        <label htmlFor={`reason-${resultId}`}>
          변경 사유 {isOverride ? "*" : "(선택)"}
        </label>
        <input
          id={`reason-${resultId}`}
          className={`input ${error ? "input-error" : ""}`}
          name="overrideReason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
          placeholder="예: 해당 거래처 2.5톤 진입 불가"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `reason-error-${resultId}` : undefined}
        />
        {error ? (
          <div id={`reason-error-${resultId}`}>
            <FieldError message={error} />
          </div>
        ) : null}
      </div>
      <button className="btn btn-primary" type="submit">
        선택 저장
      </button>
    </form>
  );
}
