import type { Product } from "./types";
/** Available quantity for one line, excluding other lines of the same product. */
export function selectionLimit(
  stock: number | null | undefined,
  elsewhere = 0,
) {
  return Math.max(0, Math.min(20, stock == null ? 20 : stock - elsewhere));
}

/** All variants and combos compete for the same underlying stock. */
export function productSelectionLimit(
  product: Product | undefined,
  products: Product[],
  lines: { productId: string; quantity: number; key?: string }[],
  excludingKey?: string,
) {
  if (!product) return 0;
  const others = lines.filter((l) => !excludingKey || l.key !== excludingKey);
  const requirements = product.stockRequirements || [
    {
      productId: product.id,
      quantity: 1,
      stockQuantity: product.stockQuantity ?? null,
    },
  ];
  let available = 20;
  for (const requirement of requirements) {
    if (requirement.stockQuantity == null) continue;
    let used = 0;
    for (const line of others) {
      const p = products.find((p) => p.id === line.productId);
      const needs = p?.stockRequirements || [
        { productId: line.productId, quantity: 1 },
      ];
      used +=
        (needs.find((r) => r.productId === requirement.productId)?.quantity ||
          0) * line.quantity;
    }
    available = Math.min(
      available,
      Math.floor((requirement.stockQuantity - used) / requirement.quantity),
    );
  }
  return Math.max(0, available);
}
