export type CustomProductInfo = {
  productName: string;
  customerName: string | null;
  locationName: string | null;
  defaultUnit: "box" | "plt";
  boxWeightKg: number | null;
  palletWeightKg: number | null;
  boxesPerPallet: number | null;
};

export function readCustomProduct(product: { productName: string; specialLoadingCondition: string | null }): CustomProductInfo {
  let data: Record<string, unknown> = {};
  try { const value = JSON.parse(product.specialLoadingCondition || "{}"); if (value && typeof value === "object" && !Array.isArray(value)) data = value; } catch { /* 이전에 등록된 품명 */ }
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  return { productName: product.productName, customerName: typeof data.customerName === "string" ? data.customerName : null, locationName: typeof data.locationName === "string" ? data.locationName : null, defaultUnit: data.defaultUnit === "plt" ? "plt" : "box", boxWeightKg: number(data.boxWeightKg), palletWeightKg: number(data.palletWeightKg), boxesPerPallet: number(data.boxesPerPallet) };
}

export function findCustomProduct(products: CustomProductInfo[], name: string | null | undefined): CustomProductInfo | undefined {
  const normalized = (value: string) => value.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("ko-KR");
  return name ? products.find((product) => normalized(product.productName) === normalized(name)) : undefined;
}
