import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { estimateArrivalTimes } from "./route-arrivals";

describe("estimated arrival times", () => {
  it("adds each leg without adding stop time", () => {
    assert.deepEqual(estimateArrivalTimes("08:00", [1800, 2700], 2), ["08:30", "09:15"]);
  });
  it("indicates arrival on a later day", () => {
    assert.deepEqual(estimateArrivalTimes("23:50", [1200, 86400], 2), ["00:10 (+1일)", "00:10 (+2일)"]);
  });
  it("does not fabricate times for missing or invalid data", () => {
    assert.deepEqual(estimateArrivalTimes("08:00", null, 2), [null, null]);
    assert.deepEqual(estimateArrivalTimes("25:00", [60], 1), [null]);
    assert.deepEqual(estimateArrivalTimes("08:00", [60], 2), [null, null]);
  });
});
