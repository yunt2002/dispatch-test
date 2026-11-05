import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { extractComparisonShipments, findComparisonSheet } from "@/lib/comparison-workbook";
import { resolveCustomerAddress } from "@/lib/delivery-customers";
import { geocodeAddresses, searchCompanyPlace } from "@/lib/geocoding";
import { matchProductLoading } from "@/lib/product-loading";
import { DEFAULT_DEPOT } from "@/lib/depot";
import { fetchKakaoDrivingRoute } from "@/lib/kakao-route-matrix";
import { fallbackCharterGroups, parseSimulationAiOrders, validateCharterGroups, validateSimulationOrders, type SimulationItem, type SimulationRoute, type SimulationResult } from "@/lib/simulation";
import { prisma } from "@/lib/prisma";
import { isPackingMode, packingPallets } from "@/lib/simulation-packing";
import { createHash } from "node:crypto";
import { chooseSimulationCandidate } from "@/lib/simulation-candidates";
import { regionalGroup, simulationRegion } from "@/lib/simulation-regions";
import { groqException, groqHttpError } from "@/lib/groq-errors";
import { formatGeminiAttempts, geminiHttpError, GeminiFallbackError, requestSimulationAi } from "@/lib/simulation-ai-provider";
import { confirmedSimulationAddress, correctedSimulationLocation, simulationAddressIssue } from "@/lib/simulation-address";
import { findCustomProduct } from "@/lib/custom-product";
import { loadCustomProducts } from "@/lib/custom-product-server";
import { simulationStageError, type SimulationStage } from "@/lib/simulation-errors";
import { simulationFleet, simulationVehicleName, simulationVehicleOver, type SimulationVehicle } from "@/lib/simulation-vehicles";

export const maxDuration = 60;
type Order = { vehicle: string; ids: string[] };

type ProposedPlan = { orders: Order[]; charterGroups: string[][] | null; note: string; model?: string };
async function propose(items: SimulationItem[], objective: string, vehicles: SimulationVehicle[]): Promise<ProposedPlan> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return { orders: [], charterGroups: null, note: "Groq 키가 없어 AI 제안을 만들지 못했습니다." };
  const issues: string[] = [];
  const models = [...new Set([process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b", "openai/gpt-oss-120b"])];
  for (const model of models) try {
    const aiResponse = await requestSimulationAi({ groqKey: key, groqModel: model, geminiKey: process.env.GEMINI_API_KEY?.trim(), geminiModel: process.env.GEMINI_MODEL, messages: [
      { role: "system", content: "너는 납품 배차 시뮬레이션 도우미다. 기존 자사 차량 품목은 빠짐없이 자사 차량에 포함하고 외부 용차/택배 품목도 가능한 한 합쳐라. 현장 확인이 필요한 후보를 제안한다. vehicles에 명시된 각 차량의 kg·PLT 한도를 초과하지 마라. 스타리아는 긴급·소량 운행을 우선 고려하고 실제 운행 여부를 확인한다. null은 미확인이지 0이 아니다. 자사 차량으로 보내지 않은 용차 품목은 모두 charterGroups에 넣는다. 각 배열은 한 번의 용차 운행이다. 같은 거래처·지역은 한 운행으로 묶고, 동일 일자·인접 권역이면 다른 거래처도 한 용차에 다중 경유로 묶을 수 있다. 멀거나 다른 권역은 분리한다. 택배는 자사 차량으로 옮기지 않으면 택배로 남긴다. id는 중복 없이 입력에 있는 문자열만 사용한다. 좌표 없는 품목을 자사 차량에 배정하지 마라. orders에는 vehicles에 있는 모든 차량을 각각 반드시 포함한다. 빈 차량이나 용차가 없어도 빈 배열을 사용한다. JSON만 출력한다: {\"orders\":[{\"vehicle\":\"차량명\",\"ids\":[\"행번호\"]}],\"charterGroups\":[[\"행번호\"]]}" },
      { role: "user", content: JSON.stringify({ objective, depot: DEFAULT_DEPOT, vehicles: vehicles.map(({ name, maxPallet, maxWeight }) => ({ name, maxPallet, maxWeight })), items: items.map((i) => ({ id: String(i.rowNumber), customer: i.customer, location: i.location, region: i.region, regionalGroup: i.regionalGroup, transport: i.transport, vehicle: i.vehicle, lat: i.lat, lng: i.lng, pallets: i.pallets, weight: i.weight, packing: i.packing })) }) },
    ] });
    const { response, provider } = aiResponse;
    const diagnostics = formatGeminiAttempts(aiResponse.geminiAttempts ?? []);
    if (!response.ok) { issues.push(provider === "Groq" ? groqHttpError(response.status) + (response.status === 429 && !process.env.GEMINI_API_KEY?.trim() ? " Gemini 키가 없어 전환하지 못했습니다." : "") : `${geminiHttpError(response.status)} ${diagnostics}`); if (aiResponse.switched) break; continue; }
    const content = aiResponse.content ?? "";
    let parsed: { orders?: unknown; charterGroups?: unknown } | null;
    try { parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); }
    catch { issues.push(`${provider} 응답 형식을 읽지 못했습니다. ${diagnostics}`); if (aiResponse.switched) break; continue; }
    const orders = parseSimulationAiOrders(parsed?.orders);
    if (!orders) { issues.push(`${provider} 차량 배정 응답 형식이 올바르지 않습니다. ${diagnostics}`); if (aiResponse.switched) break; continue; }
    const problem = validateSimulationOrders(items, orders, vehicles.map((vehicle) => vehicle.name));
    if (problem) { issues.push(`${provider} 후보 검증 실패: ${problem} ${diagnostics}`); if (aiResponse.switched) break; continue; }
    const groups = Array.isArray(parsed?.charterGroups) ? parsed.charterGroups.map((group: unknown) => Array.isArray(group) ? group.map(String) : group) : null;
    const charterProblem = groups ? validateCharterGroups(items, orders, groups as string[][]) : "AI가 용차 운행 묶음을 제안하지 않았습니다.";
    if (charterProblem) {
      const fallback = fallbackCharterGroups(items, orders);
      if (!validateCharterGroups(items, orders, fallback)) return { orders, charterGroups: fallback, model: `${provider} · ${aiResponse.model}`, note: `${aiResponse.switched ? "Groq 한도 초과 → Gemini 전환 · " : ""}${provider} 차량 배정 · AI 용차 묶음 검증 실패(${charterProblem})로 같은 거래처·지역 기준 묶음을 사용했습니다. 실제 운행 확인 필요. ${diagnostics}` };
    }
    if (charterProblem) { issues.push(`후보 검증 실패: ${charterProblem} ${diagnostics}`); continue; }
    return { orders, charterGroups: groups as string[][], model: `${provider} · ${aiResponse.model}`, note: `${aiResponse.switched ? "Groq 한도 초과 → Gemini 전환 · " : ""}${provider} 제안 · 용차 묶음과 적재량·납품 기한 확인이 필요합니다. ${diagnostics}` };
  } catch (error) { if (error instanceof GeminiFallbackError) { issues.push(error.message); break; } issues.push(groqException(error)); }
  return { orders: [], charterGroups: null, note: [...new Set(issues)].join(" / ") || "Groq 응답을 확인할 수 없습니다." };
}

async function calculate(order: Order, items: SimulationItem[], price: number | null, vehicles: SimulationVehicle[]): Promise<SimulationRoute> {
  const vehicle = vehicles.find((entry) => entry.name === order.vehicle);
  if (!vehicle) throw new Error("차량 설정이 없습니다.");
  const selected = order.ids.map((id) => items.find((item) => String(item.rowNumber) === id)!);
  const pallets = selected.reduce((sum, item) => sum + (item.pallets ?? 0), 0);
  const weight = selected.reduce((sum, item) => sum + (item.weight ?? 0), 0);
  const stops = selected.filter((item, index) => !selected.slice(0, index).some((prior) => prior.customer === item.customer && prior.lat === item.lat && prior.lng === item.lng));
  const points = [DEFAULT_DEPOT, ...stops.map((s) => ({ lat: s.lat!, lng: s.lng! })), DEFAULT_DEPOT];
  const road = stops.length ? await fetchKakaoDrivingRoute(points, "RECOMMEND", vehicle.carType) : null;
  const labels = ["회사", ...stops.map((stop) => stop.customer || stop.location || "납품지"), "회사"];
  const legs = road ? labels.slice(1).map((to, index) => ({ from: labels[index], to, distanceKm: road.legDistancesKm?.[index] ?? null, minutes: road.legDurationsSec?.[index] == null ? null : Math.round(road.legDurationsSec[index] / 60) })) : undefined;
  return { vehicle: order.vehicle, items: selected, pallets, weight, unknownPallets: selected.filter((i) => i.pallets == null).length, unknownWeight: selected.filter((i) => i.weight == null).length,
    distance: road?.distanceKm ?? null, minutes: road?.durationMin ?? null, toll: road?.tollWon ?? null,
    fuel: road && price != null ? Math.round(road.distanceKm / vehicle.fuelEconomy * price) : null,
    over: simulationVehicleOver(vehicle, pallets, weight), maxPallet: vehicle.maxPallet, maxWeight: vehicle.maxWeight, fuelEconomy: vehicle.fuelEconomy, legs };
}

export async function POST(request: Request) {
  let stage: SimulationStage = "request";
  try {
    const form = await request.formData();
    const file = form.get("file"); const date = String(form.get("date") ?? "");
    let packingOverrides: Record<string, unknown> = {};
    try { const parsed = JSON.parse(String(form.get("packing") || "{}")); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) packingOverrides = parsed; } catch { return NextResponse.json({ error: "박스 적재 방식이 올바르지 않습니다." }, { status: 400 }); }
    const priceText = String(form.get("price") ?? "").trim(); const price = priceText ? Number(priceText) : null;
    if (!(file instanceof File) || file.size > 15_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (price !== null && (!Number.isFinite(price) || price <= 0))) return NextResponse.json({ error: "엑셀 파일, 날짜와 경유 가격을 확인하세요." }, { status: 400 });
    const mode = String(form.get("mode") || "load");
    if (!["load", "regenerate", "refresh", "preview"].includes(mode)) return NextResponse.json({ error: "시뮬레이션 요청을 확인하세요." }, { status: 400 });
    stage = "workbook";
    const bytes = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = findComparisonSheet(workbook, date);
    if (!sheet) return NextResponse.json({ error: `선택한 날짜의 ${date.slice(0, 7)} 월별 시트를 찾을 수 없습니다.` }, { status: 400 });
    const allRows = extractComparisonShipments(sheet, date).map((row) => ({ ...row, originalLocation: row.location, location: correctedSimulationLocation(row.customer, row.location) }));
    if (!allRows.length) return NextResponse.json({ error: "선택한 날짜에 납품 내역이 없습니다." }, { status: 400 });
    if (mode === "preview") return NextResponse.json({ items: allRows.map(({ rowNumber, customer, product, location, transport }) => ({ rowNumber, customer, product, location, transport })) });
    let excludedRows: number[];
    try {
      const parsed: unknown = JSON.parse(String(form.get("excludedRows") || "[]"));
      if (!Array.isArray(parsed) || parsed.some((value) => !Number.isSafeInteger(value) || !allRows.some((row) => row.rowNumber === value))) throw new Error();
      excludedRows = [...new Set(parsed as number[])].sort((a, b) => a - b);
    } catch { return NextResponse.json({ error: "제외할 품목을 다시 확인하세요." }, { status: 400 }); }
    const rows = allRows.filter((row) => !excludedRows.includes(row.rowNumber));
    if (!rows.length) return NextResponse.json({ error: "모든 품목을 제외할 수 없습니다. 분석할 품목을 선택하세요." }, { status: 400 });
    stage = "data";
    const [customers, customProducts, staria] = await Promise.all([prisma.customer.findMany({ where: { isActive: true }, select: { customerName: true, address: true } }), loadCustomProducts(), prisma.vehicleType.findFirst({ where: { vehicleName: "스타리아", isActive: true }, select: { maxPallet: true, maxWeight: true } })]);
    const vehicles = simulationFleet(staria);
    const stariaUsable = vehicles.some((vehicle) => vehicle.name === "스타리아");
    if (!stariaUsable && rows.some((row) => /스타리아/.test(row.transport))) return NextResponse.json({ error: "스타리아 납품이 있습니다. 설정 → 차량에서 사용 중인 스타리아의 적재 한도를 확인하세요." }, { status: 422 });
    const vehicleNames = vehicles.map((vehicle) => vehicle.name);
    const addressFor = (row: typeof rows[number]) => row.workbookAddress || confirmedSimulationAddress(row.customer, row.location) || customers.find((c) => c.customerName.trim() === row.customer.trim())?.address?.trim() || resolveCustomerAddress(row.customer) || null;
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const signature = createHash("sha256").update(JSON.stringify({ version: 14, fileHash, date, price, vehicles, packing: rows.map((row) => { const value = packingOverrides[String(row.rowNumber)]; return isPackingMode(value) ? value : "auto"; }), addresses: rows.map((row) => addressFor(row)), customProducts: rows.map((row) => findCustomProduct(customProducts, row.product) ?? null), ...(excludedRows.length ? { excludedRows } : {}) })).digest("hex");
    const key = `simulation_snapshot:v1:${signature}`;
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    let stored: SimulationResult | null = null;
    if (setting) try {
      const value = JSON.parse(setting.value) as SimulationResult;
      if (Array.isArray(value.items) && Array.isArray(value.original) && Array.isArray(value.proposed) && Array.isArray(value.charterGroups) && typeof value.savedAt === "string") stored = value;
    } catch { /* 오래된 결과는 다시 생성한다. */ }
    if (mode === "load" && stored) return NextResponse.json({ ...stored, inputFingerprint: signature.slice(0, 12), restored: true });
    if ((mode === "refresh") && !stored) return NextResponse.json({ error: "현재 조건으로 저장된 배차안이 없습니다. 먼저 배차안을 만드세요." }, { status: 409 });
    stage = "location";
    const lookupRows = [...new Map(rows.filter((row) => !row.workbookAddress && !confirmedSimulationAddress(row.customer, row.location) && !!simulationAddressIssue(row.location, addressFor(row))).map((row) => [JSON.stringify([row.customer, row.location]), row])).entries()];
    const places = new Map(await Promise.all(lookupRows.map(async ([key, row]) => [key, await searchCompanyPlace(row.customer, row.location)] as const)));
    const resolvedAddress = (row: typeof rows[number]) => row.workbookAddress || places.get(JSON.stringify([row.customer, row.location]))?.address || addressFor(row);
    const addresses = [...new Set(rows.map((row) => { const address = resolvedAddress(row); return simulationAddressIssue(row.location, address) ? null : address; }).filter((a): a is string => !!a))]; const points = await geocodeAddresses(addresses);
    const items: SimulationItem[] = rows.map((row) => {
      const place = row.workbookAddress ? null : places.get(JSON.stringify([row.customer, row.location]));
      const address = resolvedAddress(row); const addressIssue = simulationAddressIssue(row.location, address); const point = !addressIssue && place ? place : address && !addressIssue ? points.get(address.trim().replace(/\s+/g, " ")) : null;
      const custom = findCustomProduct(customProducts, row.product); const family = custom ? null : matchProductLoading(row.productCode, row.product); const boxes = row.boxes != null && row.boxes > 0 ? Math.ceil(row.boxes) : null;
      const override = packingOverrides[String(row.rowNumber)]; const packing = isPackingMode(override) ? override : "auto";
      return { ...row, vehicle: simulationVehicleName(row.transport),
        address, addressSource: row.workbookAddress ? "엑셀 도착지" : confirmedSimulationAddress(row.customer, row.location) ? "확인된 업체·지역 주소" : place ? "카카오 업체명 검색 후보 · 실제 납품지 확인 필요" : address ? "등록 주소" : "미확인", addressIssue, lat: point?.lat ?? null, lng: point?.lng ?? null,
        region: simulationRegion(row.location, address), regionalGroup: regionalGroup(row.location, address), packing, pallets: packingPallets(boxes, custom ? custom.boxesPerPallet : family?.boxesPerPallet, packing),
        weight: boxes != null ? (custom ? (custom.boxWeightKg == null ? null : Math.round(boxes * custom.boxWeightKg * 1000) / 1000) : family?.boxWeightG ? Math.round(boxes * family.boxWeightG / 1000) : null) : null };
    });
    const excluded = items.filter((item) => item.vehicle && item.lat == null);
    const eligible = items.filter((item) => !item.vehicle || item.lat != null);
    const originals: Order[] = vehicleNames.map((vehicle) => ({ vehicle, ids: eligible.filter((item) => item.vehicle === vehicle).map((item) => String(item.rowNumber)) }));
    let ai: ProposedPlan;
    let original: SimulationRoute[];
    let proposed: SimulationRoute[];
    let candidateCount = stored?.candidateCount ?? 0;
    let candidateCountVerified = stored?.candidateCountVerified ?? false;
    let comparisonNote = stored?.comparisonNote ?? "";
    let savedAt = stored?.savedAt ?? new Date().toISOString();
    stage = "ai";
    if (mode === "refresh" && stored) {
      const orders = stored.proposed.map((route) => ({ vehicle: route.vehicle, ids: route.items.map((item) => String(item.rowNumber)) }));
      const groups = stored.charterGroups!.map((group) => group.items.map((item) => String(item.rowNumber)));
      const problem = validateSimulationOrders(eligible, orders, vehicleNames) || validateCharterGroups(eligible, orders, groups);
      if (problem) return NextResponse.json({ error: `저장된 배차안을 다시 확인해 주세요: ${problem}` }, { status: 409 });
      ai = { orders, charterGroups: groups, note: stored.note, model: stored.planSource };
      {
        stage = "route";
        [original, proposed] = await Promise.all([Promise.all(originals.map((order) => calculate(order, eligible, price, vehicles))), Promise.all(orders.map((order) => calculate(order, eligible, price, vehicles)))]);
        if ([...original, ...proposed].some((route) => route.items.length && route.distance == null)) return NextResponse.json({ error: "카카오 경로 조회에 실패해 저장된 결과를 유지했습니다. 다시 시도하세요." }, { status: 502 });
        if (!comparisonNote.includes("후보 선택 당시의 비교 기준")) comparisonNote = `${comparisonNote} 후보 선택 당시의 비교 기준이며 경로만 갱신했습니다.`;
      }
    } else {
      const attempts = await Promise.all(["용차 운행 줄이기", "차량 경로 이동 최소화", "기존 배정 유지하며 가까운 납품 합차"].map((objective) => propose(eligible, objective, vehicles)));
      const unique = new Map<string, ProposedPlan>();
      for (const plan of attempts) if (plan.charterGroups) unique.set(JSON.stringify({ orders: plan.orders, groups: plan.charterGroups }), plan);
      const plans = [...unique.values()];
      if (!plans.length) return NextResponse.json({ error: attempts.find((attempt) => attempt.note)?.note ?? "유효한 AI 배차안을 만들지 못했습니다. 저장된 결과는 유지됩니다." }, { status: 502 });
      stage = "route";
      const [originalRoutes, candidates] = await Promise.all([
        Promise.all(originals.map((order) => calculate(order, eligible, price, vehicles))),
        Promise.all(plans.map(async (plan) => ({ plan, routes: await Promise.all(plan.orders.map((order) => calculate(order, eligible, price, vehicles))) }))),
      ]);
      const rankings = candidates.map(({ plan, routes }) => ({ routes, charterCount: plan.charterGroups!.length,
        courierMovedIds: plan.orders.flatMap((order) => order.ids).filter((id) => { const item = eligible.find((row) => String(row.rowNumber) === id); return !!item && !item.vehicle && !/용차/.test(item.transport) && /택배|경동/.test(item.transport); }) }));
      const selection = chooseSimulationCandidate(rankings);
      if (selection.index == null) return NextResponse.json({ error: `${selection.note} 기존 저장 결과는 유지됩니다.` }, { status: 422 });
      ai = candidates[selection.index].plan; proposed = candidates[selection.index].routes; original = originalRoutes;
      const failures = [...new Set(attempts.filter((attempt) => !attempt.charterGroups).map((attempt) => attempt.note).filter(Boolean))];
      const sameOrders = originals.every((originalOrder) => {
        const selectedOrder = ai.orders.find((order) => order.vehicle === originalOrder.vehicle);
        return !!selectedOrder && JSON.stringify(selectedOrder.ids) === JSON.stringify(originalOrder.ids);
      });
      candidateCount = selection.validCount;
      candidateCountVerified = true;
      comparisonNote = `AI 요청 ${attempts.length}건 · 유효한 서로 다른 후보 ${selection.validCount}개${plans.length > selection.validCount ? ` · 적재 한도 등으로 제외 ${plans.length - selection.validCount}개` : ""}. ${sameOrders ? "선택된 안의 자사 차량별 품목과 순서는 기존 계획과 같습니다. 용차 묶음은 별도 확인하세요." : "선택된 안은 기존 자사 차량 배정 또는 방문 순서와 다릅니다."} ${selection.note}${failures.length ? ` 실패한 요청: ${failures.join(" / ")}` : ""}`;
      savedAt = new Date().toISOString();
    }
    const assigned = new Set(ai.orders.flatMap((order) => order.ids));
    const remaining = items.filter((item) => !item.vehicle && !assigned.has(String(item.rowNumber)));
    const warnings = [...new Set(excluded.map((item) => `${item.customer}: 주소 미확인으로 기존 자사 납품에서 제외`))];
    if (!stariaUsable) warnings.push("스타리아 차량 설정을 확인할 수 없어 이번 AI 배차 후보에서 제외했습니다.");
    for (const row of rows) if (row.originalLocation !== row.location) warnings.push(`${row.rowNumber}행 ${row.customer}: 엑셀 지역 ${row.originalLocation} → 확인된 납품지 ${row.location} 적용 (엑셀 원본은 변경되지 않음)`);
    for (const item of items) if (item.addressIssue) warnings.push(`${item.rowNumber}행 ${item.customer || "거래처 미확인"}: ${item.addressIssue}${item.address ? ` (${item.address})` : ""} · 경로 배정 제외`);
    for (const item of items) if (item.addressSource?.startsWith("카카오")) warnings.push(`${item.rowNumber}행 ${item.customer}: 엑셀 업체명·지역으로 찾은 장소를 사용했습니다. 실제 납품지 확인 필요 (${item.address})`);
    if (proposed.some((route) => route.over)) warnings.push("AI 제안이 알려진 차량 적재 한도를 초과합니다. 이 안을 실제 배차에 사용하지 마세요.");
    if ([...original, ...proposed].some((route) => route.items.length > 0 && route.distance == null)) warnings.push("카카오 길찾기에 실패한 차량이 있어 해당 운행 비용을 계산하지 못했습니다.");
    const charterGroups = ai.charterGroups?.map((group) => ({ items: group.map((id) => eligible.find((item) => String(item.rowNumber) === id)!) })) ?? null;
    const result: SimulationResult = { items, original, proposed, remaining, charterGroups, note: ai.note, warnings, savedAt, routeUpdatedAt: new Date().toISOString(), inputFingerprint: signature.slice(0, 12), candidateCount, candidateCountVerified, comparisonNote, planSource: ai.model ?? stored?.planSource };
    stage = "save";
    const value = JSON.stringify(result);
    if ((mode === "refresh") && setting) {
      const updated = await prisma.appSetting.updateMany({ where: { key, value: setting.value }, data: { value } });
      if (!updated.count) return NextResponse.json({ error: "다른 사용자가 배차안을 변경했습니다. 저장된 배차안을 다시 불러오세요." }, { status: 409 });
    } else if (mode === "load" && !setting) {
      try { await prisma.appSetting.create({ data: { key, value } }); }
      catch {
        const existing = await prisma.appSetting.findUnique({ where: { key } });
        if (existing) return NextResponse.json({ ...JSON.parse(existing.value), restored: true });
        throw new Error("저장 실패");
      }
    } else await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: simulationStageError(stage) }, { status: 500 }); }
}
