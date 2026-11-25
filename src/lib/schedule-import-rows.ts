import { scheduleEntryMatchKey } from "@/lib/apply-simulation-plan";

type ImportRow = Parameters<typeof scheduleEntryMatchKey>[0] & { deliveryDate: string; palletCount?: number | null };

export const scheduleImportMatchSelect = {
  deliveryDate: true,
  customerName: true,
  productName: true,
  productCode: true,
  locationName: true,
  quantity: true,
  boxCount: true,
  palletCount: true,
} as const;

/** 보존한 일정 한 건당 엑셀의 동일 행 한 건을 제외한다. */
export function excludePreservedImportRows<T>(
  rows: T[],
  preservedRows: ImportRow[],
  getRow: (value: T, index: number) => ImportRow,
): T[] {
  const keyFor = (row: ImportRow) => JSON.stringify([row.deliveryDate, scheduleEntryMatchKey(row)]);
  const counts = new Map<string, { total: number; byPallet: Map<number | null, number> }>();
  for (const row of preservedRows) {
    const key = keyFor(row);
    const bucket = counts.get(key) ?? { total: 0, byPallet: new Map() };
    const pallet = row.palletCount ?? null;
    bucket.total++;
    bucket.byPallet.set(pallet, (bucket.byPallet.get(pallet) ?? 0) + 1);
    counts.set(key, bucket);
  }

  const matches = rows.map((value, index) => {
    const row = getRow(value, index);
    return { bucket: counts.get(keyFor(row)), pallet: row.palletCount };
  });
  const exact = matches.map(({ bucket, pallet }) => {
    if (!bucket || pallet === undefined) return false;
    const count = bucket.byPallet.get(pallet) ?? 0;
    if (!count) return false;
    bucket.byPallet.set(pallet, count - 1);
    bucket.total--;
    return true;
  });
  return rows.filter((_, index) => {
    if (exact[index]) return false;
    const { bucket, pallet } = matches[index];
    if (!bucket?.total || pallet !== undefined) return true;
    bucket.total--;
    return false;
  });
}
