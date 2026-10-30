import type { PackingMode } from "./simulation";

export function packingPallets(boxes: number | null, boxesPerPallet: number | null | undefined, mode: PackingMode): number | null {
  if (boxes == null || !Number.isFinite(boxes) || boxes <= 0) return null;
  if (mode === "shared" || mode === "loose") return 0;
  if (mode === "pallet" && boxesPerPallet != null && Number.isFinite(boxesPerPallet) && boxesPerPallet > 0) return Math.ceil(Math.ceil(boxes) / boxesPerPallet);
  return null;
}

export function isPackingMode(value: unknown): value is PackingMode {
  return value === "unknown" || value === "shared" || value === "loose" || value === "pallet";
}
