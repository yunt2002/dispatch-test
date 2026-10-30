import { strict as assert } from "node:assert";
import { test } from "node:test";
import { estimateSimulationCost } from "./simulation-cost";

const input = { originalVehicle: 146164, proposedVehicle: 485394, originalTrips: "3", proposedTrips: "1", originalHasCharter: true, proposedHasCharter: true };
test("용차 운행 횟수와 자사 차량 비용을 합산해 절감과 증가를 구한다", () => {
  assert.deepEqual(estimateSimulationCost(input), { original: 746164, proposed: 685394, saving: 60770 });
  assert.equal(estimateSimulationCost({ ...input, proposedTrips: "3" })?.saving, -339230);
});
test("미확인 금액과 용차 잔여 품목에 모순되는 횟수는 결과를 만들지 않는다", () => {
  assert.equal(estimateSimulationCost({ ...input, proposedTrips: "" }), null);
  assert.equal(estimateSimulationCost({ ...input, proposedTrips: "0" }), null);
  assert.equal(estimateSimulationCost({ ...input, proposedVehicle: null }), null);
  assert.ok(estimateSimulationCost({ ...input, proposedTrips: "0", proposedHasCharter: false }));
});
