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
} from "./database.mjs";
import {
  hashPassword,
  verifyPassword,
  authenticate,
  issueSession,
  readSessionToken,
  tokenHash,
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
  const wrap = (fn) => (req, res, next) => {
    try {
      Promise.resolve(fn(req, res)).catch(next);
    } catch (e) {
      next(e);
    }
  };
  const currentPassword = () =>
    db.prepare("SELECT value FROM settings WHERE key='password'").get()?.value;
  const publicProducts = () =>
    db
      .prepare("SELECT * FROM products ORDER BY sort,name")
      .all()
      .map((p) => ({
        ...p,
        available: Boolean(p.available),
        featured: Boolean(p.featured),
      }));
  const cleanTarget = (t) => ({
    id: t.id,
    label: t.label,
    deviceName: t.device_name,
    width: t.width,
    station: t.station,
    enabled: Boolean(t.enabled),
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
  app.get("/api/catalog", (_req, res) =>
    res.json({
      store: readStore(db),
      products: publicProducts().filter((p) => p.available),
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

  app.post(
    "/api/orders",
    wrap((req, res) => {
      rateLimit(req, "create-order", 40, 10 * 60 * 1000);
      const body = req.body || {},
        key = text(req.headers["idempotency-key"], 100);
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
        fail(400, "Identificador do pedido inválido. Atualize o carrinho.");
      const hash = createHash("sha256")
        .update(JSON.stringify(body))
        .digest("hex");
      const old = db
        .prepare(
          "SELECT id,tracking_token,request_hash FROM orders WHERE idempotency_key=?",
        )
        .get(key);
      if (old) {
        if (old.request_hash !== hash)
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
      if (!store.open) fail(409, "A loja está fechada para novos pedidos.");
      const customerName = text(body.customerName, 80),
        phone = text(body.phone, 30).replace(/\D/g, "");
      if (customerName.length < 2 || phone.length < 10 || phone.length > 13)
        fail(400, "Informe seu nome e um telefone válido com DDD.");
      const fulfillment = body.fulfillment;
      if (
        !["pickup", "delivery"].includes(fulfillment) ||
        (fulfillment === "delivery" && !store.allowDelivery) ||
        (fulfillment === "pickup" && !store.allowPickup)
      )
        fail(400, "Escolha uma forma de recebimento disponível.");
      const address = fulfillment === "delivery" ? text(body.address, 400) : "";
      if (fulfillment === "delivery" && address.length < 8)
        fail(400, "Informe rua, número, bairro e um ponto de referência.");
      if (!["cash", "card"].includes(body.payment))
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
        return {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: i.quantity,
          notes: text(i.notes, 250),
          station: product.station,
        };
      });
      const subtotal = lines.reduce((sum, i) => sum + i.price * i.quantity, 0);
      if (subtotal < store.minimumOrder)
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
        body.payment === "cash" && body.changeFor != null
          ? body.changeFor
          : null;
      if (changeFor !== null && !integer(changeFor, total, 10000000))
        fail(400, "O valor para troco precisa ser igual ou maior que o total.");
      const id = randomUUID(),
        trackingToken = randomBytes(24).toString("hex"),
        now = new Date().toISOString();
      transaction(db, () => {
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
          "new",
          now,
          now,
        );
        const insert = db.prepare(
          "INSERT INTO order_items(id,order_id,product_id,name,price,quantity,notes,station) VALUES (?,?,?,?,?,?,?,?)",
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
          );
        db.prepare(
          "INSERT INTO order_events(id,order_id,status,created_at) VALUES (?,?,?,?)",
        ).run(randomUUID(), id, "new", now);
        enqueuePrintJobs(db, id, now);
      });
      res.status(201).json({
        order: readOrder(db, id, { privateData: false }),
        trackingToken,
      });
    }),
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
      const { phone, address, ...safeOrder } = order;
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
        if (next === "cancelled")
          db.prepare(
            "UPDATE print_jobs SET state='cancelled',updated_at=? WHERE order_id=? AND state IN ('pending','claimed')",
          ).run(now, order.id);
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
      res.type("html").send(
        receipt.renderReceipt(
          order,
          readStore(db),
          {
            width: req.query.width === "58" ? 58 : 80,
            label: "Comanda geral",
            station: "*",
          },
          { reprint: true },
        ),
      );
    }),
  );
  app.get("/api/admin/catalog", admin, (_req, res) =>
    res.json({ products: publicProducts(), store: readStore(db) }),
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
      const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
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
        };
      });
      if (!targets.some((t) => t.enabled && t.station === "*"))
        fail(400, "Mantenha uma comanda geral habilitada.");
      transaction(db, () => {
        db.prepare("UPDATE print_targets SET enabled=0").run();
        for (const t of targets)
          db.prepare(
            "INSERT INTO print_targets(id,label,device_name,width,station,enabled) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,device_name=excluded.device_name,width=excluded.width,station=excluded.station,enabled=excluded.enabled",
          ).run(
            t.id,
            t.label,
            t.deviceName,
            t.width,
            t.station,
            t.enabled ? 1 : 0,
          );
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
            `SELECT j.* FROM print_jobs j JOIN print_targets t ON t.id=j.target_id JOIN orders o ON o.id=j.order_id WHERE j.state='pending' AND t.enabled=1 AND t.device_name<>'' AND o.status<>'cancelled' ORDER BY j.created_at,j.rowid LIMIT 1`,
          )
          .get();
        if (!row) return null;
        const token = randomBytes(24).toString("hex"),
          now = new Date().toISOString();
        db.prepare(
          "UPDATE print_jobs SET state='claimed',claim_token=?,agent_id=?,lease_until=?,attempt=attempt+1,updated_at=? WHERE id=? AND state='pending'",
        ).run(token, agentId, Date.now() + 120000, now, row.id);
        const target = cleanTarget(
          db
            .prepare("SELECT * FROM print_targets WHERE id=?")
            .get(row.target_id),
        );
        return {
          id: row.id,
          claimToken: token,
          target,
          order: readOrder(db, row.order_id),
          store: readStore(db),
          reprint: row.attempt > 0,
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
      if (order.status === "cancelled") fail(409, "O pedido foi cancelado.");
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
      if (readOrder(db, row.order_id).status === "cancelled")
        fail(409, "Não é possível reenviar uma comanda de pedido cancelado.");
      db.prepare(
        "UPDATE print_jobs SET state='pending',claim_token=NULL,agent_id=NULL,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=?",
      ).run(new Date().toISOString(), row.id);
      res.json({ ok: true });
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
      icons: [
        {
          src: "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        },
      ],
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
