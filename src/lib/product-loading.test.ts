import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchProductLoading,
  normalizeBoxType,
  resolveDefaultsFromProduct,
} from "./product-loading";

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
  it("maps ERP / schedule names to 제품 정리 sheet", () => {
    assert.equal(
      matchProductLoading("MA021-01010000-01", "IDB GEN2 ROTOR ASSY_BASE _ 태양")?.boxesPerPallet,
      40,
    );
    assert.equal(
      matchProductLoading("", "IDB2 Hollow shaft Assy_영완")?.familyName,
      "IDB2 Hollow shaft Assy_영완",
    );
    assert.equal(
      matchProductLoading("DA022-00009020-06", "DIC SBW ROTOR ASSY (NBPM / 폭 8.65/42UH)")
        ?.boxesPerPallet,
      28,
    );
    assert.equal(
      matchProductLoading("MA021-56010054-02", "SBW ROTOR ASSY (CE)")?.familyName,
      "SBW ROTOR ASSY (CE)",
    );
    assert.equal(
      matchProductLoading("MA021-56010054-02", "SBW ROTOR ASSY (CE)")?.boxesPerPallet,
      60,
    );
    assert.equal(
      matchProductLoading("MA023-A7700030-02", "MPS ASSY BASE **수출사양** - 2 PLT")?.boxesPerPallet,
      15,
    );
    // 제품 정리: 내수 1PLT당 박스입수 48
    assert.equal(matchProductLoading("MA023-A7700030-01", "MPS ASSY BASE")?.boxesPerPallet, 48);
    assert.equal(
      matchProductLoading("MA021-JOYSONAK-02", "AK Ejector Hall SW Assy (수출품)")?.boxType,
      "종이박스",
    );
    // 내수 AK EJECTOR = 낱개
    assert.equal(
      matchProductLoading("MA021-JOYSONAK-01", "AK Ejector Hall SW Assy (내수품)")?.boxesPerPallet,
      null,
    );
    assert.equal(
      matchProductLoading("MA121-5910070M-02", "EC-PUMP (9.85*6.85*11.9*28)")?.boxesPerPallet,
      null,
    );
    assert.equal(matchProductLoading("", "CVS SW PE EWP IMPELLER ASSY")?.boxesPerPallet, 24);
    assert.equal(matchProductLoading("", "CVS SW BATT EWP IMPELLER ASSY")?.boxesPerPallet, 24);
    assert.equal(matchProductLoading("", "Active Purge Pump Rotor Ass'y")?.boxesPerPallet, 60);
    assert.equal(matchProductLoading("", "IDB GEN1 ASSY (13.5*3.2)")?.boxesPerPallet, null);
    assert.equal(matchProductLoading("", "DM 4545 HFP3.2 ROTOR Assy")?.boxesPerPallet, 60);
    assert.equal(matchProductLoading("", "EPS ASSY")?.boxesPerPallet, 42);
    // BC3는 제네릭 EPS(14000g)가 아니라 BC3(11000g/462kg)로 매칭
    assert.equal(
      matchProductLoading("", "MBCo eps BC3 ROTOR ASSY")?.id,
      "EPS-BC3",
    );
    assert.equal(matchProductLoading("", "MBCo eps BC3 ROTOR ASSY")?.boxWeightG, 11000);
    assert.equal(matchProductLoading("", "MBCo eps BC3 ROTOR ASSY")?.kgPerPallet, 462);
    assert.equal(
      matchProductLoading("", "MBCo EPS NX4 ROTOR ASSY(HRE FREE)")?.id,
      "EPS-NX4",
    );
    assert.equal(matchProductLoading("", "CN7 SENSING ASSY")?.boxesPerPallet, null);
    assert.equal(matchProductLoading("", "CKD")?.boxesPerPallet, 48);
    assert.equal(matchProductLoading("", "RING MAGNET"), null);
  });

  it("fills location/customer from ERP product via 납품 root", () => {
    const mps = resolveDefaultsFromProduct("MPS Assy Base_내수");
    assert.equal(mps.customerName, "만도");
    assert.equal(mps.locationName, "평택");

    const idb = resolveDefaultsFromProduct("IDB2 Hollow shaft Assy_태양");
    assert.equal(idb.customerName, "BMC");
    assert.equal(idb.locationName, "광주");

    const eps = resolveDefaultsFromProduct("MBCo EPS NX4 ROTOR ASSY(HRE FREE)");
    assert.equal(eps.customerName, "만도브로제");
    assert.equal(eps.locationName, "인천");
  });
});

