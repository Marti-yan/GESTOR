/** Available quantity for one line, excluding other lines of the same product. */
export function selectionLimit(
  stock: number | null | undefined,
  elsewhere = 0,
) {
  return Math.max(0, Math.min(20, stock == null ? 20 : stock - elsewhere));
}
