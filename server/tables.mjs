import { randomUUID } from "node:crypto";
import { transaction, readOrder } from "./database.mjs";
export function installTables({ app, db, admin, staff, wrap, fail }) {
  db.exec(`CREATE TABLE IF NOT EXISTS table_sessions (
    id TEXT PRIMARY KEY, table_key TEXT NOT NULL, table_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
    version INTEGER NOT NULL DEFAULT 1, opened_at TEXT NOT NULL, closed_at TEXT,
    payment TEXT, paid_total INTEGER, closed_by TEXT
  ); CREATE UNIQUE INDEX IF NOT EXISTS one_open_table ON table_sessions(table_key) WHERE status='open';
  CREATE INDEX IF NOT EXISTS orders_table_session ON orders(table_session_id);`);
  const get = (id) => {
    const session = db
      .prepare("SELECT * FROM table_sessions WHERE id=?")
      .get(id);
    if (!session) return null;
    const orders = db
      .prepare(
        "SELECT id FROM orders WHERE table_session_id=? ORDER BY sequence",
      )
      .all(id)
      .map((o) => readOrder(db, o.id, { privateData: false }));
    return {
      id: session.id,
      tableName: session.table_name,
      status: session.status,
      version: session.version,
      openedAt: session.opened_at,
      total: orders
        .filter((o) => o.status !== "cancelled")
        .reduce((n, o) => n + o.total, 0),
      orders: orders.map(({ phone, address, deliveryAddress, ...o }) => o),
    };
  };
  const authorize = (req, res, next) =>
    req.path.startsWith("/api/admin/")
      ? admin(req, res, next)
      : staff(req, res, next);
  app.get(
    ["/api/staff/tables", "/api/admin/tables"],
    authorize,
    wrap((_req, res) => {
      res.json({
        tables: db
          .prepare(
            "SELECT id FROM table_sessions WHERE status='open' ORDER BY opened_at",
          )
          .all()
          .map((t) => get(t.id)),
      });
    }),
  );
  app.post(
    ["/api/staff/tables/:id/close", "/api/admin/tables/:id/close"],
    authorize,
    wrap((req, res) => {
      transaction(db, () => {
        const table = get(req.params.id);
        if (!table || table.status !== "open")
          fail(409, "Essa conta já foi encerrada. Atualize as mesas.");
        if (
          table.version !== req.body.expectedVersion ||
          table.total !== req.body.expectedTotal
        )
          fail(
            409,
            "A conta mudou. Confira o valor atualizado antes de receber.",
          );
        if (
          table.orders.some(
            (o) => !["completed", "cancelled"].includes(o.status),
          )
        )
          fail(
            409,
            "Sirva ou cancele os pedidos pendentes antes de encerrar a mesa.",
          );
        if (
          !["cash", "card", "mixed"].includes(req.body.payment) ||
          req.body.received !== true
        )
          fail(400, "Informe a forma de pagamento e confirme o recebimento.");
        db.prepare(
          "UPDATE table_sessions SET status='closed',version=version+1,closed_at=?,payment=?,paid_total=?,closed_by=? WHERE id=?",
        ).run(
          new Date().toISOString(),
          req.body.payment,
          table.total,
          req.staff?.name || "Operador",
          table.id,
        );
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/staff/orders/:id/served",
    staff,
    wrap((req, res) => {
      transaction(db, () => {
        const order = readOrder(db, req.params.id);
        if (!order || order.fulfillment !== "dinein" || !order.tableSessionId)
          fail(404, "Pedido de mesa não encontrado.");
        if (order.status === "completed") return;
        if (order.status !== "ready")
          fail(409, "O pedido ainda não está pronto para servir.");
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE orders SET status='completed',updated_at=? WHERE id=?",
        ).run(now, order.id);
        db.prepare("INSERT INTO order_events VALUES (?,?,'completed',?)").run(
          randomUUID(),
          order.id,
          now,
        );
      });
      res.json({ ok: true });
    }),
  );
  return {
    attachOrder(orderId, tableName, expectedId) {
      const tableKey = tableName
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleUpperCase("pt-BR");
      let session = db
        .prepare(
          "SELECT * FROM table_sessions WHERE table_key=? AND status='open'",
        )
        .get(tableKey);
      if (expectedId && session?.id !== expectedId)
        fail(
          409,
          "Essa conta foi encerrada ou trocou de mesa. Abra as mesas e lance em uma conta atual.",
        );
      if (!session) {
        session = { id: randomUUID() };
        db.prepare(
          "INSERT INTO table_sessions(id,table_key,table_name,opened_at) VALUES (?,?,?,?)",
        ).run(session.id, tableKey, tableName.trim(), new Date().toISOString());
      } else
        db.prepare(
          "UPDATE table_sessions SET version=version+1 WHERE id=?",
        ).run(session.id);
      db.prepare("UPDATE orders SET table_session_id=? WHERE id=?").run(
        session.id,
        orderId,
      );
    },
  };
}
