import { strict as assert } from "node:assert";
import { test } from "node:test";
import { courierCost, courierTotal } from "./simulation-courier";
import type { SimulationItem } from "./simulation";

test("택배 출고 단위와 수량에 따라 요금을 계산한다", () => {
  assert.equal(courierCost({ transport: "택배 박스", boxes: 10, pallets: 2 })?.amount, 70000);
  assert.equal(courierCost({ transport: "택배 PLT", boxes: 10, pallets: 2 })?.amount, 100000);
  assert.equal(courierCost({ transport: "택배", boxes: 10, pallets: 2 }), null);
  assert.equal(courierCost({ transport: "택배", boxes: 10, pallets: null }, { mode: "pallet", quantity: 2 })?.amount, 100000);
  assert.equal(courierCost({ transport: "택배 PLT", boxes: 10, pallets: null }), null);
  assert.equal(courierCost({ transport: "택배", boxes: 4, pallets: 1 }, { mode: "pallet", quantity: 0 })?.amount, 0);
});

test("택배 출고 방식이 모두 확인되어야 안별 운임을 합산한다", () => {
  const items = [
    { rowNumber: 1, transport: "택배 박스", boxes: 10, pallets: 1 },
    { rowNumber: 2, transport: "택배", boxes: 20, pallets: 2 },
  ] as SimulationItem[];
  assert.equal(courierTotal(items, {}), null);
  assert.equal(courierTotal(items, { "2": { mode: "pallet" } }), 170000);
  assert.equal(courierTotal([], {}), 0);
});
