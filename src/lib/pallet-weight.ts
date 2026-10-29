/**
 * 제품 정리 시트 기준 중량.
 * - BOX별 중량(g) × 박스수 → kg (우선)
 * - PLT 무게(kg)는 시트에 박스·파렛트 포함 → 가산 없음
 * - 시트 없이 설정 기본 kg/PLT만 쓸 때만 포장 여유(+8kg) 가산
 */

export const PALLET_TARE_KG = 8;

export type ShipmentWeightSource = "boxes" | "pallets" | "fallback-pallets" | null;

/** 시트 PLT kg는 그대로, 잠정 기본값만 포장 여유 가산 */
export function effectiveKgPerPallet(
  sheetKg: number | null | undefined,
  fallbackKg: number | null | undefined,
): number | null {
  if (sheetKg != null && sheetKg > 0) return sheetKg;
  if (fallbackKg != null && fallbackKg > 0) return fallbackKg + PALLET_TARE_KG;
  return null;
}

export function formatKgPerPalletLabel(
  kg: number,
  opts?: { fromSheet?: boolean },
): string {
  if (opts?.fromSheet) return `${kg}kg/PLT (시트·포장포함)`;
  return `${kg}kg/PLT (잠정 ${kg - PALLET_TARE_KG}+포장 ${PALLET_TARE_KG})`;
}

/** 출고 중량(kg). 박스별 중량이 있으면 박스 기준으로 정확히 계산. */
export function computeShipmentWeightKg(input: {
  boxCount?: number | null;
  palletCount?: number | null;
  boxWeightG?: number | null;
  kgPerPallet?: number | null;
  fallbackKgPerPallet?: number | null;
}): { kg: number | null; source: ShipmentWeightSource; detail: string | null } {
  const boxes = input.boxCount != null && input.boxCount > 0 ? input.boxCount : null;
  const boxG = input.boxWeightG != null && input.boxWeightG > 0 ? input.boxWeightG : null;

  if (boxes != null && boxG != null) {
    const kg = Math.round(((boxes * boxG) / 1000) * 1000) / 1000;
    return {
      kg,
      source: "boxes",
      detail: `${boxes}박스 × ${(boxG / 1000).toFixed(boxG % 1000 === 0 ? 0 : 3)}kg = ${kg}kg`,
    };
  }

  const pallets = input.palletCount != null && input.palletCount > 0 ? input.palletCount : null;
  if (pallets != null) {
    if (input.kgPerPallet != null && input.kgPerPallet > 0) {
      const kg = pallets * input.kgPerPallet;
      return {
        kg,
        source: "pallets",
        detail: `PLT ${pallets} · ${formatKgPerPalletLabel(input.kgPerPallet, { fromSheet: true })}`,
      };
    }
    if (input.fallbackKgPerPallet != null && input.fallbackKgPerPallet > 0) {
      const per = input.fallbackKgPerPallet + PALLET_TARE_KG;
      const kg = pallets * per;
      return {
        kg,
        source: "fallback-pallets",
        detail: `PLT ${pallets} · ${formatKgPerPalletLabel(per)}`,
      };
    }
  }

  return { kg: null, source: null, detail: null };
}
