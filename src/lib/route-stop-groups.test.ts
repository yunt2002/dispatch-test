import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { expandRouteStopOrder, groupCharterStops, groupRouteStops, type GroupableRouteStop } from "./route-stop-groups";

const base: GroupableRouteStop = { id: "a", consolidateGroupId: "group", customerName: "업체 A", locationName: "김해", vehicleId: "v1", lat: 35, lng: 129 };

describe("route stop grouping", () => {
  it("combines items of the same grouped delivery into one stop", () => {
    const groups = groupRouteStops([{ ...base, id: "b" }, base]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].stop.id, "a");
    assert.deepEqual(groups[0].memberIds, ["a", "b"]);
  });
  it("keeps different companies, addresses, vehicles and independent orders separate", () => {
    const groups = groupRouteStops([
      base,
      { ...base, id: "b", customerName: "업체 B" },
      { ...base, id: "c", lat: 36 },
      { ...base, id: "d", vehicleId: "v2" },
      { ...base, id: "e", consolidateGroupId: null },
      { ...base, id: "f", customerName: null },
    ]);
    assert.equal(groups.length, 6);
  });
  it("moves all delivery items together when saving a reordered visit", () => {
    assert.deepEqual(expandRouteStopOrder(["a", "c"], [["a", "b"], ["c"]], ["c", "a"]), ["c", "a", "b"]);
  });
  it("deduplicates charter deliveries with the same customer, location and coordinates", () => {
    const groups = groupCharterStops([
      { ...base, id: "c1", consolidateGroupId: null, customerName: "DY AUTO", locationName: "창원", vehicleId: "external:charter" },
      { ...base, id: "c2", consolidateGroupId: null, customerName: "DY AUTO", locationName: "창원", vehicleId: "external:charter" },
      { ...base, id: "c3", consolidateGroupId: null, customerName: "HUANG YU", locationName: "창원", vehicleId: "external:charter", lng: 128.8 },
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0].memberIds, ["c1", "c2"]);
    assert.deepEqual(groups[1].memberIds, ["c3"]);
  });
});
