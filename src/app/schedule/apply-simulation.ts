"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import type { VehicleType } from "@prisma/client";
import {
  assignmentsFromSimulation,
  matchSimulationToSchedule,
} from "@/lib/apply-simulation-plan";
import {
  loadingRateForPallets,
  vehicleCountForPallets,
  type VehicleRecommendation,
} from "@/lib/dispatch-group";
import { externalTransport } from "@/lib/external-transport";
import { prisma } from "@/lib/prisma";
import { rebalanceDayFleet } from "@/lib/rebalance-day-fleet";
import { capacityUnits } from "@/lib/schedule-box-loading";
import type { SimulationResult } from "@/lib/simulation";

function recommendationForName(
  vehicleName: string,
  vehicles: VehicleType[],
  palletCount: number | null,
): VehicleRecommendation | null {
  if (vehicleName === "용차") return externalTransport("external:charter");
  if (vehicleName === "택배") return externalTransport("external:courier");
  const vehicle =
    vehicles.find((row) => row.vehicleName === vehicleName) ||
    vehicles.find((row) => row.vehicleName.replace(/\s+/g, "") === vehicleName.replace(/\s+/g, ""));
  if (!vehicle) return null;
  const vehicleCount = vehicleCountForPallets(palletCount, vehicle.maxPallet);
  return {
    vehicleTypeId: vehicle.id,
    vehicleName: vehicle.vehicleName,
    vehicleCount,
    maxPallet: vehicle.maxPallet,
    maxWeight: vehicle.maxWeight,
    loadingRate: loadingRateForPallets(palletCount, vehicle.maxPallet, vehicleCount),
    primaryRegionType: vehicle.primaryRegionType,
    boxPreferred: vehicle.boxPreferred,
  };
}

export type ApplySimulationInput = {
  date: string;
  result: SimulationResult;
  /** 적재 한도 초과안도 등록할지 (UI에서 확인 후) */
  allowOverLimit?: boolean;
};

export type ApplySimulationOutcome =
  | {
      ok: string;
      applied: number;
      unmatchedAssignments: number;
      unmatchedEntries: number;
      skippedStatus: number;
    }
  | { error: string };

/** AI 시뮬 배차안을 해당 날짜 배차 신청(ScheduleEntry)에 반영한다. */
export async function applySimulationToSchedule(
  input: ApplySimulationInput,
): Promise<ApplySimulationOutcome> {
  const date = input.date?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "납품일을 확인하세요." };
  }
  if (!input.result?.proposed || !Array.isArray(input.result.proposed)) {
    return { error: "AI 배차안 결과가 없습니다. 먼저 배차안을 만드세요." };
  }
  if (input.result.proposed.some((route) => route.over) && !input.allowOverLimit) {
    return {
      error:
        "AI안이 알려진 적재 한도를 초과합니다. 확인 후 다시 등록하거나, 적재·묶음을 조정하세요.",
    };
  }

  const [entries, vehicles] = await Promise.all([
    prisma.scheduleEntry.findMany({ where: { deliveryDate: date } }),
    prisma.vehicleType.findMany({ where: { isActive: true } }),
  ]);
  if (!entries.length) {
    return {
      error:
        "이 날짜 일정이 없습니다. 먼저 「처음 가져오기」에서 납품예상 일정표 엑셀을 등록하세요.",
    };
  }

  const assignments = assignmentsFromSimulation(input.result);
  if (!assignments.length) {
    return { error: "일정에 반영할 AI 배정이 없습니다." };
  }

  const matched = matchSimulationToSchedule(entries, assignments);
  if (!matched.matched.length) {
    return {
      error:
        "엑셀 AI 행과 일정 품목을 맞추지 못했습니다. 같은 일정표로 「처음 가져오기」했는지 확인하세요.",
    };
  }

  const charterGroupIds = new Map<number, string>();
  for (const { assignment } of matched.matched) {
    if (assignment.charterGroupIndex == null) continue;
    if (!charterGroupIds.has(assignment.charterGroupIndex)) {
      charterGroupIds.set(assignment.charterGroupIndex, randomUUID());
    }
  }

  // 합차 그룹별 총 PLT로 대수·적재율 재산정
  const groupPallets = new Map<string, number>();
  for (const { entry, assignment } of matched.matched) {
    const selected = recommendationForName(assignment.vehicleName, vehicles, entry.palletCount);
    if (!selected) continue;
    const groupId =
      assignment.charterGroupIndex != null
        ? charterGroupIds.get(assignment.charterGroupIndex)!
        : selected.vehicleTypeId.startsWith("external:")
          ? `solo:${entry.id}`
          : `fleet:${selected.vehicleTypeId}`;
    groupPallets.set(
      groupId,
      (groupPallets.get(groupId) ?? 0) + capacityUnits(entry.palletCount, entry.boxCount),
    );
  }

  let applied = 0;
  const unknownVehicles = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const { entry, assignment } of matched.matched) {
      const base = recommendationForName(assignment.vehicleName, vehicles, entry.palletCount);
      if (!base) {
        unknownVehicles.add(assignment.vehicleName);
        continue;
      }
      const consolidateGroupId =
        assignment.charterGroupIndex != null
          ? charterGroupIds.get(assignment.charterGroupIndex)!
          : null;
      const groupKey =
        consolidateGroupId ??
        (base.vehicleTypeId.startsWith("external:")
          ? `solo:${entry.id}`
          : `fleet:${base.vehicleTypeId}`);
      const totalPallets = groupPallets.get(groupKey) ?? capacityUnits(entry.palletCount, entry.boxCount);
      const selected: VehicleRecommendation = base.vehicleTypeId.startsWith("external:")
        ? base
        : {
            ...base,
            vehicleCount: vehicleCountForPallets(totalPallets, base.maxPallet),
            loadingRate: loadingRateForPallets(
              totalPallets,
              base.maxPallet,
              vehicleCountForPallets(totalPallets, base.maxPallet),
            ),
          };

      await tx.scheduleEntry.update({
        where: { id: entry.id },
        data: {
          selectedVehicleJson: JSON.stringify(selected),
          logistics: selected.vehicleName,
          consolidateGroupId,
          visitOrder: assignment.visitOrder,
          recommendationReason: [
            entry.recommendationReason,
            `AI 시뮬 배정 (${input.result.planSource || "AI"})`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
      applied += 1;
    }

    await tx.appLog.create({
      data: {
        userAction: "schedule_apply_simulation",
        routeCode: date,
        recommendation: input.result.planSource ?? null,
        selectedResult: `적용 ${applied}건 · 미매칭 AI ${matched.unmatchedAssignments.length} · 미매칭 일정 ${matched.unmatchedEntries.length}`,
      },
    });
  });

  if (!applied) {
    return {
      error: unknownVehicles.size
        ? `차량 이름을 일정 차량과 맞추지 못했습니다: ${[...unknownVehicles].join(", ")}`
        : "반영된 일정이 없습니다.",
    };
  }

  await rebalanceDayFleet(date);
  revalidatePath("/");
  revalidatePath("/confirm");

  const extras = [
    matched.unmatchedAssignments.length
      ? `AI ${matched.unmatchedAssignments.length}건 미매칭`
      : null,
    matched.unmatchedEntries.length
      ? `일정 ${matched.unmatchedEntries.length}건 미반영`
      : null,
    matched.skippedStatus.length
      ? `완료·취소 ${matched.skippedStatus.length}건 제외`
      : null,
  ].filter(Boolean);

  return {
    ok: `${date} AI 배차안 ${applied}건을 배차 신청에 등록했습니다.${extras.length ? ` (${extras.join(" · ")})` : ""}`,
    applied,
    unmatchedAssignments: matched.unmatchedAssignments.length,
    unmatchedEntries: matched.unmatchedEntries.length,
    skippedStatus: matched.skippedStatus.length,
  };
}
