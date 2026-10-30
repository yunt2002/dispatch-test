/** 같은 합차 묶음이라도 상태가 다른 기록은 각각의 상태 칸에 남긴다. */
export function groupScheduleCards<T extends { id: string; status: string; consolidateGroupId: string | null }>(entries: T[]): T[][] {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.consolidateGroupId ? `group:${entry.consolidateGroupId}:${entry.status}` : `item:${entry.id}`;
    const group = grouped.get(key);
    if (group) group.push(entry);
    else grouped.set(key, [entry]);
  }
  return [...grouped.values()];
}
