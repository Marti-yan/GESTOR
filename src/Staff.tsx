import { selectionLimit } from "./stockLimits";
import { AddressFields, blankAddress, type DeliveryAddress } from "./Delivery";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Minus,
  Search,
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  LogOut,
  Smartphone,
  CheckCircle2,
  UtensilsCrossed,
  Trash2,
  Copy,
  List,
  LayoutGrid,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, ApiError, createId, money, parseMoney, time } from "./api";
import { FoodArt } from "./art";
import { ItemOptionsForm, unitPrice, selectionNames } from "./ItemOptions";
import type {
  Category,
  DesktopInfo,
  Order,
  Product,
  Store,
  ModifierSelection,
} from "./types";
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Não foi possível concluir. Tente novamente.";
type Line = {
  key: string;
  productId: string;
  quantity: number;
  notes: string;
  modifiers?: ModifierSelection[];
};
type Draft = {
  lines: Line[];
  tableName: string;
  customerName: string;
  phone: string;
  fulfillment: "dinein" | "pickup" | "delivery";
  deliveryAddress?: DeliveryAddress;
  payment: "pending" | "cash" | "card";
  change: string;
  pickupCode: string;
  notes: string;
  requestKey: string;
  signature: string;
  printAtCounter: boolean;
};
const emptyDraft = (): Draft => ({
  lines: [],
  tableName: "",
  customerName: "",
  phone: "",
  fulfillment: "dinein",
  payment: "pending",
  change: "",
  pickupCode: "",
  notes: "",
  requestKey: createId(),
  signature: "",
  printAtCounter: false,
});
export function OrderEntry({
  mode,
  onCreated,
}: {
  mode: "manager" | "waiter";
  onCreated: (o: Order) => void;
}) {
  const storageKey = "pronto-entry-" + mode;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return {
        ...emptyDraft(),
        ...JSON.parse(localStorage.getItem(storageKey) || "null"),
      };
    } catch {
      return emptyDraft();
    }
  });
  const [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [store, setStore] = useState<Store | null>(null),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [categoryView, setCategoryView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem("pronto-entry-category-view-" + mode) ===
        "list"
        ? "list"
        : "cards";
    } catch {
      return "cards";
    }
  });
  const [itemView, setItemView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem("pronto-entry-item-view-" + mode) === "list"
        ? "list"
        : "cards";
    } catch {
      return "cards";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("pronto-entry-category-view-" + mode, categoryView);
      localStorage.setItem("pronto-entry-item-view-" + mode, itemView);
    } catch {}
  }, [categoryView, itemView, mode]);
  const locked = useRef(false);
  const [customizing, setCustomizing] = useState<{
    product: Product;
    lineKey?: string;
  } | null>(null);
  useEffect(() => {
    api<{ products: Product[]; store: Store; categories: Category[] }>(
      "/catalog",
    )
      .then((r) => {
        setProducts(r.products);
        setStore(r.store);
        setCategories(r.categories);
      })
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const refresh = () =>
      api<{ products: Product[] }>("/catalog")
        .then((r) => setProducts(r.products))
        .catch(() => {});
    const id = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {}
  }, [draft, storageKey]);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const total =
    draft.lines.reduce(
      (sum, l) =>
        sum +
        (products.find((p) => p.id === l.productId)
          ? unitPrice(
              products.find((p) => p.id === l.productId)!,
              l.modifiers,
            )
          : 0) *
          l.quantity,
      0,
    ) + (draft.fulfillment === "delivery" ? store?.deliveryFee || 0 : 0);
  const count = draft.lines.reduce((sum, l) => sum + l.quantity, 0);
  function add(
    p: Product,
    quantity = 1,
    notes = "",
    modifiers: ModifierSelection[] = [],
  ) {
    if (locked.current) return;
    p = products.find((item) => item.id === p.id) || p;
    if (
      p.stockQuantity != null &&
      draft.lines
        .filter((l) => l.productId === p.id)
        .reduce((n, l) => n + l.quantity, 0) +
        quantity >
        p.stockQuantity
    ) {
      setError(`Disponível: ${p.stockQuantity} unidades de ${p.name}.`);
      return;
    }
    setDraft((d) => {
      const found = d.lines.find(
        (l) =>
          l.productId === p.id &&
          l.notes === notes &&
          JSON.stringify(l.modifiers || []) === JSON.stringify(modifiers),
      );
      return {
        ...d,
        lines: found
          ? d.lines.map((l) =>
              l.key === found.key
                ? { ...l, quantity: Math.min(20, l.quantity + quantity) }
                : l,
            )
          : [
              ...d.lines,
              { key: createId(), productId: p.id, quantity, notes, modifiers },
            ],
      };
    });
  }
  const lineLimit = (productId: string, key?: string, list = draft.lines) =>
    selectionLimit(
      products.find((p) => p.id === productId)?.stockQuantity,
      list
        .filter((l) => l.productId === productId && l.key !== key)
        .reduce((n, l) => n + l.quantity, 0),
    );
  function line(key: string, p: Partial<Line>) {
    if (locked.current) return;
    setDraft((d) => ({
      ...d,
      lines: d.lines
        .map((l) =>
          l.key === key
            ? {
                ...l,
                ...p,
                ...(p.quantity != null
                  ? {
                      quantity: Math.max(
                        0,
                        Math.min(
                          p.quantity,
                          lineLimit(l.productId, key, d.lines),
                        ),
                      ),
                    }
                  : {}),
              }
            : l,
        )
        .filter((l) => l.quantity > 0),
    }));
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current || !draft.lines.length) return;
    setError("");
    locked.current = true;
    setBusy(true);
    const body = {
      customerName: draft.customerName,
      phone: draft.phone,
      fulfillment: draft.fulfillment,
      ...(draft.fulfillment === "delivery"
        ? { deliveryAddress: draft.deliveryAddress || blankAddress() }
        : {}),
      tableName: draft.fulfillment === "dinein" ? draft.tableName : "",
      pickupCode: draft.pickupCode,
      payment: draft.payment,
      changeFor:
        draft.payment === "cash" && draft.change
          ? parseMoney(draft.change)
          : null,
      notes: draft.notes,
      printAtCounter: draft.printAtCounter,
      expectedTotal: total,
      items: draft.lines.map(({ productId, quantity, notes, modifiers }) => ({
        productId,
        quantity,
        notes,
        modifiers: modifiers || [],
      })),
    };
    const signature = JSON.stringify(body),
      requestKey =
        draft.signature === signature ? draft.requestKey : createId();
    const submitted = { ...draft, signature, requestKey };
    setDraft(submitted);
    try {
      try {
        localStorage.setItem(storageKey, JSON.stringify(submitted));
      } catch {}
      const r = await api<{ order: Order }>(
        mode === "manager" ? "/admin/orders" : "/staff/orders",
        "POST",
        body,
        { "Idempotency-Key": requestKey },
      );
      const fresh: Draft = {
        ...emptyDraft(),
        tableName: draft.tableName,
        fulfillment: draft.fulfillment,
      };
      // O gestor fecha o modal no callback; persista antes de desmontar a tela.
      try {
        localStorage.setItem(storageKey, JSON.stringify(fresh));
      } catch {}
      setDraft(fresh);
      setCategory("");
      setSearch("");
      onCreated(r.order);
    } catch (e) {
      setError(message(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const filtered = products.filter(
    (p) =>
      p.category === category &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="order-entry">
      <section className="entry-products">
        {customizing && (
          <div className="entry-customizer">
            <ItemOptionsForm
              key={customizing.lineKey || customizing.product.id}
              product={{
                ...customizing.product,
                stockQuantity: products.find(
                  (p) => p.id === customizing.product.id,
                )?.stockQuantity,
              }}
              maxQuantity={lineLimit(
                customizing.product.id,
                customizing.lineKey,
              )}
              initial={
                customizing.lineKey
                  ? draft.lines.find((l) => l.key === customizing.lineKey)
                  : undefined
              }
              onCancel={() => setCustomizing(null)}
              onConfirm={(quantity, notes, modifiers) => {
                if (customizing.lineKey)
                  line(customizing.lineKey, { quantity, notes, modifiers });
                else add(customizing.product, quantity, notes, modifiers);
                setCustomizing(null);
              }}
            />
          </div>
        )}
        <div className="entry-heading">
          <div>
            <span className="eyebrow muted">LANÇAMENTO DIRETO</span>
            <h2>O que vai para a cozinha?</h2>
          </div>
          <button
            className="entry-cart-count"
            onClick={() =>
              document
                .getElementById("entry-checkout")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <ShoppingBag size={17} />
            {count} itens
          </button>
        </div>
        <div className="entry-module-bar">
          <div>
            {category ? (
              <button
                type="button"
                onClick={() => {
                  setCategory("");
                  setSearch("");
                }}
              >
                <ArrowLeft size={16} />
                Categorias
              </button>
            ) : (
              <span>1. Escolha a categoria</span>
            )}
            {category && <strong> / {category}</strong>}
          </div>
          <div
            className="entry-view-toggle"
            role="group"
            aria-label={
              category
                ? "Visualização dos itens"
                : "Visualização das categorias"
            }
          >
            <button
              type="button"
              aria-label={category ? "Itens em lista" : "Categorias em lista"}
              aria-pressed={(category ? itemView : categoryView) === "list"}
              onClick={() =>
                category ? setItemView("list") : setCategoryView("list")
              }
            >
              <List size={18} />
            </button>
            <button
              type="button"
              aria-label={category ? "Itens em cards" : "Categorias em cards"}
              aria-pressed={(category ? itemView : categoryView) === "cards"}
              onClick={() =>
                category ? setItemView("cards") : setCategoryView("cards")
              }
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
        <p className="entry-view-help">
          {category ? "Itens" : "Categorias"} em{" "}
          {(category ? itemView : categoryView) === "list" ? "lista" : "cards"}.
          As duas preferências são independentes e ficam salvas neste aparelho.
        </p>
        {category && (
          <label className="entry-search">
            <Search size={18} />
            <input
              aria-label="Buscar produto para lançar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar em ${category}…`}
            />
          </label>
        )}
        {loading ? (
          <p>Carregando o cardápio…</p>
        ) : !category ? (
          <div className={`entry-category-modules ${categoryView}`}>
            {categories.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCategory(c.name)}
              >
                <span className="entry-category-icon">
                  <UtensilsCrossed size={24} />
                </span>
                <strong>{c.name}</strong>
                <small>
                  {products.filter((p) => p.category === c.name).length} itens
                </small>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="entry-step-caption">
              2. Escolha os itens de {category}
            </p>
            <div className={`entry-product-grid ${itemView}`}>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="entry-product"
                  disabled={busy || lineLimit(p.id) === 0}
                  onClick={() =>
                    p.modifierGroups?.length
                      ? setCustomizing({ product: p })
                      : add(p)
                  }
                >
                  <div className="entry-art">
                    <FoodArt kind={p.art} />
                  </div>
                  <strong>
                    {p.name}
                    {p.stockQuantity === 0
                      ? " · Esgotado"
                      : p.stockQuantity != null
                        ? ` · ${p.stockQuantity} disponíveis`
                        : ""}
                  </strong>
                  <span>
                    {money(p.price)}
                    <Plus size={18} />
                  </span>
                </button>
              ))}
            </div>
            {!filtered.length && (
              <p className="muted-text">
                Nenhum produto encontrado nesta categoria.
              </p>
            )}
          </>
        )}
      </section>
      <form id="entry-checkout" className="entry-checkout" onSubmit={send}>
        <fieldset disabled={busy}>
          <div className="entry-checkout-heading">
            <ShoppingBag size={21} />
            <h2>Seu lançamento</h2>
          </div>
          <div className="entry-mode">
            <button
              type="button"
              className={draft.fulfillment === "dinein" ? "active" : ""}
              onClick={() => patch({ fulfillment: "dinein" })}
            >
              Mesa
            </button>
            <button
              type="button"
              className={draft.fulfillment === "pickup" ? "active" : ""}
              onClick={() => patch({ fulfillment: "pickup" })}
            >
              Retirada / balcão
            </button>
            <button
              type="button"
              className={draft.fulfillment === "delivery" ? "active" : ""}
              onClick={() => patch({ fulfillment: "delivery" })}
            >
              Entrega
            </button>
          </div>
          <div className="entry-fields">
            {draft.fulfillment === "dinein" && (
              <label className="field">
                Mesa
                <input
                  required
                  maxLength={24}
                  value={draft.tableName}
                  onChange={(e) => patch({ tableName: e.target.value })}
                  placeholder="Ex.: 12 ou varanda"
                />
              </label>
            )}
            <label className="field">
              Senha de retirada <small>opcional</small>
              <input
                maxLength={24}
                value={draft.pickupCode}
                onChange={(e) => patch({ pickupCode: e.target.value })}
                placeholder="Usar número do pedido"
              />
            </label>
          </div>
          <label className="field">
            Nome do cliente <small>opcional</small>
            <input
              maxLength={80}
              value={draft.customerName}
              onChange={(e) => patch({ customerName: e.target.value })}
              placeholder={
                draft.fulfillment === "dinein"
                  ? "Identificar pela mesa"
                  : "Identificar como balcão"
              }
            />
          </label>
          {draft.fulfillment === "delivery" && (
            <>
              <AddressFields
                value={draft.deliveryAddress || blankAddress()}
                onChange={(deliveryAddress) => patch({ deliveryAddress })}
              />
              <p>Taxa de entrega: {money(store?.deliveryFee || 0)}</p>
              <label className="field">
                Telefone do cliente
                <input
                  type="tel"
                  maxLength={30}
                  value={draft.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                />
              </label>
            </>
          )}
          <div className="entry-lines">
            {!draft.lines.length ? (
              <div className="entry-empty">
                <UtensilsCrossed size={30} />
                <p>Toque nos produtos para adicionar.</p>
              </div>
            ) : (
              draft.lines.map((l) => {
                const p = products.find((p) => p.id === l.productId);
                return (
                  <div className="entry-line" key={l.key}>
                    <div>
                      <strong>
                        {l.quantity}× {p?.name || "Produto indisponível"}
                      </strong>
                      <span>
                        {money(
                          (p ? unitPrice(p, l.modifiers) : 0) * l.quantity,
                        )}
                      </span>
                    </div>
                    {l.modifiers?.length && p ? (
                      <p className="entry-modifier-summary">
                        {selectionNames(p, l.modifiers)}
                      </p>
                    ) : null}
                    {p?.modifierGroups?.length ? (
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() =>
                          setCustomizing({ product: p, lineKey: l.key })
                        }
                      >
                        Editar complementos/adicionais
                      </button>
                    ) : null}
                    <div className="entry-line-tools">
                      <button
                        type="button"
                        aria-label="Diminuir quantidade"
                        onClick={() =>
                          line(l.key, { quantity: l.quantity - 1 })
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <b>{l.quantity}</b>
                      <button
                        type="button"
                        aria-label="Aumentar quantidade"
                        disabled={l.quantity >= lineLimit(l.productId, l.key)}
                        onClick={() =>
                          line(l.key, { quantity: l.quantity + 1 })
                        }
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        className="entry-remove"
                        type="button"
                        aria-label="Remover item"
                        onClick={() => line(l.key, { quantity: 0 })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea
                      aria-label={`Observação de ${p?.name || "item"}`}
                      rows={2}
                      maxLength={250}
                      value={l.notes}
                      onChange={(e) => line(l.key, { notes: e.target.value })}
                      placeholder="Ex.: sem cebola; um bem passado…"
                    />
                  </div>
                );
              })
            )}
          </div>
          <label className="field">
            Observação do pedido
            <textarea
              rows={2}
              maxLength={500}
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Talheres, embalagem, prioridade…"
            />
          </label>
          <label className="field">
            Pagamento
            <select
              value={draft.payment}
              onChange={(e) =>
                patch({ payment: e.target.value as Draft["payment"] })
              }
            >
              <option value="pending">A definir / no balcão</option>
              <option value="cash">Dinheiro</option>
              <option value="card">Cartão</option>
            </select>
          </label>
          {draft.payment === "cash" && (
            <label className="field">
              Troco para (R$)
              <input
                inputMode="decimal"
                value={draft.change}
                onChange={(e) => patch({ change: e.target.value })}
                placeholder="Ex.: 100,00"
              />
            </label>
          )}
          <div className="entry-total">
            <span>Total do pedido</span>
            <strong>{money(total)}</strong>
          </div>
          <label className="counter-checkbox">
            <input
              type="checkbox"
              checked={draft.printAtCounter}
              onChange={(e) => patch({ printAtCounter: e.target.checked })}
            />
            <span>
              Imprimir também no balcão
              <small>
                Uma via extra. As comandas da cozinha continuam sendo impressas.
              </small>
            </span>
          </label>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary full"
            disabled={
              busy || !draft.lines.length || loading || Boolean(customizing)
            }
            type="submit"
          >
            {busy ? "Enviando…" : "Aceitar e enviar à cozinha"}
            <ArrowRight size={17} />
          </button>
          <p className="entry-help">
            Já entra em preparo e na fila de impressão do gestor.{" "}
            {store && !store.open
              ? "O cardápio público está pausado; o lançamento interno continua disponível."
              : "O computador do gestor precisa estar ligado para imprimir."}
          </p>
        </fieldset>
      </form>
    </div>
  );
}
export function StaffApp() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [name, setName] = useState(""),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [orders, setOrders] = useState<Order[]>([]),
    [tab, setTab] = useState("entry"),
    [last, setLast] = useState<Order | null>(null),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    api<{ authenticated: boolean; name: string }>("/staff/session")
      .then((r) => {
        setAuth(r.authenticated);
        setName(r.name);
      })
      .catch((e) => {
        setError(message(e));
        setAuth(false);
      });
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!auth) return;
    const load = () =>
      api<{ orders: Order[] }>("/staff/orders")
        .then((r) => {
          setOrders(r.orders);
          setError("");
        })
        .catch((e) => {
          setError(message(e));
          if (e instanceof ApiError && e.status === 401) setAuth(false);
        });
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [auth, last]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/staff/login", "POST", { name, pin });
      setPin("");
      setAuth(true);
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (auth === null)
    return <div className="staff-loading">Abrindo Pronto Garçom…</div>;
  if (!auth)
    return (
      <main className="staff-login">
        <div className="staff-mark">
          <UtensilsCrossed size={30} />
        </div>
        <span className="eyebrow muted">PRONTO • SALÃO</span>
        <h1>
          Da mesa
          <br />
          para a cozinha<span className="orange">.</span>
        </h1>
        <p>
          Entre com o PIN definido no gestor e lance os pedidos pelo celular.
        </p>
        <form onSubmit={login}>
          <label className="field">
            Seu nome
            <input
              required
              minLength={2}
              maxLength={40}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            PIN da equipe
            <input
              required
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              minLength={6}
              maxLength={12}
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? "Entrando…" : "Entrar no salão"}
            <ArrowRight size={18} />
          </button>
        </form>
      </main>
    );
  return (
    <main className="staff-app">
      <header className="staff-top">
        <a href="/garcom#/garcom" className="staff-brand">
          <UtensilsCrossed size={22} />
          pronto.<small>GARÇOM</small>
        </a>
        <span>Olá, {name}</span>
        <button
          className="icon-button"
          aria-label="Sair do garçom"
          onClick={async () => {
            try {
              await api("/staff/logout", "POST");
              localStorage.removeItem("pronto-entry-waiter");
              setAuth(false);
              setLast(null);
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          <LogOut size={19} />
        </button>
      </header>
      {!online && (
        <p className="error-banner">
          Sem conexão. Seu rascunho fica salvo; o pedido só será enviado quando
          o gestor estiver acessível.
        </p>
      )}
      <nav className="staff-tabs">
        <button
          className={tab === "entry" ? "active" : ""}
          onClick={() => setTab("entry")}
        >
          <Plus size={17} />
          Lançar pedido
        </button>
        <button
          className={tab === "orders" ? "active" : ""}
          onClick={() => setTab("orders")}
        >
          <ShoppingBag size={17} />
          Meus pedidos{" "}
          <b>
            {
              orders.filter(
                (o) => !["completed", "cancelled"].includes(o.status),
              ).length
            }
          </b>
        </button>
      </nav>
      {last && (
        <div className="staff-success" role="status">
          <CheckCircle2 size={24} />
          <div>
            <strong>
              Pedido #{String(last.number).padStart(3, "0")} aceito!
            </strong>
            <p>
              {last.tableName ? `Mesa ${last.tableName} • ` : ""}Enviado ao
              gestor e à fila da cozinha.
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Fechar confirmação"
            onClick={() => setLast(null)}
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {tab === "entry" ? (
        <OrderEntry mode="waiter" onCreated={setLast} />
      ) : (
        <section className="staff-order-list">
          <h1>Do seu atendimento à entrega.</h1>
          {!orders.length ? (
            <p>Nenhum lançamento por aqui ainda.</p>
          ) : (
            orders.map((o) => (
              <article key={o.id}>
                <div>
                  <strong>
                    #{String(o.number).padStart(3, "0")}
                    {o.tableName ? ` • Mesa ${o.tableName}` : " • Balcão"}
                  </strong>
                  <span>{time(o.createdAt)}</span>
                </div>
                <h3>{o.customerName}</h3>
                <p>
                  {o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
                </p>
                <footer>
                  <b>{money(o.total)}</b>
                  <span className={`status-pill status-${o.status}`}>
                    {
                      {
                        new: "Aguardando aceite",
                        preparing: "Em preparo",
                        ready: "Pronto",
                        completed: "Finalizado",
                        cancelled: "Cancelado",
                      }[o.status]
                    }
                  </span>
                </footer>
              </article>
            ))
          )}
        </section>
      )}
      <footer className="staff-footer">
        Pronto Garçom • rede da loja
        {!window.isSecureContext && (
          <p>
            Use no navegador nesta rede. Para instalar como PWA com recursos
            offline, o endereço precisa de HTTPS.
          </p>
        )}
      </footer>
    </main>
  );
}
export function StaffSettings({
  desktop,
  notify,
}: {
  desktop: DesktopInfo | null;
  notify: (s: string) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [configured, setConfigured] = useState(false),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ enabled: boolean; configured: boolean }>("/admin/staff")
      .then((r) => {
        setEnabled(r.enabled);
        setConfigured(r.configured);
      })
      .catch((e) => setError(message(e)));
  }, []);
  const url = new URL(
    "/garcom#/garcom",
    desktop?.menuUrl || window.location.origin,
  ).href;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/admin/staff", "PUT", { enabled, ...(pin ? { pin } : {}) });
      setConfigured(configured || Boolean(pin));
      setPin("");
      notify("Acesso do garçom salvo. A equipe deve entrar novamente.");
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title-row">
        <div>
          <span className="eyebrow muted">DO SALÃO PARA A COZINHA</span>
          <h1>
            Garçons<span className="orange">.</span>
          </h1>
          <p>
            Lançamento direto pelo celular, com mesa, observações e impressão.
          </p>
        </div>
      </div>
      <div className="staff-settings-grid">
        <form className="section-card staff-settings-form" onSubmit={save}>
          <h2>Acesso da equipe</h2>
          <p>
            O PIN permite lançar pedidos; não dá acesso às configurações do
            gestor.
          </p>
          <label className="staff-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Habilitar acesso dos garçons
          </label>
          <label className="field">
            {configured
              ? "Novo PIN (deixe vazio para manter)"
              : "PIN da equipe"}
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              maxLength={12}
              minLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              required={enabled && !configured}
              placeholder="6 a 12 números"
            />
          </label>
          <p className="small-text">
            Compartilhe o PIN somente com a equipe. Ao salvar, as sessões atuais
            são encerradas.
          </p>
          {error && <p className="error-banner">{error}</p>}
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar acesso"}
          </button>
        </form>
        <section className="section-card staff-qr">
          <Smartphone size={26} />
          <h2>Abra no celular do garçom</h2>
          <QRCodeSVG value={url} size={190} />
          <input readOnly value={url} aria-label="Link do garçom" />
          <button
            className="button secondary"
            onClick={() =>
              navigator.clipboard
                ?.writeText(url)
                .then(() => notify("Link copiado"))
                .catch(() => notify("Selecione e copie o endereço exibido."))
            }
          >
            <Copy size={16} />
            Copiar link
          </button>
          <p>
            Celular e computador no mesmo Wi-Fi. O gestor precisa estar ligado
            para receber e imprimir.
          </p>
        </section>
      </div>
    </>
  );
}
