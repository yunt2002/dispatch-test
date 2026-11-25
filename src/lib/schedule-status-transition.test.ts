import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deleteActiveScheduleEntries, transitionScheduleStatus } from "./schedule-status-transition";

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

test("삭제 시 현재 상태가 완료나 취소인 납품은 남긴다", async () => {
  const date = "2026-11-02";
  const rows = [
    { id: "draft", deliveryDate: date, status: "PLANNED" },
    { id: "confirmed", deliveryDate: date, status: "CONFIRMED" },
    { id: "done", deliveryDate: date, status: "DONE" },
    { id: "cancelled", deliveryDate: date, status: "CANCELLED" },
    { id: "other-date", deliveryDate: "2026-11-03", status: "PLANNED" },
  ];
  // 화면에서 확인한 이후에 이 일정의 상태가 완료로 바뀌었다.
  rows[1].status = "DONE";
  const count = await deleteActiveScheduleEntries({
    async deleteMany({ where }) {
      assert.deepEqual(where, { AND: [{ deliveryDate: date }, { status: { in: ["PLANNED", "CONFIRMED"] } }] });
      const remaining = rows.filter((row) => row.deliveryDate !== date || !["PLANNED", "CONFIRMED"].includes(row.status));
      const deleted = rows.length - remaining.length;
      rows.splice(0, rows.length, ...remaining);
      return { count: deleted };
    },
  }, { deliveryDate: date });
  assert.equal(count, 1);
  assert.deepEqual(rows.map((row) => row.id), ["confirmed", "done", "cancelled", "other-date"]);
});
