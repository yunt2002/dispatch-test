import type { SimulationResult, SimulationRoute } from "./simulation";
import { charterGroupsSignature, hasComparableRoutes, estimatedTripsCost, type CharterTrip } from "./simulation-cost";
import { courierTotal, type CourierChoice } from "./simulation-courier";
import { simulationTimeTotals } from "./simulation-time";

export type HistoryReview = "확인 필요" | "검토 완료" | "실행 곤란";
export const fieldReviewStatuses = ["미검토", "운행 가능", "조건부 가능", "운행 어려움"] as const;
export type FieldReview = { status: typeof fieldReviewStatuses[number]; reason: string };
export const defaultFieldReview: FieldReview = { status: "미검토", reason: "" };
export function validFieldReview(value: unknown): value is FieldReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const review = value as FieldReview;
  return fieldReviewStatuses.some((status) => status === review.status) && typeof review.reason === "string" && review.reason.length <= 2000;
}
export const workChangeLevels = ["미확인", "수정 없음", "일부 수정", "대부분 수정", "전면 재작성"] as const;
export const workChangeTypes = ["차량 배정", "방문 순서", "용차 묶음", "용차 운임", "택배 처리", "기타"] as const;
export type WorkReview = { humanMinutes: number | null; aiGenerationMinutes: number | null; aiReviewMinutes: number | null; changeLevel: typeof workChangeLevels[number]; changes: (typeof workChangeTypes)[number][]; note: string };
export const defaultWorkReview: WorkReview = { humanMinutes: null, aiGenerationMinutes: null, aiReviewMinutes: null, changeLevel: "미확인", changes: [], note: "" };
export function validWorkReview(value: unknown): value is WorkReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const review = value as WorkReview;
  const validMinutes = (n: unknown) => n === null || (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 10080);
  return validMinutes(review.humanMinutes) && validMinutes(review.aiGenerationMinutes) && validMinutes(review.aiReviewMinutes) && workChangeLevels.some((level) => level === review.changeLevel) && Array.isArray(review.changes) && review.changes.every((change) => workChangeTypes.some((type) => type === change)) && new Set(review.changes).size === review.changes.length && !(review.changeLevel === "수정 없음" && review.changes.length > 0) && typeof review.note === "string" && review.note.length <= 2000;
}
export type SimulationHistorySnapshot = {
  version: 1;
  date: string;
  fileName: string;
  dieselPrice: string;
  excludedItems: { rowNumber: number; customer: string; product: string }[];
  result: SimulationResult;
  originalTrips: CharterTrip[];
  proposedTrips: CharterTrip[];
  originalExtras: CharterTrip[];
  proposedExtras: CharterTrip[];
  courierChoices: Record<string, CourierChoice>;
  packing: Record<string, string>;
  review: HistoryReview;
  memo: string;
  fieldReview?: FieldReview;
  workReview?: WorkReview;
};
export type HistoryMetrics = {
  originalCost: number | null; proposedCost: number | null;
  courierIncluded: boolean; originalMinutes: number | null; proposedMinutes: number | null;
  originalCharters: number; proposedCharters: number;
  comparable: boolean; aiAdjusted: boolean; warnings: string[];
};
export type SimulationHistoryRecord = { id: string; savedAt: string; snapshot: SimulationHistorySnapshot; metrics: HistoryMetrics };

export function comparisonDistribution(records: { review: HistoryReview; metrics: HistoryMetrics }[]) {
  const counts = { decrease: 0, equal: 0, increase: 0, excluded: 0 };
  for (const { review, metrics } of records) {
    const { originalCost, proposedCost } = metrics;
    if (review !== "검토 완료" || !metrics.comparable || metrics.aiAdjusted || originalCost == null || proposedCost == null || !Number.isFinite(originalCost) || !Number.isFinite(proposedCost)) { counts.excluded++; continue; }
    if (proposedCost < originalCost) counts.decrease++;
    else if (proposedCost > originalCost) counts.increase++;
    else counts.equal++;
  }
  return counts;
}

export function summarizeWorkReviews(records: { workReview?: WorkReview }[]) {
  let pairedCount = 0; let humanMinutes = 0; let aiMinutes = 0;
  const changes = Object.fromEntries(workChangeLevels.map((level) => [level, 0])) as Record<WorkReview["changeLevel"], number>;
  for (const record of records) {
    const review = record.workReview ?? defaultWorkReview;
    changes[review.changeLevel]++;
    if (review.humanMinutes != null && review.aiGenerationMinutes != null && review.aiReviewMinutes != null) {
      pairedCount++; humanMinutes += review.humanMinutes; aiMinutes += review.aiGenerationMinutes + review.aiReviewMinutes;
    }
  }
  return { pairedCount, humanMinutes, aiMinutes, changes };
}

/** 클라이언트에서 전달된 기록은 크기·형식 검사를 거친 뒤 서버에서 합계를 다시 계산한다. */
export function validHistorySnapshot(value: unknown): value is SimulationHistorySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as SimulationHistorySnapshot;
  if (v.fieldReview !== undefined && !validFieldReview(v.fieldReview)) return false;
  if (v.workReview !== undefined && !validWorkReview(v.workReview)) return false;
  if (v.version !== 1 || typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || typeof v.fileName !== "string" || !v.fileName || v.fileName.length > 255 || typeof v.dieselPrice !== "string" || v.dieselPrice.length > 30 || typeof v.memo !== "string" || v.memo.length > 2000 || !["확인 필요", "검토 완료", "실행 곤란"].includes(v.review)) return false;
  if (!Array.isArray(v.excludedItems) || v.excludedItems.length > 1000 || !v.excludedItems.every((item) => item && Number.isSafeInteger(item.rowNumber) && typeof item.customer === "string" && typeof item.product === "string")) return false;
  const result = v.result;
  if (!result || !Array.isArray(result.items) || result.items.length > 1000 || !Array.isArray(result.original) || !Array.isArray(result.proposed) || ![2, 3].includes(result.original.length) || result.original.length !== result.proposed.length || !Array.isArray(result.remaining) || !Array.isArray(result.warnings) || typeof result.note !== "string") return false;
  const validItem = (item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const i = item as SimulationResult["items"][number];
    return Number.isSafeInteger(i.rowNumber) && typeof i.customer === "string" && typeof i.location === "string" && typeof i.product === "string" && typeof i.transport === "string" && (i.vehicle === null || i.vehicle === "1호차" || i.vehicle === "2호차" || i.vehicle === "스타리아") && (i.address == null || typeof i.address === "string") && (i.boxes == null || (Number.isFinite(i.boxes) && i.boxes >= 0)) && (i.pallets == null || (Number.isFinite(i.pallets) && i.pallets >= 0));
  };
  if (!result.items.every(validItem) || !result.remaining.every(validItem) || !result.warnings.every((w) => typeof w === "string")) return false;
  const validNumber = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0);
  const validRoute = (route: SimulationRoute) => route && typeof route.vehicle === "string" && Array.isArray(route.items) && route.items.length <= 1000 && route.items.every(validItem) && validNumber(route.minutes) && validNumber(route.fuel) && validNumber(route.toll) && typeof route.pallets === "number" && Number.isFinite(route.pallets) && typeof route.weight === "number" && Number.isFinite(route.weight) && Number.isSafeInteger(route.unknownPallets) && Number.isSafeInteger(route.unknownWeight) && typeof route.over === "boolean" && (route.legs == null || (Array.isArray(route.legs) && route.legs.length <= 1000 && route.legs.every((leg) => leg && typeof leg.from === "string" && typeof leg.to === "string" && validNumber(leg.distanceKm) && validNumber(leg.minutes))));
  if (![...result.original, ...result.proposed].every(validRoute)) return false;
  const fleet = (routes: SimulationRoute[]) => routes.map((route) => route.vehicle).sort().join("|");
  const expectedFleet = result.original.length === 3 ? "1호차|2호차|스타리아" : "1호차|2호차";
  if (fleet(result.original) !== expectedFleet || fleet(result.proposed) !== expectedFleet) return false;
  if (result.charterGroups !== null && (!Array.isArray(result.charterGroups) || result.charterGroups.length > 1000 || !result.charterGroups.every((group) => group && Array.isArray(group.items) && group.items.every(validItem)))) return false;
  const validRows = new Set(result.items.map((item) => item.rowNumber));
  const validTrips = (trips: unknown) => Array.isArray(trips) && trips.length <= 2000 && trips.every((t) => t && typeof t.id === "string" && t.id.length <= 500 && typeof t.fare === "string" && /^\d*$/.test(t.fare) && (t.leg === "one_way" || t.leg === "round_trip") && Array.isArray(t.rowNumbers) && t.rowNumbers.length > 0 && t.rowNumbers.every((n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && validRows.has(n)));
  if (![v.originalTrips, v.proposedTrips, v.originalExtras, v.proposedExtras].every(validTrips)) return false;
  if (!v.courierChoices || typeof v.courierChoices !== "object" || Array.isArray(v.courierChoices) || !Object.entries(v.courierChoices).every(([key, choice]) => /^\d+$/.test(key) && choice && (choice.mode === "box" || choice.mode === "pallet") && (choice.quantity === undefined || (Number.isSafeInteger(choice.quantity) && choice.quantity >= 0)))) return false;
  return !!v.packing && typeof v.packing === "object" && !Array.isArray(v.packing) && Object.values(v.packing).every((mode) => typeof mode === "string");
}

export function historyMetrics(snapshot: SimulationHistorySnapshot): HistoryMetrics {
  const { result } = snapshot;
  const courier = (items: SimulationResult["items"]) => items.filter((item) => !item.vehicle && !/용차/.test(item.transport) && /택배|경동/.test(item.transport));
  const beforeCourier = courierTotal(courier(result.items), snapshot.courierChoices);
  const afterCourier = courierTotal(courier(result.remaining), snapshot.courierChoices);
  const courierIncluded = beforeCourier != null && afterCourier != null;
  const vehicleCost = (routes: SimulationRoute[]) => routes.some((r) => r.items.length && (r.fuel == null || r.toll == null)) ? null : routes.reduce((sum, r) => sum + (r.fuel ?? 0) + (r.toll ?? 0), 0);
  const beforeVehicle = vehicleCost(result.original), afterVehicle = vehicleCost(result.proposed);
  const beforeCharter = estimatedTripsCost([...snapshot.originalTrips, ...snapshot.originalExtras]);
  const afterCharter = estimatedTripsCost([...snapshot.proposedTrips, ...snapshot.proposedExtras]);
  const complete = hasComparableRoutes(result);
  const aiAdjusted = snapshot.proposedExtras.length > 0 || snapshot.proposedTrips.some((trip) => trip.leg !== "one_way") || result.charterGroups == null || charterGroupsSignature(result.charterGroups) !== charterGroupsSignature(snapshot.proposedTrips.map((trip) => ({ items: trip.rowNumbers.map((rowNumber) => ({ rowNumber })) })));
  const warnings: string[] = [];
  if (result.items.some((item) => /스타리아/.test(item.transport) && item.vehicle !== "스타리아")) warnings.push("스타리아가 반영되지 않은 이전 분석 기록");
  if (!courierIncluded) warnings.push("택배비 미확인: 양쪽 비용에서 택배비 제외");
  if (!complete) warnings.push("차량 경로 또는 납품 누락 확인 필요");
  if (snapshot.originalTrips.some((trip) => trip.excluded)) warnings.push("기존 용차 비용 제외: 동일 조건 비교 아님");
  if (snapshot.originalExtras.length || snapshot.proposedExtras.length) warnings.push("수동 추가 용차 비용 포함: 배정 중복 확인 필요");
  if (result.original.some((r) => r.unknownPallets || r.unknownWeight || r.over) || result.proposed.some((r) => r.unknownPallets || r.unknownWeight || r.over)) warnings.push("차량 적재량 또는 중량 확인 필요");
  const originalCost = complete && beforeVehicle != null && beforeCharter != null ? beforeVehicle + beforeCharter + (courierIncluded ? beforeCourier : 0) : null;
  const proposedCost = complete && afterVehicle != null && afterCharter != null ? afterVehicle + afterCharter + (courierIncluded ? afterCourier : 0) : null;
  if (result.warnings.length) warnings.push("시뮬레이션 경고 확인 필요");
  if (/용차 묶음 검증 실패|규칙 기반 대체/.test(result.note)) warnings.push("AI 용차 묶음 대체안 확인 필요");
  if (!result.candidateCountVerified) warnings.push("AI 후보 검증 기록 확인 필요");
  return { originalCost, proposedCost, courierIncluded, originalMinutes: complete ? simulationTimeTotals(result.original)?.total ?? null : null, proposedMinutes: complete ? simulationTimeTotals(result.proposed)?.total ?? null : null, originalCharters: snapshot.originalTrips.filter((trip) => !trip.excluded).length + snapshot.originalExtras.length, proposedCharters: snapshot.proposedTrips.length + snapshot.proposedExtras.length, comparable: complete && originalCost != null && proposedCost != null && courierIncluded && warnings.length === 0, aiAdjusted, warnings };
}

/** 과거 저장된 금액은 다시 계산하지 않고 스타리아 누락만 경고해 합계에서 제외한다. */
export function markLegacyStariaRecord(record: SimulationHistoryRecord): SimulationHistoryRecord {
  if (!record.snapshot.result.items.some((item) => /스타리아/.test(item.transport) && item.vehicle !== "스타리아")) return record;
  const warning = "스타리아가 반영되지 않은 이전 분석 기록";
  return { ...record, metrics: { ...record.metrics, comparable: false, warnings: [...new Set([...(record.metrics.warnings ?? []), warning])] } };
}
