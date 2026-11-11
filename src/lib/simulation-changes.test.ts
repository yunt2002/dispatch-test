import { test } from "node:test";
import { strict as assert } from "node:assert";
import { simulationChanges } from "./simulation-changes";
import type { SimulationItem, SimulationResult, SimulationRoute } from "./simulation";

test("차량 전환과 같은 차량의 순서 변경을 구분하고 누락된 자사 품목은 제외한다", () => {
  const item = (rowNumber: number, vehicle: SimulationItem["vehicle"], transport: string) => ({ rowNumber, vehicle, transport, customer: `업체${rowNumber}`, product: "품목" }) as SimulationItem;
  const a = item(1, "1호차", "1호차"), b = item(2, "1호차", "1호차"), c = item(3, null, "용차"), missing = item(4, "2호차", "2호차");
  const route = (vehicle: string, items: SimulationItem[]) => ({ vehicle, items }) as SimulationRoute;
  const result = { items: [a, b, c, missing], original: [route("1호차", [a, b]), route("2호차", [])], proposed: [route("1호차", [b, c, a]), route("2호차", [])] } as SimulationResult;
  const changes = simulationChanges(result);
  assert.deepEqual(changes.groups.map(({ from, to, items }) => [from, to, items.map((value) => value.rowNumber)]), [["용차", "1호차", [3]]]);
  assert.deepEqual(changes.orderChanges, ["1호차"]);
  assert.deepEqual(changes.unknown.map((value) => value.rowNumber), [4]);
});
