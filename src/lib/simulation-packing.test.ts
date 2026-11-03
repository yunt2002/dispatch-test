import { strict as assert } from "node:assert";
import { test } from "node:test";
import { packingPallets } from "./simulation-packing";

test("자동 적재는 기준표와 박스 수가 있으면 PLT를 추정하며 값이 없으면 미확인이다", () => {
  assert.equal(packingPallets(2, 40, "auto"), 1);
  assert.equal(packingPallets(80, 40, "auto"), 2);
  assert.equal(packingPallets(41, 40, "auto"), 2);
  assert.equal(packingPallets(2, null, "auto"), null);
  assert.equal(packingPallets(null, 40, "auto"), null);
  assert.equal(packingPallets(2, 0, "auto"), null);
  assert.equal(packingPallets(2, 40, "unknown"), null);
  assert.equal(packingPallets(80, 40, "unknown"), null);
});
test("합적·별도 박스는 추가 PLT가 없고 별도 PLT는 기준에 따라 계산한다", () => {
  assert.equal(packingPallets(2, 40, "shared"), 0);
  assert.equal(packingPallets(2, 40, "loose"), 0);
  assert.equal(packingPallets(41, 40, "pallet"), 2);
  assert.equal(packingPallets(2, null, "pallet"), null);
  assert.equal(packingPallets(null, 40, "loose"), null);
});
