import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.OPINET_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "오피넷 API 키가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const url = new URL("https://www.opinet.co.kr/api/avgAllPrice.do");
    url.searchParams.set("certkey", key);
    url.searchParams.set("out", "json");
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("API request failed");
    const data = await response.json() as {
      RESULT?: { OIL?: { PRODCD?: string; PRICE?: string | number; TRADE_DT?: string }[] };
    };
    const diesel = data.RESULT?.OIL?.find((item) => item.PRODCD === "D047");
    const price = Number(diesel?.PRICE);
    if (!Number.isFinite(price) || price <= 0 || !/^\d{8}$/.test(diesel?.TRADE_DT ?? "")) {
      throw new Error("Invalid price data");
    }
    return NextResponse.json(
      { price, date: diesel!.TRADE_DT, source: "오피넷 전국 평균" },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json({ error: "오피넷 가격을 가져오지 못했습니다. 직접 입력해 주세요." }, { status: 502 });
  }
}
