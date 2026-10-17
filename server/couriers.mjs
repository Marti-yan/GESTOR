import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  readSessionToken,
  tokenHash,
  hashPassword,
  verifyPassword,
} from "./auth.mjs";
import { readOrder, transaction } from "./database.mjs";
const clean = (v, n = 160) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";
export function installCouriers({
  app,
  db,
  admin,
  wrap,
  fail,
  rateLimit,
  secureCookie,
}) {
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('courier-epoch',?)").run(
    JSON.stringify(randomUUID()),
  );
  const epoch = JSON.parse(
    db.prepare("SELECT value FROM settings WHERE key='courier-epoch'").get()
      .value,
  );
  const readCourier = (req) => {
    const token = readSessionToken(req, "pronto_courier_session");
    if (!token || token.length > 160) return null;
    const value =
      db
        .prepare(
          "SELECT c.id,c.name FROM sessions s JOIN couriers c ON c.id=s.actor_name WHERE s.token_hash=? AND s.expires_at>? AND s.role='courier' AND c.active=1",
        )
        .get(tokenHash(token), Date.now()) || null;
    return value ? { ...value, epoch } : null;
  };
  const courier = (req, res, next) => {
    req.courier = readCourier(req);
    return req.courier
      ? next()
      : res.status(401).json({ error: "Entre com o acesso de entregador." });
  };
  const list = () =>
    db
      .prepare("SELECT id,name,phone,active FROM couriers ORDER BY name")
      .all()
      .map((c) => ({ ...c, active: !!c.active }));
  app.get("/api/admin/couriers", admin, (_req, res) =>
    res.json({
      couriers: list(),
      assignments: db
        .prepare(
          "SELECT d.*,o.sequence AS number,o.customer_name AS customerName,o.status AS orderStatus,c.name AS courierName FROM delivery_assignments d JOIN orders o ON o.id=d.order_id JOIN couriers c ON c.id=d.courier_id ORDER BY d.updated_at DESC LIMIT 500",
        )
        .all(),
    }),
  );
  app.post(
    "/api/admin/couriers",
    admin,
    wrap((req, res) => {
      const b = req.body || {},
        name = clean(b.name, 80),
        pin = clean(b.pin, 20);
      if (name.length < 2 || !/^\d{6,12}$/.test(pin))
        fail(400, "Informe nome e PIN de 6 a 12 números.");
      const id = randomUUID();
      db.prepare(
        "INSERT INTO couriers(id,name,phone,pin_hash) VALUES (?,?,?,?)",
      ).run(id, name, clean(b.phone, 30), hashPassword(pin));
      res.status(201).json({ id });
    }),
  );
  app.patch(
    "/api/admin/couriers/:id",
    admin,
    wrap((req, res) => {
      const c = db
        .prepare("SELECT * FROM couriers WHERE id=?")
        .get(req.params.id);
      if (!c) fail(404, "Entregador não encontrado.");
      const b = req.body || {},
        name = clean(b.name ?? c.name, 80);
      if (name.length < 2 || (b.pin && !/^\d{6,12}$/.test(b.pin)))
        fail(400, "Revise nome e PIN.");
      transaction(db, () => {
        db.prepare(
          "UPDATE couriers SET name=?,phone=?,active=?,pin_hash=? WHERE id=?",
        ).run(
          name,
          clean(b.phone ?? c.phone, 30),
          b.active === undefined ? c.active : b.active ? 1 : 0,
          b.pin ? hashPassword(b.pin) : c.pin_hash,
          c.id,
        );
        if (b.active === false || b.pin) {
          db.prepare(
            "UPDATE courier_positions SET sharing=0 WHERE courier_id=?",
          ).run(c.id);
          db.prepare("DELETE FROM courier_tracks WHERE courier_id=?").run(c.id);
          db.prepare("DELETE FROM courier_sharing WHERE courier_id=?").run(
            c.id,
          );
        }
        if (b.active === false || b.pin)
          db.prepare(
            "DELETE FROM sessions WHERE role='courier' AND actor_name=?",
          ).run(c.id);
      });
      res.json({ ok: true });
    }),
  );
  app.get("/api/courier/options", (_req, res) =>
    res.json({
      couriers: list()
        .filter((c) => c.active)
        .map(({ id, name }) => ({ id, name })),
    }),
  );
  app.get("/api/courier/session", (req, res) =>
    res.json({ courier: readCourier(req) }),
  );
  app.post(
    "/api/courier/login",
    wrap((req, res) => {
      rateLimit(req, "courier-login", 8, 15 * 60000);
      const c = db
        .prepare("SELECT * FROM couriers WHERE id=? AND active=1")
        .get(clean(req.body?.id, 100));
      if (!c || !verifyPassword(clean(req.body?.pin, 20), c.pin_hash))
        fail(401, "Acesso de entregador inválido.");
      const token = randomBytes(32).toString("hex");
      db.prepare(
        "INSERT INTO sessions(token_hash,expires_at,role,actor_name) VALUES (?,?,'courier',?)",
      ).run(tokenHash(token), Date.now() + 12 * 3600000, c.id);
      res.cookie("pronto_courier_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: secureCookie,
        maxAge: 12 * 3600000,
        path: "/",
      });
      res.json({ courier: { id: c.id, name: c.name, epoch } });
    }),
  );
  app.post("/api/courier/logout", (req, res) => {
    const c = readCourier(req);
    if (c) {
      db.prepare(
        "UPDATE courier_positions SET sharing=0 WHERE courier_id=?",
      ).run(c.id);
      db.prepare("DELETE FROM courier_tracks WHERE courier_id=?").run(c.id);
      db.prepare("DELETE FROM courier_sharing WHERE courier_id=?").run(c.id);
    }
    db.prepare(
      "DELETE FROM sessions WHERE token_hash=? AND role='courier'",
    ).run(tokenHash(readSessionToken(req, "pronto_courier_session")));
    res.clearCookie("pronto_courier_session", { path: "/" });
    res.json({ ok: true });
  });
  app.post(
    "/api/admin/orders/:id/assign",
    admin,
    wrap((req, res) => {
      const order = readOrder(db, req.params.id);
      if (
        !order ||
        order.fulfillment !== "delivery" ||
        !["preparing", "ready"].includes(order.status)
      )
        fail(409, "Atribua somente entregas aceitas ou prontas.");
      const c = db
        .prepare("SELECT id FROM couriers WHERE id=? AND active=1")
        .get(clean(req.body?.courierId, 100));
      if (!c) fail(400, "Selecione um entregador ativo.");
      transaction(db, () => {
        const old = db
          .prepare("SELECT * FROM delivery_assignments WHERE order_id=?")
          .get(order.id);
        if ((old?.version || 0) !== req.body.expectedVersion)
          fail(409, "A entrega mudou. Atualize antes de atribuir.");
        if (old?.status === "delivered") fail(409, "Entrega já concluída.");
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO delivery_assignments(order_id,courier_id,status,version,updated_at) VALUES (?,?,'assigned',1,?) ON CONFLICT(order_id) DO UPDATE SET courier_id=excluded.courier_id,status='assigned',version=delivery_assignments.version+1,updated_at=excluded.updated_at",
        ).run(order.id, c.id, now);
        db.prepare("INSERT INTO delivery_events VALUES (?,?,?,?,?)").run(
          randomUUID(),
          order.id,
          c.id,
          "assigned",
          now,
        );
      });
      res.json({ ok: true });
    }),
  );
  const locationKey = (o) =>
    (o.phone || "order:" + o.id) +
    ":" +
    createHash("sha256")
      .update(
        o.address
          .normalize("NFKC")
          .trim()
          .toLocaleLowerCase("pt-BR")
          .replace(/\s+/g, " "),
      )
      .digest("hex")
      .slice(0, 32);
  app.post(
    "/api/courier/location/start",
    courier,
    wrap((req, res) => {
      rateLimit(req, "courier-location-start-" + req.courier.id, 20, 60000);
      const trackingId = randomUUID();
      transaction(db, () => {
        db.prepare(
          "INSERT INTO courier_sharing VALUES (?,?,?) ON CONFLICT(courier_id) DO UPDATE SET tracking_id=excluded.tracking_id,started_at=excluded.started_at",
        ).run(req.courier.id, trackingId, Date.now());
        db.prepare(
          "UPDATE courier_positions SET sharing=0 WHERE courier_id=?",
        ).run(req.courier.id);
        db.prepare("DELETE FROM courier_tracks WHERE courier_id=?").run(
          req.courier.id,
        );
      });
      res.json({ trackingId });
    }),
  );
  app.post(
    "/api/courier/location",
    courier,
    wrap((req, res) => {
      rateLimit(req, "courier-location-" + req.courier.id, 120, 60000);
      const b = req.body || {},
        id = req.courier.id;
      const sharing = db
        .prepare("SELECT tracking_id FROM courier_sharing WHERE courier_id=?")
        .get(id);
      if (!sharing || sharing.tracking_id !== b.trackingId)
        fail(
          409,
          "Compartilhamento encerrado ou iniciado em outro aparelho. Toque em compartilhar novamente.",
        );
      if (b.sharing === false) {
        transaction(db, () => {
          db.prepare("DELETE FROM courier_sharing WHERE courier_id=?").run(id);
          db.prepare(
            "UPDATE courier_positions SET sharing=0,updated_at=? WHERE courier_id=?",
          ).run(Date.now(), id);
          db.prepare("DELETE FROM courier_tracks WHERE courier_id=?").run(id);
        });
        return res.json({ sharing: false });
      }
      const { latitude, longitude, accuracy } = b;
      if (
        b.sharing !== true ||
        !Number.isFinite(latitude) ||
        Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) ||
        Math.abs(longitude) > 180 ||
        !Number.isFinite(accuracy) ||
        accuracy < 0 ||
        accuracy > 100000
      )
        fail(400, "Localização inválida. Autorize o GPS para compartilhar.");
      const now = Date.now();
      if (
        !Number.isFinite(b.capturedAt) ||
        b.capturedAt > now + 60000 ||
        b.capturedAt < now - 24 * 3600000
      )
        fail(
          400,
          "O GPS retornou uma posição antiga ou uma data inválida. Obtenha uma nova localização.",
        );
      const captured = Math.min(b.capturedAt, now);
      transaction(db, () => {
        const old = db
          .prepare("SELECT * FROM courier_positions WHERE courier_id=?")
          .get(id);
        if (old?.sharing && captured < old.captured_at)
          fail(409, "Uma localização mais recente já foi recebida.");
        db.prepare(
          "INSERT INTO courier_positions VALUES (?,?,?,?,1,?,?) ON CONFLICT(courier_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,sharing=1,captured_at=excluded.captured_at,updated_at=excluded.updated_at",
        ).run(id, latitude, longitude, accuracy, captured, now);
        if (
          !old ||
          (captured > old.captured_at && now - old.updated_at >= 5000)
        )
          db.prepare("INSERT INTO courier_tracks VALUES (?,?,?,?,?,?)").run(
            randomUUID(),
            id,
            latitude,
            longitude,
            captured,
            now,
          );
        db.prepare("DELETE FROM courier_tracks WHERE created_at<?").run(
          now - 24 * 3600000,
        );
      });
      res.json({ sharing: true, updatedAt: now });
    }),
  );
  app.get("/api/admin/couriers/locations", admin, (_req, res) => {
    db.prepare("DELETE FROM courier_tracks WHERE created_at<?").run(
      Date.now() - 24 * 3600000,
    );
    db.prepare("DELETE FROM courier_positions WHERE updated_at<?").run(
      Date.now() - 24 * 3600000,
    );
    const positions = db
      .prepare(
        "SELECT p.*,c.name FROM courier_positions p JOIN couriers c ON c.id=p.courier_id WHERE c.active=1 ORDER BY c.name",
      )
      .all();
    res.json({
      positions: positions.map((p) =>
        p.sharing
          ? {
              ...p,
              track: db
                .prepare(
                  "SELECT latitude,longitude,captured_at FROM courier_tracks WHERE courier_id=? AND created_at>? ORDER BY captured_at DESC LIMIT 1000",
                )
                .all(p.courier_id, Date.now() - 2 * 3600000)
                .reverse(),
            }
          : {
              courier_id: p.courier_id,
              name: p.name,
              sharing: 0,
              updated_at: p.updated_at,
              track: [],
            },
      ),
    });
  });
  app.get(
    "/api/courier/orders",
    courier,
    wrap((req, res) => {
      const rows = db
        .prepare(
          "SELECT d.* FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.courier_id=? AND o.status<>'cancelled' ORDER BY d.updated_at DESC LIMIT 100",
        )
        .all(req.courier.id);
      res.json({
        orders: rows.map((a) => {
          const o = readOrder(db, a.order_id, { privateData: false });
          return {
            ...o,
            assignment: a,
            receipt:
              db
                .prepare(
                  "SELECT received,recipient,created_at FROM delivery_receipts WHERE order_id=?",
                )
                .get(o.id) || null,
            location:
              db
                .prepare(
                  "SELECT latitude,longitude,reference,confirmed_at AS confirmedAt FROM customer_locations WHERE customer_key=?",
                )
                .get(locationKey(o)) || null,
          };
        }),
      });
    }),
  );
  app.post(
    "/api/courier/orders/:id/status",
    courier,
    wrap((req, res) => {
      if (req.body?.epoch !== undefined && req.body.epoch !== epoch)
        fail(
          409,
          "O banco foi restaurado. Descarte a ação antiga e confira a entrega atual.",
        );
      const requestId = req.body?.requestId;
      if (
        requestId !== undefined &&
        (typeof requestId !== "string" ||
          !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))
      )
        fail(400, "Identificador da ação inválido.");
      const payloadHash = createHash("sha256")
        .update(
          JSON.stringify({
            status: req.body?.status,
            expectedVersion: req.body?.expectedVersion,
            notes: clean(req.body?.notes, 400),
            paymentReceived: req.body?.paymentReceived === true,
            recipient: clean(req.body?.recipient, 80),
          }),
        )
        .digest("hex");
      let repeated = false;
      transaction(db, () => {
        if (requestId) {
          const old = db
            .prepare("SELECT * FROM courier_commands WHERE request_id=?")
            .get(requestId);
          if (old) {
            if (
              old.courier_id !== req.courier.id ||
              old.order_id !== req.params.id ||
              old.payload_hash !== payloadHash
            )
              fail(409, "Identificador já utilizado em outra ação.");
            repeated = true;
            return;
          }
        }
        const a = db
            .prepare(
              "SELECT * FROM delivery_assignments WHERE order_id=? AND courier_id=?",
            )
            .get(req.params.id, req.courier.id),
          order = readOrder(db, req.params.id),
          next = req.body?.status;
        if (!a || !order) fail(404, "Entrega não encontrada.");
        if (a.version !== req.body.expectedVersion)
          fail(409, "A entrega mudou. Atualize a tela.");
        if (
          order.status === "cancelled" ||
          (next === "picked_up" &&
            !(a.status === "assigned" && order.status === "ready")) ||
          (next === "delivered" && a.status !== "picked_up") ||
          !["picked_up", "delivered", "failed"].includes(next) ||
          ["delivered", "failed"].includes(a.status)
        )
          fail(409, "Essa etapa não está disponível para a entrega.");
        if (next === "failed" && !clean(req.body.notes, 400))
          fail(400, "Descreva o motivo da ocorrência.");
        const now = new Date().toISOString();
        if (requestId)
          db.prepare("INSERT INTO courier_commands VALUES (?,?,?,?,?)").run(
            requestId,
            req.courier.id,
            order.id,
            payloadHash,
            now,
          );
        if (next === "delivered")
          db.prepare("INSERT INTO delivery_receipts VALUES (?,?,?,?,?)").run(
            order.id,
            req.courier.id,
            req.body.paymentReceived === true ? 1 : 0,
            clean(req.body.recipient, 80),
            now,
          );
        db.prepare(
          "UPDATE delivery_assignments SET status=?,notes=?,version=version+1,updated_at=? WHERE order_id=?",
        ).run(next, clean(req.body.notes, 400), now, order.id);
        db.prepare("INSERT INTO delivery_events VALUES (?,?,?,?,?)").run(
          randomUUID(),
          order.id,
          req.courier.id,
          next,
          now,
        );
        if (next === "delivered") {
          db.prepare(
            "UPDATE orders SET status='completed',updated_at=? WHERE id=?",
          ).run(now, order.id);
          db.prepare(
            "INSERT INTO order_events(id,order_id,status,created_at) VALUES (?,?,'completed',?)",
          ).run(randomUUID(), order.id, now);
        }
      });
      res.json({ ok: true, repeated });
    }),
  );
  app.post(
    "/api/courier/orders/:id/location",
    courier,
    wrap((req, res) => {
      const a = db
          .prepare(
            "SELECT * FROM delivery_assignments WHERE order_id=? AND courier_id=?",
          )
          .get(req.params.id, req.courier.id),
        o = readOrder(db, req.params.id),
        { latitude, longitude, reference, confirmed } = req.body || {};
      if (!a || !o || o.status === "cancelled")
        fail(404, "Entrega não encontrada.");
      if (
        confirmed !== true ||
        !Number.isFinite(latitude) ||
        Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) ||
        Math.abs(longitude) > 180
      )
        fail(
          400,
          "Confirme a localização correta e informe coordenadas válidas.",
        );
      db.prepare(
        "INSERT INTO customer_locations VALUES (?,?,?,?,?,?) ON CONFLICT(customer_key) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,reference=excluded.reference,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at",
      ).run(
        locationKey(o),
        latitude,
        longitude,
        clean(reference, 200),
        req.courier.id,
        new Date().toISOString(),
      );
      res.json({ ok: true });
    }),
  );
  app.get("/entregador.webmanifest", (_req, res) =>
    res.type("application/manifest+json").json({
      id: "/entregador",
      name: "Pronto Entregador",
      short_name: "Entregador",
      start_url: "/entregador#/entregador",
      scope: "/",
      display: "standalone",
      background_color: "#f6f7f3",
      theme_color: "#ef5a36",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    }),
  );
}
