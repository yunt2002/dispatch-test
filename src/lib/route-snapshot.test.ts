import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { POST } from "../app/api/route/snapshot/route";
import { prisma } from "./prisma";
import { routeInputSignatures, writeRouteSnapshot, type RouteSnapshot } from "./route-snapshot";

const date = "2026-11-25";
const savedAt = "2026-11-25T01:00:00.000Z";
const path = [{ lat: 37, lng: 127 }, { lat: 37.1, lng: 127.1 }];

async function mockSnapshotStore() {
  for (const model of ["scheduleEntry", "vehicleType", "customer"]) {
    Object.defineProperty(prisma, model, { value: { findMany: async () => [] }, configurable: true });
  }
  const { current } = await routeInputSignatures(date);
  const snapshot: RouteSnapshot = {
    signature: current,
    savedAt,
    result: {
      ok: true, note: "", tripMode: "oneway", depot: { ...path[0], title: "회사" },
      unassigned: [], solverReachable: true,
      routes: ["a", "b"].map((vehicleId) => ({
        vehicleId, vehicleName: vehicleId, stopIds: [], stopMemberIds: [], titles: [],
        totalDistanceKm: 10, totalTimeMin: 20, tollWon: null, carType: 1, load: 1, capacity: 8, path,
      })),
    },
  };
  const original = JSON.stringify(snapshot);
  let stored: string | null = original;
  let releaseFirstReads = () => {};
  const firstReads = new Promise<void>((resolve) => { releaseFirstReads = resolve; });
  let reads = 0;
  Object.defineProperty(prisma, "appSetting", {
    configurable: true,
    value: {
      async findUnique() {
        const value = stored;
        if (++reads === 2) releaseFirstReads();
        await firstReads;
        return value === null ? null : { value };
      },
      async updateMany({ where, data }: { where: { value: string }; data: { value: string } }) {
        if (stored !== where.value) return { count: 0 };
        stored = data.value;
        return { count: 1 };
      },
      async create({ data }: { data: { value: string } }) {
        if (stored !== null) throw new Prisma.PrismaClientKnownRequestError("unique key", { code: "P2002", clientVersion: "test" });
        stored = data.value;
      },
    },
  });
  return {
    snapshot, original,
    routes: () => (JSON.parse(stored!) as RouteSnapshot).result.routes,
    reset: () => { stored = null; },
  };
}

function saveAlternative(vehicleId: string, distanceKm: number, expectedRevision = savedAt) {
  return POST(new Request("http://localhost/api/route/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date, vehicleId, expectedRevision,
      option: { priority: "RECOMMEND", label: "추천", distanceKm, durationMin: 20, tollWon: null, legDurationsSec: null, path },
    }),
  }));
}

test("같은 묶음의 서로 다른 차량을 동시에 저장하면 두 변경이 남는다", async () => {
  const store = await mockSnapshotStore();
  const first = await Promise.all([saveAlternative("a", 21), saveAlternative("b", 22)]);
  assert.deepEqual(first.map((response) => response.status), [200, 200]);
  assert.deepEqual(store.routes().map((route) => route.totalDistanceKm), [21, 22]);
  assert.equal(await writeRouteSnapshot(date, store.snapshot, null, store.original), false);
  assert.deepEqual(store.routes().map((route) => route.totalDistanceKm), [21, 22]);
});

test("같은 차량의 오래된 변경은 충돌하고 최신 버전으로 다시 저장할 수 있다", async () => {
  const store = await mockSnapshotStore();
  const first = await Promise.all([saveAlternative("a", 21), saveAlternative("a", 22)]);
  assert.deepEqual(first.map((response) => response.status).sort(), [200, 409]);
  const conflict = first.find((response) => response.status === 409)!;
  assert.match((await conflict.json()).error, /최신 저장 경로/);
  const accepted = first.find((response) => response.ok)!;
  const { revision } = await accepted.json();
  assert.equal(store.routes()[0].revision, revision);
  assert.equal((await saveAlternative("a", 99)).status, 409);
  assert.equal((await saveAlternative("a", 23, revision)).status, 200);
  assert.deepEqual(store.routes().map((route) => route.totalDistanceKm), [23, 10]);
});

test("처음 계산한 경로를 동시에 저장하면 한 요청만 스냅샷을 만든다", async () => {
  const store = await mockSnapshotStore();
  store.reset();
  const results = await Promise.all([
    writeRouteSnapshot(date, store.snapshot, null, null),
    writeRouteSnapshot(date, { ...store.snapshot, savedAt: "later" }, null, null),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
});
