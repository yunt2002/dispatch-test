"use client";

import { uploadPlanExcel } from "@/app/plan/actions";

export function ExcelImportForm({ excelCount }: { excelCount: number }) {
  return (
    <form
      action={uploadPlanExcel}
      className="card p-4"
      onSubmit={(event) => {
        if (excelCount <= 0) return;
        const ok = confirm(
          `엑셀에서 가져온 모든 날짜의 일정 ${excelCount}건이 선택한 시트의 내용으로 교체됩니다.\n새 시트에 없는 날짜의 엑셀 일정도 삭제됩니다. 홈에서 직접 등록한 일정은 그대로 남습니다.`,
        );
        if (!ok) event.preventDefault();
      }}
    >
      <div className="grid-form">
        <div className="field">
          <label htmlFor="file">납품관리 Excel (.xlsx)</label>
          <input id="file" className="input" name="file" type="file" accept=".xlsx,.xls" required />
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
