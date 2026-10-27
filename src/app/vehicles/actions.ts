"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bool, num, optionalText, text } from "@/lib/form";
import { prisma } from "@/lib/prisma";

export async function upsertVehicle(formData: FormData) {
  const id = optionalText(formData, "id");
  const vehicleName = text(formData, "vehicleName");
  const maxWeight = num(formData, "maxWeight");
  if (!vehicleName) {
    redirect("/vehicles?error=" + encodeURIComponent("차량 이름을 입력하세요."));
  }
  if (maxWeight == null || maxWeight <= 0) {
    redirect(
      "/vehicles?error=" +
        encodeURIComponent("최대 적재량(kg)은 0보다 큰 숫자여야 합니다. 임의의 값을 넣지 마세요."),
    );
  }
  const maxPallet = num(formData, "maxPallet");
  if (maxPallet == null || maxPallet <= 0) {
    redirect("/vehicles?error=" + encodeURIComponent("최대 PLT는 0보다 큰 숫자여야 합니다."));
  }

  const data = {
    vehicleName,
    maxWeight,
    maxPallet,
    primaryRegionType: text(formData, "primaryRegionType") || "ANY",
    priorityType: bool(formData, "isEmergency") ? "EMERGENCY" : "NORMAL",
    boxPreferred: bool(formData, "boxPreferred"),
    description: optionalText(formData, "description"),
    isActive: bool(formData, "isActive"),
  };

  if (id) {
    await prisma.vehicleType.update({ where: { id }, data });
  } else {
    await prisma.vehicleType.create({ data });
  }
  revalidatePath("/vehicles");
  redirect(
    "/vehicles?ok=" + encodeURIComponent(id ? "차량 정보를 수정했습니다." : "차량을 등록했습니다."),
  );
}

export async function deleteVehicle(formData: FormData) {
  const id = text(formData, "id");
  await prisma.vehicleType.delete({ where: { id } });
  revalidatePath("/vehicles");
  redirect("/vehicles");
}
