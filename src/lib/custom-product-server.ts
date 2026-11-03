import "server-only";
import { prisma } from "@/lib/prisma";
import { readCustomProduct } from "@/lib/custom-product";

export async function loadCustomProducts() {
  const products = await prisma.product.findMany({ where: { productCode: { startsWith: "USER-" } }, select: { productName: true, specialLoadingCondition: true } });
  return products.map(readCustomProduct);
}
