import { useEffect, useRef, useState } from "react";
import { api, money } from "./api";
import type { Order, Product } from "./types";
type Group = { label: string; quantity: number; total: number };
type Report = {
  summary: Record<string, number>;
  durations: Record<string, { minutes: number | null; samples: number }>;
  groups: Record<string, Group[]>;
  orders: Order[];
};
const labels: Record<string, string> = {
  day: "Dia",
  hour: "Hora",
  status: "Situação",
  source: "Origem",
  payment: "Pagamento",
  fulfillment: "Atendimento",
  actor: "Operador / garçom",
  table: "Mesa",
  city: "Cidade",
  neighborhood: "Bairro",
  product: "Produtos",
  category: "Categorias",
  addon: "Complementos e adicionais",
  customer: "Clientes",
  new: "Novo",
  preparing: "Em preparo",
  ready: "Pronto",
  completed: "Concluído",
  cancelled: "Cancelado",
  menu: "Cardápio digital",
  waiter: "Garçom",
  manager: "Gestor",
  cash: "Dinheiro",
  card: "Cartão",
  pending: "Pendente",
  delivery: "Entrega",
  pickup: "Retirada",
  dinein: "Mesa",
};
const translate = (s: string) => labels[s] || s;
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export function exportCSV(name: string, rows: unknown[][]) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    ["\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Reports() {
  const [filters, setFilters] = useState<Record<string, string>>({
      from: today(),
      to: today(),
    }),
    [data, setData] = useState<Report | null>(null),
    [products, setProducts] = useState<Product[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [group, setGroup] = useState("day"),
    [page, setPage] = useState(0),
    [applied, setApplied] = useState(""),
    [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});
  const serial = useRef(0);
  useEffect(() => {
    api<{ products: Product[] }>("/admin/catalog")
      .then((r) => setProducts(r.products))
      .catch(() => {});
    run({ from: today(), to: today() });
    return () => {
      serial.current++;
    };
  }, []);
  function update(k: string, v: string) {
    setFilters((f) => ({ ...f, [k]: v }));
  }
  async function run(f = filters) {
    const id = ++serial.current;
    setBusy(true);
    setError("");
    setData(null);
    try {
      const query = new URLSearchParams({
        ...f,
        offset: String(
          new Date((f.from || today()) + "T12:00:00").getTimezoneOffset(),
        ),
      });
      const r = await api<Report>("/admin/reports?" + query);
      if (id === serial.current) {
        setData(r);
        setAppliedFilters({ ...f });
        setPage(0);
        setApplied(
          `${f.from || "Início"} a ${f.to || "hoje"} · fuso do computador`,
        );
      }
    } catch (e) {
      if (id === serial.current)
        setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      if (id === serial.current) setBusy(false);
    }
  }
  const rows = data?.groups[group] || [];
  return (
    <section className="operations-page">
      <h1>Relatórios</h1>
      <p>
        Valores de pedidos, não de caixa recebido. Filtros usam a data de
        criação. Totais gerais excluem cancelados; a distribuição por situação
        inclui todos. Produtos e categorias mostram somente as linhas
        selecionadas, enquanto o total do pedido permanece completo.
      </p>
      <form
        className="report-filters"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        {(["from", "to"] as const).map((k) => (
          <label className="field" key={k}>
            {k === "from" ? "De" : "Até (inclusive)"}
            <input
              type="date"
              value={filters[k] || ""}
              onChange={(e) => update(k, e.target.value)}
            />
          </label>
        ))}
        {Object.entries({
          status: ["new", "preparing", "ready", "completed", "cancelled"],
          source: ["menu", "waiter", "manager"],
          payment: ["cash", "card", "pending"],
          fulfillment: ["delivery", "pickup", "dinein"],
        }).map(([key, opts]) => (
          <label className="field" key={key}>
            {labels[key]}
            <select
              value={filters[key] || ""}
              onChange={(e) => update(key, e.target.value)}
            >
              <option value="">Todos</option>
              {opts.map((v) => (
                <option key={v} value={v}>
                  {translate(v)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="field">
          Categoria
          <select
            value={filters.category || ""}
            onChange={(e) => update("category", e.target.value)}
          >
            <option value="">Todas</option>
            {[...new Set(products.map((p) => p.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Produto
          <select
            value={filters.product || ""}
            onChange={(e) => update("product", e.target.value)}
          >
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {(["actor", "table", "city", "neighborhood", "search"] as const).map(
          (k) => (
            <label className="field" key={k}>
              {k === "search" ? "Nome, telefone ou nº pedido" : labels[k]}
              <input
                maxLength={100}
                value={filters[k] || ""}
                placeholder={k === "search" ? "Busca parcial" : "Nome exato"}
                onChange={(e) => update(k, e.target.value)}
              />
            </label>
          ),
        )}
        <div className="operation-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Consultando…" : "Aplicar filtros"}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => setFilters({ from: today(), to: today() })}
          >
            Limpar filtros
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {applied} · {data.orders.length} pedidos encontrados.
          </p>
          <div className="report-kpis">
            {Object.entries({
              orders: "Pedidos",
              completed: "Concluídos",
              cancelled: "Cancelados",
              gross: "Valor não cancelado",
              completedTotal: "Valor concluído",
              cancelledTotal: "Valor cancelado",
              subtotal: "Produtos (sem taxa)",
              deliveryFees: "Taxas de entrega",
              average: "Ticket médio",
              items: "Itens",
            }).map(([key, label]) => (
              <article className="operation-panel" key={key}>
                <small>{label}</small>
                <strong>
                  {[
                    "gross",
                    "completedTotal",
                    "cancelledTotal",
                    "subtotal",
                    "deliveryFees",
                    "average",
                  ].includes(key)
                    ? money(data.summary[key])
                    : data.summary[key]}
                </strong>
              </article>
            ))}
          </div>
          <div className="operation-panel">
            <h2>Tempos médios</h2>
            <div className="report-kpis">
              {Object.entries(data.durations).map(([key, d]) => (
                <div key={key}>
                  <strong>
                    {
                      {
                        accept: "Até aceitar",
                        prepare: "Preparo até pronto",
                        complete: "Até conclusão",
                      }[key]
                    }
                  </strong>
                  <p>
                    {d.minutes === null
                      ? "Sem amostras"
                      : d.minutes.toFixed(1) + " min"}{" "}
                    · {d.samples} pedidos
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="operation-actions">
            <label className="field">
              Agrupar por
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {Object.keys(data.groups).map((k) => (
                  <option key={k} value={k}>
                    {labels[k]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              onClick={() =>
                exportCSV("pronto-resumo-" + group, [
                  [labels[group], "Quantidade", "Valor (R$)"],
                  ...rows.map((r) => [
                    translate(r.label),
                    r.quantity,
                    (r.total / 100).toFixed(2).replace(".", ","),
                  ]),
                ])
              }
            >
              Exportar resumo CSV
            </button>
          </div>
          {group === "addon" && (
            <p>
              Valores somente dos adicionais, já incluídos nos produtos. Não
              some novamente ao total.
            </p>
          )}
          <div className="report-table">
            <table>
              <thead>
                <tr>
                  <th>{labels[group]}</th>
                  <th>
                    {["product", "category", "addon"].includes(group)
                      ? "Unidades"
                      : "Pedidos"}
                  </th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td>{translate(r.label)}</td>
                    <td>{r.quantity}</td>
                    <td>{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p>Sem resultados para estes filtros.</p>}
          </div>
          <h2>Pedidos detalhados</h2>
          <div className="operation-actions">
            <button
              className="button secondary"
              onClick={() =>
                exportCSV("pronto-pedidos", [
                  [
                    "Número",
                    "Data",
                    "Cliente",
                    "Telefone",
                    "Situação",
                    "Origem",
                    "Atendimento",
                    "Mesa",
                    "Operador",
                    "Pagamento",
                    "Cidade",
                    "Bairro",
                    "Endereço",
                    "Subtotal (R$)",
                    "Taxa (R$)",
                    "Total (R$)",
                  ],
                  ...data.orders.map((o) => [
                    o.number,
                    new Date(o.createdAt).toLocaleString("pt-BR"),
                    o.customerName,
                    o.phone,
                    translate(o.status),
                    translate(o.source),
                    translate(o.fulfillment),
                    o.tableName,
                    o.actorName,
                    translate(o.payment),
                    o.deliveryAddress?.city,
                    o.deliveryAddress?.neighborhood,
                    o.address,
                    ...[o.subtotal, o.deliveryFee, o.total].map((v) =>
                      (v / 100).toFixed(2).replace(".", ","),
                    ),
                  ]),
                ])
              }
            >
              Exportar todos os pedidos CSV
            </button>
            <button
              className="button secondary"
              onClick={() =>
                exportCSV("pronto-itens", [
                  [
                    "Pedido",
                    "Situação",
                    "Produto",
                    "Categoria",
                    "Quantidade",
                    "Preço unitário (R$)",
                    "Total (R$)",
                    "Adicionais",
                    "Observações",
                  ],
                  ...data.orders.flatMap((o) =>
                    o.items
                      .filter(
                        (i) =>
                          (!appliedFilters.product ||
                            i.productId === appliedFilters.product) &&
                          (!appliedFilters.category ||
                            i.category === appliedFilters.category),
                      )
                      .map((i) => [
                        o.number,
                        translate(o.status),
                        i.name,
                        i.category,
                        i.quantity,
                        (i.price / 100).toFixed(2).replace(".", ","),
                        ((i.price * i.quantity) / 100)
                          .toFixed(2)
                          .replace(".", ","),
                        (i.modifiers || [])
                          .map(
                            (m) => `${m.quantity}× ${m.groupName}: ${m.name}`,
                          )
                          .join(" / "),
                        i.notes,
                      ]),
                  ),
                ])
              }
            >
              Exportar itens CSV
            </button>
          </div>
          <div className="report-table">
            <table>
              <thead>
                <tr>
                  <th>Nº / Data</th>
                  <th>Cliente</th>
                  <th>Situação / Origem</th>
                  <th>Pagamento</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.slice(page * 50, (page + 1) * 50).map((o) => (
                  <tr key={o.id}>
                    <td>
                      #{o.number}
                      <br />
                      {new Date(o.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td>
                      {o.customerName}
                      <br />
                      {o.tableName && "Mesa " + o.tableName}
                    </td>
                    <td>
                      {translate(o.status)}
                      <br />
                      {translate(o.source)}
                    </td>
                    <td>{translate(o.payment)}</td>
                    <td>{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="operation-actions">
            <button
              className="button secondary"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page + 1} de{" "}
              {Math.max(1, Math.ceil(data.orders.length / 50))}
            </span>
            <button
              className="button secondary"
              disabled={(page + 1) * 50 >= data.orders.length}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </section>
  );
}
