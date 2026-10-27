export function todayISO(timeZone = "Asia/Seoul"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** Excel 일정표와 같은 `9/15(화)` 표기 */
export function formatSheetDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(year, month - 1, day).getDay()
  ];
  return `${month}/${day}(${weekday})`;
}

export function formatWeight(kg: number | null | undefined): string {
  if (kg == null || Number.isNaN(kg)) return "-";
  return `${kg.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} kg`;
}

export function formatCost(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "운송비 미등록";
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export function formatRate(percent: number | null | undefined): string {
  if (percent == null || Number.isNaN(percent)) return "-";
  return `${percent.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export function parseJsonIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function stringifyIds(ids: string[]): string {
  return JSON.stringify(ids);
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
