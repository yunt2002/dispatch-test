import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validateCharterGroups, validateSimulationOrders, type SimulationItem } from "./simulation";
import { regionalScenarioItems, simulationRegion, validateRegionalOrders } from "./simulation-regions";

const item = (id: number, vehicle: SimulationItem["vehicle"], hasLocation = true): SimulationItem => ({ rowNumber: id, date: "2026-10-14", customer: "업체", location: "지역", product: "품목", productCode: "", quantity: 1, boxes: 1, transport: vehicle ?? "용차", vehicle, lat: hasLocation ? 37 : null, lng: hasLocation ? 127 : null, pallets: 1, weight: 100, packing: "pallet" });
const items = [item(1, "1호차"), item(2, "2호차"), item(3, null), item(4, null, false)];
test("수도권과 지방 분류는 광주 혼동을 피하고 아산을 지방으로 본다", () => {
  assert.equal(simulationRegion("평택", null), "capital");
  assert.equal(simulationRegion("아산", "충청남도 아산시"), "regional");
  assert.equal(simulationRegion("광주", null), "unknown");
  assert.equal(simulationRegion("광주", "경기도 광주시"), "capital");
  assert.equal(simulationRegion("광주", "광주광역시 광산구"), "regional");
});
test("지방 집중안은 수도권 자사 물량을 용차로 전환하고 수도권 배정을 차단한다", () => {
  const scenario = regionalScenarioItems([{ ...item(1, "2호차"), region: "capital" }, { ...item(2, "1호차"), region: "regional" }]);
  assert.equal(scenario[0].vehicle, null);
  assert.match(scenario[0].transport, /용차/);
  assert.ok(validateRegionalOrders(scenario, [{ vehicle: "1호차", ids: ["1"] }, { vehicle: "2호차", ids: ["2"] }]));
  const orders = [{ vehicle: "1호차", ids: ["2"] }, { vehicle: "2호차", ids: [] }];
  assert.equal(validateRegionalOrders(scenario, orders), null);
  assert.equal(validateCharterGroups(scenario, orders, [["1"]]), null);
});
test("용차 품목을 자사 차량으로 옮긴 제안을 허용한다", () => assert.equal(validateSimulationOrders(items, [{ vehicle: "1호차", ids: ["1", "3"] }, { vehicle: "2호차", ids: ["2"] }]), null));
test("기존 납품 누락, 중복, 좌표 없는 이동을 차단한다", () => {
  assert.ok(validateSimulationOrders(items, [{ vehicle: "1호차", ids: ["3"] }, { vehicle: "2호차", ids: ["2"] }]));
  assert.ok(validateSimulationOrders(items, [{ vehicle: "1호차", ids: ["1", "3"] }, { vehicle: "2호차", ids: ["2", "3"] }]));
  assert.ok(validateSimulationOrders(items, [{ vehicle: "1호차", ids: ["1", "4"] }, { vehicle: "2호차", ids: ["2"] }]));
});
test("자사 차량에 옮기지 않은 용차 품목은 AI 용차 묶음에 정확히 한 번 포함해야 한다", () => {
  const orders = [{ vehicle: "1호차", ids: ["1", "3"] }, { vehicle: "2호차", ids: ["2"] }];
  assert.equal(validateCharterGroups(items, orders, [["4"]]), null);
  assert.ok(validateCharterGroups(items, orders, []));
  assert.ok(validateCharterGroups(items, orders, [["4"], ["4"]]));
  assert.ok(validateCharterGroups(items, orders, [["3", "4"]]));
  const unrelated = { ...item(5, null), customer: "다른 업체", location: "먼 지역", lat: 35, lng: 129 };
  assert.ok(validateCharterGroups([...items, unrelated], orders, [["4", "5"]]));
  assert.equal(validateCharterGroups([...items, unrelated], orders, [["4"], ["5"]]), null);
});
