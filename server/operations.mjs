import { randomUUID } from "node:crypto";
import { transaction, readOrder } from "./database.mjs";

export function reserveStock(db, lines, orderId, now, fail) {
  const quantities = new Map();
  for (const line of lines)
    quantities.set(
      line.productId,
      (quantities.get(line.productId) || 0) + line.quantity,
    );
  for (const [id, quantity] of quantities) {
    // Legacy / previously unlimited pending orders reserve before entering the kitchen.
    if (
      db
        .prepare(
          "SELECT 1 FROM stock_movements WHERE order_id=? AND product_id=? AND delta<0",
        )
        .get(orderId, id)
    )
      continue;

    const product = db
      .prepare("SELECT name,stock_quantity FROM products WHERE id=?")
      .get(id);
    if (product.stock_quantity === null) continue;
    const result = db
      .prepare(
        "UPDATE products SET stock_quantity=stock_quantity-?,stock_version=stock_version+1 WHERE id=? AND stock_quantity>=?",
      )
      .run(quantity, id, quantity);
    if (!result.changes)
      fail(
        409,
        `Estoque insuficiente de ${product.name}. Disponível: ${product.stock_quantity}. Atualize o carrinho.`,
      );
    db.prepare("INSERT INTO stock_movements VALUES (?,?,?,?,?,?)").run(
      randomUUID(),
      id,
      orderId,
      -quantity,
      "Reserva do pedido",
      now,
    );
  }
}
export function releaseStock(db, orderId, now) {
  const reservations = db
    .prepare(
      "SELECT product_id,-SUM(delta) AS quantity FROM stock_movements WHERE order_id=? GROUP BY product_id HAVING SUM(delta)<0",
    )
    .all(orderId);
  for (const r of reservations) {
    db.prepare(
      "UPDATE products SET stock_quantity=CASE WHEN stock_quantity IS NULL THEN NULL ELSE stock_quantity+? END,stock_version=stock_version+1 WHERE id=?",
    ).run(r.quantity, r.product_id);
    db.prepare("INSERT INTO stock_movements VALUES (?,?,?,?,?,?)").run(
      randomUUID(),
      r.product_id,
      orderId,
      r.quantity,
      "Cancelamento antes do preparo",
      now,
    );
  }
}
export function normalizeDeliveryAddress(value, fail) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value))
    fail(400, "Endereço inválido.");
  const result = {};
  for (const key of [
    "cep",
    "street",
    "number",
    "neighborhood",
    "city",
    "state",
    "complement",
    "reference",
  ])
    result[key] =
      typeof value[key] === "string"
        ? value[key].trim().slice(0, key === "reference" ? 160 : 100)
        : "";
  result.cep = result.cep.replace(/\D/g, "");
  result.state = result.state.toUpperCase();
  if (
    !result.street ||
    !result.number ||
    !result.neighborhood ||
    !result.city ||
    !/^[A-Z]{2}$/.test(result.state) ||
    (result.cep && result.cep.length !== 8)
  )
    fail(
      400,
      "Informe rua, número (ou S/N), bairro, cidade e UF. O CEP é opcional.",
    );
  return result;
}
const setting = (db, key, fallback) =>
  JSON.parse(
    db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value ||
      JSON.stringify(fallback),
  );
export function installOperations({
  app,
  db,
  admin,
  wrap,
  fail,
  rateLimit,
  addressFetch = fetch,
}) {
  app.get("/api/delivery-areas", (_req, res) =>
    res.json({ cities: setting(db, "delivery-areas", []) }),
  );
  app.put(
    "/api/admin/delivery-areas",
    admin,
    wrap((req, res) => {
      const cities = req.body?.cities;
      if (!Array.isArray(cities) || cities.length > 100)
        fail(400, "Cadastre até 100 cidades.");
      const clean = cities.map((c) => {
        const name = String(c.name || "")
            .trim()
            .slice(0, 80),
          state = String(c.state || "")
            .trim()
            .toUpperCase();
        if (
          !name ||
          !/^[A-Z]{2}$/.test(state) ||
          !Array.isArray(c.neighborhoods) ||
          c.neighborhoods.length > 300
        )
          fail(400, "Revise cidade, UF e bairros (até 300).");
        return {
          name,
          state,
          neighborhoods: [
            ...new Set(
              c.neighborhoods
                .map((n) => String(n).trim().slice(0, 80))
                .filter(Boolean),
            ),
          ],
        };
      });
      if (
        new Set(clean.map((c) => `${c.name.toLowerCase()}/${c.state}`)).size !==
        clean.length
      )
        fail(400, "Existem cidades repetidas.");
      db.prepare(
        "INSERT INTO settings VALUES ('delivery-areas',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(JSON.stringify(clean));
      res.json({ cities: clean });
    }),
  );
  const cepCache = new Map();
  app.get(
    "/api/address/cep/:cep",
    wrap(async (req, res) => {
      rateLimit(req, "cep", 30, 60000);
      const cep = req.params.cep;
      if (!/^\d{8}$/.test(cep)) fail(400, "Informe um CEP de 8 dígitos.");
      const cached = cepCache.get(cep);
      if (cached && cached.until > Date.now()) return res.json(cached.value);
      let data;
      try {
        const response = await addressFetch(
          `https://viacep.com.br/ws/${cep}/json/`,
          { signal: AbortSignal.timeout(6000), redirect: "error" },
        );
        if (!response.ok) throw Error();
        data = await response.json();
      } catch {
        fail(
          503,
          "Consulta de CEP indisponível. Você pode preencher o endereço manualmente.",
        );
      }
      if (data.erro) fail(404, "CEP não encontrado. Preencha manualmente.");
      const value = {
        cep,
        street: String(data.logradouro || ""),
        neighborhood: String(data.bairro || ""),
        city: String(data.localidade || ""),
        state: String(data.uf || ""),
      };
      if (cepCache.size >= 500) cepCache.delete(cepCache.keys().next().value);
      cepCache.set(cep, { until: Date.now() + 86400000, value });
      res.json(value);
    }),
  );
  app.put(
    "/api/admin/products/:id/stock",
    admin,
    wrap((req, res) => {
      const { quantity, expectedVersion, reason } = req.body || {};
      if (
        quantity !== null &&
        (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000)
      )
        fail(
          400,
          "Informe uma quantidade inteira entre 0 e 1.000.000 ou desative o limite.",
        );
      transaction(db, () => {
        const old = db
          .prepare("SELECT * FROM products WHERE id=?")
          .get(req.params.id);
        if (!old) fail(404, "Produto não encontrado.");
        if (old.stock_version !== expectedVersion)
          fail(
            409,
            "O estoque mudou após sua consulta. Atualize antes de ajustar.",
          );
        db.prepare(
          "UPDATE products SET stock_quantity=?,stock_version=stock_version+1 WHERE id=?",
        ).run(quantity, old.id);
        db.prepare("INSERT INTO stock_movements VALUES (?,?,?,?,?,?)").run(
          randomUUID(),
          old.id,
          null,
          (quantity ?? 0) - (old.stock_quantity ?? 0),
          String(reason || "Ajuste manual").slice(0, 160) +
            (quantity === null
              ? " — limite desativado"
              : old.stock_quantity === null
                ? " — limite ativado"
                : ""),
          new Date().toISOString(),
        );
      });
      res.json({ ok: true });
    }),
  );
  app.get("/api/admin/stock", admin, (_req, res) =>
    res.json({
      products: db
        .prepare(
          "SELECT id,name,category,stock_quantity AS stockQuantity,stock_version AS stockVersion FROM products ORDER BY category,name",
        )
        .all(),
      movements: db
        .prepare(
          "SELECT m.*,p.name FROM stock_movements m JOIN products p ON p.id=m.product_id ORDER BY m.rowid DESC LIMIT 500",
        )
        .all(),
    }),
  );
  app.get(
    "/api/admin/reports",
    admin,
    wrap((req, res) => res.json(buildReport(db, req.query, fail))),
  );
}

export function buildReport(db, q, fail) {
  const offset = Number(q.offset || 0);
  if (!Number.isInteger(offset) || offset < -840 || offset > 840)
    fail(400, "Fuso horário inválido.");
  const date = (value, end = false) => {
    if (!value) return null;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
    )
      fail(400, "Data inválida.");
    return new Date(
      Date.parse(value + "T00:00:00Z") + offset * 60000 + (end ? 86400000 : 0),
    ).toISOString();
  };
  const from = date(q.from),
    to = date(q.to, true);
  if (from && to && from >= to) fail(400, "Período inválido.");
  const clauses = [],
    args = [];
  for (const [key, column, allowed] of [
    [
      "status",
      "status",
      ["new", "preparing", "ready", "completed", "cancelled"],
    ],
    ["source", "source", ["menu", "waiter", "manager"]],
    ["payment", "payment", ["cash", "card", "pending"]],
    ["fulfillment", "fulfillment", ["delivery", "pickup", "dinein"]],
  ])
    if (q[key]) {
      if (!allowed.includes(q[key])) fail(400, "Filtro inválido.");
      clauses.push(`o.${column}=?`);
      args.push(q[key]);
    }
  for (const [operator, value] of [
    [">=", from],
    ["<", to],
  ])
    if (value) {
      clauses.push(`o.created_at${operator}?`);
      args.push(value);
    }
  for (const [key, column] of [
    ["actor", "actor_name"],
    ["table", "table_name"],
  ])
    if (q[key]) {
      clauses.push(`o.${column}=?`);
      args.push(String(q[key]).slice(0, 100));
    }
  for (const [key, column] of [
    ["product", "product_id"],
    ["category", "category"],
  ])
    if (q[key]) {
      clauses.push(
        `EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.${column}=?)`,
      );
      args.push(String(q[key]).slice(0, 100));
    }
  if (q.search) {
    clauses.push(
      "(instr(lower(o.customer_name),lower(?))>0 OR instr(o.phone,?)>0 OR CAST(o.sequence AS TEXT)=?)",
    );
    args.push(...Array(3).fill(String(q.search).slice(0, 100)));
  }
  const rows = db
    .prepare(
      `SELECT o.id FROM orders o ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY o.sequence DESC LIMIT 20001`,
    )
    .all(...args);
  if (rows.length > 20000)
    fail(
      400,
      "Mais de 20.000 pedidos no período. Reduza o intervalo para exportar e analisar.",
    );
  let orders = rows.map((r) => readOrder(db, r.id, { privateData: false }));
  for (const key of ["city", "neighborhood"])
    if (q[key])
      orders = orders.filter((o) => o.deliveryAddress?.[key] === q[key]);
  const valid = orders.filter((o) => o.status !== "cancelled"),
    completed = valid.filter((o) => o.status === "completed");
  const sum = (a, key) => a.reduce((n, o) => n + o[key], 0);
  const groups = {
    day: new Map(),
    hour: new Map(),
    status: new Map(),
    source: new Map(),
    payment: new Map(),
    fulfillment: new Map(),
    actor: new Map(),
    table: new Map(),
    city: new Map(),
    neighborhood: new Map(),
    product: new Map(),
    category: new Map(),
    addon: new Map(),
    customer: new Map(),
  };
  const add = (kind, key, amount, quantity = 1) => {
    key = key || "Não informado";
    const m = groups[kind],
      g = m.get(key) || { label: key, quantity: 0, total: 0 };
    g.quantity += quantity;
    g.total += amount;
    m.set(key, g);
  };
  for (const o of orders) add("status", o.status, o.total);
  for (const o of valid) {
    const d = new Date(Date.parse(o.createdAt) - offset * 60000);
    for (const [kind, key] of [
      ["day", d.toISOString().slice(0, 10)],
      ["hour", String(d.getUTCHours()).padStart(2, "0") + "h"],
      ["source", o.source],
      ["payment", o.payment],
      ["fulfillment", o.fulfillment],
      ["actor", o.actorName],
      ["table", o.tableName],
      ["city", o.deliveryAddress?.city],
      ["neighborhood", o.deliveryAddress?.neighborhood],
      ["customer", o.customerName + (o.phone ? " · " + o.phone : "")],
    ])
      add(kind, key, o.total);
    for (const i of o.items) {
      if (
        (q.product && i.productId !== q.product) ||
        (q.category && i.category !== q.category)
      )
        continue;
      add("product", i.name, i.price * i.quantity, i.quantity);
      add("category", i.category, i.price * i.quantity, i.quantity);
      for (const m of i.modifiers || [])
        add(
          "addon",
          m.groupName + " / " + m.name,
          m.price * m.quantity * i.quantity,
          m.quantity * i.quantity,
        );
    }
  }
  const durations = { accept: [], prepare: [], complete: [] };
  const ids = new Set(orders.map((o) => o.id)),
    events = new Map();
  for (const e of db
    .prepare(
      "SELECT order_id,status,created_at FROM order_events ORDER BY rowid",
    )
    .iterate())
    if (ids.has(e.order_id)) {
      const v = events.get(e.order_id) || {};
      v[e.status] = e.created_at;
      events.set(e.order_id, v);
    }
  for (const o of valid) {
    const e = events.get(o.id) || {};
    for (const [key, a, b] of [
      ["accept", o.createdAt, o.acceptedAt],
      ["prepare", o.acceptedAt, e.ready],
      ["complete", o.createdAt, e.completed],
    ])
      if (a && b)
        durations[key].push(
          Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000),
        );
  }
  return {
    summary: {
      orders: orders.length,
      active: valid.length,
      completed: completed.length,
      cancelled: orders.length - valid.length,
      gross: sum(valid, "total"),
      completedTotal: sum(completed, "total"),
      cancelledTotal: sum(
        orders.filter((o) => o.status === "cancelled"),
        "total",
      ),
      subtotal: sum(valid, "subtotal"),
      deliveryFees: sum(valid, "deliveryFee"),
      average: valid.length
        ? Math.round(sum(valid, "total") / valid.length)
        : 0,
      items: valid.reduce(
        (n, o) => n + o.items.reduce((x, i) => x + i.quantity, 0),
        0,
      ),
    },
    durations: Object.fromEntries(
      Object.entries(durations).map(([k, a]) => [
        k,
        {
          minutes: a.length ? a.reduce((n, v) => n + v, 0) / a.length : null,
          samples: a.length,
        },
      ]),
    ),
    groups: Object.fromEntries(
      Object.entries(groups).map(([k, m]) => [
        k,
        [...m.values()].sort((a, b) =>
          ["day", "hour"].includes(k)
            ? a.label.localeCompare(b.label)
            : b.total - a.total,
        ),
      ]),
    ),
    orders,
  };
}
