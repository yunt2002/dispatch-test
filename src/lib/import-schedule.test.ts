import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedShipment } from "./delivery-excel";
import { replaceExcelSchedule } from "./import-schedule";
import { prisma } from "./prisma";
import { boxLoadingKey, boxLoadingTargetKey } from "./schedule-box-loading";
import { excludePreservedImportRows } from "./schedule-import-rows";

test("당일 엑셀 재등록은 완료·취소와 일치하는 행을 종류별 건수만큼 제외한다", () => {
  const item = {
    deliveryDate: "2026-10-16", customerName: "거래처", productCode: "P1",
    productName: "품목", locationName: "세종", quantity: 100, boxCount: 5,
  };
  const sameDay = [item, item, { ...item, quantity: 200 }];
  assert.deepEqual(excludePreservedImportRows(sameDay, [item, { ...item, deliveryDate: "2026-10-17" }], (row) => row), [
    item, { ...item, quantity: 200 },
  ]);
  const twoPallets = { ...item, palletCount: 2 };
  const threePallets = { ...item, palletCount: 3 };
  assert.deepEqual(excludePreservedImportRows([item, twoPallets, threePallets], [threePallets], (row) => row), [
    item, twoPallets,
  ]);
});

test("시트에 있는 날짜의 엑셀 신청만 교체하고 보존한 납품은 중복 등록하지 않는다", async (t) => {
  const date = "2026-11-25";
  const shipment: NormalizedShipment = {
    rowNumber: 1, deliveryDate: date, customerName: "거래처", location: "세종", productName: "품목",
    productCode: "P1", quantity: 100, boxCount: 10, piecesPerBoxRaw: 10, totalWeight: null,
    logistics: "", staff: "", notes: "", issues: [],
  };
  const base = {
    source: "EXCEL", deliveryDate: date, customerName: shipment.customerName, productName: shipment.productName,
    productCode: shipment.productCode, locationName: shipment.location, quantity: shipment.quantity, boxCount: shipment.boxCount,
  };
  const scope = { source: "EXCEL", deliveryDate: { in: [date] } };
  const tx = {
    scheduleEntry: {
      findMany: t.mock.fn(async (query: { where: typeof scope }) => {
        assert.deepEqual(query.where, scope);
        return [
          { ...base, id: "draft", status: "PLANNED" },
          { ...base, id: "confirmed", status: "CONFIRMED" },
          { ...base, id: "done", status: "DONE" },
          { ...base, id: "cancelled", status: "CANCELLED" },
        ];
      }),
      deleteMany: t.mock.fn(async () => ({ count: 1 })),
      createMany: t.mock.fn(async ({ data }: { data: { palletCount: number | null }[] }) => {
        assert.deepEqual(data.map((row) => row.palletCount), [3]);
        return { count: 1 };
      }),
    },
    appSetting: {
      deleteMany: t.mock.fn(async () => ({ count: 2 })),
      createMany: t.mock.fn(async () => ({ count: 1 })),
    },
  };
  const transaction = t.mock.fn(async (run: (client: typeof tx) => Promise<number>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    return run(tx);
  });
  for (const name of ["vehicleType", "regionMaster", "appSetting"]) {
    Object.defineProperty(prisma, name, { value: { findMany: async () => [] }, configurable: true });
  }
  Object.defineProperty(prisma, "$transaction", { value: transaction, configurable: true });

  assert.equal(await replaceExcelSchedule([]), 0);
  assert.equal(transaction.mock.callCount(), 0);
  const imported = await replaceExcelSchedule([
    shipment, { ...shipment, rowNumber: 2 }, { ...shipment, rowNumber: 3 },
    { ...shipment, rowNumber: 4, quantity: 200, palletCount: 3 },
  ]);
  assert.equal(imported, 1);
  assert.equal(tx.scheduleEntry.findMany.mock.callCount(), 1);
  assert.deepEqual(tx.scheduleEntry.deleteMany.mock.calls[0].arguments, [{ where: { ...scope, status: "PLANNED" } }]);
  assert.deepEqual(tx.appSetting.deleteMany.mock.calls[0].arguments, [{ where: { key: { in: [boxLoadingKey("draft"), boxLoadingTargetKey("draft")] } } }]);
  assert.equal(tx.scheduleEntry.createMany.mock.callCount(), 1);
});
