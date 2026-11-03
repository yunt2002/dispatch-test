import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fallbackCharterGroups, replaceRegionalScenario, validateCharterGroups, validateSimulationOrders, type SimulationItem, type SimulationResult } from "./simulation";
import { groqException, groqHttpError } from "./groq-errors";
import { simulationAddressIssue } from "./simulation-address";
import { uniqueCompanyPlace } from "./simulation-place-match";
import { buildRegionalFallback, buildRegionalPlan, regionalGroup, regionalScenarioItems, similarCorridor, simulationRegion, validateRegionalCandidate, validateRegionalOrders } from "./simulation-regions";

const item = (id: number, vehicle: SimulationItem["vehicle"], hasLocation = true): SimulationItem => ({ rowNumber: id, date: "2026-10-14", customer: "업체", location: "지역", product: "품목", productCode: "", quantity: 1, boxes: 1, transport: vehicle ?? "용차", vehicle, lat: hasLocation ? 37 : null, lng: hasLocation ? 127 : null, pallets: 1, weight: 100, packing: "pallet" });
const items = [item(1, "1호차"), item(2, "2호차"), item(3, null), item(4, null, false)];
test("회사명과 엑셀 지역에 일치하는 유일한 장소만 주소 후보로 사용한다", () => {
  const place = { place_name: "디아이씨", road_address_name: "울산광역시 울주군 언양읍 반천산업로 1", x: "129.1", y: "35.5" };
  assert.equal(uniqueCompanyPlace("디아이씨", "울주", [place], true)?.address, place.road_address_name);
  assert.equal(uniqueCompanyPlace("디아이씨", "대구", [place], true), null);
  assert.equal(uniqueCompanyPlace("디아이씨", "울주", [place], false), null);
  assert.equal(uniqueCompanyPlace("디아이씨", "울주", [place, { ...place, x: "129.2" }], true), null);
  assert.equal(uniqueCompanyPlace("디아이씨", "광주", [place], true), null);
  assert.equal(uniqueCompanyPlace("디아이씨", "울주", [{ ...place, place_name: "디아이씨 협력사" }], true), null);
});
test("엑셀 지역과 주소가 불일치하거나 주소가 없으면 경로에서 확인하도록 알린다", () => {
  assert.match(simulationAddressIssue("울주", "대구광역시 달서구 월암동")!, /엑셀 지역 울주/);
  assert.match(simulationAddressIssue("창원", "경상남도 김해시")!, /엑셀 지역 창원/);
  assert.equal(simulationAddressIssue("김해", "경상남도 김해시 김해대로"), null);
  assert.equal(simulationAddressIssue("광주", "광주광역시 북구"), null);
  assert.equal(simulationAddressIssue("울주", null), "등록 주소 없음");
  assert.equal(simulationAddressIssue("", "경기도 화성시"), null);
});
test("지방 대체안은 서로 다른 납품지를 두 차량에 배정하고 남은 용차를 빠짐없이 처리한다", () => {
  const a = { ...item(11, null), customer: "A", location: "광주", region: "regional" as const, regionalGroup: "전라권", lat: 35.2, lng: 126.9 };
  const b = { ...item(12, null), customer: "B", location: "김해", region: "regional" as const, regionalGroup: "경상권", lat: 35.3, lng: 128.9 };
  const capital = { ...item(13, null), customer: "C", location: "평택", region: "capital" as const };
  const input = [a, b, capital];
  const fallback = buildRegionalFallback(input)!;
  assert.ok(fallback);
  assert.equal(validateSimulationOrders(input, fallback.orders), null);
  assert.equal(validateRegionalCandidate(input, fallback.orders), null);
  assert.equal(validateCharterGroups(input, fallback.orders, fallback.charterGroups), null);
  assert.ok(fallback.charterGroups.flat().includes("13"));
  assert.equal(buildRegionalFallback([a, { ...a, rowNumber: 14 }]), null);
});
test("Groq 요청 제한, 인증, 서버, 시간 초과와 형식 오류를 구분한다", () => {
  assert.match(groqHttpError(429), /요청 한도/);
  assert.match(groqHttpError(401), /인증/);
  assert.match(groqHttpError(503), /서버 오류/);
  assert.match(groqException(new DOMException("timeout", "TimeoutError")), /시간 초과/);
  assert.match(groqException(new SyntaxError()), /형식/);
});
test("지방안만 재시도하면 기존·일반 AI안과 기존 경로 시각을 유지한다", () => {
  const original = [{ vehicle: "1호차", minutes: 467 }] as SimulationResult["original"];
  const proposed = [{ vehicle: "2호차", minutes: 500 }] as SimulationResult["proposed"];
  const old = { items, original, proposed, remaining: [], charterGroups: [], note: "기존 AI", warnings: [], savedAt: "2026-11-02T00:00:00Z", routeUpdatedAt: "2026-11-02T01:00:00Z" } as SimulationResult;
  const regional = { routes: [], remaining: [], charterGroups: [], note: "새 지방안", savedAt: "2026-11-03T00:00:00Z" };
  const result = replaceRegionalScenario(old, regional, "abc");
  assert.deepEqual(result.original, old.original);
  assert.deepEqual(result.proposed, old.proposed);
  assert.equal(result.savedAt, old.savedAt);
  assert.equal(result.routeUpdatedAt, old.routeUpdatedAt);
  assert.deepEqual(result.regional, regional);
});
test("지방 집중 AI 후보는 두 차량 배정·수도권 제외·택배 유지·알려진 적재 한도를 검사한다", () => {
  const a = { ...item(1, null), customer: "A", location: "김해", region: "regional" as const, regionalGroup: "경상권" };
  const b = { ...item(2, null), customer: "B", location: "창원", region: "regional" as const, regionalGroup: "경상권", lat: 37.05 };
  const capital = { ...item(3, null), region: "capital" as const, regionalGroup: null };
  const courier = { ...item(4, null), region: "regional" as const, regionalGroup: "경상권", transport: "택배" };
  const orders = [{ vehicle: "1호차", ids: ["1"] }, { vehicle: "2호차", ids: ["2"] }];
  assert.equal(validateRegionalCandidate([a, b, capital, courier], orders), null);
  assert.match(validateRegionalCandidate([a, b], [{ ...orders[0], ids: [] }, orders[1]])!, /각각/);
  assert.ok(validateRegionalCandidate([a, b, capital], [{ ...orders[0], ids: ["1", "3"] }, orders[1]]));
  assert.ok(validateRegionalCandidate([a, b, courier], [{ ...orders[0], ids: ["1", "4"] }, orders[1]]));
  assert.ok(validateRegionalCandidate([{ ...a, weight: 4001 }, b], orders));
  assert.equal(validateRegionalCandidate([{ ...a, weight: null, pallets: null }, b], orders), null);
  assert.ok(validateRegionalCandidate([a, { ...b, customer: "A", location: "김해" }], orders));
  assert.ok(validateRegionalCandidate([a, { ...b, lat: a.lat, lng: a.lng }], orders));
});
test("수도권과 지방 분류는 광주 혼동을 피하고 아산을 지방으로 본다", () => {
  assert.equal(simulationRegion("평택", null), "capital");
  assert.equal(simulationRegion("아산", "충청남도 아산시"), "regional");
  assert.equal(simulationRegion("광주", null), "unknown");
  assert.equal(simulationRegion("광주", "경기도 광주시"), "capital");
  assert.equal(simulationRegion("광주", "광주광역시 광산구"), "regional");
});
test("지방 집중안은 수도권 자사 물량을 용차로 전환하고 수도권 배정을 차단한다", () => {
  const scenario = regionalScenarioItems([{ ...item(1, "2호차"), region: "capital" }, { ...item(2, "1호차"), region: "regional", regionalGroup: "경상권" }]);
  assert.equal(scenario[0].vehicle, null);
  assert.match(scenario[0].transport, /용차/);
  assert.ok(validateRegionalOrders(scenario, [{ vehicle: "1호차", ids: ["1"] }, { vehicle: "2호차", ids: ["2"] }]));
  const orders = [{ vehicle: "1호차", ids: ["2"] }, { vehicle: "2호차", ids: [] }];
  assert.equal(validateRegionalOrders(scenario, orders), null);
  assert.equal(validateCharterGroups(scenario, orders, [["1"]]), null);
});
test("권역을 분리하고 적재 초과 원래 자사 물량은 용차로 보낸다", () => {
  assert.equal(regionalGroup("부산", null), "경상권");
  assert.equal(regionalGroup("광주", "광주광역시 북구"), "전라권");
  assert.equal(regionalGroup("광주", null), null);
  const data: SimulationItem[] = [
    { ...item(11, "1호차"), customer: "경상1", region: "regional", regionalGroup: "경상권", pallets: 7 },
    { ...item(12, "1호차"), customer: "경상2", region: "regional", regionalGroup: "경상권", pallets: 3 },
    { ...item(13, "2호차"), customer: "전라", region: "regional", regionalGroup: "전라권", pallets: 6 },
  ];
  const plan = buildRegionalPlan(data);
  assert.equal(validateSimulationOrders(plan.items, plan.orders), null);
  assert.equal(validateRegionalOrders(plan.items, plan.orders), null);
  assert.equal(validateCharterGroups(plan.items, plan.orders, plan.charterGroups), null);
  const assigned = plan.orders.flatMap(order => order.ids);
  assert.equal(assigned.length, 2);
  assert.equal(plan.charterGroups.flat().length, 1);
  assert.ok(plan.charterGroups.flat().some(id => ["11", "12"].includes(id)));
  assert.ok(validateRegionalOrders(plan.items, [{ vehicle: "1호차", ids: ["11", "13"] }, { vehicle: "2호차", ids: [] }]));
});
test("한 권역 초과분과 권역 미확인 물량은 다른 자사 차량에 섞지 않는다", () => {
  const data: SimulationItem[] = [
    { ...item(21, "1호차"), customer: "A", location: "포항", region: "regional", regionalGroup: "경상권", pallets: 7 },
    { ...item(22, "1호차"), customer: "A", location: "포항", region: "regional", regionalGroup: "경상권", pallets: 7 },
    { ...item(23, "1호차"), customer: "B", region: "regional", regionalGroup: null, pallets: 2 },
    { ...item(24, null), customer: "C", region: "regional", regionalGroup: "전라권", transport: "택배", pallets: 1 },
  ];
  const plan = buildRegionalPlan(data);
  assert.deepEqual(plan.orders[0].ids, ["21"]);
  assert.deepEqual(plan.orders[1].ids, []);
  assert.deepEqual(plan.charterGroups.flat().sort(), ["22", "23"]);
  assert.equal(validateCharterGroups(plan.items, plan.orders, plan.charterGroups), null);
});
test("비슷한 방향의 충청 경유지와 경상 납품지는 가배정하되 경상과 전라는 분리한다", () => {
  const east: SimulationItem = { ...item(31, "1호차"), customer: "경상", region: "regional", regionalGroup: "경상권", lat: 35.5, lng: 128.5, pallets: null, weight: null };
  const waypoint: SimulationItem = { ...item(32, "2호차"), customer: "충청", region: "regional", regionalGroup: "충청권", lat: 36.45, lng: 127.95, pallets: 1, weight: 100 };
  const west: SimulationItem = { ...item(33, "2호차"), customer: "전라", region: "regional", regionalGroup: "전라권", lat: 35.2, lng: 126.9, pallets: 1, weight: 100 };
  assert.equal(similarCorridor(east, waypoint), true);
  assert.equal(similarCorridor(east, west), false);
  const plan = buildRegionalPlan([east, waypoint]);
  assert.equal(validateRegionalOrders(plan.items, plan.orders), null);
  const eastRoute = plan.orders.find((order) => order.ids.includes('31'))!;
  assert.ok(eastRoute.ids.includes('32'));
  assert.ok(!eastRoute.ids.includes('33'));
  assert.equal(plan.items.find((row) => row.rowNumber === 31)?.pallets, null);
  const all = buildRegionalPlan([east, waypoint, west]);
  assert.equal(validateRegionalOrders(all.items, all.orders), null);
  assert.notEqual(all.orders.find((order) => order.ids.includes('31')), all.orders.find((order) => order.ids.includes('33')));
});
test("AI 용차 묶음이 누락·중복돼도 보수적 대체 묶음은 남은 용차만 정확히 포함한다", () => {
  const source = [item(1, "1호차"), { ...item(2, null), customer: "A", location: "서울" }, { ...item(3, null), customer: "A", location: "서울" }, { ...item(4, null), customer: "A", location: "" }, { ...item(5, null), customer: "A", location: "" }, { ...item(6, null), transport: "택배" }];
  const orders = [{ vehicle: "1호차", ids: ["1", "2"] }, { vehicle: "2호차", ids: [] }];
  assert.ok(validateCharterGroups(source, orders, [["3", "3"]]));
  const groups = fallbackCharterGroups(source, orders);
  assert.deepEqual(groups, [["3"], ["4"], ["5"]]);
  assert.equal(validateCharterGroups(source, orders, groups), null);
});
test("용차 품목을 자사 차량으로 옮긴 제안을 허용한다", () => assert.equal(validateSimulationOrders(items, [{ vehicle: "1호차", ids: ["1", "3"] }, { vehicle: "2호차", ids: ["2"] }]), null));
test("기존 납품 누락, 중복, 좌표 없는 이동을 차단한다", () => {
  assert.ok(validateSimulationOrders(items, [{ vehicle: "1호차", ids: ["3"] }, { vehicle: "2호차", ids: ["2"] }]));
  assert.ok(validateSimulationOrders(items, [{ vehicle: "1호차", ids: ["1", "3"] }, { vehicle: "2호차", ids: ["2", "3"] }]));
  assert.ok(validateSimulationOrders(items, [{ vehicle: "1호차", ids: ["1", "4"] }, { vehicle: "2호차", ids: ["2"] }]));
});
test("자사 차량에 옮기지 않은 용차 품목은 AI 용차 묶음에 정확히 한 번 포함해야 한다", () => {
  const orders = [{ vehicle: "1호차", ids: ["1", "3"] }, { vehicle: "2호차", ids: ["2"] }];
  assert.equal(validateCharterGroups(items, orders, [["4"]]), null);
  assert.ok(validateCharterGroups(items, orders, []));
  assert.ok(validateCharterGroups(items, orders, [["4"], ["4"]]));
  assert.ok(validateCharterGroups(items, orders, [["3", "4"]]));
  const unrelated = { ...item(5, null), customer: "다른 업체", location: "먼 지역", lat: 35, lng: 129 };
  assert.ok(validateCharterGroups([...items, unrelated], orders, [["4", "5"]]));
  assert.equal(validateCharterGroups([...items, unrelated], orders, [["4"], ["5"]]), null);
});
