"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bool, num, optionalText, text } from "@/lib/form";
import { prisma } from "@/lib/prisma";

function routePath(id?: string | null, error?: string) {
  if (error) {
    return id
      ? `/routes?edit=${id}&error=${encodeURIComponent(error)}`
      : `/routes?error=${encodeURIComponent(error)}`;
  }
  return "/routes";
}

export async function upsertRoute(formData: FormData) {
  const id = optionalText(formData, "id");
  const routeCode = text(formData, "routeCode");
  const routeName = text(formData, "routeName");
  if (!routeCode || !routeName) {
    redirect(routePath(id, "루트코드와 루트명은 필수입니다."));
  }

  const data = {
    routeCode,
    routeName,
    description: optionalText(formData, "description"),
    estimatedDistance: num(formData, "estimatedDistance"),
    estimatedTime: num(formData, "estimatedTime"),
    isActive: bool(formData, "isActive"),
  };

  try {
    if (id) {
      await prisma.route.update({ where: { id }, data });
    } else {
      await prisma.route.create({ data });
    }
  } catch {
    redirect(routePath(id, "루트코드가 이미 있거나 저장에 실패했습니다."));
  }
  revalidatePath("/routes");
  redirect("/routes");
}

export async function deleteRoute(formData: FormData) {
  const id = text(formData, "id");
  const used = await prisma.shipment.count({ where: { routeId: id } });
  if (used > 0) {
    redirect("/routes?error=" + encodeURIComponent("출하 데이터가 있는 루트는 삭제할 수 없습니다."));
  }
  await prisma.route.delete({ where: { id } });
  revalidatePath("/routes");
  redirect("/routes");
}

export async function addRouteStop(formData: FormData) {
  const routeId = text(formData, "routeId");
  const customerId = text(formData, "customerId");
  const visitOrder = num(formData, "visitOrder") ?? 1;
  if (!routeId || !customerId) {
    redirect(routePath(routeId, "거래처를 선택하세요."));
  }
  try {
    await prisma.routeCustomer.create({ data: { routeId, customerId, visitOrder } });
  } catch {
    redirect(routePath(routeId, "이미 연결된 거래처입니다."));
  }
  revalidatePath("/routes");
  redirect(`/routes?edit=${routeId}`);
}

export async function removeRouteStop(formData: FormData) {
  const id = text(formData, "id");
  const routeId = text(formData, "routeId");
  await prisma.routeCustomer.delete({ where: { id } });
  revalidatePath("/routes");
  redirect(`/routes?edit=${routeId}`);
}
