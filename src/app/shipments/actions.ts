"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { computeTotalWeight } from "@/engine/dispatch";
import { num, optionalText, text } from "@/lib/form";
import { prisma } from "@/lib/prisma";

function shipmentsRedirect(date: string, error?: string, ok?: string): never {
  const q = new URLSearchParams();
  if (date) q.set("date", date);
  if (error) q.set("error", error);
  if (ok) q.set("ok", ok);
  redirect(`/shipments?${q.toString()}`);
}

export async function upsertShipment(formData: FormData) {
  const id = optionalText(formData, "id");
  const deliveryDate = text(formData, "deliveryDate");
  const customerId = text(formData, "customerId");
  const productId = text(formData, "productId");
  const quantity = num(formData, "quantity");
  const unitWeight = num(formData, "unitWeight");
  const boxCount = num(formData, "boxCount");
  const piecesPerBox = num(formData, "piecesPerBox");
  const palletCount = num(formData, "palletCount");
  const routeId = optionalText(formData, "routeId");

  if (!deliveryDate) {
    shipmentsRedirect("", "배송일을 선택하세요.");
  }
  if (!customerId) {
    shipmentsRedirect(deliveryDate, "거래처를 선택하세요.");
  }
  if (!productId) {
    shipmentsRedirect(deliveryDate, "제품을 선택하세요.");
  }
  if (quantity == null || quantity <= 0) {
    shipmentsRedirect(deliveryDate, "출하 수량은 0보다 큰 숫자여야 합니다.");
  }
  if (
    (unitWeight == null || unitWeight <= 0) &&
    (boxCount == null || boxCount <= 0) &&
    (palletCount == null || palletCount <= 0)
  ) {
    shipmentsRedirect(
      deliveryDate,
      "단위 중량·박스수량·PLT 중 하나 이상 입력하세요. (납품일정표는 박스수량)",
    );
  }
  if (!routeId) {
    shipmentsRedirect(
      deliveryDate,
      "배송 루트를 선택하세요. 루트가 없으면 배차 계산에서 제외됩니다.",
    );
  }

  const qty = quantity as number;
  const route = routeId as string;

  const [customerRow, productRow, routeRow] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.route.findUnique({ where: { id: route } }),
  ]);

  if (!customerRow) {
    shipmentsRedirect(deliveryDate, "선택한 거래처를 찾을 수 없습니다. 다시 선택하세요.");
  }
  if (!productRow) {
    shipmentsRedirect(deliveryDate, "선택한 제품을 찾을 수 없습니다. 다시 선택하세요.");
  }
  if (!routeRow) {
    shipmentsRedirect(deliveryDate, "선택한 배송 루트를 찾을 수 없습니다. 다시 선택하세요.");
  }

  const totalWeight = computeTotalWeight(qty, unitWeight);
  const data = {
    deliveryDate,
    customerId,
    productId,
    quantity: qty,
    unitWeight,
    totalWeight,
    boxCount,
    piecesPerBox,
    palletCount,
    routeId: route,
    actualLogistics: optionalText(formData, "actualLogistics"),
    dueDate: optionalText(formData, "dueDate"),
    notes: optionalText(formData, "notes"),
  };

  if (id) {
    await prisma.shipment.update({ where: { id }, data });
  } else {
    await prisma.shipment.create({ data });
  }
  revalidatePath("/shipments");
  revalidatePath("/");
  revalidatePath("/dispatch");
  shipmentsRedirect(deliveryDate, undefined, id ? "출하를 수정했습니다." : "출하를 등록했습니다.");
}

export async function deleteShipment(formData: FormData) {
  const id = text(formData, "id");
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) {
    shipmentsRedirect("", "이미 삭제됐거나 없는 출하입니다.");
  }
  await prisma.shipment.delete({ where: { id } });
  revalidatePath("/shipments");
  revalidatePath("/");
  revalidatePath("/dispatch");
  shipmentsRedirect(shipment.deliveryDate, undefined, "출하를 삭제했습니다.");
}
