import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeCustomerRoute, routeCodeFor } from "./customer-route";

const regions = [
  { locationName: "인천", regionType: "METROPOLITAN" },
  { locationName: "창원", regionType: "LOCAL" },
];
const routes = [
  { id: "1", routeCode: "R-LOCAL", routeName: "지방납품" },
  { id: "2", routeCode: "R-CAPITAL", routeName: "수도권납품" },
  { id: "3", routeCode: "R-EXPRESS", routeName: "긴급/소량" },
];

describe("customer route from address", () => {
  it("picks metropolitan route for 인천", () => {
    const result = describeCustomerRoute("인천", false, regions, routes);
    assert.equal(result.route?.routeCode, "R-CAPITAL");
    assert.equal(result.label.includes("수도권"), true);
  });

  it("overrides to emergency when checked", () => {
    assert.equal(routeCodeFor("METROPOLITAN", true), "R-EXPRESS");
    const result = describeCustomerRoute("인천", true, regions, routes);
    assert.equal(result.regionType, "EMERGENCY");
    assert.equal(result.route?.routeCode, "R-EXPRESS");
  });
});
