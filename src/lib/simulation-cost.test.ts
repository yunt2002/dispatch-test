import { strict as assert } from "node:assert";
import { test } from "node:test";
import { estimateSimulationCost, estimateCharterTrips, hasComparableRoutes, simulationCostIssues, charterDestinationKey, charterGroupsCost, estimatedCharterGroupsCost, estimatedOriginalCharterCost } from "./simulation-cost";

test("목적지별 운임은 운행마다 반영하고 미입력이나 복수 목적지는 계산하지 않는다", () => {
  const a = { rowNumber: 1, customer: "만도", location: "안양" };
  const b = { rowNumber: 2, customer: "삼현", location: "창원" };
  const fares = { [charterDestinationKey(a)]: "250000", [charterDestinationKey(b)]: "350000" };
  assert.equal(charterGroupsCost([{ items: [a] }, { items: [b] }], fares), 600000);
  assert.equal(charterGroupsCost([{ items: [a] }], {}), null);
  assert.equal(charterGroupsCost([{ items: [a, b] }], fares), null);
  assert.equal(charterGroupsCost([], {}), 0);
});

test("기본 운임으로 기존 비교를 유지하고 입력 운임만 대체한다", () => {
  const a = { rowNumber: 1, customer: "만도", location: "안양" };
  const b = { rowNumber: 2, customer: "삼현", location: "창원" };
  const groups = [{ items: [a] }, { items: [b] }];
  assert.equal(estimatedCharterGroupsCost(groups, {}), 400000);
  assert.equal(estimatedCharterGroupsCost(groups, { [charterDestinationKey(a)]: "300000" }), 500000);
  assert.equal(estimatedCharterGroupsCost(groups, { [charterDestinationKey(a)]: "0" }), 200000);
  assert.equal(estimatedOriginalCharterCost(groups, {}, "3"), 600000);
  assert.equal(estimatedOriginalCharterCost(groups, { [charterDestinationKey(a)]: "300000" }, "3"), null);
});

const input = { originalVehicle: 146164, proposedVehicle: 485394, originalTrips: "3", proposedTrips: "1", originalHasCharter: true, proposedHasCharter: true };
test("비용 미표시 시 누락된 경로·통행료·연료비와 용차 횟수를 구분한다", () => {
  const route = { vehicle: "1호차", items: [1], distance: 100, fuel: 50000, toll: null };
  assert.deepEqual(simulationCostIssues([{ label: "AI 제안", routes: [route] }], "7", true), ["AI 제안 1호차: 통행료 미확인"]);
  assert.deepEqual(simulationCostIssues([{ label: "기존", routes: [{ ...route, distance: null }] }], "", true), ["기존 1호차: 카카오 경로 미확인", "기존 용차 운행 횟수 확인 필요"]);
});
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
test("용차 횟수 예시는 거래처·지역별로 묶되 업체가 없는 행은 임의 합치지 않는다", () => {
  const item = (rowNumber: number, customer: string, location: string, transport = "용차") => ({ rowNumber, customer, location, transport, vehicle: null });
  assert.equal(estimateCharterTrips([item(1, "A", "광주"), item(2, "A", "광주"), item(3, "A", "김해"), item(4, "", ""), item(5, "", ""), item(6, "B", "서울", "택배")]), 4);
});
test("적재 초과 경고가 있어도 경로와 기존 품목이 모두 있으면 비용을 비교한다", () => {
  const full = { items: [{ rowNumber: 1, vehicle: "1호차" }], original: [{ items: [{ rowNumber: 1 }], minutes: 100 }, { items: [], minutes: null }], proposed: [{ items: [{ rowNumber: 1 }], minutes: 200, over: true }, { items: [], minutes: null }] };
  assert.equal(hasComparableRoutes(full), true);
  assert.equal(hasComparableRoutes({ ...full, proposed: [{ items: [], minutes: null }, { items: [], minutes: null }] }), false);
  assert.equal(hasComparableRoutes({ ...full, original: [{ items: [{ rowNumber: 1 }], minutes: null }, { items: [], minutes: null }] }), false);
});
