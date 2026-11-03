import { createHash } from "node:crypto";

export const HIDDEN_PRODUCT_PREFIX = "hidden_erp_product_";

export function hiddenProductKey(name: string): string {
  return HIDDEN_PRODUCT_PREFIX + createHash("sha256").update(name).digest("hex");
}
