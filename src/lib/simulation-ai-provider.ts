export type SimulationAiMessage = { role: "system" | "user"; content: string };
export type SimulationAiResponse = { provider: "Groq" | "Gemini"; model: string; response: Response; content: string | null; switched: boolean };
export class GeminiFallbackError extends Error {}

/** Groq 429에만 Gemini로 즉시 전환한다. 키는 서버 요청 헤더로만 전달한다. */
export async function requestSimulationAi(input: {
  groqKey: string; groqModel: string; geminiKey?: string; geminiModel?: string;
  messages: SimulationAiMessage[]; fetcher?: typeof fetch;
}): Promise<SimulationAiResponse> {
  const fetcher = input.fetcher ?? fetch;
  const groq = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${input.groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: input.groqModel, temperature: 0, max_completion_tokens: 4096, messages: input.messages }),
    signal: AbortSignal.timeout(20000), cache: "no-store",
  });
  if (groq.status === 429 && input.geminiKey) {
    try {
    const model = input.geminiModel?.trim() || "gemini-3.6-flash";
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new GeminiFallbackError("Groq 한도 초과 후 Gemini 모델 설정이 올바르지 않습니다.");
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": input.geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") }] }, contents: [{ role: "user", parts: [{ text: input.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n") }] }], generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 8192 } }),
      signal: AbortSignal.timeout(20000), cache: "no-store",
    });
    if (!response.ok) return { provider: "Gemini", model, response, content: null, switched: true };
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    return { provider: "Gemini", model, response, content: data.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("") ?? "", switched: true };
    } catch (error) {
      if (error instanceof GeminiFallbackError) throw error;
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new GeminiFallbackError("Groq 한도 초과 후 Gemini 응답 시간이 초과됐습니다. 잠시 후 다시 시도하세요.");
      if (error instanceof SyntaxError) throw new GeminiFallbackError("Groq 한도 초과 후 Gemini 응답 형식을 읽지 못했습니다.");
      throw new GeminiFallbackError("Groq 한도 초과 후 Gemini에 연결하지 못했습니다. 잠시 후 다시 시도하세요.");
    }
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
