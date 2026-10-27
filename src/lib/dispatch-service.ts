import { dispatchRoute, validateShipmentRow } from "@/engine/dispatch";
import type { RouteDispatchResult, VehicleCombination } from "@/engine/types";
import { parseJsonIds } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getDispatchSettings } from "@/lib/settings";

export async function calculateDispatch(dispatchDate: string): Promise<{
  results: RouteDispatchResult[];
  unroutedIssues: ReturnType<typeof validateShipmentRow>;
}> {
  const [shipments, vehicles, settings] = await Promise.all([
    prisma.shipment.findMany({
      where: { deliveryDate: dispatchDate },
      include: { customer: true, product: true, route: true },
      orderBy: [{ routeId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.vehicleType.findMany({
      where: { isActive: true },
      orderBy: { maxWeight: "asc" },
    }),
    getDispatchSettings(),
  ]);

  // 용차/택배 루트는 사내 차량 추천 대상에서 제외하지 않고 결과만 참고용으로 둠
  const vehicleInputs = vehicles.map((vehicle) => ({
    id: vehicle.id,
    vehicleName: vehicle.vehicleName,
    maxWeight: vehicle.maxWeight,
    maxPallet: vehicle.maxPallet,
    baseCost: vehicle.baseCost,
    costPerKm: vehicle.costPerKm,
    isActive: vehicle.isActive,
  }));

  const unroutedIssues: ReturnType<typeof validateShipmentRow> = [];
  const grouped = new Map<
    string,
    {
      routeId: string;
      routeCode: string;
      routeName: string;
      estimatedDistance: number | null;
      preferredVehicleTypeId: string | null;
      weight: number;
      pallet: number;
      customers: Map<
        string,
        { id: string; customerName: string; allowed: string[]; restricted: string[] }
      >;
      issues: ReturnType<typeof validateShipmentRow>;
    }
  >();

  for (const shipment of shipments) {
    const issues = validateShipmentRow({
      id: shipment.id,
      deliveryDate: shipment.deliveryDate,
      customerId: shipment.customerId,
      customerName: shipment.customer.customerName,
      productId: shipment.productId,
      productName: shipment.product.productName,
      quantity: shipment.quantity,
      unitWeight: shipment.unitWeight,
      totalWeight: shipment.totalWeight,
      boxCount: shipment.boxCount,
      palletCount: shipment.palletCount,
      routeId: shipment.routeId,
      routeCode: shipment.route?.routeCode,
    });

    if (!shipment.routeId || !shipment.route) {
      unroutedIssues.push(...issues);
      continue;
    }

    let group = grouped.get(shipment.routeId);
    if (!group) {
      group = {
        routeId: shipment.route.id,
        routeCode: shipment.route.routeCode,
        routeName: shipment.route.routeName,
        estimatedDistance: shipment.route.estimatedDistance,
        preferredVehicleTypeId: shipment.route.preferredVehicleTypeId,
        weight: 0,
        pallet: 0,
        customers: new Map(),
        issues: [],
      };
      grouped.set(shipment.routeId, group);
    }

    if (issues.length > 0) {
      group.issues.push(...issues);
      continue;
    }

    group.weight += shipment.totalWeight ?? 0;
    group.pallet += shipment.palletCount ?? 0;
    if (!group.customers.has(shipment.customer.id)) {
      group.customers.set(shipment.customer.id, {
        id: shipment.customer.id,
        customerName: shipment.customer.customerName,
        allowed: parseJsonIds(shipment.customer.allowedVehicleTypeIds),
        restricted: parseJsonIds(shipment.customer.restrictedVehicleTypeIds),
      });
    }
  }

  const results = [...grouped.values()].map((group) =>
    dispatchRoute({
      dispatchDate,
      routeId: group.routeId,
      routeCode: group.routeCode,
      routeName: group.routeName,
      estimatedDistance: group.estimatedDistance,
      totalWeight: group.weight,
      totalPallet: group.pallet > 0 ? group.pallet : null,
      preferredVehicleTypeId: group.preferredVehicleTypeId,
      customers: [...group.customers.values()].map((customer) => ({
        id: customer.id,
        customerName: customer.customerName,
        allowedVehicleTypeIds: customer.allowed,
        restrictedVehicleTypeIds: customer.restricted,
      })),
      vehicles: vehicleInputs,
      costMethod: settings.costMethod,
      issues: group.issues,
    }),
  );

  return { results, unroutedIssues };
}

export async function saveDispatchResults(
  dispatchDate: string,
  results: RouteDispatchResult[],
  selections?: Record<string, { combination: VehicleCombination; reason?: string }>,
) {
  for (const result of results) {
    const selection = selections?.[result.routeId];
    const selected = selection?.combination ?? result.recommended;
    const manualOverride = Boolean(
      selection &&
        result.recommended &&
        (selection.combination.vehicleTypeId !== result.recommended.vehicleTypeId ||
          selection.combination.vehicleCount !== result.recommended.vehicleCount),
    );

    await prisma.dispatchResult.upsert({
      where: {
        dispatchDate_routeId: { dispatchDate, routeId: result.routeId },
      },
      create: {
        dispatchDate,
        routeId: result.routeId,
        totalWeight: result.totalWeight,
        totalPallet: result.totalPallet ?? null,
        recommendedCombinationJson: JSON.stringify(result.recommended),
        recommendedCost: result.recommended?.estimatedCost ?? null,
        selectedCombinationJson: JSON.stringify(selected),
        selectedCost: selected?.estimatedCost ?? null,
        manualOverride,
        overrideReason: selection?.reason || null,
        recommendationReason: result.error ?? result.reasonLines.join("\n"),
        alternativesJson: JSON.stringify(result.alternatives),
        issuesJson: JSON.stringify(result.issues),
      },
      update: {
        totalWeight: result.totalWeight,
        totalPallet: result.totalPallet ?? null,
        recommendedCombinationJson: JSON.stringify(result.recommended),
        recommendedCost: result.recommended?.estimatedCost ?? null,
        selectedCombinationJson: JSON.stringify(selected),
        selectedCost: selected?.estimatedCost ?? null,
        manualOverride,
        overrideReason: selection?.reason || null,
        recommendationReason: result.error ?? result.reasonLines.join("\n"),
        alternativesJson: JSON.stringify(result.alternatives),
        issuesJson: JSON.stringify(result.issues),
      },
    });

    await prisma.appLog.create({
      data: {
        userAction: "dispatch_calculate",
        routeCode: result.routeCode,
        inputWeight: result.totalWeight,
        recommendation: result.recommended
          ? `${result.recommended.vehicleName} × ${result.recommended.vehicleCount}`
          : null,
        selectedResult: selected ? `${selected.vehicleName} × ${selected.vehicleCount}` : null,
        error: result.error,
      },
    });
  }
}
