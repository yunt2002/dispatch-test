import type { SimulationRoute } from "./simulation";

/** 같은 거래처·주소는 한 방문으로 계산한다. 미확인 주소는 행별로 보수적으로 계산한다. */
export function simulationTime(route: SimulationRoute) {
  if (!route.items.length) return { driving: 0, lunch: 0, unloading: 0, total: 0, stops: 0 };
  const stops = new Map<string, string>();
  for (const item of route.items) {
    const customer = item.customer.trim().replace(/\s+/g, " ");
    const address = item.address?.trim().replace(/\s+/g, " ");
    const key = customer && address ? JSON.stringify([customer, address]) : `row:${item.rowNumber}`;
    stops.set(key, customer);
  }
  const unloading = [...stops.values()].reduce((sum, name) => sum + (/현담\s*산업/.test(name) ? 180 : 40), 0);
  const lunch = 60;
  return { driving: route.minutes, lunch, unloading, total: route.minutes == null ? null : route.minutes + lunch + unloading, stops: stops.size };
}
