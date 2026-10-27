import type {
  CostMethod,
  CustomerConstraint,
  RouteDispatchInput,
  RouteDispatchResult,
  ShipmentRowInput,
  ValidationIssue,
  VehicleCombination,
  VehicleInput,
} from "./types";

export function computeTotalWeight(
  quantity: number | null,
  unitWeight: number | null,
): number | null {
  if (quantity == null || unitWeight == null) return null;
  if (!Number.isFinite(quantity) || !Number.isFinite(unitWeight)) return null;
  return quantity * unitWeight;
}

export function validateShipmentRow(row: ShipmentRowInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const base = {
    rowId: row.id,
    customerName: row.customerName ?? undefined,
  };

  if (!row.customerId) {
    issues.push({
      ...base,
      field: "customer",
      message: "등록되지 않은 거래처이거나 거래처가 없습니다.",
    });
  }
  if (!row.productId) {
    issues.push({
      ...base,
      field: "product",
      message: "등록되지 않은 제품이거나 제품이 없습니다.",
    });
  }
  if (row.quantity == null || !Number.isFinite(row.quantity) || row.quantity <= 0) {
    issues.push({ ...base, field: "quantity", message: "수량이 없거나 숫자 형식이 잘못되었습니다." });
  }
  const hasWeight =
    row.totalWeight != null && Number.isFinite(row.totalWeight) && row.totalWeight > 0;
  const hasPallet =
    row.palletCount != null && Number.isFinite(row.palletCount) && row.palletCount > 0;
  const hasBoxes = row.boxCount != null && Number.isFinite(row.boxCount) && row.boxCount > 0;
  if (!hasWeight && !hasPallet && !hasBoxes) {
    issues.push({
      ...base,
      field: "load",
      message: "중량·PLT·박스수량 중 하나 이상 필요합니다. (납품일정표는 박스수량 사용)",
    });
  }
  if (!row.routeId) {
    issues.push({ ...base, field: "route", message: "등록되지 않은 배송 루트이거나 루트가 없습니다." });
  }
  return issues;
}

export function isVehicleAllowed(
  vehicle: VehicleInput,
  customers: CustomerConstraint[],
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const customer of customers) {
    if (customer.restrictedVehicleTypeIds.includes(vehicle.id)) {
      violations.push(`${customer.customerName}: ${vehicle.vehicleName} 진입/사용 제한`);
    }
    if (
      customer.allowedVehicleTypeIds.length > 0 &&
      !customer.allowedVehicleTypeIds.includes(vehicle.id)
    ) {
      violations.push(`${customer.customerName}: 허용 차종에 ${vehicle.vehicleName} 없음`);
    }
  }
  return { ok: violations.length === 0, violations };
}

function estimateCost(
  vehicle: VehicleInput,
  count: number,
  distance: number | null,
  costMethod: CostMethod,
): { cost: number | null; costMissing: boolean } {
  if (costMethod === "distance") {
    if (vehicle.baseCost == null || vehicle.costPerKm == null || distance == null) {
      return { cost: null, costMissing: true };
    }
    return {
      cost: (vehicle.baseCost + vehicle.costPerKm * distance) * count,
      costMissing: false,
    };
  }
  if (vehicle.baseCost == null) {
    return { cost: null, costMissing: true };
  }
  return { cost: vehicle.baseCost * count, costMissing: false };
}

export function buildHomogeneousCombination(
  totalWeight: number,
  vehicle: VehicleInput,
  customers: CustomerConstraint[],
  distance: number | null,
  costMethod: CostMethod,
  totalPallet: number | null = null,
): VehicleCombination | null {
  if (!vehicle.isActive) return null;

  const allowed = isVehicleAllowed(vehicle, customers);
  if (!allowed.ok) {
    return {
      vehicleTypeId: vehicle.id,
      vehicleName: vehicle.vehicleName,
      vehicleCount: 0,
      totalCapacity: 0,
      loadingRate: 0,
      estimatedCost: null,
      costMissing: true,
      ruleViolations: allowed.violations,
      bindingConstraint: null,
    };
  }

  const weightOk = vehicle.maxWeight > 0 && totalWeight > 0;
  const palletOk =
    vehicle.maxPallet != null &&
    vehicle.maxPallet > 0 &&
    totalPallet != null &&
    totalPallet > 0;

  if (!weightOk && !palletOk) return null;

  const byWeight = weightOk ? Math.ceil(totalWeight / vehicle.maxWeight) : 0;
  const byPallet = palletOk ? Math.ceil(totalPallet / (vehicle.maxPallet as number)) : 0;
  const vehicleCount = Math.max(byWeight, byPallet, 1);
  const bindingConstraint =
    byPallet > byWeight ? "pallet" : weightOk ? "weight" : palletOk ? "pallet" : null;

  const weightCapacity = vehicleCount * vehicle.maxWeight;
  const palletCapacity =
    vehicle.maxPallet != null ? vehicleCount * vehicle.maxPallet : null;
  const loadingRate =
    bindingConstraint === "pallet" && palletCapacity && totalPallet
      ? (totalPallet / palletCapacity) * 100
      : weightOk
        ? (totalWeight / weightCapacity) * 100
        : 0;

  const { cost, costMissing } = estimateCost(vehicle, vehicleCount, distance, costMethod);

  return {
    vehicleTypeId: vehicle.id,
    vehicleName: vehicle.vehicleName,
    vehicleCount,
    totalCapacity: weightCapacity,
    totalPalletCapacity: palletCapacity,
    loadingRate,
    estimatedCost: cost,
    costMissing,
    ruleViolations: [],
    bindingConstraint,
  };
}

export function rankCombinations(
  combinations: VehicleCombination[],
  preferredVehicleTypeId?: string | null,
): VehicleCombination[] {
  return [...combinations].sort((a, b) => {
    if (preferredVehicleTypeId) {
      const aPref = a.vehicleTypeId === preferredVehicleTypeId ? 0 : 1;
      const bPref = b.vehicleTypeId === preferredVehicleTypeId ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
    }
    if (a.vehicleCount !== b.vehicleCount) return a.vehicleCount - b.vehicleCount;
    const costA = a.estimatedCost ?? Number.POSITIVE_INFINITY;
    const costB = b.estimatedCost ?? Number.POSITIVE_INFINITY;
    if (costA !== costB) return costA - costB;
    return b.loadingRate - a.loadingRate;
  });
}

export function buildReasonLines(
  recommended: VehicleCombination,
  alternatives: VehicleCombination[],
  preferredVehicleTypeId?: string | null,
): string[] {
  const lines = [
    `${recommended.vehicleName} 차량 ${recommended.vehicleCount}대로 전체 물량 운송 가능`,
  ];
  if (recommended.bindingConstraint === "pallet") {
    lines.push("대수 산정 기준: 적재 PLT");
  } else if (recommended.bindingConstraint === "weight") {
    lines.push("대수 산정 기준: 적재 중량");
  }
  if (preferredVehicleTypeId && recommended.vehicleTypeId === preferredVehicleTypeId) {
    lines.push("해당 루트의 기본 선호 차종입니다. (지방→1호 / 수도권→2호)");
  }
  const moreVehicles = alternatives.find((item) => item.vehicleCount > recommended.vehicleCount);
  if (moreVehicles) {
    lines.push(
      `${moreVehicles.vehicleName} ${moreVehicles.vehicleCount}대 대비 차량 ${moreVehicles.vehicleCount - recommended.vehicleCount}대 감소`,
    );
  }
  return lines;
}

export function dispatchRoute(input: RouteDispatchInput): RouteDispatchResult {
  const totalPallet = input.totalPallet ?? null;
  const base = {
    dispatchDate: input.dispatchDate,
    routeId: input.routeId,
    routeCode: input.routeCode,
    routeName: input.routeName,
    totalWeight: input.totalWeight,
    totalPallet,
    issues: input.issues,
  };

  const activeVehicles = input.vehicles.filter((vehicle) => vehicle.isActive);
  if (activeVehicles.length === 0) {
    return {
      ...base,
      combinations: [],
      recommended: null,
      alternatives: [],
      reasonLines: [],
      error: "차량 데이터가 없습니다. 차량 종류와 적재한도(톤/PLT)를 등록해주세요.",
    };
  }

  const hasWeight = input.totalWeight > 0;
  const hasPallet = totalPallet != null && totalPallet > 0;
  if (!hasWeight && !hasPallet) {
    const preferred = input.preferredVehicleTypeId
      ? activeVehicles.find((vehicle) => vehicle.id === input.preferredVehicleTypeId)
      : activeVehicles[0];
    if (!preferred) {
      return {
        ...base,
        combinations: [],
        recommended: null,
        alternatives: [],
        reasonLines: [],
        error:
          "총 적재중량·PLT를 계산할 수 없습니다. 출하 중량 또는 팔레트 수를 확인해주세요.\n(박스수량만 있으면 PLT 환산이 필요합니다.)",
      };
    }
    const soft: VehicleCombination = {
      vehicleTypeId: preferred.id,
      vehicleName: preferred.vehicleName,
      vehicleCount: 1,
      totalCapacity: preferred.maxWeight,
      totalPalletCapacity: preferred.maxPallet ?? null,
      loadingRate: 0,
      estimatedCost: preferred.baseCost,
      costMissing: preferred.baseCost == null,
      ruleViolations: [],
      bindingConstraint: null,
    };
    return {
      ...base,
      combinations: [soft],
      recommended: soft,
      alternatives: [],
      reasonLines: [
        `${preferred.vehicleName} 1대 제안 (루트 선호 차종)`,
        "출하에 중량·PLT가 없어 적재율은 검증하지 않았습니다.",
        "납품일정표 박스수량→PLT 환산 기준이 정해지면 대수·적재율 계산을 붙입니다.",
      ],
      error: null,
    };
  }

  const raw = activeVehicles
    .map((vehicle) =>
      buildHomogeneousCombination(
        input.totalWeight,
        vehicle,
        input.customers,
        input.estimatedDistance,
        input.costMethod,
        totalPallet,
      ),
    )
    .filter((item): item is VehicleCombination => item != null);

  const feasible = raw.filter((item) => item.ruleViolations.length === 0 && item.vehicleCount > 0);
  const ranked = rankCombinations(feasible, input.preferredVehicleTypeId);
  const recommended = ranked[0] ?? null;
  const alternatives = ranked.slice(1);

  if (!recommended) {
    return {
      ...base,
      combinations: raw,
      recommended: null,
      alternatives: [],
      reasonLines: [],
      error: `배차 계산 불가\n${input.routeCode} 물량을 현재 등록된 차량 조건으로 운송할 수 없습니다.\n총중량 ${input.totalWeight.toLocaleString("ko-KR")}kg` +
        (totalPallet != null ? ` / ${totalPallet} PLT` : "") +
        `\n\n차량 정보 또는 출하 데이터를 확인해주세요.`,
    };
  }

  return {
    ...base,
    combinations: ranked,
    recommended,
    alternatives,
    reasonLines: buildReasonLines(recommended, alternatives, input.preferredVehicleTypeId),
    error: null,
  };
}

export function summarizeCombination(combo: VehicleCombination): string {
  return `${combo.vehicleName} × ${combo.vehicleCount}`;
}
