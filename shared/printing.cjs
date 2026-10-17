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
  const matches = (i) =>
    filter.mode === "all" ||
    filter.values.includes(
      filter.mode === "products"
        ? i.productId
        : filter.mode === "categories"
          ? i.category
          : i.station,
    );
  return items.flatMap((i) => {
    const primary = matches(i),
      components = i.components || [],
      selected = components.filter(matches);
    if (!primary && !selected.length) return [];
    return [
      {
        ...i,
        comboReferenceOnly: !primary,
        components: components.map((c) => ({ ...c, prepareHere: matches(c) })),
      },
    ];
  });
}
function matchingTargets(targets, items, counter = false) {
  return targets.filter(
    (t) =>
      t.enabled &&
      (t.location !== "counter" || counter) &&
      filterItems(items, t).length > 0,
  );
}
function receiptContext(targets, targetId) {
  const kitchens = targets.filter((t) => t.location !== "counter");
  return {
    count: kitchens.length,
    index: Math.max(0, kitchens.findIndex((t) => t.id === targetId) + 1),
  };
}
module.exports = {
  normalizeFilter,
  filterItems,
  matchingTargets,
  receiptContext,
};
