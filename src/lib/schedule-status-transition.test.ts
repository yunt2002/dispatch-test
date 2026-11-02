import { strict as assert } from "node:assert";
import { test } from "node:test";
import { transitionScheduleStatus } from "./schedule-status-transition";

function repository(initial: { id: string; deliveryDate: string; status: string }[]) {
  const rows = initial.map((row) => ({ ...row }));
  return {
    rows,
    async updateMany({ where, data }: { where: { id: string; deliveryDate: string; status: string }; data: { status: string } }) {
      const matching = rows.filter((row) => row.id === where.id && row.deliveryDate === where.deliveryDate && row.status === where.status);
      matching.forEach((row) => { row.status = data.status; });
      return { count: matching.length };
    },
  };
}

test("완료와 완료 취소는 올바른 이전 상태에서만 처리한다", async () => {
  const store = repository([{ id: "a", deliveryDate: "2026-11-02", status: "PLANNED" }]);
  assert.equal(await transitionScheduleStatus(store, "a", "2026-11-02", "done"), false);
  assert.equal(store.rows[0].status, "PLANNED");
  store.rows[0].status = "CONFIRMED";
  assert.equal(await transitionScheduleStatus(store, "a", "2026-11-03", "done"), false);
  assert.equal(await transitionScheduleStatus(store, "missing", "2026-11-02", "done"), false);
  assert.equal(await transitionScheduleStatus(store, "a", "2026-11-02", "done"), true);
  assert.equal(await transitionScheduleStatus(store, "a", "2026-11-02", "done"), false);
  assert.equal(await transitionScheduleStatus(store, "a", "2026-11-02", "reopen"), true);
  assert.equal(await transitionScheduleStatus(store, "a", "2026-11-02", "reopen"), false);
  assert.equal(store.rows[0].status, "CONFIRMED");
});

test("동일 납품에 완료 요청이 중복되면 한 번만 성공한다", async () => {
  const store = repository([{ id: "a", deliveryDate: "2026-11-02", status: "CONFIRMED" }]);
  const results = await Promise.all([transitionScheduleStatus(store, "a", "2026-11-02", "done"), transitionScheduleStatus(store, "a", "2026-11-02", "done")]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(store.rows[0].status, "DONE");
});
