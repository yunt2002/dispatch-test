import "server-only";

import type { VehicleRecommendation } from "@/lib/dispatch-group";
import { recommendForQuantity } from "@/lib/dispatch-group";
import type { RegionLookup } from "@/lib/delivery-excel";
import { parseJson } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getDispatchSettings } from "@/lib/settings";

async function loadRegions(): Promise<RegionLookup> {
  const regions = await prisma.regionMaster.findMany();
  return new Map(
    regions.map((region) => [
      region.locationName,
      {
        regionType: region.regionType,
        preferredVehicleTypeId: region.preferredVehicleTypeId,
      },
    ]),
  );
}

/** 잔여 차감용 PLT. 환산 없으면 박스 건당 1칸으로 본다. */
function capacityUnits(pallet: number | null | undefined, boxCount: number | null | undefined) {
  if (pallet != null && pallet > 0) return pallet;
  if (boxCount != null && boxCount > 0) return 1;
  return 0;
}

/**
 * 당일 일정을 다시 보며 1·2호 잔여가 없으면 3호·스타리아로 넘긴다.
 * 큰 PLT 건을 먼저 1·2호에 앉히고, 남는 작은 건이 긴급차로 넘어가게 한다.
 * 수동으로 추천과 다른 차를 고른 건 유지한다.
 */
export async function rebalanceDayFleet(deliveryDate: string): Promise<number> {
  const [vehicles, regions, settings, entriesRaw] = await Promise.all([
    prisma.vehicleType.findMany({ where: { isActive: true } }),
    loadRegions(),
    getDispatchSettings(),
    prisma.scheduleEntry.findMany({
      where: {
        deliveryDate,
        status: { in: ["PLANNED", "CONFIRMED"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const entries = [...entriesRaw].sort((a, b) => {
    const au = capacityUnits(a.palletCount, a.boxCount);
    const bu = capacityUnits(b.palletCount, b.boxCount);
    if (au !== bu) return bu - au;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const remaining: Record<string, number> = {};
  for (const vehicle of vehicles) {
    remaining[vehicle.id] = vehicle.maxPallet ?? 0;
  }

  let changed = 0;

  for (const entry of entries) {
    const oldRec = parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
    const oldSel = parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null);
    const manual = Boolean(
      oldSel && oldRec && oldSel.vehicleTypeId !== oldRec.vehicleTypeId,
    );

    if (manual && oldSel) {
      const used = capacityUnits(entry.palletCount, entry.boxCount);
      if (used > 0) {
        remaining[oldSel.vehicleTypeId] = Math.max(
          0,
          (remaining[oldSel.vehicleTypeId] ?? 0) - used,
        );
      }
      continue;
    }

    const result = recommendForQuantity({
      locationName: entry.locationName,
      customerName: entry.customerName,
      boxCount: entry.boxCount,
      palletCount: entry.boxCount != null ? null : entry.palletCount,
      productCode: entry.productCode,
      productName: entry.productName,
      vehicles,
      regions,
      kgPerPallet: settings.kgPerPallet,
      remainingByVehicleId: { ...remaining },
    });

    const nextPallet =
      entry.boxCount != null
        ? (result.palletCount ?? entry.palletCount)
        : (result.palletCount ?? entry.palletCount);
    const nextRec = result.recommended;
    const used = capacityUnits(nextPallet, entry.boxCount);

    if (nextRec && used > 0) {
      remaining[nextRec.vehicleTypeId] = Math.max(
        0,
        (remaining[nextRec.vehicleTypeId] ?? 0) - used,
      );
    }

    const sameVehicle = oldSel?.vehicleTypeId === nextRec?.vehicleTypeId;
    const sameRecCount = oldRec?.vehicleCount === nextRec?.vehicleCount;
    const samePallet = entry.palletCount === nextPallet;
    if (sameVehicle && sameRecCount && samePallet) continue;

    await prisma.scheduleEntry.update({
      where: { id: entry.id },
      data: {
        palletCount: nextPallet,
        recommendedVehicleJson: nextRec ? JSON.stringify(nextRec) : null,
        selectedVehicleJson: nextRec ? JSON.stringify(nextRec) : null,
        recommendationReason: result.reasonLines.join("\n"),
        warningsJson: JSON.stringify(result.warnings),
        logistics: nextRec?.vehicleName ?? entry.logistics,
      },
    });
    changed += 1;
  }

  return changed;
}
