import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SimulationRoute } from "./simulation";
import { simulationTime } from "./simulation-time";

test("운행 차량에 점심과 방문 업체별 하차 시간을 더한다", () => {
  const route = { minutes: 100, items: [
    { rowNumber: 1, customer: "현담산업", address: "주소 A" },
    { rowNumber: 2, customer: "현담산업", address: "주소 A" },
    { rowNumber: 3, customer: "다른 업체", address: "주소 B" },
  ] } as SimulationRoute;
  assert.deepEqual(simulationTime(route), { driving: 100, lunch: 60, unloading: 220, total: 380, stops: 2 });
});

test("운행이 없으면 점심을 더하지 않으며, 경로 미확인은 총 시간을 확정하지 않는다", () => {
  assert.equal(simulationTime({ items: [], minutes: null } as unknown as SimulationRoute).total, 0);
  const unknown = simulationTime({ items: [{ rowNumber: 1, customer: "업체", address: null }], minutes: null } as SimulationRoute);
  assert.equal(unknown.total, null);
  assert.equal(unknown.unloading, 40);
});
