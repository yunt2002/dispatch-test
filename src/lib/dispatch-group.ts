import type { VehicleType } from "@prisma/client";
import {
  computePallets,
  type NormalizedShipment,
  type RegionType,
  resolveRegionType,
  type RegionLookup,
} from "@/lib/delivery-excel";
import { matchProductLoading } from "@/lib/product-loading";
import {
  matchRouteZone,
  preferredVehicleIdForZone,
} from "@/lib/route-master";

export type VehicleRecommendation = {
  vehicleTypeId: string;
  vehicleName: string;
  vehicleCount: number;
  maxPallet: number | null;
  maxWeight: number;
  loadingRate: number | null;
  primaryRegionType: string;
  boxPreferred: boolean;
};

/** PLT가 있을 때만 대수 계산. 박스만 있으면 1대(임의 환산 금지). */
export function vehicleCountForPallets(
  palletCount: number | null | undefined,
  maxPallet: number | null | undefined,
): number {
  if (palletCount == null || palletCount <= 0) return 1;
  if (maxPallet == null || maxPallet <= 0) return 1;
  return Math.max(1, Math.ceil(palletCount / maxPallet));
}

export function loadingRateForPallets(
  palletCount: number | null | undefined,
  maxPallet: number | null | undefined,
  vehicleCount: number,
): number | null {
  if (palletCount == null || palletCount <= 0) return null;
  if (maxPallet == null || maxPallet <= 0 || vehicleCount <= 0) return null;
  return (palletCount / (vehicleCount * maxPallet)) * 100;
}

export type DispatchGroupDraft = {
  groupKey: string;
  regionType: RegionType;
  customers: string[];
  locations: string[];
  totalBoxes: number;
  totalPallets: number | null;
  shipmentIndexes: number[];
  actualLogistics: string[];
  recommended: VehicleRecommendation | null;
  reasonLines: string[];
  warnings: string[];
  matchStatus: "match" | "mismatch" | "unknown" | "review";
};

function normalizeLogisticsLabel(raw: string): string {
  const t = raw.replace(/\s+/g, "");
  if (/1호/.test(t)) return "1호차";
  if (/2호/.test(t)) return "2호차";
  if (/3호/.test(t)) return "3호차";
  if (/스타리아/.test(t)) return "스타리아";
  if (/용차/.test(t)) return "용차";
  if (/경동|택배/.test(t)) return "경동택배";
  return raw.trim();
}

function logisticsMatchesVehicle(actual: string[], recommendedName: string): "match" | "mismatch" | "unknown" {
  const norms = actual.map(normalizeLogisticsLabel).filter(Boolean);
  if (!norms.length) return "unknown";
  if (norms.every((item) => item === recommendedName || item.includes(recommendedName))) return "match";
  if (norms.some((item) => item === recommendedName || item.includes(recommendedName))) return "match";
  return "mismatch";
}

export function buildDispatchGroups(input: {
  rows: NormalizedShipment[];
  vehicles: VehicleType[];
  regions: RegionLookup;
  loadingByProduct: Map<string, { boxesPerPallet: number | null }>;
  /** 잠정 1PLT당 kg. 없으면 중량 환산 안 함. */
  kgPerPallet?: number | null;
}): DispatchGroupDraft[] {
  const activeVehicles = input.vehicles.filter((v) => v.isActive);
  const kgPerPallet = input.kgPerPallet ?? null;
  const buckets = new Map<
    string,
    {
      regionType: RegionType;
      rows: { row: NormalizedShipment; index: number }[];
    }
  >();

  input.rows.forEach((row, index) => {
    const regionType = resolveRegionType(row.location, row.logistics, input.regions);
    const groupKey = `${row.deliveryDate}|${regionType}`;
    let bucket = buckets.get(groupKey);
    if (!bucket) {
      bucket = { regionType, rows: [] };
      buckets.set(groupKey, bucket);
    }
    bucket.rows.push({ row, index });
  });

  const groups: DispatchGroupDraft[] = [];

  for (const [groupKey, bucket] of buckets) {
    const warnings: string[] = [];
    const reasonLines: string[] = [];
    const customers = [...new Set(bucket.rows.map((item) => item.row.customerName))];
    const locations = [...new Set(bucket.rows.map((item) => item.row.location).filter(Boolean))];
    const actualLogistics = [
      ...new Set(bucket.rows.map((item) => item.row.logistics).filter(Boolean)),
    ];

    let totalBoxes = 0;
    let totalWeight = 0;
    let totalPallets = 0;
    let palletKnown = true;
    let missingLoading = 0;
    let usedWeightFallback = false;

    for (const { row } of bucket.rows) {
      totalBoxes += row.boxCount ?? 0;
      totalWeight += row.totalWeight ?? 0;
      const master = input.loadingByProduct.get(row.productCode);
      const family = matchProductLoading(row.productCode, row.productName);
      const boxesPerPallet = master?.boxesPerPallet ?? family?.boxesPerPallet ?? null;
      if (family?.boxesPerPallet != null) {
        reasonLines.push(
          `${family.familyName} · ${family.boxType} · 입수 ${family.boxesPerPallet}박스/PLT`,
        );
      } else if (family && family.boxesPerPallet == null) {
        warnings.push(`${family.familyName}: 낱개 적재 — PLT 환산 없음`);
      }
      const { pallets, source, warning } = computePallets({
        boxCount: row.boxCount,
        boxesPerPallet,
        totalWeight: row.totalWeight,
        kgPerPallet,
      });
      if (pallets == null) {
        palletKnown = false;
        missingLoading += 1;
        if (warning) warnings.push(`${row.productCode}: ${warning}`);
      } else {
        totalPallets += pallets;
        if (source === "weight") usedWeightFallback = true;
        if (warning) warnings.push(`${row.productCode}: ${warning}`);
      }
      for (const issue of row.issues) {
        if (!warnings.includes(issue)) warnings.push(issue);
      }
    }

    if (missingLoading > 0) {
      warnings.push(
        `PLT 미계산 품목 ${missingLoading}건 — 해당 분은 적재율에 미반영. (박스÷임의수 환산 금지)`,
      );
    }
    if (usedWeightFallback && kgPerPallet) {
      reasonLines.push(`PLT 일부/전체는 잠정 ${kgPerPallet}kg/PLT 중량 환산 사용 (TODO: 확정)`);
    }

    // Group-level weight fallback when no row-level PLT but group has weight
    if (!palletKnown && totalWeight > 0 && kgPerPallet && kgPerPallet > 0 && totalPallets === 0) {
      totalPallets = Math.ceil(totalWeight / kgPerPallet);
      palletKnown = true;
      usedWeightFallback = true;
      warnings.push(
        `품목별 박스/PLT 없음 — 그룹 총중량 ${totalWeight}kg ÷ ${kgPerPallet}kg/PLT로 추정`,
      );
    }

    const regionType = bucket.regionType;
    let recommended: VehicleRecommendation | null = null;

    if (regionType === "CHARTER" || regionType === "COURIER") {
      warnings.push("용차/택배 검토 필요 — 1차 MVP는 자사 차량을 강제하지 않습니다.");
      reasonLines.push(
        regionType === "CHARTER"
          ? "실배차/분류상 용차 그룹입니다."
          : "실배차/분류상 택배 그룹입니다.",
      );
      groups.push({
        groupKey,
        regionType,
        customers,
        locations,
        totalBoxes,
        totalPallets: palletKnown ? totalPallets : null,
        shipmentIndexes: bucket.rows.map((item) => item.index),
        actualLogistics,
        recommended: null,
        reasonLines,
        warnings,
        matchStatus: "review",
      });
      continue;
    }

    const preferredId = locations
      .map((loc) => input.regions.get(loc)?.preferredVehicleTypeId)
      .find((id): id is string => Boolean(id));

    const candidates = activeVehicles.filter((vehicle) => {
      if (regionType === "EMERGENCY") {
        return vehicle.priorityType === "EMERGENCY" || vehicle.primaryRegionType === "EMERGENCY";
      }
      if (regionType === "LOCAL") {
        return (
          vehicle.primaryRegionType === "LOCAL" ||
          vehicle.primaryRegionType === "ANY" ||
          vehicle.id === preferredId
        );
      }
      if (regionType === "METROPOLITAN") {
        return (
          vehicle.primaryRegionType === "METROPOLITAN" ||
          vehicle.primaryRegionType === "ANY" ||
          vehicle.id === preferredId
        );
      }
      return true;
    });

    const pool = candidates.length ? candidates : activeVehicles.filter((v) => v.priorityType === "NORMAL");

    const ranked = [...pool].sort((a, b) => {
      if (preferredId) {
        const ap = a.id === preferredId ? 0 : 1;
        const bp = b.id === preferredId ? 0 : 1;
        if (ap !== bp) return ap - bp;
      }
      if (regionType !== "UNKNOWN") {
        const aMatch = a.primaryRegionType === regionType ? 0 : 1;
        const bMatch = b.primaryRegionType === regionType ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return (a.maxPallet ?? 0) - (b.maxPallet ?? 0);
    });

    const pick = ranked[0];
    if (!pick) {
      warnings.push("등록된 자사 차량이 없어 추천할 수 없습니다. 용차/택배 검토 필요");
      groups.push({
        groupKey,
        regionType,
        customers,
        locations,
        totalBoxes,
        totalPallets: palletKnown ? totalPallets : null,
        shipmentIndexes: bucket.rows.map((item) => item.index),
        actualLogistics,
        recommended: null,
        reasonLines: ["추천 불가"],
        warnings,
        matchStatus: "review",
      });
      continue;
    }

    let vehicleCount = 1;
    let loadingRate: number | null = null;
    if (palletKnown && pick.maxPallet && pick.maxPallet > 0 && totalPallets > 0) {
      const byPallet = Math.ceil(totalPallets / pick.maxPallet);
      const byWeight =
        totalWeight > 0 && pick.maxWeight > 0 ? Math.ceil(totalWeight / pick.maxWeight) : 0;
      vehicleCount = Math.max(byPallet, byWeight, 1);
      loadingRate = (totalPallets / (vehicleCount * pick.maxPallet)) * 100;
      reasonLines.push(`필요 적재 ${totalPallets} PLT · 차량 한도 ${pick.maxPallet} PLT`);
      if (byWeight > byPallet) {
        reasonLines.push(
          `톤수 제약으로 대수 ${byWeight}대 (총중량 ${totalWeight}kg / ${pick.maxWeight}kg)`,
        );
      }
      reasonLines.push(`${pick.vehicleName} ${vehicleCount}대로 적재 가능`);
    } else if (totalWeight > 0 && pick.maxWeight > 0) {
      vehicleCount = Math.ceil(totalWeight / pick.maxWeight);
      loadingRate = (totalWeight / (vehicleCount * pick.maxWeight)) * 100;
      reasonLines.push(
        `PLT 미확정 — 중량 기준 ${totalWeight}kg / ${pick.maxWeight}kg → ${vehicleCount}대`,
      );
      reasonLines.push(`추천: ${pick.vehicleName}`);
    } else {
      reasonLines.push("PLT·중량 기준 부족으로 적재율은 미검증 — 지역/용도 기반 추천만 제공합니다.");
      reasonLines.push(`추천: ${pick.vehicleName} (담당자 확인 필요)`);
    }

    if (regionType === "LOCAL") reasonLines.push("지방 납품 기본 차량 후보");
    if (regionType === "METROPOLITAN") reasonLines.push("수도권 납품 기본 차량 후보");
    if (regionType === "EMERGENCY") reasonLines.push("긴급/소량 후보");
    if (regionType === "UNKNOWN") {
      warnings.push("위치가 지역 목록에 없습니다. 설정 → 지역에서 추가하세요.");
    }
    if (pick.boxPreferred) {
      reasonLines.push("박스 단위 적재 우선 차량입니다.");
    }

    recommended = {
      vehicleTypeId: pick.id,
      vehicleName: pick.vehicleName,
      vehicleCount,
      maxPallet: pick.maxPallet,
      maxWeight: pick.maxWeight,
      loadingRate,
      primaryRegionType: pick.primaryRegionType,
      boxPreferred: pick.boxPreferred,
    };

    if (
      palletKnown &&
      pick.maxPallet &&
      totalPallets > pick.maxPallet * 3
    ) {
      warnings.push("적재량이 커서 용차/분할 배차 검토가 필요할 수 있습니다.");
    }

    const matchStatus = logisticsMatchesVehicle(actualLogistics, pick.vehicleName);

    groups.push({
      groupKey,
      regionType,
      customers,
      locations,
      totalBoxes,
      totalPallets: palletKnown ? totalPallets : null,
      shipmentIndexes: bucket.rows.map((item) => item.index),
      actualLogistics,
      recommended,
      reasonLines,
      warnings: [...new Set(warnings)],
      matchStatus,
    });
  }

  return groups.sort((a, b) => a.groupKey.localeCompare(b.groupKey));
}

const DEFAULT_LOCAL_VEHICLE_ID = "vehicle-1ho-4t";
const DEFAULT_METRO_VEHICLE_ID = "vehicle-2ho-3-5t";

function resolveFleetIds(vehicles: VehicleType[]) {
  const local =
    vehicles.find((v) => v.id === DEFAULT_LOCAL_VEHICLE_ID)?.id ??
    vehicles.find((v) => v.primaryRegionType === "LOCAL" && v.priorityType === "NORMAL")?.id ??
    DEFAULT_LOCAL_VEHICLE_ID;
  const metro =
    vehicles.find((v) => v.id === DEFAULT_METRO_VEHICLE_ID)?.id ??
    vehicles.find((v) => v.primaryRegionType === "METROPOLITAN" && v.priorityType === "NORMAL")
      ?.id ??
    DEFAULT_METRO_VEHICLE_ID;
  return { local, metro };
}

/** 지역 + 수량만으로 즉시 차량 추천 (일정 등록용) */
export function recommendForQuantity(input: {
  locationName: string;
  customerName?: string | null;
  boxCount?: number | null;
  palletCount?: number | null;
  productCode?: string | null;
  productName?: string | null;
  vehicles: VehicleType[];
  regions: RegionLookup;
  kgPerPallet?: number | null;
  /** 차량별 잔여 PLT (당일 배분용). 있으면 유동 권역·적재 여유 판단에 사용 */
  remainingByVehicleId?: Record<string, number>;
}): {
  regionType: RegionType;
  recommended: VehicleRecommendation | null;
  reasonLines: string[];
  warnings: string[];
  palletCount: number | null;
} {
  const location = input.locationName.trim();
  const regionType = resolveRegionType(location, "", input.regions);
  const kgPerPallet = input.kgPerPallet ?? null;
  const boxCount = input.boxCount != null && input.boxCount > 0 ? input.boxCount : 0;
  let totalPallets =
    input.palletCount != null && input.palletCount > 0 ? input.palletCount : null;
  const palletKnown = totalPallets != null;
  const warnings: string[] = [];
  const reasonLines: string[] = [];
  const family = matchProductLoading(input.productCode, input.productName);
  if (family?.boxesPerPallet == null && family) {
    warnings.push(`${family.familyName}: 낱개 박스 — PLT 환산 없음 · 별도 보관`);
  }
  const zone = matchRouteZone({
    locationName: location,
    customerName: input.customerName ?? family?.customers?.[0] ?? null,
  });
  if (zone) {
    reasonLines.push(`권역 ${zone.label} · ${zone.notes}`);
  }

  let totalWeight = 0;
  if (palletKnown && kgPerPallet) {
    totalWeight = (totalPallets as number) * kgPerPallet;
    reasonLines.push(`PLT ${(totalPallets as number).toFixed(1)} · ${kgPerPallet}kg/PLT`);
  }

  const drafts = buildDispatchGroups({
    rows: [
      {
        rowNumber: 1,
        deliveryDate: "manual",
        customerName: input.customerName ?? "",
        location,
        productCode: input.productCode ?? "",
        productName: input.productName ?? "",
        quantity: boxCount || null,
        boxCount: boxCount || null,
        piecesPerBoxRaw: null,
        totalWeight: totalWeight || null,
        logistics: "",
        staff: "",
        notes: "",
        issues: [],
      },
    ],
    vehicles: input.vehicles,
    regions: input.regions,
    loadingByProduct: new Map(),
    kgPerPallet,
  });

  const activeVehicles = input.vehicles.filter((v) => v.isActive);
  const fleetIds = resolveFleetIds(activeVehicles);
  const zonePreferredId = preferredVehicleIdForZone({
    zone,
    vehicleIds: fleetIds,
    remainingByVehicleId: input.remainingByVehicleId,
    needPallets: totalPallets,
  });
  const regionPreferredId = input.regions.get(location)?.preferredVehicleTypeId ?? null;
  const preferredId = zonePreferredId ?? regionPreferredId;

  function pickVehicle(preferId: string | null): VehicleType | null {
    const candidates = activeVehicles.filter((vehicle) => {
      if (regionType === "EMERGENCY") {
        return vehicle.priorityType === "EMERGENCY" || vehicle.primaryRegionType === "EMERGENCY";
      }
      if (preferId && vehicle.id === preferId) return true;
      if (zone?.vehiclePolicy === "LOCAL_1HO") {
        return vehicle.primaryRegionType === "LOCAL" || vehicle.primaryRegionType === "ANY";
      }
      if (zone?.vehiclePolicy === "METRO_2HO") {
        return vehicle.primaryRegionType === "METROPOLITAN" || vehicle.primaryRegionType === "ANY";
      }
      if (zone?.vehiclePolicy === "FLEX") {
        return vehicle.priorityType === "NORMAL";
      }
      if (regionType === "LOCAL") {
        return (
          vehicle.primaryRegionType === "LOCAL" ||
          vehicle.primaryRegionType === "ANY" ||
          vehicle.id === preferId
        );
      }
      if (regionType === "METROPOLITAN") {
        return (
          vehicle.primaryRegionType === "METROPOLITAN" ||
          vehicle.primaryRegionType === "ANY" ||
          vehicle.id === preferId
        );
      }
      return true;
    });
    const pool = candidates.length
      ? candidates
      : activeVehicles.filter((v) => v.priorityType === "NORMAL");
    const ranked = [...pool].sort((a, b) => {
      if (preferId) {
        const ap = a.id === preferId ? 0 : 1;
        const bp = b.id === preferId ? 0 : 1;
        if (ap !== bp) return ap - bp;
      }
      if (input.remainingByVehicleId) {
        const ar = input.remainingByVehicleId[a.id] ?? 0;
        const br = input.remainingByVehicleId[b.id] ?? 0;
        if (ar !== br) return br - ar;
      }
      if (regionType !== "UNKNOWN") {
        const aMatch = a.primaryRegionType === regionType ? 0 : 1;
        const bMatch = b.primaryRegionType === regionType ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return (a.maxPallet ?? 0) - (b.maxPallet ?? 0);
    });
    return ranked[0] ?? null;
  }

  // PLT를 직접 넘긴 경우·권역 보정
  if (palletKnown) {
    const pick = pickVehicle(preferredId);
    if (!pick) {
      return {
        regionType,
        recommended: null,
        reasonLines: ["추천 가능한 차량이 없습니다."],
        warnings: ["차량을 확인하세요."],
        palletCount: totalPallets,
      };
    }

    const pallets = totalPallets as number;
    const vehicleCount = vehicleCountForPallets(pallets, pick.maxPallet);
    const loadingRate = loadingRateForPallets(pallets, pick.maxPallet, vehicleCount);
    const reasons = [...reasonLines];
    if (pick.maxPallet && pick.maxPallet > 0) {
      reasons.push(`${regionTypeLabelLocal(regionType)} · ${pallets} PLT`);
      reasons.push(`${pick.vehicleName} 한도 ${pick.maxPallet} PLT → ${vehicleCount}대`);
      if (input.remainingByVehicleId?.[pick.id] != null) {
        const rem = input.remainingByVehicleId[pick.id];
        reasons.push(`잔여 적재 ${rem} PLT (등록 전)`);
      }
    } else {
      reasons.push(`${regionTypeLabelLocal(regionType)} · ${pallets} PLT`);
      reasons.push(`${pick.vehicleName} (PLT 한도 미설정)`);
    }
    if (zone?.vehiclePolicy === "FLEX") {
      warnings.push("공통/유동 권역 — 잔여 PLT·동선 보고 1호/2호를 고르세요.");
    }

    return {
      regionType,
      recommended: {
        vehicleTypeId: pick.id,
        vehicleName: pick.vehicleName,
        vehicleCount,
        maxPallet: pick.maxPallet,
        maxWeight: pick.maxWeight,
        loadingRate,
        primaryRegionType: pick.primaryRegionType,
        boxPreferred: pick.boxPreferred,
      },
      reasonLines: reasons,
      warnings: [
        ...warnings,
        ...(regionType === "UNKNOWN" ? ["위치가 지역 목록에 없습니다."] : []),
      ],
      palletCount: pallets,
    };
  }

  const draft = drafts[0];
  // 권역 선호 차량이 있으면 draft 추천을 덮어쓴다 (박스만 있을 때)
  if (preferredId && draft?.recommended && draft.recommended.vehicleTypeId !== preferredId) {
    const pick = activeVehicles.find((v) => v.id === preferredId);
    if (pick) {
      draft.recommended = {
        vehicleTypeId: pick.id,
        vehicleName: pick.vehicleName,
        vehicleCount: 1,
        maxPallet: pick.maxPallet,
        maxWeight: pick.maxWeight,
        loadingRate: null,
        primaryRegionType: pick.primaryRegionType,
        boxPreferred: pick.boxPreferred,
      };
      draft.reasonLines = [...reasonLines, ...draft.reasonLines, `권역 선호 ${pick.vehicleName}`];
    }
  }
  if (zone?.vehiclePolicy === "FLEX") {
    warnings.push("공통/유동 권역 — 잔여 PLT·동선 보고 1호/2호를 고르세요.");
  }

  return {
    regionType: draft?.regionType ?? regionType,
    recommended: draft?.recommended ?? null,
    reasonLines: draft?.reasonLines?.length ? draft.reasonLines : reasonLines,
    warnings: [...warnings, ...(draft?.warnings ?? [])],
    palletCount: draft?.totalPallets ?? (palletKnown ? totalPallets : null),
  };
}

function regionTypeLabelLocal(regionType: RegionType): string {
  if (regionType === "LOCAL") return "지방";
  if (regionType === "METROPOLITAN") return "수도권";
  if (regionType === "EMERGENCY") return "긴급납품";
  if (regionType === "CHARTER") return "용차";
  if (regionType === "COURIER") return "택배";
  return "미분류";
}
