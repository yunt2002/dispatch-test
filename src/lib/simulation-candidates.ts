import type { SimulationRoute } from "./simulation";

export type CandidateForRanking = { routes: SimulationRoute[]; charterCount: number; courierMovedIds: string[] };
export function chooseSimulationCandidate(candidates: CandidateForRanking[]): { index: number | null; note: string } {
  const valid = candidates.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => candidate.routes.length === 2 && !candidate.routes.some((route) => route.over));
  if (!valid.length) return { index: null, note: "적재 한도를 초과하지 않는 후보를 만들지 못했습니다." };
  const courierSets = valid.map(({ candidate }) => [...candidate.courierMovedIds].sort().join(","));
  if (new Set(courierSets).size > 1) return { index: valid[0].index, note: "택배비가 미확인이고 후보별 택배 처리가 달라 비용 순위를 정할 수 없습니다. 첫 번째 유효 후보입니다." };
  const measurable = valid.filter(({ candidate }) => candidate.routes.every((route) => !route.items.length || (route.fuel != null && route.toll != null && route.minutes != null)));
  if (measurable.length !== valid.length) return { index: valid[0].index, note: "일부 후보의 경유비·통행료가 미확인이라 비용 순위를 정할 수 없습니다. 첫 번째 유효 후보입니다." };
  measurable.sort((a, b) => {
    const cost = (value: CandidateForRanking) => value.charterCount * 200000 + value.routes.reduce((sum, route) => sum + (route.fuel ?? 0) + (route.toll ?? 0), 0);
    return cost(a.candidate) - cost(b.candidate) || a.index - b.index;
  });
  return { index: measurable[0].index, note: `알려진 적재 한도를 초과하지 않은 후보 ${measurable.length}개 중 자사 경유비·통행료와 용차 예시 운임 합계가 가장 낮은 안입니다. 미확인 적재량과 택배비·인건비는 제외되며 최적해를 보장하지 않습니다.` };
}
