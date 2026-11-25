"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { Prisma, type VehicleType } from "@prisma/client";
import {
  assignmentsFromSimulation,
  matchSimulationToSchedule,
  type SimulationPlanForSchedule,
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
import { SIMULATION_ASSIGNMENT_REASON_PREFIX } from "@/lib/schedule-vehicle-source";

function resolveVehicleForName(
  vehicleName: string,
  vehicles: VehicleType[],
): VehicleRecommendation | null {
  if (vehicleName === "용차") return externalTransport("external:charter");
  if (vehicleName === "택배") return externalTransport("external:courier");
  const vehicle =
    vehicles.find((row) => row.vehicleName === vehicleName) ||
    vehicles.find((row) => row.vehicleName.replace(/\s+/g, "") === vehicleName.replace(/\s+/g, ""));
  if (!vehicle) return null;
  return {
    vehicleTypeId: vehicle.id,
    vehicleName: vehicle.vehicleName,
    vehicleCount: 1,
    maxPallet: vehicle.maxPallet,
    maxWeight: vehicle.maxWeight,
    loadingRate: null,
    primaryRegionType: vehicle.primaryRegionType,
    boxPreferred: vehicle.boxPreferred,
  };
}

export type ApplySimulationInput = {
  date: string;
  result: SimulationPlanForSchedule;
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
    prisma.scheduleEntry.findMany({
      where: { deliveryDate: date },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.vehicleType.findMany({ where: { isActive: true } }),
  ]);
  if (!entries.length) {
    return {
      error:
        "이 날짜 일정이 없습니다. 홈에서 납품예상 일정표를 먼저 등록하세요.",
    };
  }
  if (!entries.some((entry) => entry.status === "PLANNED")) {
    return { error: "이 날짜에 반영할 배차 신청 일정이 없습니다. 확정·완료·취소 일정은 유지됩니다." };
  }

  const assignments = assignmentsFromSimulation(input.result);
  if (!assignments.length) {
    return { error: "일정에 반영할 AI 배정이 없습니다." };
  }

  const matched = matchSimulationToSchedule(entries, assignments);
  if (!matched.matched.length) {
    return {
      error:
        "AI 배차안과 일치하는 배차 신청 품목이 없습니다. 홈에서 같은 일정표를 등록했는지 확인하세요.",
    };
  }

  const charterGroupIds = new Map<number, string>();
  const groupPallets = new Map<string, number>();
  const unknownVehicles = new Set<string>();
  const candidates = matched.matched.flatMap(({ entry, assignment }) => {
    const base = resolveVehicleForName(assignment.vehicleName, vehicles);
    if (!base) {
      unknownVehicles.add(assignment.vehicleName);
      return [];
    }
    const groupIndex = assignment.charterGroupIndex;
    const consolidateGroupId = groupIndex == null ? null : charterGroupIds.get(groupIndex) ?? randomUUID();
    if (groupIndex != null && consolidateGroupId) charterGroupIds.set(groupIndex, consolidateGroupId);

    const external = base.vehicleTypeId.startsWith("external:");
    const groupId = consolidateGroupId ?? (external ? `solo:${entry.id}` : `fleet:${base.vehicleTypeId}`);
    groupPallets.set(
      groupId,
      (groupPallets.get(groupId) ?? 0) + capacityUnits(entry.palletCount, entry.boxCount),
    );
    return [{ entry, assignment, base, consolidateGroupId, external, groupId }];
  });

  const applied = candidates.length;
  if (!applied) {
    return {
      error: unknownVehicles.size
        ? `차량 이름을 일정 차량과 맞추지 못했습니다: ${[...unknownVehicles].join(", ")}`
        : "반영된 일정이 없습니다.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const { entry, assignment, base, consolidateGroupId, external, groupId } of candidates) {
        const totalPallets = groupPallets.get(groupId)!;
        const vehicleCount = vehicleCountForPallets(totalPallets, base.maxPallet);
        const selected = external ? base : {
          ...base, vehicleCount, loadingRate: loadingRateForPallets(totalPallets, base.maxPallet, vehicleCount),
        };
        const previousReasons = entry.recommendationReason?.split("\n") ?? [];
        await tx.scheduleEntry.update({
          where: { id: entry.id, deliveryDate: date, status: "PLANNED", updatedAt: entry.updatedAt },
          data: {
            selectedVehicleJson: JSON.stringify(selected),
            logistics: selected.vehicleName,
            consolidateGroupId,
            visitOrder: assignment.visitOrder,
            recommendationReason: [
              `${SIMULATION_ASSIGNMENT_REASON_PREFIX}${input.result.planSource || "AI"})`,
              ...previousReasons.filter((line) => !line.startsWith(SIMULATION_ASSIGNMENT_REASON_PREFIX)),
            ].join("\n"),
          },
        });
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
      return { error: "반영하는 동안 일정이 변경되었습니다. 현재 배차 신청을 확인한 뒤 다시 시도해 주세요." };
    }
    throw error;
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
      ? `확정·완료·취소 ${matched.skippedStatus.length}건 유지`
      : null,
    unknownVehicles.size ? `미등록 차량: ${[...unknownVehicles].join(", ")}` : null,
  ].filter(Boolean);

  return {
    ok: `${date} AI 배차안 ${applied}건을 배차 신청에 등록했습니다.${extras.length ? ` (${extras.join(" · ")})` : ""}`,
    applied,
    unmatchedAssignments: matched.unmatchedAssignments.length,
    unmatchedEntries: matched.unmatchedEntries.length,
    skippedStatus: matched.skippedStatus.length,
  };
}
