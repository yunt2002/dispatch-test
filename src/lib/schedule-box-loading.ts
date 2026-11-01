export type BoxLoadingMode = "unknown" | "shared" | "loose" | "pallet";
export const boxLoadingKey = (id: string) => `schedule_box_loading:${id}`;
export function capacityUnits(pallet: number | null | undefined, boxCount: number | null | undefined): number {
  if (boxCount != null && pallet == null) return 0;
  return pallet != null && pallet >= 0 ? pallet : 0;
}
export function isBoxLoadingMode(value: unknown): value is BoxLoadingMode {
  return value === "unknown" || value === "shared" || value === "loose" || value === "pallet";
}
export function boxLoadingPallets(mode: BoxLoadingMode, value: string): number | null {
  if (mode !== "pallet") return 0;
  const amount = Number(value);
  return value.trim() && Number.isInteger(amount) && amount > 0 ? amount : null;
}
export function boxLoadingLabel(mode: BoxLoadingMode | null): string {
  return mode === "shared" ? "기존 PLT 합적" : mode === "loose" ? "별도 박스 적재" : mode === "pallet" ? "별도 PLT 사용" : "적재 방식 확인 필요";
}
