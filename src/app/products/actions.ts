"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bool, num, optionalText, text } from "@/lib/form";
import { prisma } from "@/lib/prisma";

export async function upsertProduct(formData: FormData) {
  const id = optionalText(formData, "id");
  const productCode = text(formData, "productCode");
  const productName = text(formData, "productName");
  if (!productCode || !productName) {
    redirect("/products?error=" + encodeURIComponent("제품코드와 제품명은 필수입니다."));
  }

  const data = {
    productCode,
    productName,
    unitWeight: num(formData, "unitWeight"),
    piecesPerBox: num(formData, "piecesPerBox"),
    specialLoadingCondition: optionalText(formData, "specialLoadingCondition"),
    isActive: bool(formData, "isActive"),
  };

  try {
    if (id) {
      await prisma.product.update({ where: { id }, data });
    } else {
      await prisma.product.create({ data });
    }
  } catch {
    redirect("/products?error=" + encodeURIComponent("제품코드가 이미 있거나 저장에 실패했습니다."));
  }
  revalidatePath("/products");
  redirect("/products");
}

export async function deleteProduct(formData: FormData) {
  const id = text(formData, "id");
  const used = await prisma.shipment.count({ where: { productId: id } });
  if (used > 0) {
    redirect("/products?error=" + encodeURIComponent("출하 데이터가 있는 제품은 삭제할 수 없습니다."));
  }
  await prisma.product.delete({ where: { id } });
  revalidatePath("/products");
  redirect("/products");
}
