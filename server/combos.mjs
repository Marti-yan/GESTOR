// Fixed accompaniments use the actual product stock; prices belong to the combo.
export function validateComponents(
  db,
  value = [],
  parentId,
  fail,
  context = {},
) {
  const rows = context.products || db.prepare("SELECT * FROM products").all();
  const groupRows =
    context.groups ||
    db
      .prepare("SELECT definition FROM modifier_groups")
      .all()
      .map((g) => JSON.parse(g.definition));
  if (typeof value === "string" && value.length <= 16000) {
    try {
      value = JSON.parse(value);
    } catch {
      fail(400, "Acompanhamentos inválidos.");
    }
  }
  if (!Array.isArray(value) || value.length > 20)
    fail(400, "Use até 20 acompanhamentos por combo.");
  const seen = new Set();
  return value.map((c) => {
    if (
      !c ||
      typeof c.productId !== "string" ||
      c.productId === parentId ||
      seen.has(c.productId) ||
      !Number.isSafeInteger(c.quantity) ||
      c.quantity < 1 ||
      c.quantity > 20
    )
      fail(
        400,
        "Revise os acompanhamentos: sem repetição, de 1 a 20 unidades.",
      );
    seen.add(c.productId);
    const p = rows.find((p) => p.id === c.productId);
    if (!p || JSON.parse(p.components || "[]").length)
      fail(
        400,
        "Escolha produtos simples como acompanhamento; combos aninhados não são permitidos.",
      );
    // A simple product already used by a combo cannot become a nested combo.
    if (
      rows
        .filter((x) => x.id !== parentId)
        .some((x) =>
          JSON.parse(x.components).some((item) => item.productId === parentId),
        )
    )
      fail(
        400,
        "Este produto já acompanha outro combo. Remova esse vínculo antes de transformá-lo em combo.",
      );
    const required = JSON.parse(p.modifier_group_ids || "[]").some((id) => {
      const group = groupRows.find((g) => g.id === id);
      return group?.min > 0;
    });
    if (required)
      fail(
        400,
        `${p.name} tem escolhas obrigatórias. Cadastre uma versão fixa para acompanhar o combo.`,
      );
    return { productId: p.id, quantity: c.quantity };
  });
}
export function snapshotComponents(db, p, check = false, fail) {
  return JSON.parse(p.components || "[]").map((c) => {
    const item = db
      .prepare("SELECT * FROM products WHERE id=?")
      .get(c.productId);
    if (
      !item ||
      (check && (!item.available || JSON.parse(item.components || "[]").length))
    ) {
      if (check)
        fail(
          409,
          "Um acompanhamento do combo ficou indisponível. Atualize o cardápio.",
        );
      return {
        ...c,
        name: "Acompanhamento indisponível",
        station: "",
        category: "",
      };
    }
    if (
      check &&
      JSON.parse(item.modifier_group_ids || "[]").some((id) => {
        const g = db
          .prepare("SELECT definition FROM modifier_groups WHERE id=?")
          .get(id);
        return g && JSON.parse(g.definition).min > 0;
      })
    )
      fail(
        409,
        "Um acompanhamento passou a exigir escolhas. Revise o combo no gestor.",
      );
    return {
      productId: item.id,
      quantity: c.quantity,
      name: item.name,
      station: item.station,
      category: item.category,
    };
  });
}
export function catalogAvailability(db, p) {
  let stockQuantity = p.stock_quantity,
    available = Boolean(p.available);
  for (const c of JSON.parse(p.components || "[]")) {
    const item = db
      .prepare(
        "SELECT available,stock_quantity,components,modifier_group_ids FROM products WHERE id=?",
      )
      .get(c.productId);
    if (!item || !item.available || JSON.parse(item.components || "[]").length)
      available = false;
    if (
      item &&
      JSON.parse(item.modifier_group_ids || "[]").some((id) => {
        const g = db
          .prepare("SELECT definition FROM modifier_groups WHERE id=?")
          .get(id);
        return g && JSON.parse(g.definition).min > 0;
      })
    )
      available = false;
    if (item?.stock_quantity != null) {
      const count = Math.floor(item.stock_quantity / c.quantity);
      stockQuantity =
        stockQuantity == null ? count : Math.min(stockQuantity, count);
    }
  }
  return { available, stockQuantity };
}
export function stockLines(lines) {
  return lines.flatMap((i) => [
    i,
    ...(i.components || []).map((c) => ({
      productId: c.productId,
      quantity: c.quantity * i.quantity,
    })),
  ]);
}
export function stockRequirements(db, p) {
  return [
    { productId: p.id, quantity: 1, stockQuantity: p.stock_quantity },
    ...JSON.parse(p.components || "[]").map((c) => ({
      ...c,
      stockQuantity: (() => {
        const item = db
          .prepare("SELECT stock_quantity FROM products WHERE id=?")
          .get(c.productId);
        return item ? item.stock_quantity : 0;
      })(),
    })),
  ];
}
