import { strict as assert } from "node:assert";
import { test } from "node:test";
import { packingPallets } from "./simulation-packing";

test("박스의 기본 적재 방식은 확인 필요이며 팔레트를 임의 배정하지 않는다", () => {
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
