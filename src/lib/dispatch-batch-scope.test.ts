import { strict as assert } from "node:assert";
import { test } from "node:test";
import { routeScopeWhere, visibleDispatchBatches, type DispatchBatch } from "./dispatch-batch-scope";

const batches: DispatchBatch[] = [
  { id: "first", date: "2026-10-30", createdAt: "2026-10-30T01:00:00Z", entryIds: ["vehicle-1", "vehicle-2"] },
  { id: "second", date: "2026-10-30", createdAt: "2026-10-30T02:00:00Z", entryIds: ["other"] },
  { id: "other-day", date: "2026-10-31", createdAt: "2026-10-31T01:00:00Z", entryIds: ["tomorrow"] },
];

test("기본 지도는 미확정 신청만 표시한다", () => {
  assert.deepEqual(routeScopeWhere("2026-10-30", null, batches), { valid: true, where: { deliveryDate: "2026-10-30", status: "PLANNED" } });
});
test("확정 묶음은 여러 호차의 일정과 완료 건을 포함하고 다른 묶음을 제외한다", () => {
  assert.deepEqual(routeScopeWhere("2026-10-30", "first", batches), { valid: true, where: { deliveryDate: "2026-10-30", status: { in: ["CONFIRMED", "DONE"] }, id: { in: ["vehicle-1", "vehicle-2"] } } });
});
test("기존 확정 건은 새 묶음에서 제외하고 잘못된 묶음은 빈 결과를 반환한다", () => {
  assert.deepEqual(routeScopeWhere("2026-10-30", "legacy", batches).where, { deliveryDate: "2026-10-30", status: { in: ["CONFIRMED", "DONE"] }, id: { notIn: ["vehicle-1", "vehicle-2", "other"] } });
  assert.equal(routeScopeWhere("2026-10-30", "other-day", batches).valid, false);
});
test("납품이 모두 삭제된 확정 묶음은 숨기고 일부 또는 완료된 납품이 남은 묶음의 원래 번호는 유지한다", () => {
  const visible = visibleDispatchBatches(batches.slice(0, 2), new Set(["vehicle-1"]));
  assert.deepEqual(visible.map(({ batch, number, remaining }) => ({ id: batch.id, number, remaining })), [{ id: "first", number: 2, remaining: 1 }]);
  assert.deepEqual(visibleDispatchBatches(batches, new Set()), []);
  assert.equal(visibleDispatchBatches(batches.slice(0, 2), new Set(["other"]))[0].number, 1);
});
