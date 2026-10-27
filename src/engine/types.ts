export type CostMethod = "fixed" | "distance";

export type VehicleInput = {
  id: string;
  vehicleName: string;
  maxWeight: number;
  maxPallet?: number | null;
  baseCost: number | null;
  costPerKm: number | null;
  isActive: boolean;
};

export type CustomerConstraint = {
  id: string;
  customerName: string;
  allowedVehicleTypeIds: string[];
  restrictedVehicleTypeIds: string[];
};

export type ShipmentRowInput = {
  id?: string;
  deliveryDate: string;
  customerId: string | null;
  customerName?: string | null;
  productId: string | null;
  productName?: string | null;
  quantity: number | null;
  unitWeight: number | null;
  totalWeight: number | null;
  boxCount?: number | null;
  palletCount?: number | null;
  routeId: string | null;
  routeCode?: string | null;
};

export type ValidationIssue = {
  rowId?: string;
  customerName?: string;
  field: string;
  message: string;
};

export type VehicleCombination = {
  vehicleTypeId: string;
  vehicleName: string;
  vehicleCount: number;
  totalCapacity: number;
  totalPalletCapacity?: number | null;
  loadingRate: number;
  estimatedCost: number | null;
  costMissing: boolean;
  ruleViolations: string[];
  bindingConstraint?: "weight" | "pallet" | null;
};

export type RouteDispatchInput = {
  dispatchDate: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  estimatedDistance: number | null;
  totalWeight: number;
  totalPallet?: number | null;
  preferredVehicleTypeId?: string | null;
  customers: CustomerConstraint[];
  vehicles: VehicleInput[];
  costMethod: CostMethod;
  issues: ValidationIssue[];
};

export type RouteDispatchResult = {
  dispatchDate: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  totalWeight: number;
  totalPallet?: number | null;
  combinations: VehicleCombination[];
  recommended: VehicleCombination | null;
  alternatives: VehicleCombination[];
  reasonLines: string[];
  error: string | null;
  issues: ValidationIssue[];
};
