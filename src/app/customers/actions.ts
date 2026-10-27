"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describeCustomerRoute } from "@/lib/customer-route";
import { customerCodeFromName } from "@/lib/delivery-excel";
import { bool, optionalText, text } from "@/lib/form";
import { prisma } from "@/lib/prisma";

export async function upsertCustomer(formData: FormData) {
  const id = optionalText(formData, "id");
  const customerName = text(formData, "customerName");
  const address = optionalText(formData, "address");
  if (!customerName || !address) {
    redirect("/customers?error=" + encodeURIComponent("거래처명과 주소는 필수입니다."));
  }

  const [regions, routes] = await Promise.all([
    prisma.regionMaster.findMany(),
    prisma.route.findMany({ where: { isActive: true } }),
  ]);
  const preview = describeCustomerRoute(
    address,
    bool(formData, "isEmergency"),
    regions.map((region) => ({ locationName: region.locationName, regionType: region.regionType })),
    routes.map((route) => ({ id: route.id, routeCode: route.routeCode, routeName: route.routeName })),
  );

  const existing = id ? await prisma.customer.findUnique({ where: { id } }) : null;
  const data = {
    customerCode: existing?.customerCode ?? customerCodeFromName(customerName),
    customerName,
    address,
    defaultRouteId: preview.route?.id ?? null,
    allowedVehicleTypeIds: existing?.allowedVehicleTypeIds ?? "[]",
    restrictedVehicleTypeIds: existing?.restrictedVehicleTypeIds ?? "[]",
    isActive: bool(formData, "isActive"),
  };

  try {
    if (id) {
      await prisma.customer.update({ where: { id }, data });
    } else {
      await prisma.customer.create({ data });
    }
  } catch {
    redirect("/customers?error=" + encodeURIComponent("같은 이름의 거래처가 있거나 저장에 실패했습니다."));
  }
  revalidatePath("/customers");
  redirect("/customers?ok=" + encodeURIComponent(`저장했습니다. 배송 루트: ${preview.label}`));
}

export async function deleteCustomer(formData: FormData) {
  const id = text(formData, "id");
  const used = await prisma.shipment.count({ where: { customerId: id } });
  if (used > 0) {
    redirect("/customers?error=" + encodeURIComponent("출하 데이터가 있는 거래처는 삭제할 수 없습니다."));
  }
  const onRoute = await prisma.routeCustomer.count({ where: { customerId: id } });
  if (onRoute > 0) {
    redirect("/customers?error=" + encodeURIComponent("배송 루트에 연결된 거래처는 먼저 루트에서 제거하세요."));
  }
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
  redirect("/customers?ok=" + encodeURIComponent("삭제했습니다."));
}
