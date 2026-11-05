import { strict as assert } from "node:assert";
import { test } from "node:test";
import { simulationFleet, simulationVehicleName, simulationVehicleOver } from "./simulation-vehicles";

test("엑셀 스타리아 물량을 자사 차량으로 인식한다", () => {
  assert.equal(simulationVehicleName("스타리아"), "스타리아");
  assert.equal(simulationVehicleName("1호 차량(3.5t)"), "1호차");
  assert.equal(simulationVehicleName("택배"), null);
});

test("DB에 등록된 스타리아 한도와 참고 연비를 쓰며 한도 초과를 판정한다", () => {
  const fleet = simulationFleet({ maxPallet: 1, maxWeight: 1000 });
  assert.deepEqual(fleet.map((vehicle) => vehicle.name), ["1호차", "2호차", "스타리아"]);
  const staria = fleet[2];
  assert.equal(staria.fuelEconomy, 11.6);
  assert.equal(staria.carType, 1);
  assert.equal(simulationVehicleOver(staria, 1, 1000), false);
  assert.equal(simulationVehicleOver(staria, 2, 100), true);
  assert.equal(simulationVehicleOver(staria, 1, 1001), true);
  assert.equal(simulationFleet(null).length, 2);
  assert.equal(simulationFleet({ maxPallet: null, maxWeight: 1000 }).length, 2);
});
