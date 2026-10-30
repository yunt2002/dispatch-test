import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { extractComparisonShipments, findComparisonSheet } from "@/lib/comparison-workbook";
import { resolveCustomerAddress } from "@/lib/delivery-customers";
import { geocodeAddresses } from "@/lib/geocoding";
import { matchProductLoading } from "@/lib/product-loading";
import { DEFAULT_DEPOT } from "@/lib/depot";
import { fetchKakaoDrivingRoute } from "@/lib/kakao-route-matrix";
import { validateCharterGroups, validateSimulationOrders, type SimulationItem, type SimulationRoute, type SimulationResult } from "@/lib/simulation";
import { prisma } from "@/lib/prisma";
import { isPackingMode, packingPallets } from "@/lib/simulation-packing";
import { createHash } from "node:crypto";
import { chooseSimulationCandidate } from "@/lib/simulation-candidates";

export const maxDuration = 60;
type Order = { vehicle: string; ids: string[] };

type ProposedPlan = { orders: Order[]; charterGroups: string[][] | null; note: string; model?: string };
async function propose(items: SimulationItem[], objective: string): Promise<ProposedPlan> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return { orders: [], charterGroups: null, note: "Groq 키가 없어 AI 제안을 만들지 못했습니다." };
  let issue = "Groq 응답을 확인할 수 없습니다.";
  const models = [...new Set([process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b", "openai/gpt-oss-120b"])];
  for (const model of models) try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, max_completion_tokens: 4096,
        messages: [{ role: "system", content: "너는 납품 배차 시뮬레이션 도우미다. 기존 자사 차량 품목은 빠짐없이 자사 차량에 포함하고 외부 용차/택배 품목도 가능한 한 합쳐라. 정보가 부족해도 안전한 확정이 아니라 현장 확인이 필요한 시뮬레이션 후보를 제안하는 것이므로, 좌표가 있는 용차/택배 물량의 합차를 적극 검토한다. 각 자사 차량 적재량 숫자의 합은 1호차 4000kg/8PLT, 2호차 3500kg/8PLT 초과 금지. null은 미확인이지 0이 아니다. 자사 차량으로 보내지 않은 용차 품목은 모두 charterGroups에 넣는다. charterGroups의 각 배열은 한 번의 용차 운행이다. 한 용차 묶음에는 반드시 같은 거래처와 같은 지역의 품목만 넣는다. 서로 다른 거래처는 절대 같은 용차에 넣지 마라. 택배는 자사 차량으로 옮기지 않으면 택배로 남긴다. 모든 id는 중복 없이 입력에 있는 문자열만 사용한다. 좌표 없는 품목을 자사 차량에 배정하지 마라. orders에는 1호차와 2호차를 각각 하나씩 반드시 포함한다. 빈 차량이나 용차가 없어도 빈 배열을 사용한다. JSON만 출력: {\"orders\":[{\"vehicle\":\"1호차\",\"ids\":[\"1\"]},{\"vehicle\":\"2호차\",\"ids\":[\"2\"]}],\"charterGroups\":[[\"3\",\"4\"],[\"5\"]]}" },
          { role: "user", content: JSON.stringify({ objective, depot: DEFAULT_DEPOT, items: items.map((i) => ({ id: String(i.rowNumber), customer: i.customer, location: i.location, transport: i.transport, vehicle: i.vehicle, lat: i.lat, lng: i.lng, pallets: i.pallets, weight: i.weight, packing: i.packing })) }) }] }),
      signal: AbortSignal.timeout(20000), cache: "no-store",
    });
    if (!response.ok) throw new Error();
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { orders?: Order[]; charterGroups?: unknown };
    const orders = Array.isArray(parsed.orders) ? parsed.orders.map((order) => ({ vehicle: order.vehicle, ids: Array.isArray(order.ids) ? order.ids.map(String) : [] })) : [];
    const problem = validateSimulationOrders(items, orders);
    if (problem) { issue = problem; continue; }
    const groups = Array.isArray(parsed.charterGroups) ? parsed.charterGroups.map((group: unknown) => Array.isArray(group) ? group.map(String) : group) : null;
    if (!groups) { issue = "AI가 용차 운행 묶음을 제안하지 않았습니다."; continue; }
    const charterProblem = validateCharterGroups(items, orders, groups as string[][]);
    if (charterProblem) { issue = charterProblem; continue; }
    return { orders, charterGroups: groups as string[][], model, note: "Groq 제안 · 용차 묶음과 적재량·납품 기한 확인이 필요합니다." };
  } catch { issue = "Groq 제안 조회에 실패했습니다. 키와 연결을 확인하세요."; }
  return { orders: [], charterGroups: null, note: `${issue} 다시 시도하세요.` };
}

async function calculate(order: Order, items: SimulationItem[], price: number | null): Promise<SimulationRoute> {
  const selected = order.ids.map((id) => items.find((item) => String(item.rowNumber) === id)!);
  const pallets = selected.reduce((sum, item) => sum + (item.pallets ?? 0), 0);
  const weight = selected.reduce((sum, item) => sum + (item.weight ?? 0), 0);
  const stops = selected.filter((item, index) => !selected.slice(0, index).some((prior) => prior.customer === item.customer && prior.lat === item.lat && prior.lng === item.lng));
  const points = [DEFAULT_DEPOT, ...stops.map((s) => ({ lat: s.lat!, lng: s.lng! })), DEFAULT_DEPOT];
  const road = stops.length ? await fetchKakaoDrivingRoute(points, "RECOMMEND", 2) : null;
  return { vehicle: order.vehicle, items: selected, pallets, weight, unknownPallets: selected.filter((i) => i.pallets == null).length, unknownWeight: selected.filter((i) => i.weight == null).length,
    distance: road?.distanceKm ?? null, minutes: road?.durationMin ?? null, toll: road?.tollWon ?? null,
    fuel: road && price != null ? Math.round(road.distanceKm / 7.1 * price) : null,
    over: pallets > 8 || weight > (order.vehicle === "1호차" ? 4000 : 3500) };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file"); const date = String(form.get("date") ?? "");
    let packingOverrides: Record<string, unknown> = {};
    try { const parsed = JSON.parse(String(form.get("packing") || "{}")); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) packingOverrides = parsed; } catch { return NextResponse.json({ error: "박스 적재 방식이 올바르지 않습니다." }, { status: 400 }); }
    const priceText = String(form.get("price") ?? "").trim(); const price = priceText ? Number(priceText) : null;
    if (!(file instanceof File) || file.size > 15_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (price !== null && (!Number.isFinite(price) || price <= 0))) return NextResponse.json({ error: "엑셀 파일, 날짜와 경유 가격을 확인하세요." }, { status: 400 });
    const mode = String(form.get("mode") || "load");
    if (!["load", "regenerate", "refresh"].includes(mode)) return NextResponse.json({ error: "시뮬레이션 요청을 확인하세요." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = findComparisonSheet(workbook, date);
    if (!sheet) return NextResponse.json({ error: `선택한 날짜의 ${date.slice(0, 7)} 월별 시트를 찾을 수 없습니다.` }, { status: 400 });
    const rows = extractComparisonShipments(sheet, date);
    if (!rows.length) return NextResponse.json({ error: "선택한 날짜에 납품 내역이 없습니다." }, { status: 400 });
    const customers = await prisma.customer.findMany({ where: { isActive: true }, select: { customerName: true, address: true } });
    const addressFor = (name: string) => resolveCustomerAddress(name) || customers.find((c) => c.customerName.trim() === name.trim())?.address?.trim() || null;
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const signature = createHash("sha256").update(JSON.stringify({ version: 1, fileHash, date, price, packing: rows.map((row) => { const value = packingOverrides[String(row.rowNumber)]; return isPackingMode(value) ? value : "unknown"; }), addresses: rows.map((row) => addressFor(row.customer)) })).digest("hex");
    const key = `simulation_snapshot:v1:${signature}`;
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    let stored: SimulationResult | null = null;
    if (setting) try {
      const value = JSON.parse(setting.value) as SimulationResult;
      if (Array.isArray(value.items) && Array.isArray(value.original) && Array.isArray(value.proposed) && Array.isArray(value.charterGroups) && typeof value.savedAt === "string") stored = value;
    } catch { /* 오래된 결과는 다시 생성한다. */ }
    if (mode === "load" && stored) return NextResponse.json({ ...stored, restored: true });
    if (mode === "refresh" && !stored) return NextResponse.json({ error: "현재 조건으로 저장된 배차안이 없습니다. 먼저 배차안을 만드세요." }, { status: 409 });
    const addresses = [...new Set(rows.map((row) => addressFor(row.customer)).filter((a): a is string => !!a))]; const points = await geocodeAddresses(addresses);
    const items: SimulationItem[] = rows.map((row) => {
      const address = addressFor(row.customer); const point = address ? points.get(address.trim().replace(/\s+/g, " ")) : null;
      const family = matchProductLoading(row.productCode, row.product); const boxes = row.boxes != null && row.boxes > 0 ? Math.ceil(row.boxes) : null;
      const override = packingOverrides[String(row.rowNumber)]; const packing = isPackingMode(override) ? override : "unknown";
      return { ...row, vehicle: /1호\s*차량/.test(row.transport) ? "1호차" : /2호\s*차량/.test(row.transport) ? "2호차" : null,
        lat: point?.lat ?? null, lng: point?.lng ?? null,
        packing, pallets: packingPallets(boxes, family?.boxesPerPallet, packing),
        weight: boxes != null && family?.boxWeightG ? Math.round(boxes * family.boxWeightG / 1000) : null };
    });
    const excluded = items.filter((item) => item.vehicle && item.lat == null);
    const eligible = items.filter((item) => !item.vehicle || item.lat != null);
    const originals: Order[] = ["1호차", "2호차"].map((vehicle) => ({ vehicle, ids: eligible.filter((item) => item.vehicle === vehicle).map((item) => String(item.rowNumber)) }));
    let ai: ProposedPlan;
    let original: SimulationRoute[];
    let proposed: SimulationRoute[];
    let candidateCount = stored?.candidateCount ?? 0;
    let comparisonNote = stored?.comparisonNote ?? "";
    let savedAt = stored?.savedAt ?? new Date().toISOString();
    if (mode === "refresh" && stored) {
      const orders = stored.proposed.map((route) => ({ vehicle: route.vehicle, ids: route.items.map((item) => String(item.rowNumber)) }));
      const groups = stored.charterGroups!.map((group) => group.items.map((item) => String(item.rowNumber)));
      const problem = validateSimulationOrders(eligible, orders) || validateCharterGroups(eligible, orders, groups);
      if (problem) return NextResponse.json({ error: `저장된 배차안을 다시 확인해 주세요: ${problem}` }, { status: 409 });
      ai = { orders, charterGroups: groups, note: stored.note, model: stored.planSource };
      [original, proposed] = await Promise.all([Promise.all(originals.map((order) => calculate(order, eligible, price))), Promise.all(orders.map((order) => calculate(order, eligible, price)))]);
      if ([...original, ...proposed].some((route) => route.items.length && route.distance == null)) return NextResponse.json({ error: "카카오 경로 조회에 실패해 저장된 결과를 유지했습니다. 다시 시도하세요." }, { status: 502 });
      if (!comparisonNote.includes("후보 선택 당시의 비교 기준")) comparisonNote = `${comparisonNote} 후보 선택 당시의 비교 기준이며 경로만 갱신했습니다.`;
    } else {
      const attempts = await Promise.all(["용차 운행 줄이기", "차량 경로 이동 최소화", "기존 배정 유지하며 가까운 납품 합차"].map((objective) => propose(eligible, objective)));
      const unique = new Map<string, ProposedPlan>();
      for (const plan of attempts) if (plan.charterGroups) unique.set(JSON.stringify({ orders: plan.orders, groups: plan.charterGroups }), plan);
      const plans = [...unique.values()];
      if (!plans.length) return NextResponse.json({ error: attempts.find((attempt) => attempt.note)?.note ?? "유효한 AI 배차안을 만들지 못했습니다. 저장된 결과는 유지됩니다." }, { status: 502 });
      const [originalRoutes, candidates] = await Promise.all([
        Promise.all(originals.map((order) => calculate(order, eligible, price))),
        Promise.all(plans.map(async (plan) => ({ plan, routes: await Promise.all(plan.orders.map((order) => calculate(order, eligible, price))) }))),
      ]);
      const rankings = candidates.map(({ plan, routes }) => ({ routes, charterCount: plan.charterGroups!.length,
        courierMovedIds: plan.orders.flatMap((order) => order.ids).filter((id) => { const item = eligible.find((row) => String(row.rowNumber) === id); return !!item && !item.vehicle && !/용차/.test(item.transport) && /택배|경동/.test(item.transport); }) }));
      const selection = chooseSimulationCandidate(rankings);
      if (selection.index == null) return NextResponse.json({ error: `${selection.note} 기존 저장 결과는 유지됩니다.` }, { status: 422 });
      ai = candidates[selection.index].plan; proposed = candidates[selection.index].routes; original = originalRoutes;
      candidateCount = plans.length; comparisonNote = selection.note; savedAt = new Date().toISOString();
    }
    const assigned = new Set(ai.orders.flatMap((order) => order.ids));
    const remaining = items.filter((item) => !item.vehicle && !assigned.has(String(item.rowNumber)));
    const warnings = [...new Set(excluded.map((item) => `${item.customer}: 주소 미확인으로 기존 자사 납품에서 제외`))];
    if (proposed.some((route) => route.over)) warnings.push("AI 제안이 알려진 차량 적재 한도를 초과합니다. 이 안을 실제 배차에 사용하지 마세요.");
    if ([...original, ...proposed].some((route) => route.items.length > 0 && route.distance == null)) warnings.push("카카오 길찾기에 실패한 차량이 있어 해당 운행 비용을 계산하지 못했습니다.");
    const charterGroups = ai.charterGroups?.map((group) => ({ items: group.map((id) => eligible.find((item) => String(item.rowNumber) === id)!) })) ?? null;
    const result: SimulationResult = { items, original, proposed, remaining, charterGroups, note: ai.note, warnings, savedAt, routeUpdatedAt: new Date().toISOString(), candidateCount, comparisonNote, planSource: ai.model ?? stored?.planSource };
    const value = JSON.stringify(result);
    if (mode === "refresh" && setting) {
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
  } catch { return NextResponse.json({ error: "엑셀을 읽거나 시뮬레이션하는 중 오류가 발생했습니다." }, { status: 500 }); }
}
