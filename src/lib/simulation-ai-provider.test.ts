import { strict as assert } from "node:assert";
import { test } from "node:test";
import { geminiHttpError, GeminiFallbackError, requestSimulationAi, resolveGeminiModelChain } from "./simulation-ai-provider";

test("Groq 한도 초과일 때만 Gemini로 전환해 응답과 출처를 반환한다", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? new Response("", { status: 429 }) : Response.json({ candidates: [{ content: { parts: [{ text: '{"orders":[],"charterGroups":[]}' }] } }] });
  };
  const result = await requestSimulationAi({ groqKey: "groq-test", groqModel: "model", geminiKey: "gemini-test", messages: [{ role: "system", content: "규칙" }, { role: "user", content: "요청" }], fetcher });
  assert.equal(result.provider, "Gemini"); assert.equal(result.switched, true); assert.match(result.content!, /charterGroups/);
  assert.equal(result.model, "gemini-3.6-flash");
  assert.match(calls[1].url, /generativelanguage\.googleapis\.com/);
  assert.equal((calls[1].init?.headers as Record<string, string>)["x-goog-api-key"], "gemini-test");
});

test("Gemini 모델 할당이 끝나면 하위 모델로 이어 시도한다", async () => {
  assert.deepEqual(resolveGeminiModelChain("gemini-2.5-flash")[0], "gemini-2.5-flash");
  assert.ok(resolveGeminiModelChain("gemini-2.5-flash").includes("gemini-2.0-flash-lite"));
  const models: string[] = [];
  const fetcher: typeof fetch = async (url) => {
    const href = String(url);
    if (href.includes("api.groq.com")) return new Response("", { status: 429 });
    const model = href.match(/models\/([^:]+):/)?.[1] ?? "";
    models.push(model);
    if (model === "gemini-3.6-flash") return new Response("", { status: 429 });
    if (model === "gemini-2.5-flash") return new Response("", { status: 404 });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"orders":[],"charterGroups":[]}' }] } }] });
  };
  const result = await requestSimulationAi({ groqKey: "test", groqModel: "model", geminiKey: "test", messages: [], fetcher });
  assert.equal(result.provider, "Gemini");
  assert.equal(result.model, "gemini-2.0-flash");
  assert.deepEqual(models.slice(0, 3), ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash"]);
});

test("Groq 성공, 500 오류 또는 Gemini 키가 없는 429는 Gemini를 호출하지 않는다", async () => {
  for (const [status, geminiKey] of [[200, "key"], [500, "key"], [429, ""]] as const) {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return status === 200 ? Response.json({ choices: [{ message: { content: "{}" } }] }) : new Response("", { status }); };
    const result = await requestSimulationAi({ groqKey: "test", groqModel: "model", geminiKey, messages: [], fetcher });
    assert.equal(calls, 1); assert.equal(result.provider, "Groq"); assert.equal(result.response.status, status);
  }
});

test("Gemini 요청 오류를 Groq 성공으로 오인하지 않는다", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => new Response("", { status: ++calls === 1 ? 429 : 503 });
  const result = await requestSimulationAi({ groqKey: "test", groqModel: "model", geminiKey: "test", messages: [], fetcher });
  assert.equal(result.provider, "Gemini"); assert.equal(result.response.status, 503);
  assert.ok(calls > 2);
});

test("Gemini 시간 초과와 잘못된 모델, 서버 오류를 구분한다", async () => {
  const timeout: typeof fetch = async (url) => {
    if (String(url).includes("api.groq.com")) return new Response("", { status: 429 });
    throw new DOMException("timeout", "TimeoutError");
  };
  await assert.rejects(requestSimulationAi({ groqKey: "test", groqModel: "model", geminiKey: "test", messages: [], fetcher: timeout }), (error: unknown) => error instanceof GeminiFallbackError && /시간.*초과/.test(error.message));
  await assert.rejects(requestSimulationAi({ groqKey: "test", groqModel: "model", geminiKey: "test", geminiModel: "bad/model", messages: [], fetcher: timeout }), (error: unknown) => error instanceof GeminiFallbackError && /모델 설정/.test(error.message));
  assert.match(geminiHttpError(503), /Gemini 서버.*503/);
  assert.match(geminiHttpError(429), /요청 한도/);
});
