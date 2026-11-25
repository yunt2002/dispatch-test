import type { SimulationItem, SimulationResult } from "@/lib/simulation";

export type SimulationBoardAssignment = {
  rowNumber: number;
  customer: string;
  product: string;
  location: string;
  quantity: number | null;
  boxes: number | null;
  vehicleName: string;
  charterGroupIndex: number | null;
  visitOrder: number | null;
};

export type ScheduleMatchRow = {
  id: string;
  deliveryDate: string;
  customerName: string | null;
  productCode: string | null;
  productName: string | null;
  locationName: string;
  quantity: number | null;
  boxCount: number | null;
  status: string;
  palletCount: number | null;
  recommendationReason?: string | null;
};

function norm(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function qtyKey(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 1000) / 1000);
}

/** 엑셀 행 ↔ 일정 매칭 키 (행번호가 일정에 없을 때). */
export function simulationMatchKey(input: {
  customer: string | null | undefined;
  product: string | null | undefined;
  location: string | null | undefined;
  quantity: number | null | undefined;
  boxes: number | null | undefined;
}) {
  return [
    norm(input.customer),
    norm(input.product),
    norm(input.location),
    qtyKey(input.quantity),
    qtyKey(input.boxes),
  ].join("|");
}

export function scheduleEntryMatchKey(entry: ScheduleMatchRow) {
  return simulationMatchKey({
    customer: entry.customerName,
    product: entry.productName || entry.productCode,
    location: entry.locationName,
    quantity: entry.quantity,
    boxes: entry.boxCount,
  });
}

function itemMeta(item: SimulationItem): Omit<SimulationBoardAssignment, "vehicleName" | "charterGroupIndex" | "visitOrder"> {
  return {
    rowNumber: item.rowNumber,
    customer: item.customer,
    product: item.product,
    location: item.location,
    quantity: item.quantity,
    boxes: item.boxes,
  };
}

/** AI 시뮬 결과에서 일정에 쓸 차량·용차·택배 배정을 뽑는다. */
export function assignmentsFromSimulation(result: SimulationResult): SimulationBoardAssignment[] {
  const map = new Map<number, SimulationBoardAssignment>();

  for (const route of result.proposed) {
    route.items.forEach((item, index) => {
      map.set(item.rowNumber, {
        ...itemMeta(item),
        vehicleName: route.vehicle,
        charterGroupIndex: null,
        visitOrder: index,
      });
    });
  }

  result.charterGroups?.forEach((group, groupIndex) => {
    group.items.forEach((item, index) => {
      if (map.has(item.rowNumber)) return;
      map.set(item.rowNumber, {
        ...itemMeta(item),
        vehicleName: "용차",
        charterGroupIndex: groupIndex,
        visitOrder: index,
      });
    });
  });

  for (const item of result.remaining) {
    if (map.has(item.rowNumber)) continue;
    const transport = item.transport || "";
    const vehicleName = /택배|경동/.test(transport)
      ? "택배"
      : /용차/.test(transport)
        ? "용차"
        : transport.trim() || "용차";
    map.set(item.rowNumber, {
      ...itemMeta(item),
      vehicleName,
      charterGroupIndex: null,
      visitOrder: null,
    });
  }

  return [...map.values()].sort((a, b) => a.rowNumber - b.rowNumber);
}

export type MatchSimulationResult = {
  matched: Array<{ entry: ScheduleMatchRow; assignment: SimulationBoardAssignment }>;
  unmatchedAssignments: SimulationBoardAssignment[];
  unmatchedEntries: ScheduleMatchRow[];
  skippedStatus: ScheduleMatchRow[];
};

/** 같은 날 일정과 AI 배정을 1:1로 맞춘다. 중복 키는 남은 일정 순으로 소모. */
export function matchSimulationToSchedule(
  entries: ScheduleMatchRow[],
  assignments: SimulationBoardAssignment[],
): MatchSimulationResult {
  const skippedStatus = entries.filter((entry) => entry.status === "DONE" || entry.status === "CANCELLED");
  const usable = entries.filter((entry) => entry.status !== "DONE" && entry.status !== "CANCELLED");
  const buckets = new Map<string, ScheduleMatchRow[]>();
  for (const entry of usable) {
    const key = scheduleEntryMatchKey(entry);
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }

  const matched: MatchSimulationResult["matched"] = [];
  const unmatchedAssignments: SimulationBoardAssignment[] = [];

  for (const assignment of assignments) {
    const key = simulationMatchKey(assignment);
    const bucket = buckets.get(key);
    const entry = bucket?.shift();
    if (!entry) {
      unmatchedAssignments.push(assignment);
      continue;
    }
    matched.push({ entry, assignment });
  }

  return {
    matched,
    unmatchedAssignments,
    unmatchedEntries: [...buckets.values()].flat(),
    skippedStatus,
  };
}
