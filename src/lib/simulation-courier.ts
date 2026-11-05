import type { SimulationItem } from "./simulation";

export type CourierMode = "box" | "pallet";
export type CourierChoice = { mode: CourierMode; quantity?: number };

/** 운송 방식에 명시된 단위만 자동 판별한다. 제품별 추정 PLT만으로 실제 출고 단위를 확정하지 않는다. */
export function courierCost(item: Pick<SimulationItem, "transport" | "boxes" | "pallets">, choice?: CourierChoice) {
  const text = item.transport.toLowerCase();
  const pallet = /파렛트|팔레트|pallet|\bplt\b/i.test(text);
  const box = /박스|\bbox\b/i.test(text);
  const mode = choice?.mode ?? (pallet !== box ? (pallet ? "pallet" : "box") : null);
  if (!mode) return null;
  const quantity = choice?.quantity ?? (mode === "box" ? item.boxes : item.pallets);
  if (quantity == null || !Number.isSafeInteger(quantity) || quantity < 0 || (quantity === 0 && !(mode === "pallet" && choice?.quantity === 0))) return null;
  return { mode, quantity, amount: quantity * (mode === "box" ? 7000 : 50000) };
}

export function courierTotal(items: SimulationItem[], choices: Record<string, CourierChoice>) {
  let total = 0;
  for (const item of items) {
    const cost = courierCost(item, choices[String(item.rowNumber)]);
    if (!cost || !Number.isSafeInteger(total + cost.amount)) return null;
    total += cost.amount;
  }
  return total;
}

/** 택배비는 두 안이 모두 확인된 경우에만 양쪽에 포함한다. */
export function comparableCourierCosts(original: number | null, proposed: number | null) {
  if (original == null || proposed == null) return { included: false, original: 0, proposed: 0 };
  return { included: true, original, proposed };
}
