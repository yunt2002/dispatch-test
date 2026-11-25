import { createHash } from "node:crypto";
import type { VehicleRecommendation } from "@/lib/dispatch-group";
import { DEFAULT_DEPOT } from "@/lib/depot";
import { matchDeliveryCustomer, resolveCustomerAddress } from "@/lib/delivery-customers";
import { extractNoteAddress } from "@/lib/excel-day-register";
import { parseJson } from "@/lib/format";

export type RouteInputSignatures = { current: string; legacy: string };
export const ROUTE_INPUT_SIGNATURE_PREFIX = "v3:";
type RouteInputEntry = {
  id: string;
  updatedAt: Date;
  createdAt: Date;
  visitOrder: number | null;
  consolidateGroupId: string | null;
  customerName: string | null;
  locationName: string;
  notes: string | null;
  selectedVehicleJson: string | null;
  recommendedVehicleJson: string | null;
};
type RouteInputVehicle = {
  id: string;
  updatedAt: Date;
  isActive: boolean;
  vehicleName: string;
  maxPallet: number | null;
  maxWeight: number | null;
};

export function routeAssignedVehicleId(entry: Pick<RouteInputEntry, "selectedVehicleJson" | "recommendedVehicleJson">): string | null {
  const vehicle = parseJson<VehicleRecommendation | null>(entry.selectedVehicleJson, null) ??
    parseJson<VehicleRecommendation | null>(entry.recommendedVehicleJson, null);
  return vehicle?.vehicleTypeId ?? null;
}

export function buildRouteInputSignatures(
  entries: RouteInputEntry[],
  vehicles: RouteInputVehicle[],
  addressByName: ReadonlyMap<string, string>,
): RouteInputSignatures {
  const stops = entries.map((entry) => {
    const customer = entry.customerName?.trim() || "";
    return {
      id: entry.id,
      customer,
      location: entry.locationName.trim(),
      addresses: [extractNoteAddress(entry.notes), resolveCustomerAddress(customer) ?? null, addressByName.get(customer) ?? null],
      locationHint: matchDeliveryCustomer(customer)?.locationHint ?? null,
      vehicleId: routeAssignedVehicleId(entry),
      groupId: entry.consolidateGroupId,
      order: entry.visitOrder,
      createdAt: entry.createdAt,
    };
  });
  const assignedIds = new Set(stops.map((stop) => stop.vehicleId));
  const fleet = vehicles.filter((vehicle) => vehicle.isActive && assignedIds.has(vehicle.id))
    .map(({ id, vehicleName, maxPallet, maxWeight }) => ({ id, vehicleName, maxPallet, maxWeight }));

  // 범위는 호출자가 제한한다. 같은 묶음의 확정→완료는 경로 입력을 바꾸지 않는다.
  const current = ROUTE_INPUT_SIGNATURE_PREFIX + createHash("sha256")
    .update(JSON.stringify({ depot: DEFAULT_DEPOT, stops, fleet })).digest("hex");
  const legacy = createHash("sha256").update(JSON.stringify({
    version: 2,
    entries: entries.map(({ id, updatedAt }) => ({ id, updatedAt })),
    vehicles: vehicles.map(({ id, updatedAt }) => ({ id, updatedAt })),
  })).digest("hex");
  return { current, legacy };
}
