import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SimulationItem, SimulationRoute } from "./simulation";
import {
  compareManagerToRecommended,
  orderCompareSummary,
  stopsInVisitOrder,
} from "./simulation-visit-order";

function item(partial: Partial<SimulationItem> & Pick<SimulationItem, "rowNumber" | "customer">): SimulationItem {
  return { product: "품목", location: "", transport: "자차", vehicle: "1호차", lat: null, lng: null, pallets: 1, weight: 100, packing: "auto", boxes: 1, address: null, date: "2025-01-01", productCode: "", quantity: 1, ...partial } as SimulationItem;
}

function route(vehicle: string, items: SimulationItem[]): SimulationRoute {
  return { vehicle, items, pallets: 0, weight: 0, unknownPallets: 0, unknownWeight: 0, distance: null, minutes: null, toll: null, fuel: null, over: false };
}

test("같은 납품지는 한 번만 남기고 첫 순서를 유지한다", () => {
  const stops = stopsInVisitOrder([
    item({ rowNumber: 1, customer: "A", address: "서울", lat: 37.5, lng: 127.0 }),
    item({ rowNumber: 2, customer: "A", address: "서울", lat: 37.5, lng: 127.0 }),
    item({ rowNumber: 3, customer: "B", address: "수원", lat: 37.2, lng: 127.1 }),
  ]);
  assert.deepEqual(stops.map((stop) => stop.label), ["A", "B"]);
});

test("담당자 순서가 가까운 곳부터면 동일로 본다", () => {
  const near = item({ rowNumber: 1, customer: "가까운", lat: 37.38, lng: 127.41, address: "a" });
  const far = item({ rowNumber: 2, customer: "먼곳", lat: 37.55, lng: 126.9, address: "b" });
  const rows = compareManagerToRecommended([route("1호차", [near, far])]);
  assert.equal(rows[0].status, "same");
  assert.equal(orderCompareSummary(rows), "1호차 동일");
});

test("먼 곳부터 가면 추천 순서와 다르다고 표시한다", () => {
  const near = item({ rowNumber: 1, customer: "가까운", lat: 37.38, lng: 127.41, address: "a" });
  const far = item({ rowNumber: 2, customer: "먼곳", lat: 37.55, lng: 126.9, address: "b" });
  const rows = compareManagerToRecommended([route("1호차", [far, near])]);
  assert.equal(rows[0].status, "different");
  assert.deepEqual(rows[0].manager.map((stop) => stop.label), ["먼곳", "가까운"]);
  assert.deepEqual(rows[0].recommended?.map((stop) => stop.label), ["가까운", "먼곳"]);
});

test("좌표가 없으면 추천 불가로 표시한다", () => {
  const rows = compareManagerToRecommended([
    route("2호차", [
      item({ rowNumber: 1, customer: "A", lat: null, lng: null }),
      item({ rowNumber: 2, customer: "B", lat: 37.4, lng: 127.4 }),
    ]),
  ]);
  assert.equal(rows[0].status, "unavailable");
  assert.equal(rows[0].recommended, null);
});
