import { useCallback, useEffect, useRef, useState } from "react";
import { selectionLimit, productSelectionLimit } from "./stockLimits";
import { AddressFields, blankAddress } from "./Delivery";
import { FoodArt } from "./art";
import { ItemOptionsForm, unitPrice, selectionNames } from "./ItemOptions";
import { ComboSummary } from "./Combos";
import { api, money, time, parseMoney, navigate, createId } from "./api";
import type {
  Store,
  Product,
  Category,
  CartItem,
  ModifierSelection,
  Order,
  OrderStatus,
} from "./types";
import {
  Logo,
  Spinner,
  Empty,
  Modal,
  Banner,
  emptyStore,
  errorText,
  statusLabels,
} from "./Ui";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Flame,
  Headphones,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  Minus,
  Monitor,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  SlidersHorizontal,
  Smartphone,
  Store as StoreIcon,
  Ticket,
  Trash2,
  Truck,
  UtensilsCrossed,
  Volume2,
  Wifi,
  WifiOff,
  X,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

export type Catalog = {
  store: Store;
  products: Product[];
  categories: Category[];
};
export function Menu({
  notify,
  initialCatalog,
}: {
  notify: (s: string) => void;
  initialCatalog?: Catalog;
}) {
  const [store, setStore] = useState<Store>(
      initialCatalog?.store || emptyStore,
    ),
    [products, setProducts] = useState<Product[]>(
      initialCatalog?.products || [],
    ),
    [categoryRecords, setCategoryRecords] = useState<Category[]>(
      initialCatalog?.categories || [],
    ),
    [loading, setLoading] = useState(!initialCatalog),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todos"),
    [cart, setCart] = useState<CartItem[]>([]);
  const [cartRestored, setCartRestored] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("pronto-cart") || "[]");
      if (Array.isArray(stored)) setCart(stored);
    } catch {}
    setCartRestored(true);
  }, []);
  const [selected, setSelected] = useState<Product | null>(null),
    [quantity, setQuantity] = useState(1),
    [notes, setNotes] = useState(""),
    [checkout, setCheckout] = useState(false),
    [mobileCart, setMobileCart] = useState(false);
  useEffect(() => {
    api<{ store: Store; products: Product[]; categories: Category[] }>(
      "/catalog",
    )
      .then((r) => {
        setStore(r.store);
        setProducts(r.products);
        setCategoryRecords(r.categories);
        setCart((current) =>
          current.flatMap((line) => {
            const product = r.products.find((p) => p.id === line.product.id);
            return product ? [{ ...line, product }] : [];
          }),
        );
      })
      .catch((e) => setError(errorText(e)))
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
    if (cartRestored) {
      try {
        localStorage.setItem("pronto-cart", JSON.stringify(cart));
      } catch {}
    }
  }, [cart, cartRestored]);
  const categories = [
    "Todos",
    ...categoryRecords
      .filter((c) => products.some((p) => p.category === c.name))
      .map((c) => c.name),
  ];
  const filtered = products.filter((p) =>
    `${p.name} ${p.description}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const total = cart.reduce(
      (sum, i) => sum + unitPrice(i.product, i.modifiers) * i.quantity,
      0,
    ),
    count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const closeProduct = useCallback(() => setSelected(null), []);
  function add(
    quantity: number,
    notes: string,
    modifiers: ModifierSelection[],
  ) {
    if (!selected) return;
    if (
      quantity >
      productSelectionLimit(
        products.find((p) => p.id === selected.id),
        products,
        cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      )
    ) {
      notify("A quantidade disponível mudou; confira seu carrinho.");
      return;
    }
    const stock = products.find((p) => p.id === selected.id)?.stockQuantity;
    if (
      stock != null &&
      cart
        .filter((i) => i.product.id === selected.id)
        .reduce((n, i) => n + i.quantity, 0) +
        quantity >
        stock
    ) {
      notify(`Disponível: ${stock} unidades de ${selected.name}.`);
      return;
    }

    const key = `${selected.id}:${notes.trim()}:${JSON.stringify([...modifiers].sort((a, b) => (a.groupId + a.optionId).localeCompare(b.groupId + b.optionId)))}`;
    setCart((old) => {
      const found = old.find((i) => i.key === key);
      if (found && found.quantity + quantity > 20) {
        notify("Limite de 20 unidades por item.");
        return old;
      }
      return found
        ? old.map((i) =>
            i.key === key ? { ...i, quantity: i.quantity + quantity } : i,
          )
        : [
            ...old,
            {
              product: selected,
              quantity,
              notes: notes.trim(),
              key,
              modifiers,
            },
          ];
    });
    notify(`${selected.name} adicionado ao pedido`);
    setSelected(null);
  }
  const cartLimit = (line: CartItem, list = cart) =>
    productSelectionLimit(
      products.find((p) => p.id === line.product.id),
      products,
      list.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        key: i.key,
      })),
      line.key,
    );
  function change(key: string, delta: number) {
    setCart((old) =>
      old
        .map((i) =>
          i.key === key
            ? {
                ...i,
                quantity:
                  delta > 0
                    ? Math.min(cartLimit(i, old), i.quantity + delta)
                    : i.quantity + delta,
              }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }
  const cartContent = (
    <>
      <div className="cart-heading">
        <div>
          <ShoppingBag size={19} />
          <h2>Seu pedido</h2>
        </div>
        <span className="count-badge">{count}</span>
      </div>
      {cart.length ? (
        <>
          <div className="cart-items">
            {cart.map((i) => (
              <div className="cart-item" key={i.key}>
                <div className="cart-item-art">
                  <FoodArt kind={i.product.art} />
                </div>
                <div className="cart-item-body">
                  <strong>{i.product.name}</strong>
                  {i.modifiers?.length ? (
                    <small>{selectionNames(i.product, i.modifiers)}</small>
                  ) : null}
                  {i.notes && <small>{i.notes}</small>}
                  <div className="cart-item-bottom">
                    <div className="stepper small">
                      <button
                        aria-label={`Diminuir ${i.product.name}`}
                        onClick={() => change(i.key, -1)}
                      >
                        <Minus size={12} />
                      </button>
                      <span>{i.quantity}</span>
                      <button
                        aria-label={`Aumentar ${i.product.name}`}
                        disabled={i.quantity >= cartLimit(i)}
                        onClick={() => change(i.key, 1)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <b>
                      {money(unitPrice(i.product, i.modifiers) * i.quantity)}
                    </b>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="cart-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(total)}</strong>
            </div>
            <div>
              <span>Entrega</span>
              <small>Calculada na próxima etapa</small>
            </div>
          </div>
          <button
            className="button primary full"
            disabled={!store.open || total < store.minimumOrder}
            onClick={() => {
              setCheckout(true);
              setMobileCart(false);
            }}
          >
            Continuar pedido <ArrowRight size={18} />
          </button>
          {total < store.minimumOrder && (
            <p className="small-text">
              Pedido mínimo de {money(store.minimumOrder)}.
            </p>
          )}
          <p className="cart-assurance">
            <ShieldCheck size={13} /> Você confirma tudo antes de enviar
          </p>
        </>
      ) : (
        <Empty
          icon={<ShoppingBasket size={31} />}
          heading="Sua sacola está esperando"
        >
          Escolha seus favoritos e a gente cuida do resto.
        </Empty>
      )}
      <div className="cart-footer">
        <Flame size={16} />
        <div>
          <strong>Feito na hora, do seu jeito.</strong>
          <span>Direto da nossa cozinha para você.</span>
        </div>
      </div>
    </>
  );
  return (
    <div className="menu-app">
      <header className="public-header">
        <div className="public-header-inner">
          <Logo />
          <span className="header-caption">DO PEDIDO À COZINHA</span>
          <a className="manager-link" href="#/gestor">
            <LayoutDashboard size={16} /> Acessar gestor{" "}
            <ArrowRight size={15} />
          </a>
        </div>
      </header>
      <main className="menu-layout">
        <section className="menu-main">
          <div className="restaurant-line">
            <span className="restaurant-avatar">
              <UtensilsCrossed size={26} />
            </span>
            <div>
              <h1>{store.name}</h1>
              <p>{store.subtitle}</p>
            </div>
            <span className={`open-pill ${!store.open ? "closed" : ""}`}>
              <i />
              {store.open ? "Aberto agora" : "Fechado agora"}
            </span>
          </div>
          <div className="restaurant-meta">
            <span>
              <Clock3 size={15} />
              {store.estimatedMinimumMinutes ??
                Math.max(5, store.estimatedMinutes - 10)}
              –{store.estimatedMinutes} min
            </span>
            <span>
              <Truck size={15} />
              Entrega a partir de {money(store.deliveryFee)}
            </span>
            <span>
              <ShoppingBag size={15} />
              Retirada disponível
            </span>
          </div>
          <div className="menu-hero">
            <div className="hero-copy">
              <span className="eyebrow">
                <Flame size={14} /> DA CHAPA, COM CARINHO
              </span>
              <h2>
                Seu próximo
                <br />
                favorito está <em>saindo.</em>
              </h2>
              <p>
                Ingredientes de verdade.
                <br />
                Aquele sabor que faz você voltar.
              </p>
              <button
                className="hero-link"
                onClick={() => {
                  setCategory("Todos");
                  document
                    .getElementById("menu-products")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Encontre seu favorito <ArrowRight size={17} />
              </button>
            </div>
            <div className="hero-art">
              <div className="hero-orbit" />
              <FoodArt kind="bacon" hero />
              <span className="hero-seal">
                FEITO
                <br />
                <b>NA CASA</b>
                <span>✦ ✦ ✦</span>
              </span>
            </div>
            <span className="hero-number">01 / FEITO PRA VOCÊ</span>
          </div>
          <div className="browse-header" id="menu-products">
            <div>
              <span className="eyebrow muted">ESCOLHA SEM PRESSA</span>
              <h2>O que vai ser hoje?</h2>
            </div>
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="Buscar no cardápio"
                placeholder="Buscar no cardápio"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Limpar busca" onClick={() => setSearch("")}>
                  <X size={15} />
                </button>
              )}
            </label>
          </div>
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCategory(c);
                  document
                    .getElementById(
                      c === "Todos"
                        ? "menu-products"
                        : "menu-cat-" + encodeURIComponent(c),
                    )
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={category === c ? "active" : ""}
              >
                {c === "Todos" && <UtensilsCrossed size={15} />} {c}
              </button>
            ))}
          </div>
          {error && <Banner message={error} />}
          <div className="menu-category-lists">
            {loading ? (
              <p>Carregando o cardápio…</p>
            ) : (
              categoryRecords
                .filter((c) => filtered.some((p) => p.category === c.name))
                .map((c) => (
                  <section
                    className="menu-category-section"
                    id={"menu-cat-" + encodeURIComponent(c.name)}
                    key={c.id}
                  >
                    <div className="menu-category-title">
                      <h3>{c.name}</h3>
                      <span>
                        {filtered.filter((p) => p.category === c.name).length}{" "}
                        opções
                      </span>
                    </div>
                    <div className="menu-product-list">
                      {filtered
                        .filter((p) => p.category === c.name)
                        .map((p, i) => (
                          <button
                            className="product-card"
                            key={p.id}
                            onClick={() => {
                              setSelected(p);
                              setQuantity(1);
                              setNotes("");
                            }}
                            disabled={
                              !store.open ||
                              productSelectionLimit(
                                p,
                                products,
                                cart.map((i) => ({
                                  productId: i.product.id,
                                  quantity: i.quantity,
                                })),
                              ) === 0
                            }
                          >
                            <div className={`product-image art-${p.art}`}>
                              {p.featured && (
                                <span className="product-tag">
                                  <Flame size={12} /> Favorito da casa
                                </span>
                              )}
                              <FoodArt kind={p.art} />
                              <span className="product-add">
                                <Plus size={21} />
                              </span>
                            </div>
                            <div className="product-copy">
                              <h3>
                                {p.name}
                                {p.stockQuantity === 0
                                  ? " · Esgotado"
                                  : p.stockQuantity != null
                                    ? ` · ${p.stockQuantity} disponíveis`
                                    : ""}
                              </h3>
                              <p>{p.description}</p>
                              {p.components?.length ? (
                                <small className="combo-inline">
                                  Combo ·{" "}
                                  {p.components
                                    .map((c) => `${c.quantity}× ${c.name}`)
                                    .join(" + ")}
                                </small>
                              ) : null}
                              <div>
                                <strong>{money(p.price)}</strong>
                                <span>Preparado na hora</span>
                              </div>
                            </div>
                          </button>
                        ))}
                    </div>
                  </section>
                ))
            )}
          </div>
          {!loading && !filtered.length && (
            <Empty icon={<Search size={28} />} heading="Nenhum item encontrado">
              Tente outro nome ou escolha uma categoria.
            </Empty>
          )}
          <footer className="menu-bottom">
            <span>{store.name} • Feito com cuidado, servido com carinho.</span>
            <span>
              Pedidos com <b>pronto.</b>
            </span>
          </footer>
        </section>
        <aside className="cart-panel">{cartContent}</aside>
      </main>
      <button
        className="mobile-cart-button"
        onClick={() => setMobileCart(true)}
      >
        <ShoppingBag size={19} />
        <span>
          Ver meu pedido <b>{count} itens</b>
        </span>
        <strong>{money(total)}</strong>
        <ChevronRight size={18} />
      </button>
      {mobileCart && (
        <Modal title="Seu pedido" onClose={() => setMobileCart(false)}>
          {cartContent}
        </Modal>
      )}
      {selected && (
        <Modal title="Monte seu pedido" onClose={closeProduct}>
          <div className={`product-modal-art art-${selected.art}`}>
            <FoodArt kind={selected.art} />
          </div>
          <div className="modal-body">
            <ItemOptionsForm
              key={selected.id}
              product={{
                ...selected,
                stockQuantity: products.find((p) => p.id === selected.id)
                  ?.stockQuantity,
              }}
              maxQuantity={productSelectionLimit(
                products.find((p) => p.id === selected.id),
                products,
                cart.map((i) => ({
                  productId: i.product.id,
                  quantity: i.quantity,
                })),
              )}
              onConfirm={add}
            />
          </div>
        </Modal>
      )}
      {checkout && (
        <Checkout
          cart={cart}
          store={store}
          onClose={() => setCheckout(false)}
          onSuccess={(token) => {
            setCart([]);
            setCheckout(false);
            navigate(`/acompanhar/${token}`);
          }}
        />
      )}
    </div>
  );
}

function Checkout({
  cart,
  store,
  onClose,
  onSuccess,
}: {
  cart: CartItem[];
  store: Store;
  onClose: () => void;
  onSuccess: (token: string) => void;
}) {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [fulfillment, setFulfillment] = useState<"delivery" | "pickup">(
      store.allowPickup ? "pickup" : "delivery",
    ),
    [deliveryAddress, setDeliveryAddress] = useState(blankAddress),
    [payment, setPayment] = useState("card"),
    [changeFor, setChangeFor] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const idempotency = useRef(createId()),
    lastBody = useRef("");
  const subtotal = cart.reduce(
      (sum, i) => sum + unitPrice(i.product, i.modifiers) * i.quantity,
      0,
    ),
    total = subtotal + (fulfillment === "delivery" ? store.deliveryFee : 0);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const body = {
        customerName: name,
        phone,
        fulfillment,
        deliveryAddress,
        payment,
        expectedTotal: total,
        changeFor:
          payment === "cash" && changeFor ? parseMoney(changeFor) : null,
        notes,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          notes: i.notes,
          modifiers: i.modifiers || [],
        })),
      };
      const serialized = JSON.stringify(body);
      if (lastBody.current && lastBody.current !== serialized)
        idempotency.current = createId();
      lastBody.current = serialized;
      const response = await api<{ trackingToken: string }>(
        "/orders",
        "POST",
        body,
        { "Idempotency-Key": idempotency.current },
      );
      onSuccess(response.trackingToken);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Falta pouco para ficar pronto" onClose={onClose}>
      <form onSubmit={submit} className="modal-body checkout">
        <p className="muted-text">
          Confira seus dados. O pagamento é feito na entrega ou retirada.
        </p>
        {error && <Banner message={error} />}
        <div className="field-grid">
          <label className="field">
            Seu nome
            <input
              required
              autoComplete="name"
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como podemos chamar você?"
            />
          </label>
          <label className="field">
            Telefone com DDD
            <input
              required
              type="tel"
              autoComplete="tel"
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </label>
        </div>
        <span className="field-label">Como quer receber?</span>
        <div className="option-row">
          {store.allowPickup && (
            <button
              type="button"
              className={`option-card ${fulfillment === "pickup" ? "selected" : ""}`}
              onClick={() => setFulfillment("pickup")}
            >
              <ShoppingBag size={21} />
              <strong>Vou retirar</strong>
              <small>Sem taxa de entrega</small>
            </button>
          )}
          {store.allowDelivery && (
            <button
              type="button"
              className={`option-card ${fulfillment === "delivery" ? "selected" : ""}`}
              onClick={() => setFulfillment("delivery")}
            >
              <Truck size={21} />
              <strong>Receber em casa</strong>
              <small>Taxa de {money(store.deliveryFee)}</small>
            </button>
          )}
        </div>
        {fulfillment === "delivery" && (
          <AddressFields
            value={deliveryAddress}
            onChange={setDeliveryAddress}
          />
        )}
        <label className="field">
          Pagamento
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="card">
              Cartão na {fulfillment === "delivery" ? "entrega" : "retirada"}
            </option>
            <option value="cash">
              Dinheiro na {fulfillment === "delivery" ? "entrega" : "retirada"}
            </option>
          </select>
        </label>
        {payment === "cash" && (
          <label className="field">
            Precisa de troco para quanto?
            <input
              inputMode="decimal"
              placeholder="Ex.: 100,00 — deixe vazio se não precisar"
              value={changeFor}
              onChange={(e) => setChangeFor(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          Observação do pedido
          <textarea
            maxLength={500}
            placeholder="Alguma informação para a cozinha?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="checkout-summary">
          <div>
            <span>Itens</span>
            <b>{money(subtotal)}</b>
          </div>
          <div>
            <span>Entrega</span>
            <b>
              {fulfillment === "delivery" ? money(store.deliveryFee) : "Grátis"}
            </b>
          </div>
          <div className="checkout-total">
            <strong>Total do pedido</strong>
            <strong>{money(total)}</strong>
          </div>
        </div>
        <button className="button primary full" disabled={busy}>
          {busy ? <Spinner /> : <Check size={18} />}{" "}
          {busy ? "Enviando pedido…" : "Confirmar e enviar pedido"}
        </button>
        <p className="small-text center">
          O preço e a disponibilidade serão conferidos no envio.
        </p>
      </form>
    </Modal>
  );
}

export function Tracking({ token }: { token: string }) {
  const [order, setOrder] = useState<Order | null>(null),
    [store, setStore] = useState<Store>(emptyStore),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await api<{ order: Order; store: Store }>(
          `/track/${encodeURIComponent(token)}`,
        );
        if (active) {
          setOrder(result.order);
          setStore(result.store);
          setError("");
        }
      } catch (e) {
        if (active) setError(errorText(e));
      }
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);
  const steps: OrderStatus[] = ["new", "preparing", "ready", "completed"];
  return (
    <div className="tracking-page">
      <header className="public-header">
        <div className="public-header-inner">
          <Logo />
          <a href="#/" className="text-link">
            Voltar ao cardápio <ArrowRight size={16} />
          </a>
        </div>
      </header>
      <main className="tracking-card">
        {error && <Banner message={error} />}{" "}
        {!order ? (
          <div className="loading-block">
            <Spinner />
            Buscando seu pedido…
          </div>
        ) : (
          <>
            <div
              className={`success-orbit ${order.status === "cancelled" ? "cancelled" : ""}`}
            >
              {order.status === "cancelled" ? (
                <X size={37} />
              ) : (
                <Check size={37} />
              )}
            </div>
            <span className="eyebrow muted">{store.name}</span>
            <h1>
              {order.status === "cancelled"
                ? "Pedido cancelado"
                : order.status === "completed"
                  ? "Tudo certo. Bom apetite!"
                  : "Seu pedido já está com a gente."}
            </h1>
            <p className="muted-text">
              Pedido <strong>#{String(order.number).padStart(3, "0")}</strong> •{" "}
              {order.customerName}
            </p>
            {order.status !== "cancelled" && (
              <div className="tracking-steps">
                {steps.map((s, i) => (
                  <div
                    key={s}
                    className={steps.indexOf(order.status) >= i ? "done" : ""}
                  >
                    <span>
                      {steps.indexOf(order.status) > i ? (
                        <Check size={15} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <strong>{statusLabels[s]}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="tracking-order">
              {order.items.map((i) => (
                <div key={i.id}>
                  <span>
                    {i.quantity}× {i.name}
                    {i.notes && <small>{i.notes}</small>}
                  </span>
                  <b>{money(i.price * i.quantity)}</b>
                </div>
              ))}
              <div className="tracking-total">
                <span>Total com entrega</span>
                <strong>{money(order.total)}</strong>
              </div>
            </div>
            <p className="small-text">
              <Clock3 size={14} /> Previsão inicial: {store.estimatedMinutes}{" "}
              minutos •{" "}
              {order.fulfillment === "delivery" ? "Entrega" : "Retirada"}
            </p>
            <p className="small-text">
              Pagamento em {order.payment === "cash" ? "dinheiro" : "cartão"} na{" "}
              {order.fulfillment === "delivery" ? "entrega" : "retirada"}.
            </p>
            <div className="tracking-note">
              <Link2 size={17} />
              <span>
                Guarde este link para acompanhar o preparo. Ele é exclusivo do
                seu pedido.
              </span>
            </div>
            <a href="#/" className="button secondary full">
              Voltar ao cardápio <ArrowRight size={17} />
            </a>
          </>
        )}
      </main>
    </div>
  );
}
