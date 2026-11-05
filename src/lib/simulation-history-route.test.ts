import { strict as assert } from "node:assert";
import { test } from "node:test";
import { GET, POST } from "../app/api/simulation/history/route";
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
  };
  Object.defineProperty(prisma, "appSetting", { value: fake, configurable: true });
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
  assert.equal((await post({ action: "select", date: "2026-10-14", id: one.id })).status, 400);
  for (let i = 0; i < 100; i++) assert.equal((await post({ action: "save", snapshot })).status, 200);
  const page = await (await GET(new Request("http://localhost/api/simulation/history"))).json();
  assert.equal(page.records.length, 100);
  assert.ok(page.nextCursor);
  const older = await (await GET(new Request(`http://localhost/api/simulation/history?before=${encodeURIComponent(page.nextCursor)}`))).json();
  assert.equal(older.records.length, 2);
  assert.equal(older.nextCursor, null);
  assert.equal(new Set([...page.records, ...older.records].map((entry: { id: string }) => entry.id)).size, 102);
});
