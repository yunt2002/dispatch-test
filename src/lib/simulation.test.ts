import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validateCharterGroups, validateSimulationOrders, type SimulationItem } from "./simulation";

const item = (id: number, vehicle: SimulationItem["vehicle"], hasLocation = true): SimulationItem => ({ rowNumber: id, date: "2026-10-14", customer: "업체", location: "지역", product: "품목", productCode: "", quantity: 1, boxes: 1, transport: vehicle ?? "용차", vehicle, lat: hasLocation ? 37 : null, lng: hasLocation ? 127 : null, pallets: 1, weight: 100, packing: "pallet" });
const items = [item(1, "1호차"), item(2, "2호차"), item(3, null), item(4, null, false)];
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
