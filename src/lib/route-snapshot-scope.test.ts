import { strict as assert } from "node:assert";
import { test } from "node:test";
import { snapshotMatchesScope } from "./route-snapshot-scope";

const snapshot = { routes: [{ stopIds: ["a"], stopMemberIds: [["a", "b"]] }, { stopIds: ["c"], stopMemberIds: [["c"]] }], unassigned: ["d"] };
test("묶인 품목, 차량별 납품, 경로 제외 건까지 현재 범위와 비교한다", () => {
  assert.equal(snapshotMatchesScope(snapshot, ["d", "c", "b", "a"]), true);
  assert.equal(snapshotMatchesScope(snapshot, ["a", "b", "d"]), false);
  assert.equal(snapshotMatchesScope(snapshot, ["a", "b", "c", "d", "e"]), false);
});
test("중복된 저장 경로는 표시하지 않는다", () => {
  assert.equal(snapshotMatchesScope({ routes: [{ stopIds: ["a"] }], unassigned: ["a"] }, ["a"]), false);
});
