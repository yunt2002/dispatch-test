import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { extractComparisonShipments } from "@/lib/comparison-workbook";
import { resolveCustomerAddress } from "@/lib/delivery-customers";
import { geocodeAddresses } from "@/lib/geocoding";
import { matchProductLoading } from "@/lib/product-loading";
import { DEFAULT_DEPOT } from "@/lib/depot";
import { fetchKakaoDrivingRoute } from "@/lib/kakao-route-matrix";
import { validateSimulationOrders, type SimulationItem, type SimulationRoute, type SimulationResult } from "@/lib/simulation";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;
type Order = { vehicle: string; ids: string[] };

async function propose(items: SimulationItem[]): Promise<{ orders: Order[]; note: string }> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return { orders: [], note: "Groq 키가 없어 AI 제안을 만들지 못했습니다." };
  let issue = "Groq 응답을 확인할 수 없습니다.";
  const models = [...new Set([process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b", "openai/gpt-oss-120b"])];
  for (const model of models) try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, max_completion_tokens: 4096,
        messages: [{ role: "system", content: "너는 납품 배차 시뮬레이션 도우미다. 기존 자사 차량 품목을 모두 포함하고, 외부 용차/택배 품목 중 가까운 방문지를 가능한 한 자사 차량에 합쳐라. 차량 간 재배정 가능. 각 품목 id는 최대 1회. 좌표가 없으면 외부 품목은 선택하지 마라. 적재량 숫자가 있는 품목들의 합계는 1호차 4000kg 및 8PLT, 2호차 3500kg 및 8PLT를 초과하지 말아라. 값이 null이면 미확인이며 0이라고 가정하지 마라. 방문 순서대로 id를 정렬한다. 입력에 없는 id를 만들지 마라. 반드시 orders 배열에 1호차와 2호차 객체를 각각 하나씩 포함하고, 품목이 없는 차량은 ids를 빈 배열로 둔다. 각 id는 문자열이다. JSON 객체 {\"orders\":[{\"vehicle\":\"1호차\",\"ids\":[\"1\"]},{\"vehicle\":\"2호차\",\"ids\":[\"2\"]}]}만 출력." },
          { role: "user", content: JSON.stringify({ depot: DEFAULT_DEPOT, items: items.map((i) => ({ id: String(i.rowNumber), customer: i.customer, transport: i.transport, vehicle: i.vehicle, lat: i.lat, lng: i.lng, pallets: i.pallets, weight: i.weight })) }) }] }),
      signal: AbortSignal.timeout(20000), cache: "no-store",
    });
    if (!response.ok) throw new Error();
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { orders?: Order[] };
    const orders = Array.isArray(parsed.orders) ? parsed.orders.map((order) => ({ vehicle: order.vehicle, ids: Array.isArray(order.ids) ? order.ids.map(String) : [] })) : [];
    const problem = validateSimulationOrders(items, orders);
    if (problem) { issue = problem; continue; }
    return { orders, note: "Groq 제안 · 적재량과 납품 기한 확인이 필요한 시뮬레이션" };
  } catch { issue = "Groq 제안 조회에 실패했습니다. 키와 연결을 확인하세요."; }
  return { orders: [], note: `${issue} 다시 시도하세요.` };
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
    const priceText = String(form.get("price") ?? "").trim(); const price = priceText ? Number(priceText) : null;
    if (!(file instanceof File) || file.size > 15_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (price !== null && (!Number.isFinite(price) || price <= 0))) return NextResponse.json({ error: "엑셀 파일, 날짜와 경유 가격을 확인하세요." }, { status: 400 });
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ExcelJS.Buffer);
    const sheetName = `${date.slice(2, 4)}년 ${Number(date.slice(5, 7))}월`; const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return NextResponse.json({ error: `${sheetName} 시트를 찾을 수 없습니다.` }, { status: 400 });
    const rows = extractComparisonShipments(sheet, date);
    if (!rows.length) return NextResponse.json({ error: "선택한 날짜에 납품 내역이 없습니다." }, { status: 400 });
    const customers = await prisma.customer.findMany({ where: { isActive: true }, select: { customerName: true, address: true } });
    const addressFor = (name: string) => resolveCustomerAddress(name) || customers.find((c) => c.customerName.trim() === name.trim())?.address?.trim() || null;
    const addresses = [...new Set(rows.map((row) => addressFor(row.customer)).filter((a): a is string => !!a))]; const points = await geocodeAddresses(addresses);
    const items: SimulationItem[] = rows.map((row) => {
      const address = addressFor(row.customer); const point = address ? points.get(address.trim().replace(/\s+/g, " ")) : null;
      const family = matchProductLoading(row.productCode, row.product); const boxes = row.boxes != null && row.boxes > 0 ? Math.ceil(row.boxes) : null;
      return { ...row, vehicle: /1호\s*차량/.test(row.transport) ? "1호차" : /2호\s*차량/.test(row.transport) ? "2호차" : null,
        lat: point?.lat ?? null, lng: point?.lng ?? null,
        pallets: boxes != null && family?.boxesPerPallet ? Math.ceil(boxes / family.boxesPerPallet) : null,
        weight: boxes != null && family?.boxWeightG ? Math.round(boxes * family.boxWeightG / 1000) : null };
    });
    const excluded = items.filter((item) => item.vehicle && item.lat == null);
    const eligible = items.filter((item) => !item.vehicle || item.lat != null);
    const originals: Order[] = ["1호차", "2호차"].map((vehicle) => ({ vehicle, ids: eligible.filter((item) => item.vehicle === vehicle).map((item) => String(item.rowNumber)) }));
    const ai = await propose(eligible);
    const [original, proposed] = await Promise.all([Promise.all(originals.map((o) => calculate(o, eligible, price))), Promise.all(ai.orders.map((o) => calculate(o, eligible, price)))]);
    const assigned = new Set(ai.orders.flatMap((order) => order.ids));
    const remaining = items.filter((item) => !item.vehicle && !assigned.has(String(item.rowNumber)));
    const warnings = [...new Set(excluded.map((item) => `${item.customer}: 주소 미확인으로 기존 자사 납품에서 제외`))];
    if (proposed.some((route) => route.over)) warnings.push("AI 제안이 알려진 차량 적재 한도를 초과합니다. 이 안을 실제 배차에 사용하지 마세요.");
    if ([...original, ...proposed].some((route) => route.items.length > 0 && route.distance == null)) warnings.push("카카오 길찾기에 실패한 차량이 있어 해당 운행 비용을 계산하지 못했습니다.");
    const result: SimulationResult = { items, original, proposed, remaining, note: ai.note, warnings };
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: "엑셀을 읽거나 시뮬레이션하는 중 오류가 발생했습니다." }, { status: 500 }); }
}
