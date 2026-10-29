import "server-only";

import {
  parseConstraintsHeuristic,
  type OrderConstraint,
  type ParsedRouteConstraints,
  type VehicleOrderHint,
} from "@/lib/route-constraints";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** llama-3.1-8b-instant 는 2026-08 폐기. 무료/개발 티어 대체 모델 */
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
const GROQ_MODEL_FALLBACKS = [
  GROQ_MODEL,
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
].filter((model, index, all) => all.indexOf(model) === index);

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() || trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON 없음");
  return JSON.parse(body.slice(start, end + 1));
}

function normalizeConstraints(raw: unknown): ParsedRouteConstraints {
  if (!raw || typeof raw !== "object") {
    return { constraints: [], orders: [], notes: [], summary: "빈 응답" };
  }
  const obj = raw as Record<string, unknown>;
  const constraints: OrderConstraint[] = [];
  const list = Array.isArray(obj.constraints) ? obj.constraints : [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? "");
    const match = String(row.match ?? "").trim();
    const vehicleRaw = row.vehicle == null ? "" : String(row.vehicle).trim();
    const vehicle = vehicleRaw || null;
    if (!match) continue;
    if (type === "early" || type === "late") {
      constraints.push({ type, match, vehicle });
    } else if (type === "before") {
      const other = String(row.other ?? "").trim();
      if (other) constraints.push({ type: "before", match, other, vehicle });
    }
  }

  const orders: VehicleOrderHint[] = [];
  const orderList = Array.isArray(obj.orders) ? obj.orders : [];
  for (const item of orderList) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const vehicle = String(row.vehicle ?? "").trim();
    const sequence = Array.isArray(row.sequence)
      ? row.sequence.map((token) => String(token).trim()).filter(Boolean)
      : [];
    if (vehicle && sequence.length) orders.push({ vehicle, sequence });
  }

  const notes = Array.isArray(obj.notes)
    ? obj.notes.map((note) => String(note).trim()).filter(Boolean)
    : [];
  const scoped = constraints.filter((c) => c.vehicle).length;
  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim()
      : orders.length
        ? `차량별 순서 ${orders.length}건`
        : constraints.length
          ? `제약 ${constraints.length}건${scoped ? ` · ${scoped}건 차량지정` : ""}`
          : "해석된 순서 제약 없음";

  return { constraints, orders, notes, summary };
}

export async function parseRouteConstraintsWithGroq(input: {
  text: string;
  stopLabels: string[];
  vehicleNames?: string[];
}): Promise<
  ParsedRouteConstraints & {
    source: "groq" | "heuristic";
    warning?: string;
  }
> {
  const text = input.text.trim();
  if (!text) {
    return {
      constraints: [],
      orders: [],
      notes: [],
      summary: "",
      source: "heuristic",
    };
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return {
      ...parseConstraintsHeuristic(text),
      source: "heuristic",
      warning: "GROQ_API_KEY 없음 · 규칙 폴백",
    };
  }

  const system = `당신은 한국 공장 배차 현장의 자연어 제약을 JSON으로만 변환한다.
문장이 차량별 방문 순서를 명시하면 orders에 넣는다.
예: 1호차는 만도→만도브로제→삼현, 2호차는 만도브로제→만도
→ {"orders":[{"vehicle":"1호","sequence":["만도","만도브로제","삼현"]},{"vehicle":"2호","sequence":["만도브로제","만도"]}],"constraints":[],"notes":[],"summary":"..."}
부분 제약만 있으면 constraints 사용:
- early/late/before + match + vehicle(없으면 null)
중요: "만도"와 "만도브로제"는 다른 거래처. stopLabels 표기를 우선 사용.
출력 JSON 하나만.`;

  const user = `차량: ${JSON.stringify(input.vehicleNames ?? [])}
납품 라벨: ${JSON.stringify(input.stopLabels)}
요청: ${text}`;

  let lastError = "";
  for (const model of GROQ_MODEL_FALLBACKS) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        cache: "no-store",
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        lastError = `${model} ${res.status}`;
        console.warn("[groq-constraints]", model, res.status, detail.slice(0, 200));
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = normalizeConstraints(extractJsonObject(content));
      return { ...parsed, source: "groq" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn("[groq-constraints]", model, error);
    }
  }

  return {
    ...parseConstraintsHeuristic(text),
    source: "heuristic",
    warning: `Groq 실패(${lastError || "unknown"}) · 규칙 폴백`,
  };
}
