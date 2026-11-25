"use client";

import { uploadPlanExcel } from "@/app/plan/actions";
import { EXCEL_UPLOAD_SIZE_LABEL, excelUploadError } from "@/lib/excel-upload";

export function ExcelImportForm({ hasExcelDrafts }: { hasExcelDrafts: boolean }) {
  return (
    <form
      action={uploadPlanExcel}
      className="card p-4"
      onSubmit={(event) => {
        if (hasExcelDrafts && !confirm("선택한 시트에 포함된 날짜의 엑셀 신청 일정을 교체할까요?")) {
          event.preventDefault();
        }
      }}
    >
      <div className="grid-form">
        <div className="field">
          <label htmlFor="file">납품관리 Excel (.xlsx · {EXCEL_UPLOAD_SIZE_LABEL})</label>
          <input
            id="file"
            className="input"
            name="file"
            type="file"
            accept=".xlsx"
            required
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              const error = file ? excelUploadError(file) : null;
              input.setCustomValidity(error ?? "");
              if (error) input.reportValidity();
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="sheetName">월 시트명 (선택)</label>
          <input
            id="sheetName"
            className="input"
            name="sheetName"
            placeholder="비우면 가장 최근 월 시트"
          />
        </div>
      </div>
      <div className="mt-3">
        <button className="btn btn-primary" type="submit">
          가져와서 일정으로 등록
        </button>
      </div>
    </form>
  );
}
