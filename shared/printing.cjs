function normalizeFilter(input, station = "*") {
  const fallback =
    station && station !== "*"
      ? { mode: "station", values: [station] }
      : { mode: "all", values: [] };
  if (
    !input ||
    !["all", "categories", "products", "station"].includes(input.mode)
  )
    return fallback;
  return {
    mode: input.mode,
    values:
      input.mode === "all"
        ? []
        : [
            ...new Set(
              (Array.isArray(input.values) ? input.values : []).filter(
                (v) => typeof v === "string" && v.length <= 100,
              ),
            ),
          ].slice(0, 200),
  };
}
function filterItems(items, target = {}) {
  const filter = normalizeFilter(target.filter, target.station);
  return items.filter(
    (i) =>
      filter.mode === "all" ||
      filter.values.includes(
        filter.mode === "products"
          ? i.productId
          : filter.mode === "categories"
            ? i.category
            : i.station,
      ),
  );
}
function matchingTargets(targets, items, counter = false) {
  return targets.filter(
    (t) =>
      t.enabled &&
      (t.location !== "counter" || counter) &&
      filterItems(items, t).length > 0,
  );
}
module.exports = { normalizeFilter, filterItems, matchingTargets };
