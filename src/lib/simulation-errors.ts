export type SimulationStage = "request" | "workbook" | "data" | "location" | "ai" | "route" | "save";

/** 내부 오류나 비밀정보를 노출하지 않고 실패 지점만 안내한다. */
export function simulationStageError(stage: SimulationStage): string {
  switch (stage) {
    case "request": return "요청을 읽지 못했습니다. 파일과 입력값을 확인하고 다시 시도하세요.";
    case "workbook": return "엑셀 파일을 읽지 못했습니다. 파일 형식과 시트 내용을 확인하세요.";
    case "data": return "배차 기준 또는 저장된 결과를 불러오지 못했습니다. 잠시 후 다시 시도하세요.";
    case "location": return "납품지 주소 또는 좌표를 확인하는 중 오류가 발생했습니다. 다시 시도하세요.";
    case "ai": return "AI 배차안을 처리하는 중 오류가 발생했습니다. 기존 저장 결과는 유지됩니다.";
    case "route": return "배차 경로를 계산하는 중 오류가 발생했습니다. 기존 저장 결과는 유지됩니다.";
    case "save": return "배차 결과를 저장하지 못했습니다. 기존 저장 결과를 확인하고 다시 시도하세요.";
  }
}
