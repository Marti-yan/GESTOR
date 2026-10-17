import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
type StockProduct = {
  id: string;
  name: string;
  category: string;
  stockQuantity: number | null;
  stockVersion: number;
};
type Movement = {
  id: string;
  name: string;
  delta: number;
  reason: string;
  created_at: string;
  order_id: string | null;
};
export function Stock() {
  const [products, setProducts] = useState<StockProduct[]>([]),
    [movements, setMovements] = useState<Movement[]>([]),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [only, setOnly] = useState("all"),
    [editing, setEditing] = useState<StockProduct | null>(null),
    [quantity, setQuantity] = useState(""),
    [unlimited, setUnlimited] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api<{ products: StockProduct[]; movements: Movement[] }>(
        "/admin/stock",
      );
      setProducts(r.products);
      setMovements(r.movements);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar.");
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await api("/admin/products/" + editing.id + "/stock", "PUT", {
        quantity: unlimited ? null : Number(quantity),
        expectedVersion: editing.stockVersion,
        reason,
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operations-page">
      <h1>Estoque e limites de venda</h1>
      <p>
        O saldo disponível já desconta os pedidos reservados. Cancelamentos
        antes do preparo devolvem o saldo. Depois do preparo, confira o
        ingrediente e faça um ajuste manual.
      </p>
      <p>
        O limite é por produto. Para 3 pastéis de carne, ajuste o produto
        “Pastel de carne” para 3. Ingredientes compartilhados entre produtos e
        adicionais ainda não consomem um estoque comum.
      </p>
      <div className="report-filters">
        <label className="field">
          Buscar
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          Categoria
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas</option>
            {[...new Set(products.map((p) => p.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Saldo
          <select value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="all">Todos</option>
            <option value="limited">Com limite</option>
            <option value="zero">Esgotados</option>
          </select>
        </label>
        <button className="button secondary" onClick={load}>
          Atualizar
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {editing && (
        <form className="operation-panel" onSubmit={save}>
          <h2>Ajustar {editing.name}</h2>
          <p>
            Defina o saldo disponível agora, além do que já está reservado nos
            pedidos. Não é o estoque físico total.
          </p>
          <label>
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => setUnlimited(e.target.checked)}
            />{" "}
            Sem limite de quantidade
          </label>
          {!unlimited && (
            <label className="field">
              Quantidade disponível
              <input
                type="number"
                required
                min={0}
                max={1000000}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          )}
          <label className="field">
            Motivo do ajuste
            <input
              maxLength={160}
              value={reason}
              required
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="operation-actions">
            <button className="button primary" disabled={busy}>
              Salvar saldo
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setEditing(null)}
            >
              Fechar
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const p = products.find((p) => p.id === editing.id);
                if (p) {
                  setEditing(p);
                  setQuantity(String(p.stockQuantity ?? 0));
                  setUnlimited(p.stockQuantity === null);
                  setError("");
                }
              }}
            >
              Recarregar saldo atual
            </button>
          </div>
        </form>
      )}
      <div className="report-table">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Disponível</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {products
              .filter(
                (p) =>
                  (!category || p.category === category) &&
                  p.name
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()) &&
                  (only === "all" ||
                    (only === "limited" && p.stockQuantity !== null) ||
                    (only === "zero" && p.stockQuantity === 0)),
              )
              .map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td>
                    <strong>
                      {p.stockQuantity === null
                        ? "Sem limite"
                        : p.stockQuantity === 0
                          ? "Esgotado"
                          : p.stockQuantity}
                    </strong>
                  </td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setEditing(p);
                        setQuantity(String(p.stockQuantity ?? 0));
                        setUnlimited(p.stockQuantity === null);
                        setReason("");
                        setError("");
                      }}
                    >
                      Ajustar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <h2>Histórico de movimentações</h2>
      <p>
        Últimas 500 movimentações. Reservas negativas, devoluções e reposições
        positivas; ativação e desativação são ajustes de configuração.
      </p>
      <div className="report-table">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Produto</th>
              <th>Variação</th>
              <th>Motivo</th>
              <th>Pedido</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.created_at).toLocaleString("pt-BR")}</td>
                <td>{m.name}</td>
                <td>
                  {m.delta > 0 ? "+" : ""}
                  {m.delta}
                </td>
                <td>{m.reason}</td>
                <td>{m.order_id ? "Vinculado ao pedido" : "Manual"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
