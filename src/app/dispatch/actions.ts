"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { VehicleCombination } from "@/engine/types";
import { calculateDispatch, saveDispatchResults } from "@/lib/dispatch-service";
import { parseJson } from "@/lib/format";
import { optionalText, text } from "@/lib/form";
import { prisma } from "@/lib/prisma";

function dispatchRedirect(
  date: string,
  params: { error?: string; notice?: string; ok?: string },
): never {
  const q = new URLSearchParams();
  if (date) q.set("date", date);
  if (params.error) q.set("error", params.error);
  if (params.notice) q.set("notice", params.notice);
  if (params.ok) q.set("ok", params.ok);
  redirect(`/dispatch?${q.toString()}`);
}

export async function runDispatch(formData: FormData) {
  const date = text(formData, "date");
  if (!date) {
    dispatchRedirect("", { error: "배송일을 선택하세요." });
  }

  const shipments = await prisma.shipment.findMany({
    where: { deliveryDate: date },
    select: { id: true, routeId: true },
  });
  if (shipments.length === 0) {
    dispatchRedirect(date, {
      error: "해당 날짜의 출하 데이터가 없습니다. 먼저 출하를 등록하세요.",
    });
  }

  const unrouted = shipments.filter((item) => !item.routeId).length;
  const routed = shipments.length - unrouted;
  if (routed === 0) {
    dispatchRedirect(date, {
      error: `출하 ${shipments.length}건 모두 배송 루트가 없습니다. 출하 화면에서 루트를 지정하세요.`,
    });
  }

  const { results, unroutedIssues } = await calculateDispatch(date);
  const existing = await prisma.dispatchResult.findMany({ where: { dispatchDate: date } });
  const selections: Record<string, { combination: VehicleCombination; reason?: string }> = {};

  for (const row of existing) {
    if (!row.manualOverride || !row.selectedCombinationJson) continue;
    const combo = parseJson<VehicleCombination | null>(row.selectedCombinationJson, null);
    if (combo) {
      selections[row.routeId] = { combination: combo, reason: row.overrideReason ?? undefined };
    }
  }

  await saveDispatchResults(date, results, selections);

  const failed = results.filter((item) => !item.recommended).length;
  const issueRoutes = results.filter((item) => item.issues.length > 0).length;

  if (unroutedIssues.length > 0) {
    await prisma.appLog.create({
      data: {
        userAction: "dispatch_calculate",
        error: `루트 미지정 ${unroutedIssues.length}건`,
      },
    });
  }

  revalidatePath("/dispatch");
  revalidatePath("/");

  const notices: string[] = [];
  if (unrouted > 0) notices.push(`루트 미지정 출하 ${unrouted}건은 계산에서 제외됐습니다.`);
  if (issueRoutes > 0) notices.push(`데이터 검증 이슈가 있는 루트 ${issueRoutes}개`);
  if (failed > 0) notices.push(`추천 불가 루트 ${failed}개 — 아래에서 사유를 확인하세요.`);

  dispatchRedirect(date, {
    ok: `${results.length}개 루트 배차 계산 완료`,
    notice: notices.length ? notices.join(" · ") : undefined,
  });
}

export async function saveOverride(formData: FormData) {
  const date = text(formData, "date");
  const routeId = text(formData, "routeId");
  const combinationJson = text(formData, "combinationJson");
  const reason = optionalText(formData, "overrideReason");
  const recommended = parseJson<VehicleCombination | null>(
    text(formData, "recommendedJson") || "null",
    null,
  );
  const selected = parseJson<VehicleCombination | null>(combinationJson, null);
  if (!date || !routeId) {
    dispatchRedirect(date || "", { error: "배송일 또는 루트 정보가 없습니다. 다시 시도하세요." });
  }
  if (!selected) {
    dispatchRedirect(date, { error: "선택한 배차안을 확인하세요." });
  }

  const chosen = selected;
  const manualOverride = Boolean(
    recommended &&
      (recommended.vehicleTypeId !== chosen.vehicleTypeId ||
        recommended.vehicleCount !== chosen.vehicleCount),
  );

  if (manualOverride && !reason) {
    dispatchRedirect(date, {
      error: "추천과 다른 안을 저장하려면 변경 사유를 입력하세요.",
    });
  }

  await prisma.dispatchResult.update({
    where: { dispatchDate_routeId: { dispatchDate: date, routeId } },
    data: {
      selectedCombinationJson: JSON.stringify(chosen),
      selectedCost: chosen.estimatedCost,
      manualOverride,
      overrideReason: reason,
    },
  });

  await prisma.appLog.create({
    data: {
      userAction: "dispatch_override",
      routeCode: routeId,
      recommendation: recommended
        ? `${recommended.vehicleName} × ${recommended.vehicleCount}`
        : null,
      selectedResult: `${chosen.vehicleName} × ${chosen.vehicleCount}`,
      error: manualOverride ? reason : null,
    },
  });

  revalidatePath("/dispatch");
  revalidatePath("/");
  dispatchRedirect(date, {
    ok: manualOverride ? "수동 변경안을 저장했습니다." : "추천안을 최종 선택으로 저장했습니다.",
  });
}
