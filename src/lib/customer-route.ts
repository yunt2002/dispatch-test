import { regionTypeLabel } from "@/lib/labels";

export type RegionOption = { locationName: string; regionType: string };
export type RouteOption = { id: string; routeCode: string; routeName: string };

export function matchRegionType(address: string, regions: RegionOption[]): string {
  const text = address.trim();
  if (!text) return "UNKNOWN";
  const exact = regions.find((region) => region.locationName === text);
  if (exact) return exact.regionType;
  const contained = regions.find(
    (region) => text.includes(region.locationName) || region.locationName.includes(text),
  );
  return contained?.regionType ?? "UNKNOWN";
}

export function routeCodeFor(regionType: string, emergency: boolean): string {
  if (emergency) return "R-EXPRESS";
  if (regionType === "LOCAL") return "R-LOCAL";
  if (regionType === "METROPOLITAN") return "R-CAPITAL";
  if (regionType === "CHARTER") return "R-CHARTER";
  if (regionType === "COURIER") return "R-COURIER";
  if (regionType === "EMERGENCY") return "R-EXPRESS";
  return "R-OTHER";
}

export function describeCustomerRoute(
  address: string,
  emergency: boolean,
  regions: RegionOption[],
  routes: RouteOption[],
): { regionType: string; route: RouteOption | null; label: string } {
  const regionType = emergency ? "EMERGENCY" : matchRegionType(address, regions);
  const code = routeCodeFor(regionType, emergency);
  const route = routes.find((item) => item.routeCode === code) ?? null;
  const label = route
    ? `${regionTypeLabel(regionType)} · ${route.routeName}`
    : regionTypeLabel(regionType);
  return { regionType, route, label };
}
