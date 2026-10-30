import "server-only";

import type { VehicleRecommendation } from "@/lib/dispatch-group";
import { parseJson } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { resolveRouteScope } from "@/lib/dispatch-batches";

function assignedVehicleId(entry: {
  selectedVehicleJson: string | null;
  recommendedVehicleJson: string | null;
}): string | null {
  const assigned =
    parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null) ??
    parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
  return assigned?.vehicleTypeId ?? null;
}

/**
 * 같은 날·같은 차량에 배정된 납품의 방문 순서를 stopIds 순으로 저장한다.
 */
export async function saveVehicleVisitOrder(input: {
  date: string;
  vehicleId: string;
  stopIds: string[];
  batchId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const date = input.date.trim();
  const vehicleId = input.vehicleId.trim();
  const stopIds = input.stopIds.map((id) => id.trim()).filter(Boolean);

  if (!date || !vehicleId) {
    return { ok: false, error: "date와 vehicleId가 필요합니다." };
  }
  if (stopIds.length === 0) {
    return { ok: false, error: "stopIds가 비어 있습니다." };
  }
  if (new Set(stopIds).size !== stopIds.length) {
    return { ok: false, error: "중복된 납품이 있습니다." };
  }

  const scope = await resolveRouteScope(date, input.batchId);
  if (!scope.valid) return { ok: false, error: "확정 배차를 찾을 수 없습니다." };
  const entries = await prisma.scheduleEntry.findMany({
    where: scope.where,
    select: {
      id: true,
      selectedVehicleJson: true,
      recommendedVehicleJson: true,
    },
  });

  const forVehicle = entries.filter(
    (entry) => assignedVehicleId(entry) === vehicleId,
  );
  const expectedIds = new Set(forVehicle.map((entry) => entry.id));

  if (expectedIds.size !== stopIds.length) {
    return {
      ok: false,
      error: "해당 차량 납품 목록과 순서가 일치하지 않습니다. 경로를 다시 계산하세요.",
    };
  }
  for (const id of stopIds) {
    if (!expectedIds.has(id)) {
      return {
        ok: false,
        error: "다른 차량 납품이 섞여 있거나 알 수 없는 일정입니다.",
      };
    }
  }

  await prisma.$transaction(
    stopIds.map((id, index) =>
      prisma.scheduleEntry.update({
        where: { id },
        data: { visitOrder: index },
      }),
    ),
  );

  return { ok: true };
}
