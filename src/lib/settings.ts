import { prisma } from "@/lib/prisma";

export type CostMethod = "fixed" | "distance";

export type DispatchSettings = {
  costMethod: CostMethod;
  /** 1PLT당 kg. 현장 기준 600kg/PLT. */
  kgPerPallet: number;
  kgPerPalletConfirmed: boolean;
};

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = {
  costMethod: "fixed",
  kgPerPallet: 600,
  kgPerPalletConfirmed: true,
};

export async function getDispatchSettings(): Promise<DispatchSettings> {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: { in: ["cost_method", "kg_per_pallet", "kg_per_pallet_confirmed"] },
    },
  });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const kg = Number(map.kg_per_pallet);
  return {
    costMethod: map.cost_method === "distance" ? "distance" : "fixed",
    kgPerPallet: Number.isFinite(kg) && kg > 0 ? kg : DEFAULT_DISPATCH_SETTINGS.kgPerPallet,
    kgPerPalletConfirmed: map.kg_per_pallet_confirmed === "true",
  };
}
