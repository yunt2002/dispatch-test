import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { summarizeVehicleWeight } from "./vehicle-weight-summary";

describe("vehicle weight summary", () => {
  it("compares known total to one vehicle capacity", () => {
    const result = summarizeVehicleWeight([{ kg: 1840, source: "boxes" }], 4000);
    assert.equal(result.kg, 1840);
    assert.equal(result.overSingleVehicle, false);
    assert.equal(result.unknownCount, 0);
  });

  it("shows both overload and missing or estimated weights", () => {
    const result = summarizeVehicleWeight([
      { kg: 4100, source: "fallback-pallets" },
      { kg: null, source: null },
    ], 4000);
    assert.equal(result.overSingleVehicle, true);
    assert.equal(result.unknownCount, 1);
    assert.equal(result.estimatedCount, 1);
  });

  it("does not claim overload when capacity is missing or exactly met", () => {
    assert.equal(summarizeVehicleWeight([{ kg: 4000, source: "boxes" }], 4000).overSingleVehicle, false);
    const unknownCapacity = summarizeVehicleWeight([{ kg: 4000, source: "boxes" }], 0);
    assert.equal(unknownCapacity.maxWeight, null);
    assert.equal(unknownCapacity.overSingleVehicle, false);
  });
});
