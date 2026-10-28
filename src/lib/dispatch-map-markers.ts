import "server-only";

import type { DispatchMapMarker } from "@/components/kakao-map/types";
import {
  matchDeliveryCustomer,
  resolveCustomerAddress,
} from "@/lib/delivery-customers";
import { geocodeAddress } from "@/lib/geocoding";
import { prisma } from "@/lib/prisma";

type EntryLike = {
  id: string;
  locationName: string;
  customerName: string | null;
};

/**
 * 일정 행 → 지도 마커.
 * 주소는 납품 root 고객 주소 → DB 거래처 → 지역명 순으로 Geocoding.
 */
export async function buildDispatchMapMarkers(
  entries: EntryLike[],
): Promise<DispatchMapMarker[]> {
  if (!entries.length) return [];

  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: { customerName: true, address: true },
  });
  const addressByName = new Map(
    customers
      .filter((c) => c.address?.trim())
      .map((c) => [c.customerName.trim(), c.address!.trim()] as const),
  );

  const queryCache = new Map<string, Awaited<ReturnType<typeof geocodeAddress>>>();

  async function resolve(query: string) {
    const key = query.trim();
    if (!key) return null;
    if (queryCache.has(key)) return queryCache.get(key) ?? null;
    const point = await geocodeAddress(key);
    queryCache.set(key, point);
    return point;
  }

  const markers: DispatchMapMarker[] = [];

  for (const entry of entries) {
    const customerName = entry.customerName?.trim() || "";
    const locationName = entry.locationName?.trim() || "";
    const rootCustomer = matchDeliveryCustomer(customerName);
    const rootAddress = resolveCustomerAddress(customerName);
    const dbAddress = customerName ? addressByName.get(customerName) : undefined;
    const customerAddress = rootAddress || dbAddress;
    const locationHint = rootCustomer?.locationHint || locationName;

    const queries = [
      customerAddress,
      customerName && locationHint ? `${locationHint} ${customerName}` : "",
      locationHint,
      locationName,
      customerName,
    ].filter((q): q is string => Boolean(q && q.trim()));

    let point = null;
    for (const query of queries) {
      point = await resolve(query);
      if (point) break;
    }
    if (!point) continue;

    markers.push({
      id: entry.id,
      title: rootCustomer?.name || customerName || locationName || "납품지",
      subtitle:
        [locationHint || locationName, customerAddress].filter(Boolean).join(" · ") ||
        undefined,
      lat: point.lat,
      lng: point.lng,
    });
  }

  return markers;
}
