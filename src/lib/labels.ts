/** UI 표시용 한국어 라벨. DB/로직 코드 값은 영문 유지. */

export const REGION_TYPE_LABEL: Record<string, string> = {
  LOCAL: "지방",
  METROPOLITAN: "수도권",
  EMERGENCY: "긴급납품",
  CHARTER: "용차",
  COURIER: "택배",
  UNKNOWN: "미분류",
  ANY: "전체",
};

export const PRIORITY_TYPE_LABEL: Record<string, string> = {
  NORMAL: "일반",
  EMERGENCY: "긴급납품",
};

export function regionTypeLabel(code: string | null | undefined): string {
  if (!code) return "-";
  return REGION_TYPE_LABEL[code] ?? code;
}

export function priorityTypeLabel(code: string | null | undefined): string {
  if (!code) return "-";
  return PRIORITY_TYPE_LABEL[code] ?? code;
}

/** 추천 이유를 차 이름 옆 한 줄로 */
export function reasonOneLine(reason: string | null | undefined): string {
  if (!reason) return "";
  const lines = reason
    .split(/\n+/)
    .map((line) => line.replace(/^추천:\s*/, "").trim())
    .filter(Boolean);
  const useful = lines.filter(
    (line) => !line.includes("적재율은 미검증") && !line.includes("박스÷임의수"),
  );
  return useful.at(-1) || lines.at(-1) || "";
}
