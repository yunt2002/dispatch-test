import { strict as assert } from "node:assert";
import { test } from "node:test";
import { confirmedRouteState } from "./confirmed-route-state";

test("각 확정 묶음의 저장 경로가 현재 납품과 일치할 때만 표시한다", () => {
  const snapshot = { signature: "v1", result: { routes: [{ stopIds: ["a"], stopMemberIds: [["a", "b"]], path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] }], unassigned: [] } };
  assert.equal(confirmedRouteState(snapshot, "v1", ["a", "b"]), "ready");
  assert.equal(confirmedRouteState(snapshot, "v2", ["a", "b"]), "stale");
  assert.equal(confirmedRouteState(snapshot, "v1", ["a", "other"]), "stale");
  assert.equal(confirmedRouteState(null, "v1", ["a"]), "missing");
  assert.equal(confirmedRouteState({ ...snapshot, result: { ...snapshot.result, routes: [{ ...snapshot.result.routes[0], path: [] }] } }, "v1", ["a", "b"]), "missing");
});
