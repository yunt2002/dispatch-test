/** 보드 표시용 합차 라벨 (클라이언트·서버 공용) */
export function consolidateLabel(groupId: string | null | undefined) {
  if (!groupId) return null;
  return `합차 ${groupId.slice(-4).toUpperCase()}`;
}
