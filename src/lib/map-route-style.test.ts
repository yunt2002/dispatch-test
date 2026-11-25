import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  mapRouteKind,
  offsetMapPath,
  resolveMapRouteStyle,
} from "./map-route-style";

test("1·2호차는 서로 다른 실선 색이다", () => {
  const one = resolveMapRouteStyle("1호차", 0);
  const two = resolveMapRouteStyle("2호차", 1);
  assert.equal(one.kind, "own");
  assert.equal(two.kind, "own");
  assert.equal(one.strokeStyle, "solid");
  assert.equal(two.strokeStyle, "solid");
  assert.notEqual(one.color, two.color);
  assert.equal(one.strokeWeight, 7);
});

test("용차는 점선이고 자사와 구분된다", () => {
  const charter = resolveMapRouteStyle("용차 · DY AUTO", 0);
  const own = resolveMapRouteStyle("1호차", 1);
  assert.equal(mapRouteKind("용차 · DY AUTO"), "charter");
  assert.equal(charter.strokeStyle, "dashed");
  assert.ok(charter.strokeWeight < own.strokeWeight);
  assert.notEqual(charter.color, own.color);
});

test("여러 경로일 때 좌표를 살짝 어긋낸다", () => {
  const path = [
    { lat: 37.4, lng: 126.9 },
    { lat: 36.5, lng: 127.4 },
  ];
  const a = offsetMapPath(path, 0, 3);
  const b = offsetMapPath(path, 1, 3);
  const c = offsetMapPath(path, 2, 3);
  assert.notDeepEqual(a[0], c[0]);
  assert.deepEqual(b[0], path[0]);
});
