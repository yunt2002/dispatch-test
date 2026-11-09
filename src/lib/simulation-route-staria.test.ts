import { strict as assert } from "node:assert";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { POST } from "../app/api/route/compare/route";

test("가상 일정으로 스타리아 배차·경로·비용을 계산하고 차량 설정 누락을 차단한다", async () => {
  const customers = { findMany: async () => [] };
  const products = { findMany: async () => [] };
  let staria: { maxPallet: number; maxWeight: number } | null = { maxPallet: 1, maxWeight: 1000 };
  const vehicles = { findFirst: async () => staria };
  const settings = { findUnique: async () => null, create: async () => ({}), upsert: async () => ({}) };
  const geo = { findMany: async ({ where }: { where: { query: { in: string[] } } }) => where.query.in.map((query) => ({ query, found: true, lat: 37.4, lng: 127.1 })) };
  for (const [name, fake] of [["customer", customers], ["product", products], ["vehicleType", vehicles], ["appSetting", settings], ["geocodeCache", geo]] as const) {
    Object.defineProperty(prisma, name, { value: fake, configurable: true });
    assert.equal(prisma[name], fake);
  }
  const originalFetch = globalThis.fetch;
  const originalGroq = process.env.GROQ_API_KEY;
  const originalKakao = process.env.KAKAO_REST_API_KEY;
  process.env.GROQ_API_KEY = "가상테스트키";
  process.env.KAKAO_REST_API_KEY = "가상테스트키";
  let stariaRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("api.groq.com")) {
      const body = JSON.parse(String(init?.body));
      const user = JSON.parse(body.messages.find((message: { role: string }) => message.role === "user").content);
      assert.ok(user.vehicles.some((vehicle: { name: string; maxPallet: number }) => vehicle.name === "스타리아" && vehicle.maxPallet === 1));
      stariaRequests++;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ orders: [{ vehicle: "1호차", ids: ["2"] }, { vehicle: "2호차", ids: ["3"] }, { vehicle: "스타리아", ids: ["4"] }], charterGroups: [] }) } }] });
    }
    if (url.includes("apis-navi.kakaomobility.com")) return Response.json({ routes: [{ result_code: 0, summary: { distance: 71000, duration: 1800, fare: { toll: 1000 } }, sections: [{ roads: [{ vertexes: [127.1, 37.4, 127.2, 37.5] }] }] }] });
    throw new Error("테스트에서 허용되지 않은 네트워크 호출");
  };
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("26년 10월");
    sheet.addRow(["일자", "업체명", "업체위치", "품명", "박스수량", "물류", "주소"]);
    sheet.addRow(["10/15", "가상 1", "서울", "품목 1", 1, "1호 차량", "서울특별시 중구 세종대로 110"]);
    sheet.addRow(["10/15", "가상 2", "서울", "품목 2", 1, "2호 차량", "서울특별시 중구 세종대로 110"]);
    sheet.addRow(["10/15", "가상 3", "서울", "품목 3", 1, "스타리아", "서울특별시 중구 세종대로 110"]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const request = (overrides?: Record<string, string>) => { const form = new FormData(); form.set("file", new File([bytes], "가상.xlsx")); form.set("date", "2026-10-15"); form.set("price", "1800"); form.set("mode", "regenerate"); if (overrides) form.set("addressOverrides", JSON.stringify(overrides)); return new Request("http://localhost/api/route/compare", { method: "POST", body: form }); };
    const addressRequest = (overrides: unknown, excludedRows: number[] = []) => { const form = new FormData(); form.set("file", new File([bytes], "가상.xlsx")); form.set("date", "2026-10-15"); form.set("mode", "addresses"); form.set("addressOverrides", JSON.stringify(overrides)); form.set("excludedRows", JSON.stringify(excludedRows)); return new Request("http://localhost/api/route/compare", { method: "POST", body: form }); };
    const check = await POST(addressRequest({ "3": "경기도 안양시 만안구 덕천로152번길 25" }, [4]));
    const checked = await check.json();
    assert.equal(check.status, 200, JSON.stringify(checked));
    assert.equal(stariaRequests, 0, "주소 사전 확인은 AI를 호출하지 않는다");
    assert.equal(checked.items.length, 2);
    assert.equal(checked.items[1].address, "경기도 안양시 만안구 덕천로152번길 25");
    assert.equal(checked.items[1].addressSource, "담당자 입력 주소");
    assert.match(checked.items[1].addressWarning, /서울/);
    assert.equal(checked.items[1].lat, 37.4);
    assert.equal((await POST(addressRequest({ "999": "서울시 중구 세종대로 110" }))).status, 400);
    assert.equal((await POST(addressRequest({ "3": "가".repeat(301) }))).status, 400);
    const response = await POST(request());
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(stariaRequests, 3);
    for (const plan of [result.original, result.proposed]) {
      const star = plan.find((route: { vehicle: string }) => route.vehicle === "스타리아");
      assert.equal(star.items[0].rowNumber, 4);
      assert.equal(star.maxPallet, 1);
      assert.equal(star.maxWeight, 1000);
      assert.equal(star.fuel, Math.round(71 / 11.6 * 1800));
      assert.equal(star.toll, 1000);
    }
    const changed = await POST(request({ "3": "경기도 안양시 만안구 덕천로152번길 25" }));
    const changedResult = await changed.json();
    assert.equal(changed.status, 200, JSON.stringify(changedResult));
    assert.notEqual(changedResult.inputFingerprint, result.inputFingerprint);
    assert.equal(changedResult.original[1].items[0].address, "경기도 안양시 만안구 덕천로152번길 25");
    assert.ok(changedResult.warnings.some((warning: string) => /입력 주소가 엑셀 지역과 다릅니다/.test(warning)));
    const portWorkbook = new ExcelJS.Workbook();
    const portSheet = portWorkbook.addWorksheet("26년 10월");
    portSheet.addRow(["일자", "업체명", "업체위치", "품명", "박스수량", "물류", "주소"]);
    portSheet.addRow(["10/15", "가상 항만", "인천항", "품목", 1, "2호 차량", ""]);
    portSheet.addRow(["10/15", "가상 항만", "부산항", "품목", 1, "1호 차량", "부산광역시 동구 충장대로 210"]);
    const portBytes = new Uint8Array(await portWorkbook.xlsx.writeBuffer());
    const portRequest = (overrides: Record<string, string>) => { const form = new FormData(); form.set("file", new File([portBytes], "항만.xlsx")); form.set("date", "2026-10-15"); form.set("mode", "addresses"); form.set("addressOverrides", JSON.stringify(overrides)); return new Request("http://localhost/api/route/compare", { method: "POST", body: form }); };
    const portCheck = await (await POST(portRequest({}))).json();
    assert.equal(portCheck.items[0].address, "인천광역시 제물포구 항동7가 27-171");
    assert.match(portCheck.items[0].addressSource, /대표 지점.*확인 필요/);
    assert.equal(portCheck.items[0].lat, 37.4);
    assert.equal(portCheck.items[1].address, "부산광역시 동구 충장대로 210");
    assert.equal(portCheck.items[1].addressSource, "엑셀 도착지");
    const manualPort = await (await POST(portRequest({ "2": "인천광역시 연수구 국제항만대로 438" }))).json();
    assert.equal(manualPort.items[0].addressSource, "담당자 입력 주소");
    assert.equal(manualPort.items[0].address, "인천광역시 연수구 국제항만대로 438");
    staria = null;
    const missing = await POST(request());
    assert.equal(missing.status, 422);
    assert.match((await missing.json()).error, /스타리아.*적재 한도/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalGroq;
    if (originalKakao === undefined) delete process.env.KAKAO_REST_API_KEY; else process.env.KAKAO_REST_API_KEY = originalKakao;
  }
});
