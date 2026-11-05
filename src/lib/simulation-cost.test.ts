import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addReturnCharterTrip,
  charterDestinationKey,
  charterFareDestinations,
  charterGroupsSignature,
  charterGroupsCost,
  defaultOriginalCharterTrips,
  estimateCharterTrips,
  estimateSimulationCost,
  estimatedCharterGroupsCost,
  estimatedOriginalCharterCost,
  estimatedTripsCost,
  hasComparableRoutes,
  mergeCharterTrips,
  parseCharterTrips,
  restoreEditedCharterTrips,
  simulationCostIssues,
  splitCharterTrip,
  syncOriginalCharterTrips,
  tripLabel,
  tripsFromCharterGroups,
  type CharterTrip,
} from "./simulation-cost";

test("AI 운행을 묶으면 비용이 변경되고 같은 AI 결과에서만 수정안을 복원한다", () => {
  const a = { rowNumber: 1, customer: "A", location: "광주" };
  const b = { rowNumber: 2, customer: "B", location: "광주" };
  const groups = [{ items: [a] }, { items: [b] }];
  const initial = tripsFromCharterGroups(groups, "proposed");
  const edited = mergeCharterTrips(initial, initial.map((trip) => trip.id));
  assert.equal(estimatedTripsCost(initial), 400000);
  assert.equal(estimatedTripsCost(edited), 200000);
  assert.deepEqual(restoreEditedCharterTrips(groups, parseCharterTrips(edited), charterGroupsSignature(groups)), edited);
  assert.equal(restoreEditedCharterTrips(groups, edited, charterGroupsSignature([{ items: [a, b] }])).length, 2);
  assert.equal(restoreEditedCharterTrips(groups, [{ ...edited[0], rowNumbers: [1] }], charterGroupsSignature(groups)).length, 2);
});

test("AI 용차를 목적지별로 분리하고 회수를 추가해도 저장된 운행과 비용을 복원한다", () => {
  const a = { rowNumber: 1, customer: "A", location: "광주" };
  const b = { rowNumber: 2, customer: "B", location: "창원" };
  const groups = [{ items: [a, b] }];
  const initial = tripsFromCharterGroups(groups, "proposed");
  const parts = splitCharterTrip(initial[0], [a, b]);
  const returnTrip = { ...addReturnCharterTrip(parts[0]), fare: "250000" };
  const saved = [...parts, returnTrip];
  assert.equal(parts.length, 2);
  assert.equal(estimatedTripsCost(saved), 650000);
  assert.deepEqual(restoreEditedCharterTrips(groups, parseCharterTrips(saved), charterGroupsSignature(groups)), saved);
  assert.equal(estimatedTripsCost(saved.filter((trip) => trip.id !== returnTrip.id)), 400000);
  const invalid = [...parts, { ...returnTrip, rowNumbers: [99] }];
  assert.equal(restoreEditedCharterTrips(groups, invalid, charterGroupsSignature(groups)).length, 1);
});

test("기존 운행 비용 제외는 저장 후 유지되며 다시 포함할 수 있다", () => {
  const item = { rowNumber: 1, customer: "거래처", location: "안양" };
  const original = defaultOriginalCharterTrips([item])[0];
  const excluded = { ...original, excluded: true };
  const restored = syncOriginalCharterTrips([item], parseCharterTrips([excluded]));
  assert.equal(restored[0].excluded, true);
  assert.equal(estimatedTripsCost(restored), 0);
  assert.equal(estimatedTripsCost([{ ...restored[0], excluded: false }]), 200000);
  const returnTrip = addReturnCharterTrip(original);
  assert.equal(estimatedTripsCost([original, returnTrip]), 400000);
  assert.equal(estimatedTripsCost([original, returnTrip].filter((trip) => trip.id !== returnTrip.id)), 200000);
});

test("운임 입력에는 각 비교안에서 용차가 필요한 목적지만 표시한다", () => {
  const item = (rowNumber: number, customer: string, transport: string, vehicle: string | null = null) => ({ rowNumber, customer, location: "경기", transport, vehicle });
  const own = item(1, "자사", "자사", "1호차");
  const original = item(2, "기존 용차", "용차");
  const parcel = item(3, "택배", "택배");
  const proposed = item(4, "AI 용차", "용차");
  const regional = item(5, "지방안 용차", "자사", "2호차");
  const destinations = charterFareDestinations([own, original, parcel], [{ items: [original, proposed] }], { charterGroups: [{ items: [regional] }] });
  assert.deepEqual(destinations.map(([, value]) => value.customer), ["기존 용차", "AI 용차", "지방안 용차"]);
  assert.deepEqual(charterFareDestinations([own, parcel], null, { charterGroups: [{ items: [regional] }], error: "계산 실패" }), []);
});

test("목적지별 운임은 운행마다 반영하고 미입력은 계산하지 않는다", () => {
  const a = { rowNumber: 1, customer: "만도", location: "안양" };
  const b = { rowNumber: 2, customer: "삼현", location: "창원" };
  const fares = { [charterDestinationKey(a)]: "250000", [charterDestinationKey(b)]: "350000" };
  assert.equal(charterGroupsCost([{ items: [a] }, { items: [b] }], fares), 600000);
  assert.equal(charterGroupsCost([{ items: [a] }], {}), null);
  assert.equal(charterGroupsCost([{ items: [a, b] }], { [charterDestinationKey(a)]: "1400000" }), 1400000);
  assert.equal(charterGroupsCost([], {}), 0);
});

test("기본 운임으로 기존 비교를 유지하고 입력 운임만 대체한다", () => {
  const a = { rowNumber: 1, customer: "만도", location: "안양" };
  const b = { rowNumber: 2, customer: "삼현", location: "창원" };
  const groups = [{ items: [a] }, { items: [b] }];
  assert.equal(estimatedCharterGroupsCost(groups, {}), 400000);
  assert.equal(estimatedCharterGroupsCost(groups, { [charterDestinationKey(a)]: "300000" }), 500000);
  assert.equal(estimatedCharterGroupsCost(groups, { [charterDestinationKey(a)]: "0" }), 200000);
  assert.equal(estimatedCharterGroupsCost([{ items: [a, b] }], {}), 200000);
  assert.equal(estimatedCharterGroupsCost([{ items: [a, b] }], { [charterDestinationKey(a)]: "300000" }), 300000);
  assert.equal(estimatedOriginalCharterCost(groups, {}, "3"), 600000);
  assert.equal(estimatedOriginalCharterCost(groups, { [charterDestinationKey(a)]: "300000" }, "3"), null);
});

test("10/14 기준 운행 단위 운임(광주 편도·회수, DIC→GMB 왕복)을 합산한다", () => {
  const gwangju = { rowNumber: 1, customer: "비엠씨 광주공장", location: "광주" };
  const dic = { rowNumber: 2, customer: "디아이씨", location: "울주" };
  const gmb = { rowNumber: 3, customer: "지엠비 코리아", location: "창원" };
  const byRow = new Map([[1, gwangju], [2, dic], [3, gmb]]);
  const outbound: CharterTrip = { id: "original:gwangju", leg: "one_way", rowNumbers: [1], fare: "450000" };
  const inbound = { ...addReturnCharterTrip(outbound), fare: "280000" };
  const multi: CharterTrip = { id: "original:merged", leg: "round_trip", rowNumbers: [2, 3], fare: "1400000" };
  const trips = [outbound, inbound, multi];
  assert.equal(estimatedTripsCost(trips), 2130000);
  assert.equal(tripLabel(outbound, byRow), "네오 → 비엠씨 광주공장(광주)");
  assert.match(tripLabel(inbound, byRow), /회수/);
  assert.equal(tripLabel(multi, byRow), "네오 → 디아이씨(울주) → 지엠비 코리아(창원) → 네오");
  assert.equal(estimatedTripsCost([{ ...multi, fare: "" }]), 200000);
});

test("기존 운행 묶기·분리와 AI 묶음 운행 변환을 지원한다", () => {
  const a = { rowNumber: 10, customer: "디아이씨", location: "울주" };
  const b = { rowNumber: 11, customer: "지엠비 코리아", location: "창원" };
  const defaults = defaultOriginalCharterTrips([a, b]);
  assert.equal(defaults.length, 2);
  const merged = mergeCharterTrips(defaults, defaults.map((trip) => trip.id));
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].rowNumbers, [10, 11]);
  const synced = syncOriginalCharterTrips([a, b], [{ id: "keep", leg: "round_trip", rowNumbers: [10, 11], fare: "1400000" }]);
  assert.equal(synced[0].fare, "1400000");
  const fromAi = tripsFromCharterGroups([{ items: [a, b] }], "proposed", [{ id: "proposed:10,11", leg: "round_trip", rowNumbers: [10, 11], fare: "1400000" }]);
  assert.equal(fromAi[0].leg, "round_trip");
  assert.equal(fromAi[0].fare, "1400000");
});

const input = { originalVehicle: 146164, proposedVehicle: 485394, originalTrips: "3", proposedTrips: "1", originalHasCharter: true, proposedHasCharter: true };
test("비용 미표시 시 누락된 경로·통행료·연료비와 용차 횟수를 구분한다", () => {
  const route = { vehicle: "1호차", items: [1], distance: 100, fuel: 50000, toll: null };
  assert.deepEqual(simulationCostIssues([{ label: "AI 제안", routes: [route] }], 7, true), ["AI 제안 1호차: 통행료 미확인"]);
  assert.deepEqual(simulationCostIssues([{ label: "기존", routes: [{ ...route, distance: null }] }], 0, true), ["기존 1호차: 카카오 경로 미확인", "기존 용차 운행 횟수 확인 필요"]);
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
