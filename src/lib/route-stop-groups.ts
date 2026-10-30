export type GroupableRouteStop = {
  id: string;
  consolidateGroupId: string | null;
  customerName: string | null;
  locationName: string;
  vehicleId: string | null;
  lat: number;
  lng: number;
};

/** 묶음 안에서 같은 차량·업체·지역·좌표만 하나의 방문지로 취급한다. */
export function groupRouteStops<T extends GroupableRouteStop>(stops: T[]): { stop: T; memberIds: string[] }[] {
  const groups = new Map<string, T[]>();
  for (const stop of stops) {
    const customer = stop.customerName?.trim().replace(/\s+/g, " ");
    const location = stop.locationName.trim().replace(/\s+/g, " ");
    const key = stop.consolidateGroupId && stop.vehicleId && customer && location
      ? JSON.stringify([stop.consolidateGroupId, stop.vehicleId, customer, location, stop.lat, stop.lng])
      : JSON.stringify(["single", stop.id]);
    const group = groups.get(key);
    if (group) group.push(stop); else groups.set(key, [stop]);
  }
  return [...groups.values()].map((group) => {
    const memberIds = group.map((stop) => stop.id).sort();
    return { stop: group.find((stop) => stop.id === memberIds[0])!, memberIds };
  });
}

/** 방문지 순서를 각 납품 일정 ID의 순서로 펼쳐 저장한다. */
export function expandRouteStopOrder(stopIds: string[], memberIds: string[][] | undefined, order: string[]): string[] {
  const members = new Map(stopIds.map((id, index) => [id, memberIds?.[index] ?? [id]]));
  return order.flatMap((id) => members.get(id) ?? [id]);
}
