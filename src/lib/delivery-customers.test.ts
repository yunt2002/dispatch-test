import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchDeliveryCustomer, resolveCustomerAddress } from "./delivery-customers";
import { matchRouteZone } from "./route-master";

describe("delivery customers / 납품 root", () => {
  it("resolves official addresses", () => {
    assert.match(resolveCustomerAddress("BMC") ?? "", /손재로/);
    assert.match(resolveCustomerAddress("만도브로제") ?? "", /첨단대로/);
    assert.match(resolveCustomerAddress("현담산업") ?? "", /아산/);
  });

  it("forces 2호 for root metro customers even in 충청", () => {
    const zone = matchRouteZone({ locationName: "아산", customerName: "현담산업" });
    assert.equal(zone?.vehiclePolicy, "METRO_2HO");
    assert.equal(matchDeliveryCustomer("듀링플러스")?.vehicleHint, "2HO");
  });

  it("keeps 1호 for jeolla / gyeongsang root customers", () => {
    assert.equal(matchDeliveryCustomer("코아오토모티브")?.vehicleHint, "1HO");
    assert.equal(matchDeliveryCustomer("GMB")?.vehicleHint, "1HO");
    assert.equal(
      matchRouteZone({ customerName: "BMC", locationName: "" })?.vehiclePolicy,
      "LOCAL_1HO",
    );
  });
});
