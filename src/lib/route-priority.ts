/** 카카오 자동차 길찾기 priority */
export const ROUTE_PRIORITIES = [
  { id: "RECOMMEND", label: "추천", hint: "교통 반영" },
  { id: "TIME", label: "최단 시간", hint: "가장 빠른 길" },
  { id: "DISTANCE", label: "최단 거리", hint: "가장 짧은 길" },
  { id: "MAIN_ROAD", label: "큰길 우선", hint: "대로 위주" },
] as const;

export type RoutePriorityId = (typeof ROUTE_PRIORITIES)[number]["id"];

export function isRoutePriorityId(value: string): value is RoutePriorityId {
  return ROUTE_PRIORITIES.some((item) => item.id === value);
}
