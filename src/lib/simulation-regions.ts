import type { SimulationItem } from "./simulation";

export type SimulationRegion = "capital" | "regional" | "unknown";

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
  return items.some((item) => item.region !== "regional" && assigned.has(String(item.rowNumber)))
    ? "지방이 아닌 물량은 지방 집중안의 자사 차량에 배정할 수 없습니다." : null;
}
