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
    const model = input.geminiModel?.trim() || "gemini-3.8-flash";
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Gemini 모델 이름이 올바르지 않습니다.");
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": input.geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") }] }, contents: [{ role: "user", parts: [{ text: input.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n") }] }], generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 8192 } }),
      signal: AbortSignal.timeout(20000), cache: "no-store",
    });
    if (!response.ok) return { provider: "Gemini", model, response, content: null, switched: true };
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    return { provider: "Gemini", model, response, content: data.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("") ?? "", switched: true };
    } catch {
      throw new GeminiFallbackError("Groq 한도 초과 후 Gemini 연결, 응답 또는 모델 설정을 확인할 수 없습니다.");
    }
  }
  if (!groq.ok) return { provider: "Groq", model: input.groqModel, response: groq, content: null, switched: false };
  const data = await groq.json() as { choices?: { message?: { content?: string } }[] };
  return { provider: "Groq", model: input.groqModel, response: groq, content: data.choices?.[0]?.message?.content ?? "", switched: false };
}
