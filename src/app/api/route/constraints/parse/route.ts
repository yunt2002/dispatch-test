import { NextResponse } from "next/server";
import { parseRouteConstraintsWithGroq } from "@/lib/groq-constraints";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    stopLabels?: unknown;
    vehicleNames?: unknown;
  };

  const text = typeof body.text === "string" ? body.text : "";
  const stopLabels = Array.isArray(body.stopLabels)
    ? body.stopLabels.filter((label): label is string => typeof label === "string")
    : [];
  const vehicleNames = Array.isArray(body.vehicleNames)
    ? body.vehicleNames.filter((name): name is string => typeof name === "string")
    : [];

  if (!text.trim()) {
    return NextResponse.json(
      { ok: false, error: "제약 문장을 입력하세요." },
      { status: 400 },
    );
  }

  const parsed = await parseRouteConstraintsWithGroq({
    text,
    stopLabels,
    vehicleNames,
  });
  return NextResponse.json({
    ok: true,
    ...parsed,
    groqConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
  });
}
