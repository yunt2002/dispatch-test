import { test } from "node:test";
import assert from "node:assert/strict";
import { boxLoadingPallets, capacityUnits, currentLoadingWarning } from "./schedule-box-loading";
import { computeShipmentWeightKg } from "./pallet-weight";

test("박스 적재 방식에 따라 추가 PLT만 계산한다", () => {
  assert.equal(boxLoadingPallets("unknown", ""), 0);
  assert.equal(boxLoadingPallets("shared", ""), 0);
  assert.equal(boxLoadingPallets("loose", ""), 0);
  assert.equal(boxLoadingPallets("pallet", "2"), 2);
  assert.equal(boxLoadingPallets("pallet", "0"), null);
  assert.equal(boxLoadingPallets("pallet", "1.5"), null);
  assert.equal(capacityUnits(0, 20), 0);
  assert.equal(capacityUnits(null, 20), 0);
  assert.equal(capacityUnits(2, 20), 2);
});

test("추가 PLT가 없어도 박스 중량은 계속 계산하고 미확인 중량은 추정하지 않는다", () => {
  assert.equal(computeShipmentWeightKg({ boxCount: 20, boxWeightG: 6000, palletCount: 0 }).kg, 120);
  assert.equal(computeShipmentWeightKg({ boxCount: 20, palletCount: 0 }).kg, null);
});

test("저장된 이전 1칸 안내는 현장 확인 문구로 표시하고 다른 경고는 유지한다", () => {
  assert.equal(currentLoadingWarning("제품: 낱개 박스 — PLT 환산 없음 · 별도 보관 · 자리 1칸"), "제품: 박스 적재 방식과 실제 공간 확인 필요 · 기존 PLT 값 확인");
  assert.equal(currentLoadingWarning("적재 중량 초과"), "적재 중량 초과");
});
