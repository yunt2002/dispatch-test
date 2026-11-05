import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DELETE, GET, POST } from "../app/api/simulation/history/route";
import { prisma } from "./prisma";
import type { SimulationHistorySnapshot } from "./simulation-history";
import type { SimulationItem, SimulationResult, SimulationRoute } from "./simulation";

test("분석 기록을 별도로 누적하고 날짜당 한 건을 선택한다", async () => {
  // 실제 DB 대신 테스트 전용 메모리 저장소로 대체한다.
  const values = new Map<string, string>();
  const fake = {
    create: async ({ data }: { data: { key: string; value: string } }) => { if (values.has(data.key)) throw Error("duplicate"); values.set(data.key, data.value); return data; },
    findUnique: async ({ where }: { where: { key: string } }) => values.has(where.key) ? { key: where.key, value: values.get(where.key)! } : null,
    findMany: async ({ where, take }: { where: { key: { startsWith: string; lt?: string } }; take?: number }) => [...values].filter(([key]) => key.startsWith(where.key.startsWith) && (!where.key.lt || key < where.key.lt)).sort(([a], [b]) => a < b ? 1 : a > b ? -1 : 0).slice(0, take).map(([key, value]) => ({ key, value })),
    upsert: async ({ where, create, update }: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }) => { values.set(where.key, values.has(where.key) ? update.value : create.value); return { key: where.key, value: values.get(where.key)! }; },
    updateMany: async ({ where, data }: { where: { key: string; value: string }; data: { value: string } }) => { if (values.get(where.key) !== where.value) return { count: 0 }; values.set(where.key, data.value); return { count: 1 }; },
    deleteMany: async ({ where }: { where: { key: { startsWith?: string; in?: string[] }; value?: { in: string[] } } }) => { let count = 0; for (const [key, value] of values) { if ((where.key.startsWith === undefined || key.startsWith(where.key.startsWith)) && (where.key.in === undefined || where.key.in.includes(key)) && (!where.value || where.value.in.includes(value))) { values.delete(key); count++; } } return { count }; },
  };
  Object.defineProperty(prisma, "appSetting", { value: fake, configurable: true });
  Object.defineProperty(prisma, "$transaction", { value: (operations: Promise<unknown>[]) => Promise.all(operations), configurable: true });
  assert.equal(prisma.appSetting, fake);
  const own = { rowNumber: 1, customer: "테스트", location: "서울", product: "시험품", transport: "1호 차량", vehicle: "1호차", address: "가상 주소", boxes: 1, pallets: 1 } as SimulationItem;
  const route = { vehicle: "1호차", items: [own], minutes: 30, fuel: 1000, toll: 2000, pallets: 1, weight: 1, unknownPallets: 0, unknownWeight: 0, over: false } as SimulationRoute;
  const empty = { ...route, vehicle: "2호차", items: [], minutes: 0, fuel: 0, toll: 0 };
  const result = { items: [own], original: [route, empty], proposed: [route, empty], remaining: [], warnings: [], charterGroups: [], note: "테스트", candidateCountVerified: true } as SimulationResult;
  const snapshot: SimulationHistorySnapshot = { version: 1, date: "2026-10-15", fileName: "가상.xlsx", dieselPrice: "1800", excludedItems: [], result, originalTrips: [], proposedTrips: [], originalExtras: [], proposedExtras: [], courierChoices: {}, packing: {}, review: "검토 완료", memo: "" };
  const post = (body: unknown) => POST(new Request("http://localhost/api/simulation/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const first = await post({ action: "save", snapshot });
  const second = await post({ action: "save", snapshot });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  const one = await first.json(); const two = await second.json();
  assert.notEqual(one.id, two.id);
  assert.equal((await post({ action: "select", date: snapshot.date, id: one.id })).status, 200);
  assert.equal((await post({ action: "select", date: snapshot.date, id: two.id })).status, 200);
  const list = await (await GET(new Request("http://localhost/api/simulation/history"))).json();
  assert.equal(list.records.length, 2);
  assert.equal(list.selected[snapshot.date], two.id);
  const detail = await (await GET(new Request(`http://localhost/api/simulation/history?id=${encodeURIComponent(one.id)}`))).json();
  assert.equal(detail.snapshot.fileName, "가상.xlsx");
  assert.equal(detail.metrics.originalCost, 3000);
  assert.equal(list.records[0].fieldReview.status, "미검토");
  assert.equal((await post({ action: "field-review", id: one.id, fieldReview: { status: "조건부 가능", reason: " 하차 시간 확인 " } })).status, 200);
  const reviewed = await (await GET(new Request(`http://localhost/api/simulation/history?id=${encodeURIComponent(one.id)}`))).json();
  assert.deepEqual(reviewed.snapshot.fieldReview, { status: "조건부 가능", reason: "하차 시간 확인" });
  assert.equal(reviewed.metrics.originalCost, detail.metrics.originalCost);
  const updatedList = await (await GET(new Request("http://localhost/api/simulation/history"))).json();
  assert.equal(updatedList.records.find((entry: { id: string }) => entry.id === one.id).fieldReview.status, "조건부 가능");
  assert.equal((await post({ action: "field-review", id: one.id, fieldReview: { status: "잘못된 상태", reason: "" } })).status, 400);
  assert.equal((await post({ action: "select", date: "2026-10-14", id: one.id })).status, 400);
  for (let i = 0; i < 100; i++) assert.equal((await post({ action: "save", snapshot })).status, 200);
  const page = await (await GET(new Request("http://localhost/api/simulation/history"))).json();
  assert.equal(page.records.length, 100);
  assert.ok(page.nextCursor);
  const older = await (await GET(new Request(`http://localhost/api/simulation/history?before=${encodeURIComponent(page.nextCursor)}`))).json();
  assert.equal(older.records.length, 2);
  assert.equal(older.nextCursor, null);
  assert.equal(new Set([...page.records, ...older.records].map((entry: { id: string }) => entry.id)).size, 102);
  const remove = (body: unknown) => DELETE(new Request("http://localhost/api/simulation/history", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  values.set("unrelated-setting", "keep");
  assert.equal((await remove({ ids: ["unrelated-setting"] })).status, 400);
  assert.equal((await remove({ ids: [] })).status, 400);
  assert.equal((await remove({ all: true, ids: [one.id] })).status, 400);
  assert.equal((await (await remove({ ids: [one.id] })).json()).deleted, 1);
  assert.equal(values.get(`simulation_history_selection:v1:${snapshot.date}`), two.id);
  assert.equal((await (await remove({ ids: [two.id] })).json()).deleted, 1);
  assert.equal(values.has(`simulation_history_selection:v1:${snapshot.date}`), false);
  assert.equal((await (await remove({ all: true })).json()).deleted, 100);
  assert.equal(values.get("unrelated-setting"), "keep");
  assert.equal((await (await GET(new Request("http://localhost/api/simulation/history"))).json()).records.length, 0);
});
