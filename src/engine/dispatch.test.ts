import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHomogeneousCombination,
  computeTotalWeight,
  dispatchRoute,
  rankCombinations,
  validateShipmentRow,
} from "./dispatch";
import type { CustomerConstraint, VehicleInput } from "./types";

const vehicles: VehicleInput[] = [
  {
    id: "v1",
    vehicleName: "DUMMY_1톤",
    maxWeight: 1000,
    baseCost: 120000,
    costPerKm: 0,
    isActive: true,
  },
  {
    id: "v25",
    vehicleName: "DUMMY_2.5톤",
    maxWeight: 2500,
    baseCost: 170000,
    costPerKm: 0,
    isActive: true,
  },
  {
    id: "v5",
    vehicleName: "DUMMY_5톤",
    maxWeight: 5000,
    baseCost: 250000,
    costPerKm: 0,
    isActive: true,
  },
];

const openCustomer: CustomerConstraint = {
  id: "a",
  customerName: "DUMMY_A",
  allowedVehicleTypeIds: [],
  restrictedVehicleTypeIds: [],
};

describe("dispatch engine (DUMMY numbers only)", () => {
  it("Case 1: 단일 거래처 + 단일 차량", () => {
    const combo = buildHomogeneousCombination(800, vehicles[0], [openCustomer], null, "fixed");
    assert.equal(combo?.vehicleCount, 1);
    assert.equal(combo?.loadingRate, 80);
    assert.equal(combo?.estimatedCost, 120000);
  });

  it("Case 2: 동일 루트 복수 거래처 총중량", () => {
    assert.equal(computeTotalWeight(70, 10), 700);
    assert.equal(computeTotalWeight(45, 10), 450);
    const result = dispatchRoute({
      dispatchDate: "2026-09-15",
      routeId: "r01",
      routeCode: "DUMMY_R01",
      routeName: "테스트 루트",
      estimatedDistance: 40,
      totalWeight: 1150,
      customers: [openCustomer, { ...openCustomer, id: "b", customerName: "DUMMY_B" }],
      vehicles,
      costMethod: "fixed",
      issues: [],
    });
    assert.equal(result.recommended?.vehicleName, "DUMMY_2.5톤");
    assert.equal(result.recommended?.vehicleCount, 1);
    assert.equal(result.alternatives.length, 2);
  });

  it("Case 3: 1톤 한 대 적재량 초과", () => {
    const combo = buildHomogeneousCombination(1150, vehicles[0], [openCustomer], null, "fixed");
    assert.equal(combo?.vehicleCount, 2);
    assert.equal(combo?.totalCapacity, 2000);
  });

  it("Case 4: 여러 차량 조합 가능 시 최소 대수 우선", () => {
    const ranked = rankCombinations([
      {
        vehicleTypeId: "v1",
        vehicleName: "DUMMY_1톤",
        vehicleCount: 2,
        totalCapacity: 2000,
        loadingRate: 57.5,
        estimatedCost: 240000,
        costMissing: false,
        ruleViolations: [],
      },
      {
        vehicleTypeId: "v25",
        vehicleName: "DUMMY_2.5톤",
        vehicleCount: 1,
        totalCapacity: 2500,
        loadingRate: 46,
        estimatedCost: 170000,
        costMissing: false,
        ruleViolations: [],
      },
    ]);
    assert.equal(ranked[0].vehicleName, "DUMMY_2.5톤");
  });

  it("Case 5: 특정 차량 제한 거래처", () => {
    const restricted: CustomerConstraint = {
      id: "c",
      customerName: "DUMMY_C",
      allowedVehicleTypeIds: [],
      restrictedVehicleTypeIds: ["v25"],
    };
    const result = dispatchRoute({
      dispatchDate: "2026-09-15",
      routeId: "r02",
      routeCode: "DUMMY_R02",
      routeName: "제한 테스트",
      estimatedDistance: null,
      totalWeight: 800,
      customers: [restricted],
      vehicles,
      costMethod: "fixed",
      issues: [],
    });
    assert.ok(result.recommended);
    assert.notEqual(result.recommended?.vehicleTypeId, "v25");
    assert.ok(result.combinations.every((item) => item.vehicleTypeId !== "v25" || item.ruleViolations.length > 0));
  });

  it("Case 6: 중량·PLT·박스 모두 없음", () => {
    const issues = validateShipmentRow({
      id: "s1",
      deliveryDate: "2026-09-15",
      customerId: "a",
      customerName: "DUMMY_A",
      productId: "p2",
      quantity: 10,
      unitWeight: null,
      totalWeight: null,
      routeId: "r01",
    });
    assert.ok(issues.some((issue) => issue.field === "load"));
  });

  it("Case 6b: 박스수량만 있으면 적재 검증 통과", () => {
    const issues = validateShipmentRow({
      id: "s2",
      deliveryDate: "2026-09-15",
      customerId: "a",
      customerName: "DUMMY_A",
      productId: "p2",
      quantity: 10,
      unitWeight: null,
      totalWeight: null,
      boxCount: 5.8,
      routeId: "r01",
    });
    assert.equal(issues.length, 0);
  });

  it("Case 6c: PLT 기준으로 대수 산정", () => {
    const withPallet = vehicles.map((vehicle) => ({
      ...vehicle,
      maxPallet: vehicle.id === "v25" ? 8 : vehicle.id === "v1" ? 2 : 12,
    }));
    const combo = buildHomogeneousCombination(100, withPallet[1], [openCustomer], null, "fixed", 10);
    assert.equal(combo?.vehicleCount, 2);
    assert.equal(combo?.bindingConstraint, "pallet");
  });

  it("Case 7: 등록되지 않은 거래처", () => {
    const issues = validateShipmentRow({
      deliveryDate: "2026-09-15",
      customerId: null,
      productId: "p1",
      quantity: 10,
      unitWeight: 10,
      totalWeight: 100,
      routeId: "r01",
    });
    assert.ok(issues.some((issue) => issue.field === "customer"));
  });

  it("Case 8: 어떤 차량으로도 운송 불가능", () => {
    const blocked: CustomerConstraint = {
      id: "e",
      customerName: "DUMMY_E",
      allowedVehicleTypeIds: [],
      restrictedVehicleTypeIds: ["v1", "v25", "v5"],
    };
    const result = dispatchRoute({
      dispatchDate: "2026-09-15",
      routeId: "r04",
      routeCode: "DUMMY_R04",
      routeName: "불가 테스트",
      estimatedDistance: null,
      totalWeight: 6700,
      customers: [blocked],
      vehicles,
      costMethod: "fixed",
      issues: [],
    });
    assert.equal(result.recommended, null);
    assert.ok(result.error?.includes("배차 계산 불가"));
  });

  it("적재율 공식", () => {
    const combo = buildHomogeneousCombination(1150, vehicles[1], [openCustomer], null, "fixed");
    assert.ok(combo);
    assert.equal(Number(combo.loadingRate.toFixed(1)), 46.0);
  });
});
