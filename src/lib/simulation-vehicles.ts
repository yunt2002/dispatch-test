import { defaultFuelEconomy } from "./vehicle-fuel-economy";
import type { SimulationItem } from "./simulation";

export type SimulationVehicle = { name: NonNullable<SimulationItem["vehicle"]>; maxPallet: number; maxWeight: number; fuelEconomy: number; carType: number };

export function simulationVehicleName(transport: string): SimulationItem["vehicle"] {
  return /1호\s*차량/.test(transport) ? "1호차" : /2호\s*차량/.test(transport) ? "2호차" : /스타리아/.test(transport) ? "스타리아" : null;
}

/** 기존 1·2호 기준은 유지하고, 유효한 스타리아 DB 설정이 있을 때만 추가한다. */
export function simulationFleet(staria: { maxPallet: number | null; maxWeight: number } | null): SimulationVehicle[] {
  const fleet: SimulationVehicle[] = [
    { name: "1호차", maxPallet: 8, maxWeight: 4000, fuelEconomy: 7.1, carType: 2 },
    { name: "2호차", maxPallet: 8, maxWeight: 3500, fuelEconomy: 7.1, carType: 2 },
  ];
  const fuelEconomy = defaultFuelEconomy("스타리아")?.kmPerLiter;
  if (staria && staria.maxPallet != null && Number.isFinite(staria.maxPallet) && staria.maxPallet > 0 && Number.isFinite(staria.maxWeight) && staria.maxWeight > 0 && fuelEconomy != null && fuelEconomy > 0) {
    fleet.push({ name: "스타리아", maxPallet: staria.maxPallet, maxWeight: staria.maxWeight, fuelEconomy, carType: 1 });
  }
  return fleet;
}

export function simulationVehicleOver(vehicle: SimulationVehicle, pallets: number, weight: number): boolean {
  return pallets > vehicle.maxPallet || weight > vehicle.maxWeight;
}
