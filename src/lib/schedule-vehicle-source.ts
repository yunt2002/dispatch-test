export const EXCEL_LOGISTICS_REASON_PREFIX = "엑셀 물류 그대로 · ";
export const SIMULATION_ASSIGNMENT_REASON_PREFIX = "AI 시뮬 배정 (";

export function explicitScheduleVehicleReason(entry: { source: string; recommendationReason: string | null }) {
  const lines = entry.recommendationReason?.split("\n") ?? [];
  const simulation = lines.findLast((line) => line.startsWith(SIMULATION_ASSIGNMENT_REASON_PREFIX));
  if (simulation) return simulation;
  const firstLine = lines[0];
  return entry.source === "EXCEL" && firstLine?.startsWith(EXCEL_LOGISTICS_REASON_PREFIX)
    ? firstLine
    : null;
}
