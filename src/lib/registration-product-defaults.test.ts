import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolveRegistrationProductFields } from "./registration-product-defaults";

describe("product registration suggestions", () => {
  const common = { current: { customerName: "직접 업체", locationName: "직접 지역" }, suggestedCustomer: "추천 업체", suggestedLocation: "추천 지역", locationForCustomer: () => "매핑 지역" };
  it("preserves separately chosen customer and location", () => {
    assert.deepEqual(resolveRegistrationProductFields({ ...common, customerManual: true, locationManual: true }), common.current);
  });
  it("uses the manually chosen customer for automatic location", () => {
    assert.deepEqual(resolveRegistrationProductFields({ ...common, customerManual: true, locationManual: false }), { customerName: "직접 업체", locationName: "매핑 지역" });
  });
  it("updates suggestions while retaining a manually selected location", () => {
    assert.deepEqual(resolveRegistrationProductFields({ ...common, customerManual: false, locationManual: true }), { customerName: "추천 업체", locationName: "직접 지역" });
  });
  it("does not use another customer's suggested location when manual customer is unmapped", () => {
    assert.deepEqual(resolveRegistrationProductFields({ ...common, customerManual: true, locationManual: false, locationForCustomer: () => null }), { customerName: "직접 업체", locationName: "" });
  });
});
