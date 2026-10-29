import type { ShipmentWeightSource } from "@/lib/pallet-weight";

export function summarizeVehicleWeight(
  weights: { kg: number | null; source: ShipmentWeightSource }[],
  maxWeight: number | null,
) {
  const kg = weights.reduce((sum, weight) => sum + (weight.kg ?? 0), 0);
  const unknownCount = weights.filter((weight) => weight.kg == null).length;
  const estimatedCount = weights.filter((weight) => weight.source === "fallback-pallets").length;
  return {
    kg,
    unknownCount,
    estimatedCount,
    maxWeight: maxWeight != null && maxWeight > 0 ? maxWeight : null,
    overSingleVehicle: maxWeight != null && maxWeight > 0 && kg > maxWeight,
  };
}
