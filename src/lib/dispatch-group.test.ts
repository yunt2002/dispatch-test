import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VehicleType } from "@prisma/client";
import { buildDispatchGroups, recommendForQuantity, vehicleCountForPallets } from "./dispatch-group";
import type { NormalizedShipment } from "./delivery-excel";

function vehicle(partial: Partial<VehicleType> & Pick<VehicleType, "id" | "vehicleName">): VehicleType {
  return {
    maxWeight: 3500,
    maxPallet: 8,
    baseCost: null,
    costPerKm: null,
    primaryRegionType: "METROPOLITAN",
    priorityType: "NORMAL",
    boxPreferred: false,
    description: null,
    isActive: true,
    isDummy: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("dispatch groups", () => {
  it("등록 담당자가 박스의 추가 PLT를 0으로 지정하면 품목 기준표로 다시 환산하지 않는다", () => {
    const result = recommendForQuantity({ locationName: "인천", boxCount: 20, palletCount: 0, productName: "BD HIP SENSOR MAGNET ASSY", vehicles: [vehicle({ id: "v2", vehicleName: "2호차" })], regions: new Map([["인천", { regionType: "METROPOLITAN", preferredVehicleTypeId: "v2" }]]) });
    assert.equal(result.palletCount, 0);
    assert.equal(result.recommended?.vehicleName, "2호차");
  });
  it("엑셀 박스 품목은 기준표와 중량이 있어도 자동으로 PLT를 잡지 않고 중량 제한을 반영한다", () => {
    const row: NormalizedShipment = { rowNumber: 1, deliveryDate: "2026-10-14", customerName: "거래처", location: "인천", productCode: "", productName: "HFP 3.2 FE ROTOR ASSY (8호 금형)", quantity: 1000, boxCount: 1000, piecesPerBoxRaw: null, totalWeight: 5620, logistics: "", staff: "", notes: "", issues: [] };
    const options = { vehicles: [vehicle({ id: "v2", vehicleName: "2호차", maxWeight: 3500 })], regions: new Map([["인천", { regionType: "METROPOLITAN", preferredVehicleTypeId: "v2" }]]), kgPerPallet: 600 };
    const group = buildDispatchGroups({ ...options, rows: [row], loadingByProduct: new Map() })[0];
    assert.equal(group.totalPallets, 0);
    assert.equal(group.recommended?.vehicleCount, 2);
    assert.ok(group.warnings.some((warning) => warning.includes("실제 공간")));
    const recommendation = recommendForQuantity({ ...options, locationName: row.location, boxCount: row.boxCount, productName: row.productName });
    assert.equal(recommendation.palletCount, 0);
    assert.equal(recommendation.recommended?.vehicleCount, 2);
  });
  it("recommends 2호차 for metropolitan without inventing PLT", () => {
    const rows: NormalizedShipment[] = [
      {
        rowNumber: 3,
        deliveryDate: "2026-09-01",
        customerName: "만도브로제",
        location: "인천",
        productCode: "P1",
        productName: "A",
        quantity: 100,
        boxCount: 10,
        piecesPerBoxRaw: 10,
        totalWeight: null,
        logistics: "2호 차량(3.5t)",
        staff: "",
        notes: "",
        issues: [],
      },
    ];
    const groups = buildDispatchGroups({
      rows,
      vehicles: [
        vehicle({ id: "v1", vehicleName: "1호차", primaryRegionType: "LOCAL", maxWeight: 4000 }),
        vehicle({ id: "v2", vehicleName: "2호차", primaryRegionType: "METROPOLITAN", maxWeight: 3500 }),
      ],
      regions: new Map([
        ["인천", { regionType: "METROPOLITAN", preferredVehicleTypeId: "v2" }],
      ]),
      loadingByProduct: new Map(),
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].recommended?.vehicleName, "2호차");
    assert.equal(groups[0].totalPallets, 0);
    assert.equal(groups[0].matchStatus, "match");
    assert.ok(groups[0].warnings.some((w) => w.includes("PLT")));
  });

  it("marks charter as review-needed", () => {
    const rows: NormalizedShipment[] = [
      {
        rowNumber: 3,
        deliveryDate: "2026-09-01",
        customerName: "디아이씨",
        location: "울주",
        productCode: "P1",
        productName: "A",
        quantity: 100,
        boxCount: 10,
        piecesPerBoxRaw: null,
        totalWeight: null,
        logistics: "용차",
        staff: "용차",
        notes: "",
        issues: [],
      },
    ];
    const groups = buildDispatchGroups({
      rows,
      vehicles: [vehicle({ id: "v1", vehicleName: "1호차", primaryRegionType: "LOCAL" })],
      regions: new Map([["울주", { regionType: "LOCAL", preferredVehicleTypeId: "v1" }]]),
      loadingByProduct: new Map(),
    });
    assert.equal(groups[0].matchStatus, "review");
    assert.equal(groups[0].recommended, null);
  });
});

describe("recommendForQuantity", () => {
  it("picks vehicle from location + pallet count", () => {
    const result = recommendForQuantity({
      locationName: "인천",
      palletCount: 30,
      vehicles: [
        vehicle({ id: "v2", vehicleName: "2호차", primaryRegionType: "METROPOLITAN", maxPallet: 8 }),
        vehicle({ id: "v1", vehicleName: "1호차", primaryRegionType: "LOCAL", maxPallet: 8 }),
      ],
      regions: new Map([
        ["인천", { regionType: "METROPOLITAN", preferredVehicleTypeId: "v2" }],
      ]),
    });
    assert.equal(result.regionType, "METROPOLITAN");
    assert.equal(result.recommended?.vehicleName, "2호차");
    assert.equal(result.recommended?.vehicleCount, 4);
  });

  it("박스는 제품 기준표가 있어도 PLT를 자동 배정하지 않는다", () => {
    const result = recommendForQuantity({
      locationName: "울주",
      boxCount: 64,
      productName: "DIC SBW ROTOR ASSY (NBPM / 폭 8.65/42UH)",
      vehicles: [
        vehicle({ id: "v1", vehicleName: "1호차", primaryRegionType: "LOCAL", maxPallet: 8 }),
        vehicle({ id: "v2", vehicleName: "2호차", primaryRegionType: "METROPOLITAN", maxPallet: 8 }),
      ],
      regions: new Map([["울주", { regionType: "LOCAL", preferredVehicleTypeId: "v1" }]]),
    });
    assert.equal(result.palletCount, 0);
    assert.ok(result.warnings.some((warning) => warning.includes("적재 방식")));
    assert.equal(result.recommended?.vehicleName, "1호차");
    assert.equal(result.recommended?.vehicleCount, 1);
    assert.ok(result.reasonLines.some((line) => line.includes("28박스/PLT")));
  });

  it("박스 중량은 계산하면서 추가 PLT는 자동 배정하지 않는다", () => {
    // HFP 3.2: 5620g/박스. 50박스 → 중량 50×5.62=281kg
    const result = recommendForQuantity({
      locationName: "평택",
      boxCount: 50,
      productName: "HFP 3.2 FE ROTOR ASSY (8호 금형)",
      kgPerPallet: 600,
      vehicles: [
        vehicle({ id: "v2", vehicleName: "2호차", primaryRegionType: "METROPOLITAN", maxPallet: 8 }),
      ],
      regions: new Map([["평택", { regionType: "METROPOLITAN", preferredVehicleTypeId: "v2" }]]),
    });
    assert.equal(result.palletCount, 0);
    assert.ok(
      result.reasonLines.some((line) => line.includes("281kg") && line.includes("50박스")),
      result.reasonLines.join(" | "),
    );
  });

  it("overflows to emergency when 1호 remaining is full", () => {
    const result = recommendForQuantity({
      locationName: "울주",
      palletCount: 2,
      vehicles: [
        vehicle({ id: "v1", vehicleName: "1호차", primaryRegionType: "LOCAL", maxPallet: 8 }),
        vehicle({
          id: "v3",
          vehicleName: "3호차",
          primaryRegionType: "EMERGENCY",
          priorityType: "EMERGENCY",
          maxPallet: 2,
          maxWeight: 2500,
        }),
        vehicle({
          id: "staria",
          vehicleName: "스타리아",
          primaryRegionType: "EMERGENCY",
          priorityType: "EMERGENCY",
          maxPallet: 1,
          maxWeight: 1000,
        }),
      ],
      regions: new Map([["울주", { regionType: "LOCAL", preferredVehicleTypeId: "v1" }]]),
      remainingByVehicleId: { v1: 0, v3: 2, staria: 1 },
    });
    assert.equal(result.recommended?.vehicleName, "3호차");
    assert.ok(result.reasonLines.some((line) => line.includes("잔여 부족")));
  });
});

describe("vehicleCountForPallets", () => {
  it("keeps 1 when only boxes exist", () => {
    assert.equal(vehicleCountForPallets(null, 1), 1);
    assert.equal(vehicleCountForPallets(0, 8), 1);
  });

  it("recalculates count for a smaller truck", () => {
    assert.equal(vehicleCountForPallets(8, 8), 1);
    assert.equal(vehicleCountForPallets(8, 1), 8);
    assert.equal(vehicleCountForPallets(2, 1), 2);
  });
});
