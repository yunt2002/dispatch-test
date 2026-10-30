import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { extractComparisonShipments } from "@/lib/comparison-workbook";
import { resolveCustomerAddress } from "@/lib/delivery-customers";
import { geocodeAddresses } from "@/lib/geocoding";
import { DEFAULT_DEPOT } from "@/lib/depot";
import { fetchKakaoDrivingRoute } from "@/lib/kakao-route-matrix";
import type { ComparisonResult, ComparisonRoute } from "@/lib/comparison-types";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

type Stop = { id: string; name: string; lat: number; lng: number };
type Group = { vehicle: string; stops: Stop[] };

async function proposeOrder(groups: Group[]): Promise<{ groups: Group[]; note: string }> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return { groups: [], note: "Groq API 키가 없어 AI 제안을 만들지 못했습니다." };
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b", temperature: 0,
        messages: [{ role: "system", content: "차량별 방문 순서를 제안하라. 차량 사이 납품을 옮기지 말고 각 id를 정확히 한번씩 사용한다. 입력 좌표와 왕복을 고려하라. JSON 객체 {\"orders\":[{\"vehicle\":\"1호차\",\"ids\":[\"...\"]}]}만 반환한다. 새로운 납품을 만들지 않는다." },
          { role: "user", content: JSON.stringify({ depot: { lat: DEFAULT_DEPOT.lat, lng: DEFAULT_DEPOT.lng }, groups }) }] }),
      signal: AbortSignal.timeout(30000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Groq 요청 실패");
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    const parsed = JSON.parse(json ?? "{}") as { orders?: { vehicle: string; ids: string[] }[] };
    const proposed = groups.map((group) => {
      const order = parsed.orders?.find((item) => item.vehicle === group.vehicle)?.ids;
      if (!Array.isArray(order) || order.length !== group.stops.length || new Set(order).size !== order.length) throw new Error("AI 방문 순서가 누락되거나 중복되었습니다.");
      const stops = order.map((id) => group.stops.find((stop) => stop.id === id));
      if (stops.some((stop) => !stop)) throw new Error("AI가 알 수 없는 방문지를 반환했습니다.");
      return { ...group, stops: stops as Stop[] };
    });
    return { groups: proposed, note: "Groq 제안 · 자사 차량 배정 유지, 방문 순서만 변경" };
  } catch {
    return { groups: [], note: "Groq 제안 조회에 실패했습니다. 키와 연결을 확인하고 다시 시도하세요." };
  }
}

async function calculate(group: Group, price: number | null): Promise<ComparisonRoute | null> {
  const points = [DEFAULT_DEPOT, ...group.stops, DEFAULT_DEPOT];
  const route = await fetchKakaoDrivingRoute(points, "RECOMMEND", 2);
  if (!route) return null;
  return { vehicle: group.vehicle, stops: group.stops.map((s) => s.name), distance: route.distanceKm,
    minutes: route.durationMin, toll: route.tollWon, fuel: price == null ? null : Math.round(route.distanceKm / 7.1 * price) };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const date = String(form.get("date") ?? "");
    const priceText = String(form.get("price") ?? "").trim();
    const price = priceText ? Number(priceText) : null;
    if (!(file instanceof File) || file.size > 15_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (price !== null && (!Number.isFinite(price) || price <= 0))) return NextResponse.json({ error: "엑셀 파일, 날짜와 경유 가격을 확인하세요." }, { status: 400 });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ExcelJS.Buffer);
    const sheetName = `${date.slice(2, 4)}년 ${Number(date.slice(5, 7))}월`;
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return NextResponse.json({ error: `${sheetName} 시트를 찾을 수 없습니다.` }, { status: 400 });
    const rows = extractComparisonShipments(sheet, date);
    if (!rows.length) return NextResponse.json({ error: "선택한 날짜에 납품 내역이 없습니다." }, { status: 400 });
    const owned = rows.filter((row) => /[12]호\s*차량/.test(row.transport));
    const dbCustomers = await prisma.customer.findMany({ where: { isActive: true }, select: { customerName: true, address: true } });
    const customerAddress = (name: string) => resolveCustomerAddress(name) || dbCustomers.find((customer) => customer.customerName.trim() === name.trim())?.address?.trim() || null;
    const addresses = [...new Set(owned.map((row) => customerAddress(row.customer)).filter((address): address is string => !!address))];
    const points = await geocodeAddresses(addresses);
    const warnings: string[] = [];
    const groups: Group[] = [];
    for (const row of owned) {
      const address = customerAddress(row.customer);
      const point = address ? points.get(address.trim().replace(/\s+/g, " ")) : undefined;
      if (!point) { warnings.push(`${row.customer || `${row.rowNumber}행`}: 정확한 주소 또는 좌표를 확인할 수 없어 자사 차량 비교에서 제외`); continue; }
      const vehicle = /1호/.test(row.transport) ? "1호차" : "2호차";
      let group = groups.find((item) => item.vehicle === vehicle);
      if (!group) { group = { vehicle, stops: [] }; groups.push(group); }
      if (!group.stops.some((stop) => stop.name === row.customer && stop.lat === point.lat && stop.lng === point.lng)) group.stops.push({ id: String(row.rowNumber), name: row.customer, ...point });
    }
    const proposed = await proposeOrder(groups);
    const [humanResults, aiResults] = await Promise.all([Promise.all(groups.map((group) => calculate(group, price))), Promise.all(proposed.groups.map((group) => calculate(group, price)))]);
    if (humanResults.some((r) => !r) || aiResults.some((r) => !r)) warnings.push("카카오 길찾기 실패 차량은 비교에서 제외했습니다.");
    const result: ComparisonResult = { rows, human: humanResults.filter((r): r is ComparisonRoute => !!r), ai: aiResults.filter((r): r is ComparisonRoute => !!r), aiNote: proposed.note, warnings: [...new Set(warnings)] };
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: "엑셀을 읽거나 비교하는 중 오류가 발생했습니다. 파일 형식과 연결 상태를 확인하세요." }, { status: 500 }); }
}
