import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sameOrder, suggestVisitOrder } from "./visit-order-suggest";

describe("suggestVisitOrder", () => {
  const depot = { lat: 37.37, lng: 127.4 };

  it("orders nearest stops first from depot", () => {
    const stops = [
      { id: "far", lat: 37.5, lng: 127.8 },
      { id: "near", lat: 37.38, lng: 127.41 },
      { id: "mid", lat: 37.42, lng: 127.5 },
    ];
    const order = suggestVisitOrder(depot, stops);
    assert.equal(order[0], "near");
    assert.ok(order.includes("mid"));
    assert.ok(order.includes("far"));
    assert.equal(order.length, 3);
  });

  it("sameOrder compares sequences", () => {
    assert.equal(sameOrder(["a", "b"], ["a", "b"]), true);
    assert.equal(sameOrder(["a", "b"], ["b", "a"]), false);
  });
});
