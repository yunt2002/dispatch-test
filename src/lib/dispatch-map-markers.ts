import "server-only";

import type { DispatchMapMarker } from "@/components/kakao-map/types";
import { extractNoteAddress } from "@/lib/excel-day-register";
import {
  matchDeliveryCustomer,
  resolveCustomerAddress,
} from "@/lib/delivery-customers";
import { geocodeAddresses } from "@/lib/geocoding";
import { prisma } from "@/lib/prisma";

type EntryLike = {
  id: string;
  locationName: string;
  customerName: string | null;
  notes?: string | null;
};

export async function loadDispatchCustomerAddresses(): Promise<Map<string, string>> {
  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: { customerName: true, address: true },
  });
  return new Map(
    customers
      .filter((customer) => customer.address?.trim())
      .map((customer) => [customer.customerName.trim(), customer.address!.trim()] as const),
  );
}

/**
 * 일정 행 → 지도 마커.
 * 주소는 엑셀 비고/메모 주소 → 납품 root 고객 주소 → DB 거래처 → 지역명 순으로 Geocoding.
 */
export async function buildDispatchMapMarkers(
  entries: EntryLike[],
): Promise<DispatchMapMarker[]> {
  if (!entries.length) return [];

  const addressByName = await loadDispatchCustomerAddresses();

  const plans = entries.map((entry) => {
    const customerName = entry.customerName?.trim() || "";
    const locationName = entry.locationName?.trim() || "";
    const noteAddress = extractNoteAddress(entry.notes);
    const rootCustomer = matchDeliveryCustomer(customerName);
    const rootAddress = resolveCustomerAddress(customerName);
    const dbAddress = customerName ? addressByName.get(customerName) : undefined;
    const customerAddress = noteAddress || rootAddress || dbAddress;
    const locationHint = rootCustomer?.locationHint || locationName;
    const queries = [
      noteAddress,
      rootAddress,
      dbAddress,
      customerName && locationHint ? `${locationHint} ${customerName}` : "",
      locationHint,
      locationName,
      customerName,
    ].filter((q): q is string => Boolean(q && q.trim()));
    return { entry, customerName, locationName, rootCustomer, customerAddress, locationHint, queries };
  });

  const points = await geocodeAddresses(plans.flatMap((plan) => plan.queries));
  const markers: DispatchMapMarker[] = [];

  for (const plan of plans) {
    let point: { lat: number; lng: number } | null = null;
    for (const query of plan.queries) {
      const hit = points.get(query.trim().replace(/\s+/g, " "));
      if (hit) {
        point = hit;
        break;
      }
    }
    if (!point) continue;
    const { entry, customerName, locationName, rootCustomer, customerAddress, locationHint } = plan;

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
