import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SimulationRoute } from "./simulation";
import { planHasUnknownLoad, routeFieldReadiness, routeFieldReadinessLabel } from "./simulation-field-readiness";

const route = (partial: Partial<SimulationRoute>): SimulationRoute => ({
  vehicle: "스타리아",
  items: [],
  pallets: 0,
  weight: 0,
  unknownPallets: 0,
  unknownWeight: 0,
  distance: 1,
  minutes: 1,
  toll: 0,
  fuel: 0,
  over: false,
  ...partial,
});

test("미확인 적재는 현장 확인 전으로 구분한다", () => {
  assert.equal(routeFieldReadiness(route({ unknownPallets: 5 })), "unknown_load");
  assert.match(routeFieldReadinessLabel("unknown_load"), /현장 확인 전/);
  assert.equal(planHasUnknownLoad([route({ unknownPallets: 1 }), route({})]), true);
});

test("한도 초과와 확인 완료를 구분한다", () => {
  assert.equal(routeFieldReadiness(route({ over: true, unknownPallets: 2 })), "over");
  assert.equal(routeFieldReadiness(route({})), "ready");
});
