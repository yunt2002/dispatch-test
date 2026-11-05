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

/** 운행 차량별 시간을 합산하며 한 차량이라도 운전 시간이 미확인이면 비교하지 않는다. */
export function simulationTimeTotals(routes: SimulationRoute[]) {
  const parts = routes.map(simulationTime);
  if (parts.some((part) => part.driving == null)) return null;
  const driving = parts.reduce((sum, part) => sum + (part.driving ?? 0), 0);
  const lunch = parts.reduce((sum, part) => sum + part.lunch, 0);
  const unloading = parts.reduce((sum, part) => sum + part.unloading, 0);
  return { driving, lunch, unloading, total: driving + lunch + unloading };
}
