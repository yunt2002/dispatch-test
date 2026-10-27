import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchRouteZone,
  preferredVehicleIdForZone,
} from "./route-master";

describe("matchRouteZone", () => {
  it("maps Jeolla locations to 1호 고정 권역", () => {
    const zone = matchRouteZone({ locationName: "광주", customerName: "비엠씨 광주공장" });
    assert.equal(zone?.code, "JEOLLA");
    assert.equal(zone?.vehiclePolicy, "LOCAL_1HO");
  });

  it("maps Gyeongsang stops", () => {
    assert.equal(matchRouteZone({ locationName: "울주" })?.code, "GYEONGSANG");
    assert.equal(matchRouteZone({ locationName: "창원", customerName: "GMB" })?.code, "GYEONGSANG");
  });

  it("maps flex zone for Chungcheong/Sejong", () => {
    const zone = matchRouteZone({ locationName: "세종", customerName: "코아비스" });
    assert.equal(zone?.code, "FLEX");
    assert.equal(zone?.vehiclePolicy, "FLEX");
  });
});

describe("preferredVehicleIdForZone", () => {
  const ids = { local: "vehicle-1ho-4t", metro: "vehicle-2ho-3-5t" };

  it("picks 1호 for Jeolla", () => {
    const zone = matchRouteZone({ locationName: "광주" });
    assert.equal(
      preferredVehicleIdForZone({ zone, vehicleIds: ids }),
      "vehicle-1ho-4t",
    );
  });

  it("picks the truck with more remaining PLT for flex", () => {
    const zone = matchRouteZone({ locationName: "세종" });
    assert.equal(
      preferredVehicleIdForZone({
        zone,
        vehicleIds: ids,
        remainingByVehicleId: {
          "vehicle-1ho-4t": 2,
          "vehicle-2ho-3-5t": 6,
        },
        needPallets: 2,
      }),
      "vehicle-2ho-3-5t",
    );
  });
});
