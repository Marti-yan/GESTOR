import { validateComponents } from "./combos.mjs";
import { transaction } from "./database.mjs";
export function installCatalogTools({ app, db, admin, wrap, fail }) {
  app.put(
    "/api/admin/catalog/kitchens",
    admin,
    wrap((req, res) => {
      const names = req.body?.potatoCategories,
        categories = db
          .prepare("SELECT name FROM categories")
          .all()
          .map((c) => c.name);
      if (
        !Array.isArray(names) ||
        names.length > 100 ||
        names.some((n) => !categories.includes(n))
      )
        fail(400, "Selecione categorias cadastradas.");
      transaction(db, () => {
        for (const category of categories)
          db.prepare("UPDATE products SET station=? WHERE category=?").run(
            names.includes(category) ? "Cozinha Batata" : "Cozinha",
            category,
          );
        const old = db
          .prepare("SELECT * FROM print_targets WHERE id='batata'")
          .get();
        if (old)
          db.prepare(
            "UPDATE print_targets SET station='Cozinha Batata',filter=? WHERE id='batata'",
          ).run(
            JSON.stringify({ mode: "station", values: ["Cozinha Batata"] }),
          );
        else
          db.prepare(
            "INSERT INTO print_targets(id,label,station,filter,options) VALUES ('batata','Comanda-batata','Cozinha Batata',?,?)",
          ).run(
            JSON.stringify({ mode: "station", values: ["Cozinha Batata"] }),
            JSON.stringify({ preset: "minimal" }),
          );
      });
      res.json({ ok: true });
    }),
  );
  app.get("/api/admin/catalog/export", admin, (_req, res) =>
    res.json(exportCatalog(db)),
  );
  app.post(
    "/api/admin/catalog/import",
    admin,
    wrap((req, res) =>
      res.json({
        summary: importCatalog(
          db,
          req.body?.catalog,
          { dryRun: req.body?.dryRun === true },
          fail,
        ),
      }),
    ),
  );
  app.put(
    "/api/admin/products/order",
    admin,
    wrap((req, res) => {
      const { ids, category } = req.body || {};
      transaction(db, () => {
        const current = db
          .prepare(
            "SELECT id FROM products WHERE category=? ORDER BY sort,rowid",
          )
          .all(typeof category === "string" ? category : "")
          .map((p) => p.id);
        validateOrder(ids, current, fail);
        ids.forEach((id, i) =>
          db.prepare("UPDATE products SET sort=? WHERE id=?").run(i, id),
        );
      });
      res.json({ ok: true });
    }),
  );
  app.put(
    "/api/admin/modifier-groups/order",
    admin,
    wrap((req, res) => {
      transaction(db, () => {
        const current = db
          .prepare("SELECT id FROM modifier_groups ORDER BY sort,rowid")
          .all()
          .map((g) => g.id);
        validateOrder(req.body?.ids, current, fail);
        req.body.ids.forEach((id, i) =>
          db.prepare("UPDATE modifier_groups SET sort=? WHERE id=?").run(i, id),
        );
      });
      res.json({ ok: true });
    }),
  );
}
function validateOrder(ids, current, fail) {
  if (
    !Array.isArray(ids) ||
    ids.length !== current.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string" || !current.includes(id))
  )
    fail(409, "A lista mudou. Atualize antes de ordenar.");
}

export function exportCatalog(db) {
  const groups = readModifierGroups(db);
  return {
    format: "pronto-catalog/v1",
    exportedAt: new Date().toISOString(),
    categories: db
      .prepare("SELECT id,name,sort FROM categories ORDER BY sort,name")
      .all(),
    modifierGroups: groups,
    products: db
      .prepare("SELECT * FROM products ORDER BY sort,rowid")
      .all()
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,
        available: !!p.available,
        station: p.station,
        art: p.art,
        featured: !!p.featured,
        modifierGroupIds: JSON.parse(p.modifier_group_ids),
        components: JSON.parse(p.components || "[]"),
        sort: p.sort,
      })),
  };
}
import { readModifierGroups, validateModifierGroup } from "./modifiers.mjs";
import { randomUUID } from "node:crypto";
export function importCatalog(db, input, { dryRun = false } = {}, fail) {
  if (
    !input ||
    input.format !== "pronto-catalog/v1" ||
    !Array.isArray(input.categories) ||
    !Array.isArray(input.products) ||
    !Array.isArray(input.modifierGroups)
  )
    fail(400, "Arquivo de catálogo inválido. Use uma exportação Pronto.");
  if (
    input.products.length > 200 ||
    input.modifierGroups.length > 60 ||
    input.categories.length > 100
  )
    fail(
      400,
      "Catálogo excede os limites de produtos (200), grupos (60) ou categorias (100).",
    );
  const id = (v) =>
    typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : null;
  const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const categories = input.categories.map((c) => ({
    id: id(c?.id) || randomUUID(),
    name: text(c?.name, 60),
  }));
  if (
    categories.some((c) => !c.name) ||
    new Set(categories.map((c) => c.name)).size !== categories.length ||
    new Set(categories.map((c) => c.id)).size !== categories.length
  )
    fail(400, "Categorias repetidas ou sem nome.");
  const groups = input.modifierGroups.map((g) => {
    if (!id(g?.id)) fail(400, "Identificador de grupo inválido.");
    return validateModifierGroup(g, g.id);
  });
  if (new Set(groups.map((g) => g.id)).size !== groups.length)
    fail(400, "Grupos repetidos.");
  const existingCategories = db.prepare("SELECT id,name FROM categories").all();
  for (const c of categories)
    if (existingCategories.some((x) => x.id === c.id && x.name !== c.name))
      fail(
        409,
        "Identificador de categoria já utilizado. Exporte novamente o catálogo.",
      );
  const categoryNames = new Set([
      ...categories.map((c) => c.name),
      ...existingCategories.map((c) => c.name),
    ]),
    groupIds = new Set([
      ...groups.map((g) => g.id),
      ...readModifierGroups(db).map((g) => g.id),
    ]);
  const products = input.products.map((p) => {
    if (
      !id(p?.id) ||
      text(p?.name, 100).length < 2 ||
      !categoryNames.has(p.category) ||
      !Number.isSafeInteger(p.price) ||
      p.price < 0 ||
      p.price > 1000000
    )
      fail(
        400,
        "Produto inválido: confira nome, categoria, identificador e preço.",
      );
    const links = p.modifierGroupIds || [];
    if (
      !Array.isArray(links) ||
      links.length > 10 ||
      new Set(links).size !== links.length ||
      links.some((g) => !groupIds.has(g))
    )
      fail(400, "Grupos do produto inválidos.");
    return {
      id: p.id,
      name: text(p.name, 100),
      description: text(p.description, 400),
      category: p.category,
      price: p.price,
      available: p.available !== false,
      station: text(p.station, 60) || "Cozinha",
      art: text(p.art, 30) || "burger",
      featured: !!p.featured,
      modifierGroupIds: links,
      components: p.components || [],
    };
  });
  if (new Set(products.map((p) => p.id)).size !== products.length)
    fail(400, "Produtos repetidos.");
  const universe = new Map(
    db
      .prepare("SELECT * FROM products")
      .all()
      .map((p) => [p.id, p]),
  );
  for (const p of products)
    universe.set(p.id, {
      ...p,
      components: JSON.stringify(p.components),
      modifier_group_ids: JSON.stringify(p.modifierGroupIds),
    });
  const allGroups = new Map(readModifierGroups(db).map((g) => [g.id, g]));
  for (const g of groups) allGroups.set(g.id, g);
  for (const p of universe.values())
    validateComponents(db, JSON.parse(p.components || "[]"), p.id, fail, {
      products: [...universe.values()],
      groups: [...allGroups.values()],
    });
  for (const p of products)
    p.components = validateComponents(db, p.components, p.id, fail, {
      products: [...universe.values()],
      groups: [...allGroups.values()],
    });
  const currentProducts = new Set(
      db
        .prepare("SELECT id FROM products")
        .all()
        .map((p) => p.id),
    ),
    currentGroups = new Set(readModifierGroups(db).map((g) => g.id));
  if (
    new Set([...currentProducts, ...products.map((p) => p.id)]).size > 200 ||
    new Set([...currentGroups, ...groups.map((g) => g.id)]).size > 60
  )
    fail(400, "A combinação dos catálogos excede o limite da loja.");
  const summary = {
    products: products.length,
    groups: groups.length,
    categories: categories.length,
    added: products.filter((p) => !currentProducts.has(p.id)).length,
    updated: products.filter((p) => currentProducts.has(p.id)).length,
  };
  if (dryRun) return summary;
  transaction(db, () => {
    const categoryOffset = db
      .prepare("SELECT COALESCE(MAX(sort),-1)+1 AS n FROM categories")
      .get().n;
    categories.forEach((c, i) =>
      db
        .prepare(
          "INSERT INTO categories(id,name,sort) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET sort=excluded.sort",
        )
        .run(c.id, c.name, categoryOffset + i),
    );
    const groupOffset = db
      .prepare("SELECT COALESCE(MAX(sort),-1)+1 AS n FROM modifier_groups")
      .get().n;
    groups.forEach((g, i) =>
      db
        .prepare(
          "INSERT INTO modifier_groups(id,definition,sort) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET definition=excluded.definition,sort=excluded.sort",
        )
        .run(g.id, JSON.stringify(g), groupOffset + i),
    );
    const offset = db
      .prepare("SELECT COALESCE(MAX(sort),-1)+1 AS n FROM products")
      .get().n;
    products.forEach((p, i) =>
      db
        .prepare(
          "INSERT INTO products(id,name,description,category,price,available,station,art,featured,modifier_group_ids,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,category=excluded.category,price=excluded.price,available=excluded.available,station=excluded.station,art=excluded.art,featured=excluded.featured,modifier_group_ids=excluded.modifier_group_ids,sort=excluded.sort",
        )
        .run(
          p.id,
          p.name,
          p.description,
          p.category,
          p.price,
          p.available ? 1 : 0,
          p.station,
          p.art,
          p.featured ? 1 : 0,
          JSON.stringify(p.modifierGroupIds),
          offset + i,
        ),
    );
    for (const p of products)
      db.prepare("UPDATE products SET components=? WHERE id=?").run(
        JSON.stringify(p.components),
        p.id,
      );
  });
  return summary;
}
