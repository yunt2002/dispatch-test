import "server-only";

import { randomUUID } from "node:crypto";
import type { VehicleType } from "@prisma/client";
import {
  loadingRateForPallets,
  vehicleCountForPallets,
  type VehicleRecommendation,
} from "@/lib/dispatch-group";
import { consolidateLabel } from "@/lib/consolidate-label";
import { parseJson } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export function capacityUnits(
  pallet: number | null | undefined,
  boxCount: number | null | undefined,
) {
  if (pallet != null && pallet > 0) return pallet;
  if (boxCount != null && boxCount > 0) return 1;
  return 0;
}

function shortGroupLabel(groupId: string) {
  return groupId.slice(-4).toUpperCase();
}

export { consolidateLabel };

function pickVehicleForTotal(
  vehicles: VehicleType[],
  totalPallets: number,
  preferredRegion: string | null,
): VehicleType | null {
  const active = vehicles.filter((v) => v.isActive);
  if (!active.length) return null;

  const fits = (v: VehicleType) => {
    const max = v.maxPallet ?? 0;
    return max <= 0 || totalPallets <= max * 4; // 과도한 복수는 피하되 막지는 않음
  };

  const scored = active
    .filter(fits)
    .map((v) => {
      let score = 0;
      if (preferredRegion && v.primaryRegionType === preferredRegion) score += 20;
      if (v.priorityType === "NORMAL") score += 10;
      const max = v.maxPallet ?? 0;
      if (max > 0 && totalPallets <= max) score += 30;
      else if (max > 0) score += Math.max(0, 15 - Math.ceil(totalPallets / max));
      score += max;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.v ?? active[0] ?? null;
}

export async function consolidateEntries(input: {
  ids: string[];
  date: string;
}): Promise<{ ok: string } | { error: string }> {
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (ids.length < 2) {
    return { error: "합차는 2건 이상 선택하세요." };
  }

  const [entries, vehicles] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: { id: { in: ids }, deliveryDate: input.date },
    }),
    prisma.vehicleType.findMany({ where: { isActive: true } }),
  ]);

  if (entries.length !== ids.length) {
    return { error: "선택한 일정 중 일부를 찾지 못했습니다. 날짜를 확인하세요." };
  }
  if (entries.some((e) => e.status === "DONE" || e.status === "CANCELLED")) {
    return { error: "완료·취소 건은 합차할 수 없습니다." };
  }

  const totalPallets = entries.reduce(
    (sum, e) => sum + capacityUnits(e.palletCount, e.boxCount),
    0,
  );
  if (totalPallets <= 0) {
    return { error: "PLT(또는 박스) 수량이 없어 합차할 수 없습니다." };
  }

  // 이미 같은 그룹이면 차량만 재맞춤
  const existingGroups = [
    ...new Set(entries.map((e) => e.consolidateGroupId).filter(Boolean)),
  ] as string[];

  const preferredRegion = entries[0]?.regionType ?? null;
  // 선택 건에 공통 차량이 있으면 우선
  const selectedIds = entries.map(
    (e) =>
      parseJson<VehicleRecommendation | null>(e.selectedVehicleJson, null)?.vehicleTypeId ??
      null,
  );
  const commonVehicleId = selectedIds.every((id) => id && id === selectedIds[0])
    ? selectedIds[0]
    : null;
  const vehicle =
    (commonVehicleId
      ? vehicles.find((v) => v.id === commonVehicleId) ?? null
      : null) ?? pickVehicleForTotal(vehicles, totalPallets, preferredRegion);

  if (!vehicle) {
    return { error: "합차에 쓸 차량이 없습니다." };
  }

  const vehicleCount = vehicleCountForPallets(totalPallets, vehicle.maxPallet);
  const shared: VehicleRecommendation = {
    vehicleTypeId: vehicle.id,
    vehicleName: vehicle.vehicleName,
    vehicleCount,
    maxPallet: vehicle.maxPallet,
    maxWeight: vehicle.maxWeight,
    loadingRate: loadingRateForPallets(totalPallets, vehicle.maxPallet, vehicleCount),
    primaryRegionType: vehicle.primaryRegionType,
    boxPreferred: vehicle.boxPreferred,
  };
  const vehicleJson = JSON.stringify(shared);
  const groupId = existingGroups.length === 1 ? existingGroups[0]! : randomUUID();
  const reason = [
    `합차 ${entries.length}건 · 총 ${totalPallets} PLT`,
    `${vehicle.vehicleName}${vehicleCount > 1 ? ` ×${vehicleCount}` : ""}`,
    `그룹 ${shortGroupLabel(groupId)}`,
  ].join("\n");

  const ordered = [...entries].sort((a, b) => {
    const ao = a.visitOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.visitOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  await prisma.$transaction(
    ordered.map((entry, index) =>
      prisma.scheduleEntry.update({
        where: { id: entry.id },
        data: {
          consolidateGroupId: groupId,
          visitOrder: index,
          selectedVehicleJson: vehicleJson,
          recommendedVehicleJson: vehicleJson,
          recommendationReason: reason,
          logistics: vehicle.vehicleName,
          warningsJson: JSON.stringify([
            `합차 ${shortGroupLabel(groupId)} · ${entries.length}건 동승`,
          ]),
        },
      }),
    ),
  );

  await prisma.appLog.create({
    data: {
      userAction: "schedule_consolidate",
      routeCode: input.date,
      recommendation: `${entries.length}건 → ${vehicle.vehicleName}`,
      selectedResult: groupId,
    },
  });

  return {
    ok: `${entries.length}건을 ${vehicle.vehicleName} 합차(${shortGroupLabel(groupId)})로 묶었습니다. 총 ${totalPallets} PLT`,
  };
}

export async function splitConsolidateGroup(input: {
  groupId: string;
  date: string;
}): Promise<{ ok: string } | { error: string }> {
  const groupId = input.groupId.trim();
  if (!groupId) return { error: "합차 그룹이 없습니다." };

  const result = await prisma.scheduleEntry.updateMany({
    where: { consolidateGroupId: groupId, deliveryDate: input.date },
    data: {
      consolidateGroupId: null,
      warningsJson: "[]",
    },
  });

  if (!result.count) {
    return { error: "해제할 합차 그룹을 찾지 못했습니다." };
  }

  await prisma.appLog.create({
    data: {
      userAction: "schedule_split_consolidate",
      routeCode: input.date,
      selectedResult: groupId,
    },
  });

  return { ok: `합차 ${shortGroupLabel(groupId)} ${result.count}건을 해제했습니다.` };
}
