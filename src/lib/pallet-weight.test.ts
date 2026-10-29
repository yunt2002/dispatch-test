import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeShipmentWeightKg,
  effectiveKgPerPallet,
  PALLET_TARE_KG,
} from "./pallet-weight";

describe("pallet / box weight from 제품 정리 sheet", () => {
  it("uses BOX별 중량(g) × boxes as primary kg", () => {
    // IDB2: 13000g × 40 = 520kg (풀 PLT)
    const full = computeShipmentWeightKg({
      boxCount: 40,
      boxWeightG: 13000,
      kgPerPallet: 520,
    });
    assert.equal(full.kg, 520);
    assert.equal(full.source, "boxes");

    // 90박스만 — 비례 중량 (PLT ceil과 별개)
    const partial = computeShipmentWeightKg({
      boxCount: 90,
      boxWeightG: 13000,
      palletCount: 3,
      kgPerPallet: 520,
    });
    assert.equal(partial.kg, 1170);
    assert.equal(partial.source, "boxes");
  });

  it("uses sheet PLT kg when only PLT count is known (no extra tare)", () => {
    assert.equal(effectiveKgPerPallet(520, 600), 520);
    const byPlt = computeShipmentWeightKg({
      palletCount: 2,
      kgPerPallet: 520,
      fallbackKgPerPallet: 600,
    });
    assert.equal(byPlt.kg, 1040);
    assert.equal(byPlt.source, "pallets");
  });

  it("adds tare only for settings fallback kg/PLT", () => {
    assert.equal(PALLET_TARE_KG, 8);
    assert.equal(effectiveKgPerPallet(null, 600), 608);
    const fallback = computeShipmentWeightKg({
      palletCount: 1,
      fallbackKgPerPallet: 600,
    });
    assert.equal(fallback.kg, 608);
    assert.equal(fallback.source, "fallback-pallets");
  });

  it("supports 낱개 via box weight without PLT", () => {
    // CN7: 1650g × 10박스
    const loose = computeShipmentWeightKg({
      boxCount: 10,
      boxWeightG: 1650,
      kgPerPallet: null,
    });
    assert.equal(loose.kg, 16.5);
    assert.equal(loose.source, "boxes");
  });
});
