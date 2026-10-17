import {
  installOperations,
  normalizeDeliveryAddress,
  reserveStock,
  releaseStock,
} from "./operations.mjs";
import express from "express";
import packageInfo from "../package.json" with { type: "json" };
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  openDatabase,
  transaction,
  readStore,
  readOrder,
  enqueuePrintJobs,
  readPrintTarget,
} from "./database.mjs";
import printing from "../shared/printing.cjs";
import {
  readModifierGroups,
  validateModifierGroup,
  productGroupIds,
  priceModifiers,
} from "./modifiers.mjs";
import {
  hashPassword,
  verifyPassword,
  authenticate,
  issueSession,
  readSessionToken,
  tokenHash,
  staffSession,
  issueStaffSession,
} from "./auth.mjs";
import receipt from "../shared/receipt.cjs";

const statuses = ["new", "preparing", "ready", "completed", "cancelled"];
const nextStates = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const text = (value, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const integer = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max;

export function createApplication({
  dataDir,
  webDir = resolve("dist"),
  host = "127.0.0.1",
  adminPassword = "",
  bootstrapToken = "",
  secureCookie = false,
  addressFetch = fetch,
} = {}) {
  const db = openDatabase(dataDir || resolve(".data"));
  if (
    adminPassword &&
    !db.prepare("SELECT value FROM settings WHERE key='password'").get()
  ) {
    if (adminPassword.length < 12)
      throw new Error("ADMIN_PASSWORD precisa ter pelo menos 12 caracteres.");
    db.prepare("INSERT INTO settings(key,value) VALUES (?,?)").run(
      "password",
      hashPassword(adminPassword),
    );
  }
  const app = express();
  app.disable("x-powered-by");
  const limits = new Map();
  const rateLimit = (req, key, max, windowMs) => {
    const ip = req.socket.remoteAddress || "unknown";
    const bucketKey = `${key}:${ip}`;
    const now = Date.now();
    let bucket = limits.get(bucketKey);
    if (!bucket || bucket.until < now) {
      bucket = { count: 0, until: now + windowMs };
      limits.set(bucketKey, bucket);
    }
    if (++bucket.count > max)
      fail(429, "Muitas tentativas. Aguarde um pouco e tente novamente.");
    if (limits.size > 5000)
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  };
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    if (req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    // Cookie-authenticated writes must come from this origin. Native calls use a bearer token.
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      try {
        if (
          new URL(req.headers.origin).host !== req.headers.host &&
          !(
            (host === "127.0.0.1" || host === "localhost") &&
            new URL(req.headers.origin).hostname === "127.0.0.1"
          )
        )
          return res.status(403).json({ error: "Origem não autorizada." });
      } catch {
        return res.status(403).json({ error: "Origem inválida." });
      }
    }
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  const admin = (req, res, next) =>
    authenticate(db, req)
      ? next()
      : res.status(401).json({ error: "Entre no gestor para continuar." });
  const staff = (req, res, next) => {
    const session = staffSession(db, req);
    if (!session)
      return res
        .status(401)
        .json({ error: "Entre com o PIN do garçom para continuar." });
    req.staff = session;
    next();
  };
  const wrap = (fn) => (req, res, next) => {
    try {
      Promise.resolve(fn(req, res)).catch(next);
    } catch (e) {
      next(e);
    }
  };
  const currentPassword = () =>
    db.prepare("SELECT value FROM settings WHERE key='password'").get()?.value;
  const publicProducts = () => {
    const groups = readModifierGroups(db);
    return db
      .prepare("SELECT * FROM products ORDER BY sort,name")
      .all()
      .map((p) => ({
        ...p,
        available: Boolean(p.available),
        featured: Boolean(p.featured),
        stockQuantity: p.stock_quantity,
        stockVersion: p.stock_version,
        modifierGroupIds: JSON.parse(p.modifier_group_ids || "[]"),
        modifierGroups: groups.filter((g) =>
          JSON.parse(p.modifier_group_ids || "[]").includes(g.id),
        ),
      }));
  };
  const categories = () =>
    db.prepare("SELECT id,name,sort FROM categories ORDER BY sort,name").all();
  const cleanTarget = (t) => ({
    ...readPrintTarget(t),
    options: receipt.normalizeReceiptOptions(
      JSON.parse(t.options || "{}"),
      t.width,
    ),
  });
  function expireClaims() {
    const now = Date.now(),
      stamp = new Date().toISOString();
    db.prepare(
      "UPDATE print_jobs SET state='pending',claim_token=NULL,agent_id=NULL,lease_until=NULL,updated_at=? WHERE state='claimed' AND lease_until<?",
    ).run(stamp, now);
    db.prepare(
      "UPDATE print_jobs SET state='uncertain',last_error='A conexão foi interrompida durante a impressão. Confira o papel antes de reenviar.',updated_at=? WHERE state='printing' AND lease_until<?",
    ).run(stamp, now);
  }
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, version: packageInfo.version }),
  );
  installOperations({ app, db, admin, wrap, fail, rateLimit, addressFetch });
  app.get("/api/catalog", (_req, res) =>
    res.json({
      store: readStore(db),
      products: publicProducts().filter((p) => p.available),
      categories: categories(),
    }),
  );
  app.get("/api/auth/session", (req, res) =>
    res.json({
      authenticated: authenticate(db, req),
      needsSetup: !currentPassword(),
    }),
  );
  app.post(
    "/api/auth/setup",
    wrap((req, res) => {
      if (currentPassword())
        fail(409, "O gestor já está configurado. Faça login.");
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress,
      );
      const trusted =
        bootstrapToken && req.headers["x-pronto-bootstrap"] === bootstrapToken;
      if (
        !loopback ||
        (!trusted && host !== "127.0.0.1" && host !== "localhost")
      )
        fail(403, "Faça a configuração inicial no computador do gestor.");
      rateLimit(req, "setup", 5, 60000);
      const password = text(req.body?.password, 128);
      if (password.length < 12)
        fail(400, "Use uma senha com pelo menos 12 caracteres.");
      db.prepare("INSERT INTO settings(key,value) VALUES (?,?)").run(
        "password",
        hashPassword(password),
      );
      res.status(201).json({
        ok: true,
        ...issueSession(db, req, res, { secure: secureCookie }),
      });
    }),
  );
  app.post(
    "/api/auth/login",
    wrap((req, res) => {
      rateLimit(req, "login", 15, 15 * 60 * 1000);
      const stored = currentPassword();
      if (!stored || !verifyPassword(text(req.body?.password, 128), stored))
        fail(401, "Senha incorreta. Confira e tente novamente.");
      res.json({
        ok: true,
        ...issueSession(db, req, res, { secure: secureCookie }),
      });
    }),
  );
  app.post("/api/auth/logout", admin, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
      tokenHash(readSessionToken(req)),
    );
    res.clearCookie("pronto_session", { path: "/" });
    res.json({ ok: true });
  });

  const staffConfig = () => {
    const value = db
      .prepare("SELECT value FROM settings WHERE key='staff'")
      .get()?.value;
    return value ? JSON.parse(value) : { enabled: false, password: "" };
  };
  app.get("/api/admin/staff", admin, (_req, res) => {
    const c = staffConfig();
    res.json({ enabled: c.enabled, configured: Boolean(c.password) });
  });
  app.put(
    "/api/admin/staff",
    admin,
    wrap((req, res) => {
      const old = staffConfig(),
        pin = String(req.body?.pin || "");
      if (pin && !/^\d{6,12}$/.test(pin))
        fail(400, "Use um PIN de 6 a 12 números.");
      const enabled = req.body?.enabled === true;
      if (enabled && !pin && !old.password)
        fail(400, "Defina o PIN antes de habilitar o garçom.");
      transaction(db, () => {
        db.prepare(
          "INSERT INTO settings(key,value) VALUES ('staff',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ).run(
          JSON.stringify({
            enabled,
            password: pin ? hashPassword(pin) : old.password,
          }),
        );
        db.prepare("DELETE FROM sessions WHERE role='waiter'").run();
      });
      res.json({ ok: true, enabled });
    }),
  );
  app.get("/api/staff/session", (req, res) => {
    const session = staffSession(db, req);
    res.json({
      authenticated: Boolean(session),
      name: session?.name || "",
      enabled: staffConfig().enabled,
    });
  });
  app.post(
    "/api/staff/login",
    wrap((req, res) => {
      rateLimit(req, "staff-login", 8, 15 * 60 * 1000);
      const c = staffConfig(),
        name = text(req.body?.name, 40);
      if (
        !c.enabled ||
        !verifyPassword(String(req.body?.pin || ""), c.password)
      )
        fail(401, "PIN incorreto ou acesso do garçom desativado.");
      if (name.length < 2)
        fail(400, "Informe seu nome para identificar os pedidos.");
      issueStaffSession(db, res, name, { secure: secureCookie });
      res.json({ ok: true, name });
    }),
  );
  app.post(
    "/api/staff/logout",
    wrap((req, res) => {
      db.prepare(
        "DELETE FROM sessions WHERE token_hash=? AND role='waiter'",
      ).run(tokenHash(readSessionToken(req, "pronto_staff_session")));
      res.clearCookie("pronto_staff_session", { path: "/" });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/staff/orders",
    staff,
    wrap((req, res) => {
      const rows = db
        .prepare(
          "SELECT id FROM orders WHERE source='waiter' AND actor_name=? ORDER BY sequence DESC LIMIT 50",
        )
        .all(req.staff.name);
      res.json({
        orders: rows.map((row) => {
          const { phone, address, deliveryAddress, ...order } = readOrder(
            db,
            row.id,
            {
              privateData: false,
            },
          );
          return order;
        }),
      });
    }),
  );

  function createOrder(req, res, source = "menu") {
    const internal = source !== "menu";
    rateLimit(
      req,
      "create-order-" + source,
      internal ? 300 : 40,
      10 * 60 * 1000,
    );
    const body = req.body || {},
      key = text(req.headers["idempotency-key"], 100);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      fail(400, "Identificador do pedido inválido. Atualize o carrinho.");
    const hash = createHash("sha256")
      .update(JSON.stringify({ source, body }))
      .digest("hex");
    const old = db
      .prepare(
        "SELECT id,tracking_token,request_hash,source FROM orders WHERE idempotency_key=?",
      )
      .get(key);
    if (old) {
      const legacyHash = createHash("sha256")
        .update(JSON.stringify(body))
        .digest("hex");
      if (
        old.request_hash !== hash &&
        !(
          source === "menu" &&
          old.source === "menu" &&
          old.request_hash === legacyHash
        )
      )
        fail(
          409,
          "Esse envio já foi usado com outro carrinho. Inicie um novo pedido.",
        );
      return res.json({
        order: readOrder(db, old.id, { privateData: false }),
        trackingToken: old.tracking_token,
        repeated: true,
      });
    }
    const store = readStore(db);
    if (!internal && !store.open)
      fail(409, "A loja está fechada para novos pedidos.");
    const tableName = internal ? text(body.tableName, 24) : "";
    const customerName =
        text(body.customerName, 80) ||
        (internal ? (tableName ? `Mesa ${tableName}` : "Balcão") : ""),
      phone = text(body.phone, 30).replace(/\D/g, "");
    if (
      customerName.length < 2 ||
      (!internal && (phone.length < 10 || phone.length > 13)) ||
      (internal && phone.length > 0 && (phone.length < 10 || phone.length > 13))
    )
      fail(400, "Informe seu nome e um telefone válido com DDD.");
    const fulfillment = body.fulfillment;
    if (
      !(
        internal ? ["pickup", "delivery", "dinein"] : ["pickup", "delivery"]
      ).includes(fulfillment) ||
      (!internal && fulfillment === "delivery" && !store.allowDelivery) ||
      (!internal && fulfillment === "pickup" && !store.allowPickup)
    )
      fail(400, "Escolha uma forma de recebimento disponível.");
    if (fulfillment === "dinein" && !tableName)
      fail(400, "Informe a mesa para o pedido no salão.");
    const deliveryAddress =
      fulfillment === "delivery"
        ? normalizeDeliveryAddress(body.deliveryAddress, fail)
        : {};
    const address =
      fulfillment === "delivery"
        ? Object.keys(deliveryAddress).length
          ? [
              deliveryAddress.street,
              deliveryAddress.number,
              deliveryAddress.neighborhood,
              deliveryAddress.city,
              deliveryAddress.state,
              deliveryAddress.complement,
              deliveryAddress.reference,
            ]
              .filter(Boolean)
              .join(", ")
          : text(body.address, 400)
        : "";
    if (fulfillment === "delivery" && address.length < 8)
      fail(400, "Informe rua, número, bairro e um ponto de referência.");
    if (
      !(internal ? ["cash", "card", "pending"] : ["cash", "card"]).includes(
        body.payment,
      )
    )
      fail(400, "Escolha dinheiro ou cartão na entrega/retirada.");
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 40
    )
      fail(400, "Adicione de 1 a 40 itens ao carrinho.");
    const lines = body.items.map((i) => {
      if (!i || !integer(i.quantity, 1, 20))
        fail(400, "A quantidade de cada item deve estar entre 1 e 20.");
      const product = db
        .prepare("SELECT * FROM products WHERE id=? AND available=1")
        .get(text(i.productId, 100));
      if (!product)
        fail(
          409,
          "Um item ficou indisponível. Revise o cardápio antes de enviar.",
        );
      const priced = priceModifiers(db, product, i.modifiers);
      return {
        productId: product.id,
        name: product.name,
        price: priced.price,
        basePrice: product.price,
        modifiers: priced.modifiers,
        quantity: i.quantity,
        notes: text(i.notes, 250),
        station: product.station,
        category: product.category,
      };
    });
    const subtotal = lines.reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (!internal && subtotal < store.minimumOrder)
      fail(
        400,
        `O pedido mínimo é R$ ${(store.minimumOrder / 100).toFixed(2).replace(".", ",")}.`,
      );
    const deliveryFee = fulfillment === "delivery" ? store.deliveryFee : 0,
      total = subtotal + deliveryFee;
    if (body.expectedTotal !== undefined && body.expectedTotal !== total)
      fail(
        409,
        "Os preços mudaram desde que você abriu o cardápio. Atualize a página e confira o carrinho antes de enviar.",
      );
    const changeFor =
      body.payment === "cash" && body.changeFor != null ? body.changeFor : null;
    if (changeFor !== null && !integer(changeFor, total, 10000000))
      fail(400, "O valor para troco precisa ser igual ou maior que o total.");
    const id = randomUUID(),
      trackingToken = randomBytes(24).toString("hex"),
      now = new Date().toISOString();
    transaction(db, () => {
      reserveStock(db, lines, id, now, fail);
      db.prepare(
        `INSERT INTO orders(id,idempotency_key,request_hash,tracking_token,customer_name,phone,fulfillment,address,payment,change_for,notes,subtotal,delivery_fee,total,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        key,
        hash,
        trackingToken,
        customerName,
        phone,
        fulfillment,
        address,
        body.payment,
        changeFor,
        text(body.notes, 500),
        subtotal,
        deliveryFee,
        total,
        internal ? "preparing" : "new",
        now,
        now,
      );
      db.prepare(
        "UPDATE orders SET source=?,table_name=?,pickup_code=?,actor_name=?,accepted_at=? WHERE id=?",
      ).run(
        source,
        tableName,
        internal ? text(body.pickupCode, 24) : "",
        source === "waiter" ? req.staff.name : internal ? "Operador" : "",
        internal ? now : null,
        id,
      );
      db.prepare("UPDATE orders SET delivery_address=? WHERE id=?").run(
        JSON.stringify(deliveryAddress),
        id,
      );
      if (internal && body.printAtCounter === true)
        db.prepare("UPDATE orders SET counter_requested=1 WHERE id=?").run(id);
      const insert = db.prepare(
        "INSERT INTO order_items(id,order_id,product_id,name,price,quantity,notes,station,category,base_price,modifiers) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      );
      for (const line of lines)
        insert.run(
          randomUUID(),
          id,
          line.productId,
          line.name,
          line.price,
          line.quantity,
          line.notes,
          line.station,
          line.category,
          line.basePrice,
          JSON.stringify(line.modifiers),
        );
      db.prepare(
        "INSERT INTO order_events(id,order_id,status,created_at) VALUES (?,?,?,?)",
      ).run(randomUUID(), id, internal ? "preparing" : "new", now);
      if (internal) enqueuePrintJobs(db, id, now);
    });
    res.status(201).json({
      order: readOrder(db, id, { privateData: false }),
      trackingToken,
    });
  }
  app.post(
    "/api/orders",
    wrap((req, res) => createOrder(req, res, "menu")),
  );
  app.post(
    "/api/admin/orders",
    admin,
    wrap((req, res) => createOrder(req, res, "manager")),
  );
  app.post(
    "/api/staff/orders",
    staff,
    wrap((req, res) => createOrder(req, res, "waiter")),
  );
  app.get(
    "/api/track/:token",
    wrap((req, res) => {
      rateLimit(req, "track", 180, 60000);
      const row = db
        .prepare("SELECT id FROM orders WHERE tracking_token=?")
        .get(req.params.token);
      if (!row)
        fail(404, "Pedido não encontrado. Confira o link de acompanhamento.");
      const order = readOrder(db, row.id, { privateData: false });
      // Acompanhamento público não devolve endereço nem telefone.
      const { phone, address, deliveryAddress, ...safeOrder } = order;
      res.json({ order: safeOrder, store: readStore(db) });
    }),
  );
  app.get(
    "/api/admin/orders",
    admin,
    wrap((req, res) => {
      expireClaims();
      const rows = db
        .prepare("SELECT id FROM orders ORDER BY sequence DESC LIMIT 250")
        .all();
      res.json({
        orders: rows.map((r) => readOrder(db, r.id)),
        store: readStore(db),
      });
    }),
  );
  app.patch(
    "/api/admin/orders/:id/status",
    admin,
    wrap((req, res) => {
      const order = readOrder(db, req.params.id);
      if (!order) fail(404, "Pedido não encontrado.");
      const next = req.body?.status;
      if (!statuses.includes(next)) fail(400, "Situação inválida.");
      if (next === order.status) return res.json({ order });
      if (req.body?.expectedStatus !== order.status)
        fail(
          409,
          "Este pedido mudou em outra tela. Atualize e tente novamente.",
        );
      if (!nextStates[order.status].includes(next))
        fail(409, "Essa mudança não é permitida para a situação atual.");
      const now = new Date().toISOString();
      transaction(db, () => {
        const result = db
          .prepare(
            "UPDATE orders SET status=?,updated_at=? WHERE id=? AND status=?",
          )
          .run(next, now, order.id, order.status);
        if (result.changes !== 1)
          fail(409, "Pedido alterado por outro operador.");
        db.prepare(
          "INSERT INTO order_events(id,order_id,status,created_at) VALUES (?,?,?,?)",
        ).run(randomUUID(), order.id, next, now);
        if (order.status === "new" && next === "preparing") {
          reserveStock(db, order.items, order.id, now, fail);
          db.prepare("UPDATE orders SET accepted_at=? WHERE id=?").run(
            now,
            order.id,
          );
          enqueuePrintJobs(db, order.id, now);
        }
        if (next === "cancelled" && order.status === "new")
          releaseStock(db, order.id, now);
        if (next === "cancelled")
          db.prepare(
            "UPDATE print_jobs SET state='cancelled',updated_at=? WHERE order_id=? AND state IN ('pending','claimed')",
          ).run(now, order.id);
      });
      res.json({ order: readOrder(db, order.id) });
    }),
  );
  app.post(
    "/api/admin/orders/:id/counter",
    admin,
    wrap((req, res) => {
      const order = readOrder(db, req.params.id);
      if (!order) fail(404, "Pedido não encontrado.");
      if (order.status === "cancelled")
        fail(409, "Pedido cancelado não pode ser impresso.");
      const enabled = req.body?.enabled !== false;
      if (!enabled && order.status !== "new")
        fail(409, "A via já foi solicitada. Confira a fila de impressão.");
      if (
        enabled &&
        !db
          .prepare(
            "SELECT 1 FROM print_targets WHERE location='counter' AND enabled=1",
          )
          .get()
      )
        fail(
          409,
          "Habilite a saída de balcão em Impressão antes de solicitar essa via.",
        );
      transaction(db, () => {
        db.prepare("UPDATE orders SET counter_requested=? WHERE id=?").run(
          enabled ? 1 : 0,
          order.id,
        );
        if (enabled && order.status !== "new")
          enqueuePrintJobs(db, order.id, new Date().toISOString(), {
            counterOnly: true,
          });
      });
      res.json({ order: readOrder(db, order.id) });
    }),
  );
  app.get(
    "/api/admin/orders/:id/receipt",
    admin,
    wrap((req, res) => {
      const order = readOrder(db, req.params.id);
      if (!order) fail(404, "Pedido não encontrado.");
      const general = db
        .prepare(
          "SELECT * FROM print_targets WHERE enabled=1 AND station='*' ORDER BY rowid LIMIT 1",
        )
        .get();
      res.type("html").send(
        receipt.renderReceipt(
          order,
          readStore(db),
          {
            ...(general ? cleanTarget(general) : {}),
            width:
              req.query.width === "58"
                ? 58
                : req.query.width === "80"
                  ? 80
                  : general?.width || 80,
            label: general?.label || "Comanda geral",
            station: "*",
          },
          { reprint: true },
        ),
      );
    }),
  );
  app.get("/api/admin/catalog", admin, (_req, res) =>
    res.json({
      products: publicProducts(),
      store: readStore(db),
      categories: categories(),
      modifierGroups: readModifierGroups(db),
    }),
  );
  app.get("/api/admin/modifier-groups", admin, (_req, res) =>
    res.json({ groups: readModifierGroups(db) }),
  );
  app.post(
    "/api/admin/modifier-groups",
    admin,
    wrap((req, res) => {
      if (readModifierGroups(db).length >= 60)
        fail(400, "São permitidos até 60 grupos.");
      const group = validateModifierGroup(req.body);
      db.prepare("INSERT INTO modifier_groups(id,definition) VALUES (?,?)").run(
        group.id,
        JSON.stringify(group),
      );
      res.status(201).json({ group });
    }),
  );
  app.put(
    "/api/admin/modifier-groups/:id",
    admin,
    wrap((req, res) => {
      if (
        !db
          .prepare("SELECT 1 FROM modifier_groups WHERE id=?")
          .get(req.params.id)
      )
        fail(404, "Grupo não encontrado.");
      const group = validateModifierGroup(req.body, req.params.id);
      db.prepare("UPDATE modifier_groups SET definition=? WHERE id=?").run(
        JSON.stringify(group),
        group.id,
      );
      res.json({ group });
    }),
  );
  app.delete(
    "/api/admin/modifier-groups/:id",
    admin,
    wrap((req, res) => {
      if (
        db
          .prepare("SELECT modifier_group_ids FROM products")
          .all()
          .some((p) => JSON.parse(p.modifier_group_ids).includes(req.params.id))
      )
        fail(409, "Desvincule o grupo dos produtos antes de excluir.");
      db.prepare("DELETE FROM modifier_groups WHERE id=?").run(req.params.id);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/categories",
    admin,
    wrap((req, res) => {
      const name = text(req.body?.name, 60);
      if (name.length < 2)
        fail(400, "Informe um nome de categoria com pelo menos 2 caracteres.");
      if (categories().length >= 40)
        fail(400, "São permitidas até 40 categorias.");
      if (
        db
          .prepare("SELECT 1 FROM categories WHERE name=? COLLATE NOCASE")
          .get(name)
      )
        fail(409, "Essa categoria já existe.");
      db.prepare("INSERT INTO categories(id,name,sort) VALUES (?,?,?)").run(
        randomUUID(),
        name,
        (db.prepare("SELECT MAX(sort) AS n FROM categories").get().n ?? -1) + 1,
      );
      res.status(201).json({ categories: categories() });
    }),
  );
  app.put(
    "/api/admin/categories/order",
    admin,
    wrap((req, res) => {
      const ids = req.body?.ids,
        current = categories();
      if (
        !Array.isArray(ids) ||
        ids.length !== current.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !current.some((c) => c.id === id))
      )
        fail(409, "As categorias mudaram. Atualize antes de ordenar.");
      transaction(db, () =>
        ids.forEach((id, index) =>
          db.prepare("UPDATE categories SET sort=? WHERE id=?").run(index, id),
        ),
      );
      res.json({ categories: categories() });
    }),
  );
  app.patch(
    "/api/admin/categories/:id",
    admin,
    wrap((req, res) => {
      const old = db
          .prepare("SELECT * FROM categories WHERE id=?")
          .get(req.params.id),
        name = text(req.body?.name, 60);
      if (!old) fail(404, "Categoria não encontrada.");
      if (name.length < 2) fail(400, "Informe um nome de categoria.");
      if (
        db
          .prepare(
            "SELECT 1 FROM categories WHERE name=? COLLATE NOCASE AND id<>?",
          )
          .get(name, old.id)
      )
        fail(409, "Essa categoria já existe.");
      transaction(db, () => {
        db.prepare("UPDATE categories SET name=? WHERE id=?").run(name, old.id);
        db.prepare("UPDATE products SET category=? WHERE category=?").run(
          name,
          old.name,
        );
        for (const row of db.prepare("SELECT * FROM print_targets").all()) {
          const target = cleanTarget(row);
          if (target.filter.mode === "categories")
            target.filter.values = target.filter.values.map((v) =>
              v === old.name ? name : v,
            );
          target.options.categoryHighlights =
            target.options.categoryHighlights.map((r) => ({
              ...r,
              category: r.category === old.name ? name : r.category,
            }));
          db.prepare(
            "UPDATE print_targets SET filter=?,options=? WHERE id=?",
          ).run(
            JSON.stringify(target.filter),
            JSON.stringify(target.options),
            row.id,
          );
        }
      });
      res.json({ categories: categories() });
    }),
  );
  app.delete(
    "/api/admin/categories/:id",
    admin,
    wrap((req, res) => {
      const old = db
        .prepare("SELECT * FROM categories WHERE id=?")
        .get(req.params.id);
      if (!old) fail(404, "Categoria não encontrada.");
      if (db.prepare("SELECT 1 FROM products WHERE category=?").get(old.name))
        fail(
          409,
          "Mova os produtos para outra categoria antes de excluir esta.",
        );
      db.prepare("DELETE FROM categories WHERE id=?").run(old.id);
      res.json({ categories: categories() });
    }),
  );
  app.post(
    "/api/admin/products",
    admin,
    wrap((req, res) => {
      const b = req.body || {},
        id = randomUUID(),
        name = text(b.name, 100),
        description = text(b.description, 400),
        category = text(b.category, 60),
        station = text(b.station, 60) || "Cozinha";
      if (name.length < 2 || !category || !integer(b.price, 0, 1000000))
        fail(400, "Preencha nome, categoria e um preço válido.");
      if (!db.prepare("SELECT 1 FROM categories WHERE name=?").get(category))
        fail(400, "Cadastre a categoria antes de adicionar o produto.");
      const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
      const groupIds = productGroupIds(db, b.modifierGroupIds);
      if (count >= 200) fail(400, "O MVP suporta até 200 produtos.");
      db.prepare(
        "INSERT INTO products(id,name,description,category,price,station,art,sort) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        id,
        name,
        description,
        category,
        b.price,
        station,
        text(b.art, 30) || "burger",
        count,
      );
      db.prepare("UPDATE products SET modifier_group_ids=? WHERE id=?").run(
        JSON.stringify(groupIds),
        id,
      );
      res.status(201).json({ ok: true });
    }),
  );
  app.patch(
    "/api/admin/products/:id",
    admin,
    wrap((req, res) => {
      const old = db
        .prepare("SELECT * FROM products WHERE id=?")
        .get(req.params.id);
      if (!old) fail(404, "Produto não encontrado.");
      const b = req.body || {};
      if (Object.keys(b).length === 1 && typeof b.available === "boolean") {
        db.prepare("UPDATE products SET available=? WHERE id=?").run(
          b.available ? 1 : 0,
          old.id,
        );
        return res.json({ ok: true });
      }
      const name = text(b.name, 100),
        category = text(b.category, 60),
        station = text(b.station, 60);
      if (
        name.length < 2 ||
        !category ||
        !station ||
        !integer(b.price, 0, 1000000)
      )
        fail(400, "Preencha nome, categoria, setor e preço.");
      if (!db.prepare("SELECT 1 FROM categories WHERE name=?").get(category))
        fail(400, "Escolha uma categoria cadastrada.");
      const groupIds = productGroupIds(
        db,
        b.modifierGroupIds === undefined
          ? JSON.parse(old.modifier_group_ids)
          : b.modifierGroupIds,
      );
      db.prepare(
        "UPDATE products SET name=?,description=?,category=?,price=?,station=?,available=?,art=? WHERE id=?",
      ).run(
        name,
        text(b.description, 400),
        category,
        b.price,
        station,
        b.available ? 1 : 0,
        text(b.art, 30) || old.art,
        old.id,
      );
      db.prepare("UPDATE products SET modifier_group_ids=? WHERE id=?").run(
        JSON.stringify(groupIds),
        old.id,
      );
      res.json({ ok: true });
    }),
  );
  app.patch(
    "/api/admin/store",
    admin,
    wrap((req, res) => {
      const b = req.body || {},
        old = readStore(db);
      const next = { ...old };
      for (const key of ["open", "allowDelivery", "allowPickup"])
        if (typeof b[key] === "boolean") next[key] = b[key];
      if ("name" in b) {
        next.name = text(b.name, 80);
        if (next.name.length < 2) fail(400, "Informe o nome da loja.");
      }
      if ("subtitle" in b) next.subtitle = text(b.subtitle, 160);
      if ("phone" in b) next.phone = text(b.phone, 30);
      for (const key of ["deliveryFee", "minimumOrder"])
        if (key in b) {
          if (!integer(b[key], 0, 1000000)) fail(400, "Valor inválido.");
          next[key] = b[key];
        }
      if ("estimatedMinutes" in b) {
        if (!integer(b.estimatedMinutes, 5, 240))
          fail(400, "O prazo deve estar entre 5 e 240 minutos.");
        next.estimatedMinutes = b.estimatedMinutes;
      }
      if (!next.allowDelivery && !next.allowPickup)
        fail(400, "Habilite ao menos entrega ou retirada.");
      db.prepare("UPDATE settings SET value=? WHERE key='store'").run(
        JSON.stringify(next),
      );
      res.json({ store: next });
    }),
  );
  app.post(
    "/api/admin/printing/preview",
    admin,
    wrap((req, res) => {
      const t = req.body?.target || {};
      const target = {
        id: text(t.id, 70),
        width: t.width === 58 ? 58 : 80,
        label: text(t.label, 80) || "Comanda geral",
        station: text(t.station, 60) || "*",
        options: receipt.normalizeReceiptOptions(t.options, t.width),
        location: t.location === "counter" ? "counter" : "kitchen",
        filter: printing.normalizeFilter(t.filter, t.station),
      };
      const order = req.body?.orderId
        ? readOrder(db, text(req.body.orderId, 100))
        : receipt.testOrder();
      if (!order) fail(404, "Pedido não encontrado.");
      const allTargets = Array.isArray(req.body.targets)
        ? req.body.targets
        : db
            .prepare("SELECT * FROM print_targets WHERE enabled=1")
            .all()
            .map(cleanTarget);
      let planned = printing.matchingTargets(
        allTargets,
        order.items,
        Boolean(order.printAtCounter) || target.location === "counter",
      );
      if (!planned.some((p) => p.id === target.id))
        planned = [...planned, target];
      res.json({
        html: receipt.renderReceipt(order, readStore(db), target, {
          test: !req.body?.orderId,
          receipt: {
            count:
              order.printJobs?.find((j) => j.targetId === target.id)
                ?.receiptCount || planned.length,
            index:
              order.printJobs?.find((j) => j.targetId === target.id)
                ?.receiptIndex ||
              Math.max(1, planned.findIndex((p) => p.id === target.id) + 1),
          },
        }),
        options: target.options,
      });
    }),
  );
  app.get(
    "/api/admin/printing",
    admin,
    wrap((_req, res) => {
      expireClaims();
      const targets = db
        .prepare("SELECT * FROM print_targets ORDER BY rowid")
        .all()
        .map(cleanTarget);
      const jobs = db
        .prepare(
          `SELECT j.id,j.order_id AS orderId,j.target_id AS targetId,j.state,j.attempt,j.last_error AS lastError,j.created_at AS createdAt,o.sequence AS number,t.label FROM print_jobs j JOIN orders o ON o.id=j.order_id JOIN print_targets t ON t.id=j.target_id ORDER BY j.created_at DESC LIMIT 100`,
        )
        .all();
      res.json({ targets, jobs });
    }),
  );
  app.put(
    "/api/admin/printing/targets",
    admin,
    wrap((req, res) => {
      if (
        !Array.isArray(req.body?.targets) ||
        !req.body.targets.length ||
        req.body.targets.length > 8
      )
        fail(400, "Configure entre uma e oito saídas de impressão.");
      const seen = new Set();
      const targets = req.body.targets.map((t, i) => {
        const id = text(t.id, 70) || randomUUID();
        if (seen.has(id)) fail(400, "Saídas duplicadas.");
        seen.add(id);
        const label = text(t.label, 80);
        if (!label || ![58, 80].includes(t.width))
          fail(400, "Informe nome e largura de cada saída.");
        return {
          id,
          label,
          deviceName: text(t.deviceName, 240),
          width: t.width,
          station: text(t.station, 60) || "*",
          enabled: Boolean(t.enabled),
          options: receipt.normalizeReceiptOptions(t.options, t.width),
          location: t.location === "counter" ? "counter" : "kitchen",
          filter: printing.normalizeFilter(t.filter, t.station),
        };
      });
      const generalPrinter = targets.find((t) => t.id === "geral")?.deviceName;
      if (generalPrinter)
        for (const t of targets)
          if (t.id !== "geral" && !t.deviceName) t.deviceName = generalPrinter;
      if (
        !targets.some(
          (t) =>
            t.enabled && t.location === "kitchen" && t.filter.mode === "all",
        )
      )
        fail(400, "Mantenha uma comanda geral habilitada.");
      transaction(db, () => {
        db.prepare("UPDATE print_targets SET enabled=0").run();
        for (const t of targets)
          db.prepare(
            "INSERT INTO print_targets(id,label,device_name,width,station,enabled,options,location,filter) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,device_name=excluded.device_name,width=excluded.width,station=excluded.station,enabled=excluded.enabled,options=excluded.options,location=excluded.location,filter=excluded.filter",
          ).run(
            t.id,
            t.label,
            t.deviceName,
            t.width,
            t.station,
            t.enabled ? 1 : 0,
            JSON.stringify(t.options),
            t.location,
            JSON.stringify(t.filter),
          );
        // Layout novo vale para trabalhos ainda pendentes; o filtro do lote é preservado.
        for (const t of targets)
          for (const job of db
            .prepare(
              "SELECT id,target_snapshot FROM print_jobs WHERE target_id=? AND state='pending' AND target_snapshot IS NOT NULL",
            )
            .all(t.id)) {
            const snap = JSON.parse(job.target_snapshot);
            db.prepare(
              "UPDATE print_jobs SET target_snapshot=? WHERE id=?",
            ).run(
              JSON.stringify({
                ...snap,
                options: t.options,
                deviceName: t.deviceName,
                width: t.width,
                label: t.label,
              }),
              job.id,
            );
          }
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/printing/claim",
    admin,
    wrap((req, res) => {
      const agentId = text(req.body?.agentId, 100);
      if (!agentId) fail(400, "Agente inválido.");
      expireClaims();
      const job = transaction(db, () => {
        const row = db
          .prepare(
            `SELECT j.* FROM print_jobs j JOIN print_targets t ON t.id=j.target_id JOIN orders o ON o.id=j.order_id WHERE j.state='pending' AND t.enabled=1 AND t.device_name<>'' AND o.status<>'cancelled' AND (o.source<>'menu' OR o.status<>'new') ORDER BY j.created_at,j.rowid LIMIT 1`,
          )
          .get();
        if (!row) return null;
        const token = randomBytes(24).toString("hex"),
          now = new Date().toISOString();
        db.prepare(
          "UPDATE print_jobs SET state='claimed',claim_token=?,agent_id=?,lease_until=?,attempt=attempt+1,updated_at=? WHERE id=? AND state='pending'",
        ).run(token, agentId, Date.now() + 120000, now, row.id);
        const liveTarget = cleanTarget(
          db
            .prepare("SELECT * FROM print_targets WHERE id=?")
            .get(row.target_id),
        );
        const target = row.target_snapshot
          ? JSON.parse(row.target_snapshot)
          : liveTarget;
        target.deviceName = liveTarget.deviceName;
        return {
          id: row.id,
          claimToken: token,
          target,
          order: readOrder(db, row.order_id),
          store: readStore(db),
          reprint: row.attempt > 0,
          receipt: {
            index: row.batch_index,
            count: row.batch_count,
            lateExtra: Boolean(row.late_extra),
          },
        };
      });
      res.json({ job });
    }),
  );
  app.post(
    "/api/admin/printing/jobs/:id/start",
    admin,
    wrap((req, res) => {
      const row = db
        .prepare("SELECT * FROM print_jobs WHERE id=?")
        .get(req.params.id);
      if (
        !row ||
        row.claim_token !== req.body?.claimToken ||
        row.state !== "claimed" ||
        row.lease_until < Date.now()
      )
        fail(
          409,
          "A reserva da comanda expirou. Nenhuma impressão foi iniciada.",
        );
      const order = readOrder(db, row.order_id);
      if (
        order.status === "cancelled" ||
        (order.source === "menu" && order.status === "new")
      )
        fail(409, "O pedido não está aceito para impressão.");
      db.prepare(
        "UPDATE print_jobs SET state='printing',lease_until=?,updated_at=? WHERE id=?",
      ).run(Date.now() + 120000, new Date().toISOString(), row.id);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/printing/jobs/:id/result",
    admin,
    wrap((req, res) => {
      const row = db
        .prepare("SELECT * FROM print_jobs WHERE id=?")
        .get(req.params.id);
      if (!row || row.claim_token !== req.body?.claimToken)
        fail(409, "Reserva de impressão inválida.");
      const state = req.body?.state;
      if (!["spooled", "failed", "uncertain"].includes(state))
        fail(400, "Resultado inválido.");
      if (row.state === "spooled" && state === "spooled")
        return res.json({ ok: true });
      if (!["claimed", "printing", "uncertain"].includes(row.state))
        fail(409, "A comanda mudou. Atualize a fila.");
      db.prepare(
        "UPDATE print_jobs SET state=?,last_error=?,lease_until=NULL,updated_at=? WHERE id=?",
      ).run(
        state,
        text(req.body?.error, 500) || null,
        new Date().toISOString(),
        row.id,
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/printing/jobs/:id/retry",
    admin,
    wrap((req, res) => {
      const row = db
        .prepare("SELECT * FROM print_jobs WHERE id=?")
        .get(req.params.id);
      if (!row) fail(404, "Comanda não encontrada.");
      if (!["failed", "uncertain", "spooled"].includes(row.state))
        fail(409, "Aguarde o trabalho atual terminar.");
      if (req.body?.confirmed !== true)
        fail(400, "Confira o papel antes de confirmar a reimpressão.");
      const retryOrder = readOrder(db, row.order_id);
      if (
        retryOrder.status === "cancelled" ||
        (retryOrder.source === "menu" && retryOrder.status === "new")
      )
        fail(
          409,
          "Aceite o pedido antes de reenviar; pedidos cancelados não podem ser impressos.",
        );
      db.prepare(
        "UPDATE print_jobs SET state='pending',claim_token=NULL,agent_id=NULL,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=?",
      ).run(new Date().toISOString(), row.id);
      res.json({ ok: true });
    }),
  );
  const appIcons = [
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
  ];
  app.get("/garcom.webmanifest", (_req, res) =>
    res.type("application/manifest+json").json({
      id: "/garcom",
      name: "Pronto Garçom",
      short_name: "Garçom",
      start_url: "/garcom#/garcom",
      scope: "/",
      display: "standalone",
      background_color: "#f6f7f3",
      theme_color: "#ef5a36",
      icons: appIcons,
    }),
  );
  app.get("/manifest.webmanifest", (_req, res) =>
    res.type("application/manifest+json").json({
      name: readStore(db).name,
      short_name: "Pronto",
      start_url: "/",
      display: "standalone",
      background_color: "#f7f7f2",
      theme_color: "#ef5a36",
      icons: appIcons,
    }),
  );
  if (existsSync(webDir)) {
    app.use(express.static(webDir, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) =>
      res.sendFile("index.html", { root: resolve(webDir) }),
    );
  }
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Recurso não encontrado." }),
  );
  app.use((error, req, res, _next) => {
    if (error.type === "entity.parse.failed")
      return res
        .status(400)
        .json({ error: "O pedido contém dados inválidos." });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "O pedido ultrapassou o tamanho permitido." });
    if (!error.status) console.error("Falha na requisição:", error.message);
    res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : "Não foi possível concluir agora. Tente novamente.",
    });
  });
  return { app, db };
}
