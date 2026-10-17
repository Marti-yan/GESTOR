import { useCallback, useEffect, useState } from "react";
import { Plus, CheckCircle2, RefreshCw, UtensilsCrossed } from "lucide-react";
import { api, money, time } from "./api";
import type { Order } from "./types";
type Table = {
  id: string;
  tableName: string;
  version: number;
  openedAt: string;
  total: number;
  orders: Order[];
};
export function Tables({
  mode,
  onAdd,
}: {
  mode: "staff" | "admin";
  onAdd: (tableName: string, tableSessionId: string) => void;
}) {
  const [tables, setTables] = useState<Table[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [payment, setPayment] = useState("cash"),
    [received, setReceived] = useState(false),
    [people, setPeople] = useState(1);
  const load = useCallback(async () => {
    try {
      const r = await api<{ tables: Table[] }>(`/${mode}/tables`);
      setTables(r.tables);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [mode]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const table = tables.find((t) => t.id === selected);
  async function serve(order: Order) {
    setBusy(true);
    setError("");
    try {
      await api(
        mode === "staff"
          ? `/staff/orders/${order.id}/served`
          : `/admin/orders/${order.id}/status`,
        mode === "staff" ? "POST" : "PATCH",
        mode === "staff"
          ? {}
          : { status: "completed", expectedStatus: "ready" },
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function close(e: React.FormEvent) {
    e.preventDefault();
    if (!table) return;
    setBusy(true);
    setError("");
    try {
      await api(`/${mode}/tables/${table.id}/close`, "POST", {
        expectedVersion: table.version,
        expectedTotal: table.total,
        payment,
        received,
      });
      setSelected("");
      setReceived(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tables-panel">
      <div className="page-title-row">
        <div>
          <span className="eyebrow muted">SALÃO</span>
          <h1>Mesas e contas</h1>
          <p>Cada novo lançamento soma na conta da mesa até o encerramento.</p>
        </div>
        <button className="button secondary" onClick={load}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {!table ? (
        <>
          <div className="table-grid">
            {tables.map((t) => (
              <button
                className={`table-card ${t.orders.some((o) => o.status === "ready") ? "has-ready" : ""}`}
                key={t.id}
                onClick={() => {
                  setSelected(t.id);
                  setReceived(false);
                }}
              >
                <UtensilsCrossed size={24} />
                <strong>Mesa {t.tableName}</strong>
                <span>
                  Desde {time(t.openedAt)} ·{" "}
                  {t.orders.filter((o) => o.status !== "cancelled").length}{" "}
                  pedidos
                </span>
                <b>{money(t.total)}</b>
                <small>
                  {t.orders.some((o) => o.status === "ready")
                    ? "Tem pedido pronto para servir"
                    : "Conta aberta"}
                </small>
              </button>
            ))}
          </div>
          {!tables.length && (
            <div className="operation-panel">
              <h2>Salão pronto para atender</h2>
              <p>
                Ao lançar o primeiro pedido com uma mesa, a conta é aberta
                automaticamente.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="operation-panel table-detail">
          <div className="page-title-row">
            <h2>Mesa {table.tableName}</h2>
            <button
              className="button secondary"
              onClick={() => setSelected("")}
            >
              Todas as mesas
            </button>
          </div>
          <button
            className="button primary"
            onClick={() => onAdd(table.tableName, table.id)}
          >
            <Plus size={17} /> Adicionar nesta mesa
          </button>
          {table.orders.map((o) => (
            <article className="table-order" key={o.id}>
              <div>
                <strong>
                  #{String(o.number).padStart(3, "0")} · {time(o.createdAt)}
                </strong>
                <span>
                  {o.status === "completed"
                    ? "Servido"
                    : o.status === "ready"
                      ? "Pronto para servir"
                      : o.status === "cancelled"
                        ? "Cancelado"
                        : "Em preparo"}
                </span>
              </div>
              {o.items.map((i) => (
                <p key={i.id}>
                  {i.quantity}× {i.name} <b>{money(i.price * i.quantity)}</b>
                  {i.notes && <small>{i.notes}</small>}
                </p>
              ))}
              <strong>{money(o.total)}</strong>
              {o.status === "ready" && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => serve(o)}
                >
                  <CheckCircle2 size={16} /> Marcar como servido
                </button>
              )}
            </article>
          ))}
          <form onSubmit={close} className="table-bill">
            <h2>
              Total da conta <strong>{money(table.total)}</strong>
            </h2>
            <label className="field">
              Dividir como referência entre quantas pessoas?
              <input
                type="number"
                min="1"
                max="100"
                value={people}
                onChange={(e) =>
                  setPeople(Math.max(1, Math.min(100, Number(e.target.value))))
                }
              />
            </label>
            <p>
              {money(Math.floor(table.total / people))} por pessoa
              {table.total % people > 0
                ? ` + ${table.total % people} centavo(s) para completar a conta`
                : ""}
              . A divisão é informativa.
            </p>
            <label className="field">
              Recebido em
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              >
                <option value="cash">Dinheiro</option>
                <option value="card">Cartão</option>
                <option value="mixed">Mais de uma forma</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={received}
                onChange={(e) => setReceived(e.target.checked)}
              />{" "}
              Conferi a conta e recebi o pagamento
            </label>
            <button
              className="button primary full"
              disabled={
                busy ||
                !received ||
                table.orders.some(
                  (o) => !["completed", "cancelled"].includes(o.status),
                )
              }
            >
              Receber e encerrar mesa
            </button>
            <small>
              Sirva todos os pedidos antes de encerrar. O registro é manual e
              não faz cobrança em cartão.
            </small>
          </form>
        </div>
      )}
    </section>
  );
}
