import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

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
  addColumn("print_targets", "options", "TEXT NOT NULL DEFAULT '{}'");
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
    })),
  };
  if (privateData)
    order.printJobs = db
      .prepare(
        "SELECT id,target_id AS targetId,state,attempt,last_error AS lastError FROM print_jobs WHERE order_id=? ORDER BY created_at",
      )
      .all(id);
  return order;
}

export function enqueuePrintJobs(db, orderId, now) {
  const targets = db
    .prepare("SELECT * FROM print_targets WHERE enabled=1")
    .all();
  const stations = db
    .prepare("SELECT DISTINCT station FROM order_items WHERE order_id=?")
    .all(orderId)
    .map((r) => r.station);
  for (const target of targets) {
    if (target.station !== "*" && !stations.includes(target.station)) continue;
    if (
      db
        .prepare("SELECT 1 FROM print_jobs WHERE order_id=? AND target_id=?")
        .get(orderId, target.id)
    )
      continue;
    db.prepare(
      "INSERT INTO print_jobs(id,order_id,target_id,state,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    ).run(randomUUID(), orderId, target.id, "pending", now, now);
  }
}
