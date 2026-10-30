import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chooseSimulationCandidate, type CandidateForRanking } from "./simulation-candidates";
import type { SimulationRoute } from "./simulation";

const route = (fuel: number | null, toll: number | null, over = false): SimulationRoute => ({ vehicle: "1호차", items: [{} as SimulationRoute["items"][number]], pallets: 0, weight: 0, unknownPallets: 1, unknownWeight: 1, distance: 1, minutes: 1, toll, fuel, over });
const candidate = (charterCount: number, fuel: number | null, over = false, courierMovedIds: string[] = []): CandidateForRanking => ({ routes: [route(fuel, 10000, over), { ...route(0, 0), items: [] }], charterCount, courierMovedIds });
test("과적 후보를 제외하고 실제 계산된 용차·자사 비용 합계가 낮은 후보를 선택한다", () => {
  assert.equal(chooseSimulationCandidate([candidate(2, 100000), candidate(1, 120000), candidate(0, 1, true)]).index, 1);
  assert.equal(chooseSimulationCandidate([candidate(1, 100, true)]).index, null);
});
test("택배 방식이나 통행 비용을 비교할 수 없으면 최저 비용이라고 주장하지 않는다", () => {
  assert.match(chooseSimulationCandidate([candidate(1, null), candidate(2, 100)]).note, /순위를 정할 수 없/);
  assert.match(chooseSimulationCandidate([candidate(1, 100, false, ["3"]), candidate(1, 100)]).note, /택배비/);
});
