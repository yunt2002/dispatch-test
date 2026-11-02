import { fallbackCharterGroups, type SimulationItem } from "./simulation";

export type SimulationRegion = "capital" | "regional" | "unknown";

/** 한 차량에 함께 실을 수 있는 넓은 권역. 불명확하면 추측하지 않는다. */
export function regionalGroup(location: string, address: string | null): string | null {
  const value = (address?.trim() || location.trim()).replace(/\s+/g, "");
  if (/^(경상|경북|경남|부산|대구|울산|울주|창원|김해|진해|거창|포항|경주|구미)/.test(value)) return "경상권";
  if (/^(전라|전북|전남|광주광역시|광주광역|완주|전주|군산|익산|여수|순천|광산|목포)/.test(value)) return "전라권";
  if (/^(충청|충북|충남|대전|세종|아산|서산|천안|청주|충주)/.test(value)) return "충청권";
  if (/^강원/.test(value)) return "강원권";
  if (/^제주/.test(value)) return "제주권";
  return null;
}

/** 주소를 우선하며, 광주처럼 이름이 겹치는 지역은 주소 없이는 판정하지 않는다. */
export function simulationRegion(location: string, address: string | null): SimulationRegion {
  const a = (address ?? "").trim();
  if (/^(서울|인천|경기)/.test(a)) return "capital";
  if (/^(부산|대구|광주광역시|광주 광역시|대전|울산|세종|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/.test(a)) return "regional";
  const l = location.trim().replace(/\s/g, "");
  if (/^(서울|인천|경기|수원|성남|용인|고양|부천|안산|안양|남양주|화성|평택|시흥|파주|김포|광명|군포|오산|이천|안성|의왕|하남|의정부|양주|포천|구리|과천|동두천|가평|양평|연천)(시|군|구)?$/.test(l)) return "capital";
  if (/^(아산|서산|세종|천안|청주|충주|대전|대구|부산|울산|울주|창원|김해|진해|거창|완주|전주|군산|익산|여수|순천|광산|목포|포항|경주|구미|제주)(시|군|구|항)?$/.test(l)) return "regional";
  return "unknown";
}

export function regionalScenarioItems(items: SimulationItem[]): SimulationItem[] {
  return items.map((item) => item.region === "capital" && item.vehicle
    ? { ...item, vehicle: null, transport: "용차 (기존 자사 차량)" }
    : item);
}

export function validateRegionalOrders(items: SimulationItem[], orders: { vehicle: string; ids: string[] }[]): string | null {
  const assigned = new Set(orders.flatMap((order) => order.ids));
  if (items.some((item) => item.region !== "regional" && assigned.has(String(item.rowNumber)))) return "지방이 아닌 물량은 지방 집중안의 자사 차량에 배정할 수 없습니다.";
  const used = new Set<string>();
  for (const order of orders) {
    const groups = new Set(order.ids.map((id) => items.find((item) => String(item.rowNumber) === id)?.regionalGroup ?? null));
    if (groups.has(null)) return "배정된 납품지의 세부 권역을 확인해 주세요.";
    if (groups.size > 1) return "한 차량에 서로 다른 지방 권역을 배정할 수 없습니다.";
    for (const group of groups) {
      if (group && used.has(group)) return "같은 지방 권역을 여러 자사 차량에 나누지 않습니다. 초과 물량은 용차를 확인하세요.";
      if (group) used.add(group);
    }
  }
  return null;
}

/** 품목을 쪼개지 않고 권역별 한 대에 배정하며, 남은 자사 물량은 용차로 전환한다. */
export function buildRegionalPlan(input: SimulationItem[]) {
  const items = input.map((item) => item.vehicle && item.region !== "unknown"
    ? { ...item, transport: "용차 (기존 자사 차량)", vehicle: null } : { ...item });
  const candidates = items.filter((item) => item.region === "regional" && item.regionalGroup && item.lat != null && item.lng != null && item.pallets != null && Number.isFinite(item.pallets) && item.pallets >= 0 && item.weight != null && Number.isFinite(item.weight) && item.weight >= 0 && /용차/.test(item.transport));
  const groups = [...new Set(candidates.map((item) => item.regionalGroup!))];
  type Order = { vehicle: string; ids: string[] };
  let best: { orders: Order[]; score: number } | null = null;
  const choices: (string | null)[] = [null, ...groups];
  for (const first of choices) for (const second of choices) {
    if (first && first === second) continue;
    const orders: Order[] = ["1호차", "2호차"].map((vehicle, i) => {
      const group = i === 0 ? first : second;
      let pallets = 0, weight = 0;
      const ids: string[] = [];
      const choices = candidates.filter((item) => item.regionalGroup === group).sort((a, b) => Number(/기존 자사/.test(b.transport)) - Number(/기존 자사/.test(a.transport)) || a.rowNumber - b.rowNumber);
      for (const item of choices) {
        if (pallets + item.pallets! <= 8 && weight + item.weight! <= (i === 0 ? 4000 : 3500)) {
          pallets += item.pallets!; weight += item.weight!; ids.push(String(item.rowNumber));
        }
      }
      return { vehicle, ids };
    });
    const selected = orders.flatMap((o) => o.ids).map((id) => items.find((item) => String(item.rowNumber) === id)!);
    const score = selected.reduce((sum, item) => sum + (/기존 자사/.test(item.transport) ? 100000 : 1000) + (item.pallets ?? 0), 0) + (orders[0].ids.length ? 0.01 : 0);
    if (!best || score > best.score) best = { orders, score };
  }
  const orders = best!.orders;
  // 초과한 기존 자사 품목은 용차 적재 정보가 없어 각 품목을 별도 운행으로 보수적으로 가정한다.
  const charterGroups = fallbackCharterGroups(items, orders).flatMap((group) =>
    group.some((id) => /기존 자사/.test(items.find((item) => String(item.rowNumber) === id)?.transport ?? ""))
      ? group.map((id) => [id]) : [group]);
  return { items, orders, charterGroups };
}
