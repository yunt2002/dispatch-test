import type { VehicleRecommendation } from "./dispatch-group";

export const EXTERNAL_TRANSPORTS = [
  { id: "external:charter", vehicleName: "용차" },
  { id: "external:courier", vehicleName: "택배" },
] as const;

export function externalTransport(id: string | null | undefined): VehicleRecommendation | null {
  const option = EXTERNAL_TRANSPORTS.find((item) => item.id === id);
  return option ? { vehicleTypeId: option.id, vehicleName: option.vehicleName, vehicleCount: 1, maxPallet: null, maxWeight: 0, loadingRate: null, primaryRegionType: option.id === "external:charter" ? "CHARTER" : "COURIER", boxPreferred: false } : null;
}
export function transportFeeKey(entryId: string, vehicleId: string): string {
  return `transport_fee:${encodeURIComponent(entryId)}:${encodeURIComponent(vehicleId)}`;
}

export function parseTransportFee(input: string): string | null {
  const raw = input.replace(/,/g, "").trim();
  if (!raw) return "";
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 1000000000) return null;
  return String(Number(raw));
}
