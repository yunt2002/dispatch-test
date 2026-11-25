import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CHARTER_GROUPING_VERSION, confirmedRouteState } from "./confirmed-route-state";
import { buildRouteInputSignatures } from "./route-input-signature";

test("각 확정 묶음의 저장 경로가 현재 납품과 일치할 때만 표시한다", () => {
  const snapshot = { signature: "v1", result: { routes: [{ stopIds: ["a"], stopMemberIds: [["a", "b"]], path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] }], unassigned: [] } };
  const signatures = { current: "v2", legacy: "v1" };
  assert.equal(confirmedRouteState(snapshot, signatures, ["a", "b"]), "ready");
  assert.equal(confirmedRouteState(snapshot, { ...signatures, legacy: "old" }, ["a", "b"]), "stale");
  assert.equal(confirmedRouteState(snapshot, signatures, ["a", "other"]), "stale");
  assert.equal(confirmedRouteState(null, signatures, ["a"]), "missing");
  assert.equal(confirmedRouteState({ ...snapshot, result: { ...snapshot.result, routes: [{ ...snapshot.result.routes[0], path: [] }] } }, signatures, ["a", "b"]), "missing");
});

test("용차가 있는 이전 저장 경로는 새 계산 결과로 갱신해야 표시한다", () => {
  const snapshot = {
    signature: "same",
    result: {
      routes: [{ isCharter: true, stopIds: ["a"], stopMemberIds: [["a"]], path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] }],
      unassigned: [],
    },
  };
  const signatures = { current: "same", legacy: "previous" };
  assert.equal(confirmedRouteState(snapshot, signatures, ["a"]), "stale");
  assert.equal(confirmedRouteState({ ...snapshot, charterGroupingVersion: CHARTER_GROUPING_VERSION }, signatures, ["a"]), "ready");
});

test("같은 묶음에서 완료 처리만 하면 경로를 유지하고 주소·차량·방문 순서 변경은 갱신한다", () => {
  const timestamp = new Date("2026-10-20T09:00:00Z");
  const entry = {
    id: "a", customerName: "가상 거래처", locationName: "세종", notes: "확정",
    createdAt: timestamp, updatedAt: timestamp, visitOrder: 0, consolidateGroupId: null,
    selectedVehicleJson: '{"vehicleTypeId":"truck"}', recommendedVehicleJson: null, status: "CONFIRMED",
  };
  const truck = { id: "truck", updatedAt: timestamp, vehicleName: "1호차", isActive: true, maxPallet: 8, maxWeight: 4000 };
  const unrelated = { ...truck, id: "unused" };
  const addresses = new Map([["가상 거래처", "세종특별자치시 연서면 공단로 117"]]);
  const before = buildRouteInputSignatures([entry], [truck, unrelated], addresses);
  const done = { ...entry, updatedAt: new Date("2026-10-20T10:00:00Z"), status: "DONE" };
  const snapshot = { signature: before.current, result: { routes: [{ stopIds: ["a"], stopMemberIds: [["a"]], path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] }], unassigned: [] } };
  const completed = buildRouteInputSignatures([done], [truck, unrelated], addresses);
  assert.notEqual(before.legacy, completed.legacy);
  assert.equal(confirmedRouteState(snapshot, completed, ["a"]), "ready");

  const inputs = [
    buildRouteInputSignatures([{ ...done, visitOrder: 1 }], [truck, unrelated], addresses),
    buildRouteInputSignatures([{ ...done, selectedVehicleJson: '{"vehicleTypeId":"unused"}' }], [truck, unrelated], addresses),
    buildRouteInputSignatures([{ ...done, notes: "주소: 세종특별자치시 연서면 공단로 120" }], [truck, unrelated], addresses),
    buildRouteInputSignatures([done], [truck, unrelated], new Map()),
  ];
  for (const signatures of inputs) assert.equal(confirmedRouteState(snapshot, signatures, ["a"]), "stale");
  assert.equal(
    buildRouteInputSignatures([{ ...done, notes: "납품 완료" }], [truck, { ...unrelated, maxWeight: 1000 }], addresses).current,
    before.current,
  );
});
