/** 구간별 이동시간의 누계로 도착시각을 계산한다. 하차·대기시간은 포함하지 않는다. */
export function estimateArrivalTimes(departure: string, legs: number[] | null | undefined, stopCount: number): (string | null)[] {
  const result: (string | null)[] = Array(stopCount).fill(null);
  const match = /^(\d{2}):(\d{2})$/.exec(departure);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || !legs || legs.length !== stopCount) return result;
  let seconds = 0;
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  for (let i = 0; i < stopCount; i++) {
    if (!Number.isFinite(legs[i]) || legs[i] < 0) break;
    seconds += legs[i];
    const minutes = startMinutes + Math.round(seconds / 60);
    const days = Math.floor(minutes / 1440);
    const clock = minutes % 1440;
    result[i] = `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}${days ? ` (+${days}일)` : ""}`;
  }
  return result;
}
