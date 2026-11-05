export type SimulationAiMessage = { role: "system" | "user"; content: string };
export type GeminiAttempt = { model: string; outcome: `HTTP ${number}` | "시간 초과" | "연결 실패" | "응답 형식 오류" };
export type SimulationAiResponse = { provider: "Groq" | "Gemini"; model: string; response: Response; content: string | null; switched: boolean; geminiAttempts?: GeminiAttempt[] };
export class GeminiFallbackError extends Error {}

/** 오류 원문이나 환경 변수 값은 출력하지 않는다. */
export function formatGeminiAttempts(attempts: GeminiAttempt[]): string {
  if (!attempts.length) return "";
  return `Gemini 모델별 시도: ${attempts.map(({ model, outcome }) => `${/^gemini-[a-z0-9.-]{1,60}$/.test(model) ? model : "설정된 모델"} ${outcome}`).join(" → ")}.`;
}

/** 마지막 모델의 404가 앞선 할당량·서버 오류를 가리지 않도록 전체 시도를 요약한다. */
export function summarizeGeminiFailure(attempts: GeminiAttempt[], finalStatus: number): string {
  const outcomes = attempts.map((attempt) => attempt.outcome);
  if (outcomes.some((outcome) => outcome === "HTTP 401" || outcome === "HTTP 403")) return "Groq 한도 초과 후 Gemini 인증 또는 모델 접근 권한을 확인하세요.";
  const parts: string[] = [];
  if (outcomes.includes("HTTP 429")) parts.push("Gemini 요청 한도 초과(429)");
  if (outcomes.some((outcome) => /^HTTP 5\d\d$/.test(outcome))) parts.push("Gemini 일시적 서버 오류(5xx)");
  if (outcomes.includes("시간 초과")) parts.push("Gemini 응답 시간 초과");
  if (outcomes.includes("연결 실패")) parts.push("Gemini 연결 실패");
  if (outcomes.includes("HTTP 404")) parts.push("일부 Gemini 모델 미지원 또는 접근 불가(404)");
  return parts.length ? `Groq 한도 초과 후 ${parts.join(" · ")}가 발생했습니다. 잠시 후 재시도하거나 모델 접근 권한을 확인하세요.` : geminiHttpError(finalStatus);
}

/** 선호 모델 한도·미지원 시 아래로 이어 시도한다. */
export const DEFAULT_GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
] as const;

export function resolveGeminiModelChain(preferred?: string): string[] {
  const primary = preferred?.trim() || DEFAULT_GEMINI_MODELS[0];
  if (!/^[a-zA-Z0-9._-]+$/.test(primary)) {
    throw new GeminiFallbackError("Groq 한도 초과 후 Gemini 모델 설정이 올바르지 않습니다.");
  }
  return [primary, ...DEFAULT_GEMINI_MODELS.filter((model) => model !== primary)];
}

function shouldTryNextGeminiModel(status: number): boolean {
  return status === 429 || status === 404 || status >= 500;
}

/** Groq 429에만 Gemini로 즉시 전환한다. 키는 서버 요청 헤더로만 전달한다. */
export async function requestSimulationAi(input: {
  groqKey: string; groqModel: string; geminiKey?: string; geminiModel?: string;
  messages: SimulationAiMessage[]; fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void>;
}): Promise<SimulationAiResponse> {
  const fetcher = input.fetcher ?? fetch;
  const groq = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${input.groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: input.groqModel, temperature: 0, max_completion_tokens: 4096, messages: input.messages }),
    signal: AbortSignal.timeout(20000), cache: "no-store",
  });
  if (groq.status === 429 && input.geminiKey) {
    const geminiKey = input.geminiKey;
    const models = resolveGeminiModelChain(input.geminiModel);
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") }] },
      contents: [{ role: "user", parts: [{ text: input.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n") }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 8192 },
    });
    let lastFailure: SimulationAiResponse | null = null;
    let timedOutAll = true;
    const attempts: GeminiAttempt[] = [];
    for (const [modelIndex, model] of models.entries()) {
      try {
        const request = () => fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
          body, signal: AbortSignal.timeout(20000), cache: "no-store",
        });
        let response = await request();
        if (modelIndex === 0 && (response.status === 429 || response.status === 503)) {
          attempts.push({ model, outcome: `HTTP ${response.status}` });
          const seconds = Number(response.headers.get("retry-after"));
          const wait = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 2000) : 1000;
          await (input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(wait);
          response = await request();
        }
        timedOutAll = false;
        if (response.ok) {
          const data = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
          attempts.push({ model, outcome: `HTTP ${response.status}` });
          return {
            provider: "Gemini",
            model,
            response,
            content: data.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("") ?? "",
            switched: true,
            geminiAttempts: attempts,
          };
        }
        attempts.push({ model, outcome: `HTTP ${response.status}` });
        lastFailure = { provider: "Gemini", model, response, content: null, switched: true, geminiAttempts: attempts };
        if (response.status === 401 || response.status === 403) return lastFailure;
        if (!shouldTryNextGeminiModel(response.status)) return lastFailure;
      } catch (error) {
        if (error instanceof GeminiFallbackError) throw error;
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) { attempts.push({ model, outcome: "시간 초과" }); continue; }
        if (error instanceof SyntaxError) { attempts.push({ model, outcome: "응답 형식 오류" }); throw new GeminiFallbackError(`Groq 한도 초과 후 Gemini 응답 형식을 읽지 못했습니다. ${formatGeminiAttempts(attempts)}`); }
        attempts.push({ model, outcome: "연결 실패" });
        throw new GeminiFallbackError(`Groq 한도 초과 후 Gemini에 연결하지 못했습니다. 잠시 후 다시 시도하세요. ${formatGeminiAttempts(attempts)}`);
      }
    }
    if (lastFailure) return lastFailure;
    if (timedOutAll) throw new GeminiFallbackError(`Groq 한도 초과 후 Gemini 응답 시간이 초과됐습니다. 잠시 후 다시 시도하세요. ${formatGeminiAttempts(attempts)}`);
    throw new GeminiFallbackError("Groq 한도 초과 후 Gemini에 연결하지 못했습니다. 잠시 후 다시 시도하세요.");
  }
  if (!groq.ok) return { provider: "Groq", model: input.groqModel, response: groq, content: null, switched: false };
  const data = await groq.json() as { choices?: { message?: { content?: string } }[] };
  return { provider: "Groq", model: input.groqModel, response: groq, content: data.choices?.[0]?.message?.content ?? "", switched: false };
}

export function geminiHttpError(status: number): string {
  if (status === 401 || status === 403) return `Groq 한도 초과 후 Gemini 인증 또는 권한 오류 (HTTP ${status}). 키와 모델 접근 권한을 확인하세요.`;
  if (status === 429) return "Groq와 Gemini의 요청 한도를 초과했습니다 (Gemini HTTP 429). 잠시 후 다시 시도하세요.";
  if (status === 404) return "Groq 한도 초과 후 Gemini 모델을 찾지 못했습니다 (HTTP 404). 모델 설정을 확인하세요.";
  if (status >= 500) return `Groq 한도 초과 후 Gemini 서버가 요청을 처리하지 못했습니다 (HTTP ${status}). 잠시 후 다시 시도하세요.`;
  return `Groq 한도 초과 후 Gemini 요청 실패 (HTTP ${status}). 요청과 모델 설정을 확인하세요.`;
}
