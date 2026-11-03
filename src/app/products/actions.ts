"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bool, num, optionalText, text } from "@/lib/form";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { listErpProductNames } from "@/lib/product-loading";
import { hiddenProductKey } from "@/lib/product-visibility";
import { DELIVERY_CUSTOMERS } from "@/lib/delivery-customers";

async function productDetails(formData: FormData) {
  const customerName = optionalText(formData, "customerName");
  const locationName = optionalText(formData, "locationName");
  const defaultUnit = text(formData, "defaultUnit");
  const parseWeight = (name: string) => { const raw = text(formData, name); if (!raw) return null; const value = Number(raw); if (!Number.isFinite(value) || value <= 0 || value > 1000000) throw new Error("invalid"); return value; };
  if (customerName && !DELIVERY_CUSTOMERS.some((customer) => customer.name === customerName)) throw new Error("invalid");
  if (locationName && !(await prisma.regionMaster.findFirst({ where: { locationName } }))) throw new Error("invalid");
  if (defaultUnit !== "box" && defaultUnit !== "plt") throw new Error("invalid");
  return JSON.stringify({ customerName, locationName, defaultUnit, boxWeightKg: parseWeight("boxWeightKg"), palletWeightKg: parseWeight("palletWeightKg"), boxesPerPallet: parseWeight("boxesPerPallet") });
}

export async function setExistingProductVisibility(formData: FormData) {
  const name = text(formData, "name");
  const visible = text(formData, "visible");
  if (!listErpProductNames().includes(name) || (visible !== "true" && visible !== "false")) {
    redirect("/products?error=" + encodeURIComponent("품명 또는 요청을 확인해 주세요."));
  }
  const key = hiddenProductKey(name);
  try {
    if (visible === "true") await prisma.appSetting.deleteMany({ where: { key } });
    else await prisma.appSetting.upsert({ where: { key }, create: { key, value: name }, update: { value: name } });
  } catch {
    redirect("/products?error=" + encodeURIComponent("품명 상태를 변경하지 못했습니다. 다시 시도해 주세요."));
  }
  revalidatePath("/");
  revalidatePath("/products");
  redirect("/products?ok=" + encodeURIComponent(visible === "true" ? "품명을 다시 등록했습니다." : "품명을 목록에서 삭제했습니다. 기존 납품 기록은 유지됩니다."));
}

export async function registerProduct(formData: FormData) {
  const productName = text(formData, "productName").replace(/\s+/g, " ").trim();
  if (!productName || productName.length > 150) {
    redirect("/products?error=" + encodeURIComponent("품명을 1~150자로 입력해 주세요."));
  }
  const key = productName.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const existingName = listErpProductNames().find((name) => name.replace(/\s+/g, " ").trim().normalize("NFKC").toLocaleLowerCase("ko-KR") === key);
  if (existingName) {
    let removed: { count: number };
    try {
      removed = await prisma.appSetting.deleteMany({ where: { key: hiddenProductKey(existingName) } });
    } catch {
      redirect("/products?error=" + encodeURIComponent("품명을 등록하지 못했습니다. 다시 시도해 주세요."));
    }
    if (!removed.count) redirect("/products?error=" + encodeURIComponent("기존 품목 목록에 이미 있는 품명입니다."));
    revalidatePath("/");
    revalidatePath("/products");
    redirect("/products?ok=" + encodeURIComponent("품명을 다시 등록했습니다."));
  }
  const productCode = `USER-${createHash("sha256").update(key).digest("hex")}`;
  try {
    const specialLoadingCondition = await productDetails(formData);
    const restored = await prisma.product.updateMany({ where: { productCode, isActive: false }, data: { productName, specialLoadingCondition, isActive: true } });
    if (!restored.count) await prisma.product.create({ data: { productCode, productName, specialLoadingCondition } });
  } catch {
    redirect("/products?error=" + encodeURIComponent("이미 등록된 품명이거나 저장하지 못했습니다. 확인 후 다시 시도해 주세요."));
  }
  revalidatePath("/");
  revalidatePath("/products");
  redirect("/products?ok=" + encodeURIComponent("품명이 등록되었습니다. 새 납품 등록에서 선택할 수 있습니다."));
}

export async function updateRegisteredProduct(formData: FormData) {
  const id = text(formData, "id");
  try {
    const specialLoadingCondition = await productDetails(formData);
    const updated = await prisma.product.updateMany({ where: { id, isActive: true, productCode: { startsWith: "USER-" } }, data: { specialLoadingCondition } });
    if (!updated.count) throw new Error("missing");
  } catch { redirect("/products?error=" + encodeURIComponent("품목 정보를 확인해 주세요. 중량과 박스 수는 0보다 커야 합니다.")); }
  revalidatePath("/"); revalidatePath("/confirm"); revalidatePath("/products");
  redirect("/products?ok=" + encodeURIComponent("품목 정보를 저장했습니다."));
}

export async function removeRegisteredProduct(formData: FormData) {
  const id = text(formData, "id");
  let removed: { count: number };
  try {
    removed = await prisma.product.updateMany({ where: { id, isActive: true, productCode: { startsWith: "USER-" } }, data: { isActive: false } });
  } catch {
    redirect("/products?error=" + encodeURIComponent("품명을 삭제하지 못했습니다. 다시 시도해 주세요."));
  }
  if (!removed.count) redirect("/products?error=" + encodeURIComponent("삭제할 수 있는 추가 품명을 찾지 못했습니다."));
  revalidatePath("/");
  revalidatePath("/products");
  redirect("/products?ok=" + encodeURIComponent("품명을 목록에서 삭제했습니다. 기존 납품 기록은 유지됩니다."));
}

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
