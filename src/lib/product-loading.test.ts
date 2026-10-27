import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchProductLoading, normalizeBoxType } from "./product-loading";

describe("normalizeBoxType", () => {
  it("treats P folding boxes as P boxes", () => {
    assert.equal(normalizeBoxType("P 접이식박스"), "P 박스");
    assert.equal(normalizeBoxType("p접이식 박스"), "P 박스");
    assert.equal(normalizeBoxType("P 박스"), "P 박스");
    assert.equal(normalizeBoxType("종이박스"), "종이박스");
    assert.equal(normalizeBoxType("단프라"), "단프라");
  });
});

describe("matchProductLoading", () => {
  it("maps real product names to the ops table", () => {
    assert.equal(
      matchProductLoading("MA021-01010000-01", "IDB GEN2 ROTOR ASSY_BASE _ 태양")?.boxesPerPallet,
      40,
    );
    assert.equal(
      matchProductLoading("DA022-00009020-06", "DIC SBW ROTOR ASSY (NBPM / 폭 8.65/42UH)")
        ?.familyName,
      "DIC SBW 내수",
    );
    assert.equal(
      matchProductLoading("MA021-56010054-02", "SBW ROTOR ASSY (CE)")?.familyName,
      "DIC(수출)",
    );
    assert.equal(
      matchProductLoading("MA023-A7700030-02", "MPS ASSY BASE **수출사양** - 2 PLT")?.boxesPerPallet,
      15,
    );
    assert.equal(matchProductLoading("MA023-A7700030-01", "MPS ASSY BASE")?.boxesPerPallet, 96);
    assert.equal(matchProductLoading("MA021-JOYSONAK-02", "AK Ejector Hall SW Assy (수출품)")?.boxType, "종이박스");
    assert.equal(matchProductLoading("MA021-JOYSONAK-01", "AK Ejector Hall SW Assy (내수품)")?.boxesPerPallet, 30);
    assert.equal(matchProductLoading("MA121-5910070M-02", "EC-PUMP (9.85*6.85*11.9*28)")?.boxType, "P 박스");
    assert.equal(matchProductLoading("MA121-5910070M-02", "EC-PUMP (9.85*6.85*11.9*28)")?.boxesPerPallet, null);
    assert.equal(matchProductLoading("", "CVS SW PE EWP IMPELLER ASSY")?.familyName, "PE");
    assert.equal(matchProductLoading("", "CVS SW PE EWP IMPELLER ASSY")?.boxesPerPallet, 24);
    assert.equal(matchProductLoading("", "CVS SW BATT EWP IMPELLER ASSY")?.familyName, "BATT");
    assert.equal(matchProductLoading("", "Active Purge Pump Rotor Ass'y")?.boxesPerPallet, 60);
    assert.equal(matchProductLoading("", "IDB GEN1 ASSY (13.5*3.2)")?.boxesPerPallet, null);
    assert.equal(matchProductLoading("", "DM 4545 HFP3.2 ROTOR Assy")?.familyName, "3.2 ROTOR");
    assert.equal(matchProductLoading("", "DM 4545 HFP3.2 ROTOR Assy")?.boxesPerPallet, 60);
    assert.equal(matchProductLoading("", "EPS ASSY")?.boxesPerPallet, 42);
    assert.equal(
      matchProductLoading("DA022-00009020-06", "DIC SBW ROTOR ASSY (NBPM / 폭 8.65/42UH)")
        ?.boxesPerPallet,
      28,
    );
    assert.equal(matchProductLoading("", "RING MAGNET"), null);
  });
});
