import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import printing from "../shared/printing.cjs";

export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, "pronto.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
      available INTEGER NOT NULL DEFAULT 1, station TEXT NOT NULL DEFAULT 'Cozinha',
      art TEXT NOT NULL DEFAULT 'burger', featured INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL,
      tracking_token TEXT UNIQUE NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL,
      fulfillment TEXT NOT NULL, address TEXT NOT NULL, payment TEXT NOT NULL, change_for INTEGER,
      notes TEXT NOT NULL, subtotal INTEGER NOT NULL, delivery_fee INTEGER NOT NULL,
      total INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL,
      name TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL,
      notes TEXT NOT NULL, station TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_events (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS print_targets (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '',
      width INTEGER NOT NULL DEFAULT 80, station TEXT NOT NULL DEFAULT '*',
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS print_jobs (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      target_id TEXT NOT NULL REFERENCES print_targets(id), state TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0, claim_token TEXT, agent_id TEXT,
      lease_until INTEGER, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_state ON print_jobs(state, created_at);
    CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
  `);
  const addColumn = (table, name, definition) => {
    if (
      !db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((c) => c.name === name)
    )
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  for (const [name, definition] of [
    ["source", "TEXT NOT NULL DEFAULT 'menu'"],
    ["table_name", "TEXT NOT NULL DEFAULT ''"],
    ["pickup_code", "TEXT NOT NULL DEFAULT ''"],
    ["actor_name", "TEXT NOT NULL DEFAULT ''"],
    ["accepted_at", "TEXT"],
  ])
    addColumn("orders", name, definition);
  addColumn("order_items", "category", "TEXT NOT NULL DEFAULT ''");
  addColumn("order_items", "modifiers", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("order_items", "base_price", "INTEGER");
  addColumn("products", "modifier_group_ids", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("orders", "counter_requested", "INTEGER NOT NULL DEFAULT 0");
  addColumn("print_targets", "options", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("print_targets", "location", "TEXT NOT NULL DEFAULT 'kitchen'");
  addColumn("print_targets", "filter", "TEXT");
  for (const [name, definition] of [
    ["batch_id", "TEXT NOT NULL DEFAULT ''"],
    ["batch_index", "INTEGER NOT NULL DEFAULT 1"],
    ["batch_count", "INTEGER NOT NULL DEFAULT 1"],
    ["target_snapshot", "TEXT"],
    ["purpose", "TEXT NOT NULL DEFAULT 'production'"],
    ["late_extra", "INTEGER NOT NULL DEFAULT 0"],
  ])
    addColumn("print_jobs", name, definition);
  db.exec(
    "CREATE TABLE IF NOT EXISTS modifier_groups(id TEXT PRIMARY KEY,definition TEXT NOT NULL)",
  );
  addColumn("sessions", "role", "TEXT NOT NULL DEFAULT 'admin'");
  addColumn("sessions", "actor_name", "TEXT NOT NULL DEFAULT ''");
  db.exec(
    "CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,sort INTEGER NOT NULL DEFAULT 0)",
  );
  const seeded = db
    .prepare("SELECT value FROM settings WHERE key='store'")
    .get();
  if (!seeded) {
    const store = {
      name: "Brasa da Casa",
      subtitle: "Burgers artesanais. Feitos de verdade.",
      phone: "",
      open: true,
      deliveryFee: 500,
      minimumOrder: 0,
      estimatedMinutes: 40,
      allowDelivery: true,
      allowPickup: true,
    };
    db.prepare("INSERT INTO settings(key,value) VALUES (?,?)").run(
      "store",
      JSON.stringify(store),
    );
    const products = [
      [
        "brasa-classico",
        "Brasa Clássico",
        "Pão brioche, burger de 160 g, queijo cheddar, alface e maionese da casa.",
        "Burgers",
        2490,
        "Cozinha",
        "burger",
        1,
      ],
      [
        "bacon-da-casa",
        "Bacon da Casa",
        "Burger de 160 g, cheddar cremoso, bacon crocante e barbecue artesanal.",
        "Burgers",
        2990,
        "Cozinha",
        "bacon",
        1,
      ],
      [
        "duplo-brasa",
        "Duplo Brasa",
        "Dois burgers de 120 g, duplo cheddar, cebola na chapa e molho especial.",
        "Burgers",
        3590,
        "Cozinha",
        "double",
        1,
      ],
      [
        "verde-da-horta",
        "Verde da Horta",
        "Burger vegetal, queijo, folhas frescas, tomate e maionese de ervas.",
        "Burgers",
        2790,
        "Cozinha",
        "veggie",
        0,
      ],
      [
        "batata-crocante",
        "Batata Crocante",
        "Porção de 300 g de batatas douradas com sal de ervas.",
        "Acompanhamentos",
        1490,
        "Cozinha",
        "fries",
        0,
      ],
      [
        "batata-cheddar",
        "Batata com Cheddar",
        "Batata crocante com cheddar cremoso e bacon em cubinhos.",
        "Acompanhamentos",
        2190,
        "Cozinha",
        "loaded-fries",
        0,
      ],
      [
        "refrigerante",
        "Refrigerante Lata",
        "Lata de 350 ml. Escolha o sabor nas observações.",
        "Bebidas",
        690,
        "Bar",
        "soda",
        0,
      ],
      [
        "limonada",
        "Limonada da Casa",
        "Limão fresco, água e gelo. Copo de 400 ml.",
        "Bebidas",
        990,
        "Bar",
        "lemonade",
        0,
      ],
      [
        "agua",
        "Água Mineral",
        "Garrafa de 500 ml, sem gás.",
        "Bebidas",
        450,
        "Bar",
        "water",
        0,
      ],
    ];
    const insert = db.prepare(
      "INSERT INTO products(id,name,description,category,price,station,art,featured,sort) VALUES (?,?,?,?,?,?,?,?,?)",
    );
    products.forEach((p, index) => insert.run(...p, index));
  }
  db.prepare(
    "INSERT OR IGNORE INTO print_targets(id,label,station) VALUES ('geral','Comanda geral','*')",
  ).run();
  const existingCategories = db
    .prepare(
      "SELECT category,MIN(sort) AS position FROM products GROUP BY category ORDER BY position,category",
    )
    .all();
  for (const [position, c] of existingCategories.entries())
    db.prepare(
      "INSERT OR IGNORE INTO categories(id,name,sort) VALUES (?,?,?)",
    ).run(randomUUID(), c.category, position);
  if (
    !db
      .prepare("SELECT 1 FROM settings WHERE key='printing-templates-v3'")
      .get()
  ) {
    const general = db
      .prepare("SELECT * FROM print_targets WHERE id='geral'")
      .get();
    if (general) {
      const options = JSON.parse(general.options || "{}");
      if (!options.preset || options.preset === "expedition")
        db.prepare("UPDATE print_targets SET options=? WHERE id=?").run(
          JSON.stringify({
            ...options,
            preset: "kitchen",
            showPrices: false,
            showPhone: false,
          }),
          "geral",
        );
    }
    const potatoes = db
      .prepare("SELECT id,name,art FROM products")
      .all()
      .filter(
        (p) =>
          /batata/i.test(p.name) || ["fries", "loaded-fries"].includes(p.art),
      )
      .map((p) => p.id);
    const insert = db.prepare(
      "INSERT OR IGNORE INTO print_targets(id,label,device_name,width,station,enabled,options,location,filter) VALUES (?,?,?,?,?,1,?,?,?)",
    );
    insert.run(
      "batata",
      "Comanda-batata",
      general?.device_name || "",
      general?.width || 80,
      "*",
      JSON.stringify({ preset: "minimal" }),
      "kitchen",
      JSON.stringify({ mode: "products", values: potatoes }),
    );
    insert.run(
      "balcao",
      "Via do balcão",
      general?.device_name || "",
      general?.width || 80,
      "*",
      JSON.stringify({ preset: "expedition" }),
      "counter",
      JSON.stringify({ mode: "all", values: [] }),
    );
    db.prepare(
      "INSERT INTO settings(key,value) VALUES ('printing-templates-v3','1')",
    ).run();
  }
  const legacyOrders = db
    .prepare(
      "SELECT DISTINCT order_id FROM print_jobs WHERE batch_id='' ORDER BY rowid",
    )
    .all();
  for (const { order_id } of legacyOrders) {
    const jobs = db
      .prepare(
        "SELECT id FROM print_jobs WHERE order_id=? AND state<>'cancelled' ORDER BY rowid",
      )
      .all(order_id);
    jobs.forEach((j, index) =>
      db
        .prepare(
          "UPDATE print_jobs SET batch_id=?,batch_index=?,batch_count=? WHERE id=?",
        )
        .run(order_id, index + 1, jobs.length, j.id),
    );
  }
  return db;
}

export function transaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readStore(db) {
  return JSON.parse(
    db.prepare("SELECT value FROM settings WHERE key='store'").get().value,
  );
}

export function readOrder(db, id, { privateData = true } = {}) {
  const row = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
  if (!row) return null;
  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY rowid")
    .all(id);
  const order = {
    id: row.id,
    number: row.sequence,
    customerName: row.customer_name,
    phone: row.phone,
    fulfillment: row.fulfillment,
    address: row.address,
    payment: row.payment,
    changeFor: row.change_for,
    notes: row.notes,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    total: row.total,
    status: row.status,
    source: row.source,
    tableName: row.table_name,
    pickupCode: row.pickup_code,
    actorName: row.actor_name,
    acceptedAt: row.accepted_at,
    printAtCounter: Boolean(row.counter_requested),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      notes: i.notes,
      station: i.station,
      category: i.category,
      basePrice: i.base_price ?? i.price,
      modifiers: JSON.parse(i.modifiers || "[]"),
    })),
  };
  if (privateData)
    order.printJobs = db
      .prepare(
        "SELECT id,target_id AS targetId,state,attempt,last_error AS lastError,batch_index AS receiptIndex,batch_count AS receiptCount,purpose FROM print_jobs WHERE order_id=? ORDER BY created_at,rowid",
      )
      .all(id);
  return order;
}

export function readPrintTarget(row) {
  return {
    id: row.id,
    label: row.label,
    deviceName: row.device_name,
    width: row.width,
    station: row.station,
    enabled: Boolean(row.enabled),
    location: row.location || "kitchen",
    filter: printing.normalizeFilter(
      row.filter ? JSON.parse(row.filter) : null,
      row.station,
    ),
    options: JSON.parse(row.options || "{}"),
  };
}
export function enqueuePrintJobs(
  db,
  orderId,
  now,
  { counterOnly = false } = {},
) {
  const order = readOrder(db, orderId),
    targets = printing
      .matchingTargets(
        db
          .prepare("SELECT * FROM print_targets WHERE enabled=1 ORDER BY rowid")
          .all()
          .map(readPrintTarget),
        order.items,
        order.printAtCounter,
      )
      .filter((t) => !counterOnly || t.location === "counter");
  if (order.printAtCounter && !targets.some((t) => t.location === "counter")) {
    const e = new Error(
      "Configure e habilite uma impressora de balcão antes de solicitar essa via.",
    );
    e.status = 409;
    throw e;
  }
  const existing = db
    .prepare(
      "SELECT * FROM print_jobs WHERE order_id=? AND state<>'cancelled' ORDER BY rowid",
    )
    .all(orderId);
  const additions = targets.filter(
    (t) => !existing.some((j) => j.target_id === t.id),
  );
  if (!additions.length) return;
  const count = existing.length + additions.length,
    batch = existing[0]?.batch_id || randomUUID(),
    late = existing.some((j) =>
      ["printing", "spooled", "uncertain"].includes(j.state),
    );
  db.prepare(
    "UPDATE print_jobs SET batch_id=?,batch_count=? WHERE order_id=? AND state IN ('pending','claimed','failed')",
  ).run(batch, count, orderId);
  additions.forEach((t, index) =>
    db
      .prepare(
        "INSERT INTO print_jobs(id,order_id,target_id,state,created_at,updated_at,batch_id,batch_index,batch_count,target_snapshot,purpose,late_extra) VALUES (?,?,?,'pending',?,?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        orderId,
        t.id,
        now,
        now,
        batch,
        existing.length + index + 1,
        count,
        JSON.stringify(t),
        t.location === "counter" ? "counter" : "production",
        late ? 1 : 0,
      ),
  );
}
