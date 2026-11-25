import { scheduleEntryMatchKey } from "@/lib/apply-simulation-plan";

type ImportRow = Parameters<typeof scheduleEntryMatchKey>[0] & { deliveryDate: string };

export const scheduleImportMatchSelect = {
  deliveryDate: true,
  customerName: true,
  productName: true,
  productCode: true,
  locationName: true,
  quantity: true,
  boxCount: true,
} as const;

/** 보존한 일정 한 건당 엑셀의 동일 행 한 건을 제외한다. */
export function excludePreservedImportRows<T>(
  rows: T[],
  preservedRows: ImportRow[],
  getRow: (value: T) => ImportRow,
): T[] {
  const keyFor = (row: ImportRow) => JSON.stringify([row.deliveryDate, scheduleEntryMatchKey(row)]);
  const counts = new Map<string, number>();
  for (const row of preservedRows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.filter((row) => {
    const key = keyFor(getRow(row));
    const count = counts.get(key) ?? 0;
    if (!count) return true;
    counts.set(key, count - 1);
    return false;
  });
}
