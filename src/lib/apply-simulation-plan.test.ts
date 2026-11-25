import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentsFromSimulation,
  matchSimulationToSchedule,
  simulationMatchKey,
} from "./apply-simulation-plan";
import type { SimulationResult } from "./simulation";

const item = (
  rowNumber: number,
  customer: string,
  product: string,
  location: string,
  transport = "용차",
) => ({
  rowNumber,
  date: "2026-11-25",
  customer,
  product,
  productCode: product,
  location,
  quantity: 100,
  boxes: 10,
  transport,
  vehicle: null,
  lat: 1,
  lng: 1,
  pallets: 1,
  weight: 100,
  packing: "auto" as const,
  workbookAddress: null,
});

test("AI 자사·용차·택배 배정을 뽑는다", () => {
  const a = item(1, "A", "P1", "지방");
  const b = item(2, "B", "P2", "수도권");
  const c = item(3, "C", "P3", "서울", "경동택배");
  const result = {
    items: [a, b, c],
    original: [],
    proposed: [{ vehicle: "1호차", items: [a], pallets: 1, weight: 100, unknownPallets: 0, unknownWeight: 0, distance: 1, minutes: 1, toll: 0, fuel: 0, over: false }],
    remaining: [c],
    charterGroups: [{ items: [b] }],
    note: "",
    warnings: [],
  } as SimulationResult;

  const assignments = assignmentsFromSimulation(result);
  assert.equal(assignments.length, 3);
  assert.equal(assignments.find((row) => row.rowNumber === 1)?.vehicleName, "1호차");
  assert.equal(assignments.find((row) => row.rowNumber === 2)?.vehicleName, "용차");
  assert.equal(assignments.find((row) => row.rowNumber === 2)?.charterGroupIndex, 0);
  assert.equal(assignments.find((row) => row.rowNumber === 3)?.vehicleName, "택배");
});

test("일정과 AI 행을 키로 맞춘다", () => {
  const assignments = [
    {
      rowNumber: 1,
      customer: "네오",
      product: "MPS",
      location: "평택",
      quantity: 10,
      boxes: 2,
      vehicleName: "1호차",
      charterGroupIndex: null,
      visitOrder: 0,
    },
  ];
  const entries = [
    {
      id: "e1",
      deliveryDate: "2026-11-25",
      customerName: "네오",
      productCode: null,
      productName: "MPS",
      locationName: "평택",
      quantity: 10,
      boxCount: 2,
      status: "PLANNED",
      palletCount: 1,
    },
  ];
  const matched = matchSimulationToSchedule(entries, assignments);
  assert.equal(matched.matched.length, 1);
  assert.equal(matched.matched[0]?.entry.id, "e1");
  assert.equal(
    simulationMatchKey(assignments[0]!),
    simulationMatchKey({
      customer: "네오",
      product: "MPS",
      location: "평택",
      quantity: 10,
      boxes: 2,
    }),
  );
});
