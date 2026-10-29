import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyOrderConstraints,
  constraintAppliesToVehicle,
  parseConstraintsHeuristic,
  resolveExplicitOrder,
} from "./route-constraints";

describe("route-constraints", () => {
  const stops = [
    { id: "1", label: "만도" },
    { id: "2", label: "만도브로제" },
    { id: "3", label: "만도브로제" },
    { id: "4", label: "BMC" },
  ];

  it("does not treat 만도 as 만도브로제", () => {
    const order = applyOrderConstraints(
      ["1", "2", "3", "4"],
      stops,
      [{ type: "late", match: "만도" }],
      "2호차",
    );
    assert.equal(order[order.length - 1], "1");
    assert.ok(order.indexOf("2") < order.indexOf("1"));
  });

  it("scopes constraints to the named vehicle", () => {
    const constraints = [
      { type: "early" as const, match: "만도브로제", vehicle: "2호" },
    ];
    assert.equal(constraintAppliesToVehicle(constraints[0], "2호차"), true);
    assert.equal(constraintAppliesToVehicle(constraints[0], "1호차"), false);

    const forOne = applyOrderConstraints(["1", "2", "3"], stops, constraints, "1호차");
    assert.deepEqual(forOne, ["1", "2", "3"]);

    const forTwo = applyOrderConstraints(["1", "2", "3"], stops, constraints, "2호차");
    assert.equal(forTwo[0], "2");
  });

  it("parses vehicle-scoped early/late heuristic", () => {
    const parsed = parseConstraintsHeuristic(
      "2호차 만도 브로제 2개를 먼저 가고 만도를 다음에",
    );
    assert.ok(parsed.constraints.some((c) => c.type === "early" && c.vehicle === "2호"));
    assert.ok(parsed.constraints.some((c) => c.type === "late" && c.vehicle === "2호"));
  });

  it("resolves explicit label sequences without confusing 만도", () => {
    const order = resolveExplicitOrder(stops, ["만도브로제", "만도브로제", "만도"]);
    assert.deepEqual(order?.slice(0, 3), ["2", "3", "1"]);
  });
});
