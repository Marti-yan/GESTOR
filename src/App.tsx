import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { QRCodeSVG } from "qrcode.react";
import { api, money, time, parseMoney, navigate, createId } from "./api";
import { FoodArt } from "./art";
import type {
  CartItem,
  DesktopInfo,
  Order,
  OrderStatus,
  PrintJob,
  PrintState,
  PrintTarget,
  Product,
  Store,
} from "./types";

const statusLabels: Record<OrderStatus, string> = {
  new: "Novo pedido",
  preparing: "Em preparo",
  ready: "Pronto",
  completed: "Finalizado",
  cancelled: "Cancelado",
};
const printLabels: Record<PrintState, string> = {
  pending: "Na fila",
  claimed: "Reservada",
  printing: "Enviando",
  spooled: "Enviada à impressora",
  failed: "Falhou",
  uncertain: "Conferir impressão",
  cancelled: "Cancelada",
};
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Não foi possível concluir. Tente novamente.";
const emptyStore: Store = {
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

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`logo ${compact ? "compact" : ""}`} href="#/">
      <span className="logo-mark">
        p<span />
      </span>
      <span>
        pronto<span className="orange">.</span>
      </span>
    </a>
  );
}
function Spinner() {
  return <Loader2 size={18} className="spin" />;
}
function Empty({
  icon,
  heading,
  children,
}: {
  icon: ReactNode;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{heading}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      "button,input,select,textarea",
    );
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const all = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        );
        if (!all?.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Banner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={18} />
      {message}
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState(
    () =>
      window.location.hash.slice(1) || (window.prontoDesktop ? "/gestor" : "/"),
  );
  const [toast, setToast] = useState("");
  useEffect(() => {
    const handler = () => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  return (
    <>
      {route.startsWith("/gestor") ? (
        <Manager route={route} notify={setToast} />
      ) : route.startsWith("/acompanhar/") ? (
        <Tracking token={route.split("/")[2]} />
      ) : (
        <Menu notify={setToast} />
      )}
      <div className={`toast ${toast ? "visible" : ""}`} role="status">
        <CheckCircle2 size={18} />
        {toast}
      </div>
    </>
  );
}

function Menu({ notify }: { notify: (s: string) => void }) {
  const [store, setStore] = useState<Store>(emptyStore),
    [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todos"),
    [cart, setCart] = useState<CartItem[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("pronto-cart") || "[]");
      } catch {
        return [];
      }
    });
  const [selected, setSelected] = useState<Product | null>(null),
    [quantity, setQuantity] = useState(1),
    [notes, setNotes] = useState(""),
    [checkout, setCheckout] = useState(false),
    [mobileCart, setMobileCart] = useState(false);
  useEffect(() => {
    api<{ store: Store; products: Product[] }>("/catalog")
      .then((r) => {
        setStore(r.store);
        setProducts(r.products);
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
    localStorage.setItem("pronto-cart", JSON.stringify(cart));
  }, [cart]);
  const categories = ["Todos", ...new Set(products.map((p) => p.category))];
  const filtered = products.filter(
    (p) =>
      (category === "Todos" || p.category === category) &&
      `${p.name} ${p.description}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
    count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const closeProduct = useCallback(() => setSelected(null), []);
  function add() {
    if (!selected) return;
    const key = `${selected.id}:${notes.trim()}`;
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
        : [...old, { product: selected, quantity, notes: notes.trim(), key }];
    });
    notify(`${selected.name} adicionado ao pedido`);
    setSelected(null);
  }
  function change(key: string, delta: number) {
    setCart((old) =>
      old
        .map((i) =>
          i.key === key
            ? { ...i, quantity: Math.min(20, i.quantity + delta) }
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
                        onClick={() => change(i.key, 1)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <b>{money(i.product.price * i.quantity)}</b>
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
              {store.estimatedMinutes - 10}–{store.estimatedMinutes} min
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
                  setCategory("Burgers");
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
                onClick={() => setCategory(c)}
                className={category === c ? "active" : ""}
              >
                {c === "Todos" && <UtensilsCrossed size={15} />} {c}
              </button>
            ))}
          </div>
          {error && <Banner message={error} />}
          <div className="products-grid">
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <div className="product-skeleton" key={i} />
                ))
              : filtered.map((p, i) => (
                  <button
                    className="product-card"
                    key={p.id}
                    onClick={() => {
                      setSelected(p);
                      setQuantity(1);
                      setNotes("");
                    }}
                    disabled={!store.open}
                    style={{ animationDelay: `${i * 40}ms` }}
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
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <div>
                        <strong>{money(p.price)}</strong>
                        <span>Preparado na hora</span>
                      </div>
                    </div>
                  </button>
                ))}
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
            <h2 className="product-modal-name">{selected.name}</h2>
            <p className="muted-text">{selected.description}</p>
            <strong className="product-modal-price">
              {money(selected.price)}
            </strong>
            <label className="field">
              Alguma observação?
              <textarea
                placeholder="Ex.: sem cebola, molho à parte…"
                maxLength={250}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="add-product-row">
              <div className="stepper">
                <button
                  aria-label="Diminuir quantidade"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => q - 1)}
                >
                  <Minus size={17} />
                </button>
                <strong>{quantity}</strong>
                <button
                  aria-label="Aumentar quantidade"
                  disabled={quantity >= 20}
                  onClick={() => setQuantity((q) => q + 1)}
                >
                  <Plus size={17} />
                </button>
              </div>
              <button className="button primary" onClick={add}>
                Adicionar <span>{money(selected.price * quantity)}</span>
              </button>
            </div>
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
    [address, setAddress] = useState(""),
    [payment, setPayment] = useState("card"),
    [changeFor, setChangeFor] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const idempotency = useRef(createId()),
    lastBody = useRef("");
  const subtotal = cart.reduce(
      (sum, i) => sum + i.product.price * i.quantity,
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
        address,
        payment,
        expectedTotal: total,
        changeFor:
          payment === "cash" && changeFor ? parseMoney(changeFor) : null,
        notes,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          notes: i.notes,
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
          <label className="field">
            Endereço completo
            <textarea
              required
              minLength={8}
              maxLength={400}
              autoComplete="street-address"
              placeholder="Rua, número, bairro, complemento e referência"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <small>A entrega será combinada pelo telefone informado.</small>
          </label>
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

function Tracking({ token }: { token: string }) {
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

function Manager({
  route,
  notify,
}: {
  route: string;
  notify: (s: string) => void;
}) {
  const [auth, setAuth] = useState<boolean | null>(null),
    [needsSetup, setNeedsSetup] = useState(false),
    [store, setStore] = useState<Store>(emptyStore),
    [desktop, setDesktop] = useState<DesktopInfo | null>(null);
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connection, setConnection] = useState(false),
    [share, setShare] = useState(false);
  const section = route.split("/")[2] || "pedidos";
  const checkAuth = useCallback(async () => {
    try {
      const r = await api<{ authenticated: boolean; needsSetup: boolean }>(
        "/auth/session",
      );
      setAuth(r.authenticated);
      setNeedsSetup(r.needsSetup);
      setError("");
    } catch (e) {
      setError(errorText(e));
      setAuth(false);
    }
  }, []);
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
  useEffect(() => {
    if (auth)
      api<{ store: Store }>("/admin/catalog")
        .then((r) => setStore(r.store))
        .catch(() => {});
  }, [auth]);
  useEffect(() => {
    if (!window.prontoDesktop) return;
    const refresh = () =>
      window
        .prontoDesktop!.info()
        .then(setDesktop)
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (needsSetup && password !== confirm) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    try {
      await api(needsSetup ? "/auth/setup" : "/auth/login", "POST", {
        password,
      });
      setPassword("");
      setConfirm("");
      await checkAuth();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      setAuth(false);
    } catch (e) {
      notify(errorText(e));
    }
  }
  const menuUrl = desktop?.menuUrl || new URL("/", window.location.href).href;
  if (auth === null)
    return (
      <div className="page-loader">
        <Logo />
        <Spinner />
      </div>
    );
  if (!auth)
    return (
      <div className="login-page">
        <div className="login-story">
          <Logo />
          <div>
            <span className="eyebrow">MENOS CORRERIA. MAIS CONTROLE.</span>
            <h1>
              O pedido chega.
              <br />A cozinha recebe.
              <br />
              <em>Você acompanha.</em>
            </h1>
            <p>
              Seu balcão digital, do primeiro pedido
              <br />à última comanda do dia.
            </p>
            <div className="login-flow">
              <ShoppingBag />
              <span />
              <Monitor />
              <span />
              <Printer />
            </div>
          </div>
          <small>PRONTO GESTOR • MVP 0.1</small>
        </div>
        <main className="login-form-wrap">
          <form onSubmit={login} className="login-form">
            <span className="form-icon">
              <LayoutDashboard size={25} />
            </span>
            <span className="eyebrow muted">SEU CENTRO DE OPERAÇÃO</span>
            <h2>
              {needsSetup ? "Vamos abrir sua cozinha?" : "Bom te ver por aqui."}
            </h2>
            <p>
              {needsSetup
                ? "Crie a senha de acesso ao gestor. O cardápio fica livre para seus clientes."
                : "Entre para acompanhar os pedidos e organizar o preparo."}
            </p>
            {error && <Banner message={error} />}
            <label className="field">
              {needsSetup ? "Crie sua senha" : "Senha do gestor"}
              <input
                type="password"
                autoComplete={needsSetup ? "new-password" : "current-password"}
                required
                minLength={needsSetup ? 12 : 1}
                maxLength={128}
                placeholder={
                  needsSetup
                    ? "Pelo menos 12 caracteres"
                    : "Sua senha de acesso"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {needsSetup && (
              <label className="field">
                Confirme sua senha
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  placeholder="Digite a senha novamente"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? <Spinner /> : <ArrowRight size={18} />}{" "}
              {needsSetup ? "Criar acesso e começar" : "Entrar no gestor"}
            </button>
            <a className="text-link center" href="#/">
              <ArrowLeft size={15} /> Abrir cardápio digital
            </a>
            {window.prontoDesktop && (
              <button
                type="button"
                className="text-link center"
                onClick={() => setConnection(true)}
              >
                <Settings2 size={15} /> Configurar conexão
              </button>
            )}
            <p className="login-security">
              <ShieldCheck size={15} /> Seus pedidos ficam salvos no servidor.
            </p>
          </form>
        </main>
        {connection && (
          <Connection
            info={desktop}
            onClose={() => setConnection(false)}
            onSaved={() => {
              checkAuth();
              setConnection(false);
            }}
          />
        )}
      </div>
    );
  return (
    <div className="manager-app">
      <aside className="manager-sidebar">
        <Logo />
        <div className="sidebar-store">
          <span className="store-symbol">
            <UtensilsCrossed size={19} />
          </span>
          <div>
            <strong>{store.name}</strong>
            <small>Minha loja</small>
          </div>
        </div>
        <span className="sidebar-label">OPERAÇÃO</span>
        <nav>
          {[
            {
              id: "pedidos",
              icon: <LayoutDashboard size={19} />,
              label: "Pedidos",
            },
            {
              id: "cardapio",
              icon: <UtensilsCrossed size={19} />,
              label: "Cardápio",
            },
            {
              id: "impressao",
              icon: <Printer size={19} />,
              label: "Impressão",
            },
            { id: "loja", icon: <Settings2 size={19} />, label: "Minha loja" },
          ].map((item) => (
            <a
              key={item.id}
              href={`#/gestor/${item.id}`}
              className={section === item.id ? "active" : ""}
            >
              {item.icon}
              <span>{item.label}</span>
              {section === item.id && <span className="nav-active-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span>
              <Flame size={19} />
            </span>
            <strong>Da tela para a cozinha.</strong>
            <p>Compartilhe o cardápio e receba seu próximo pedido.</p>
            <button onClick={() => setShare(true)}>
              Compartilhar cardápio <ArrowRight size={15} />
            </button>
          </div>
          <button className="sidebar-logout" onClick={logout}>
            <LogOut size={17} /> Sair do gestor
          </button>
          <span className="sidebar-version">
            PRONTO GESTOR <b>v0.1.0</b>
          </span>
        </div>
      </aside>
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="breadcrumb">
            Minha loja <ChevronRight size={14} />
            <strong>
              {{
                pedidos: "Pedidos",
                cardapio: "Cardápio",
                impressao: "Impressão",
                loja: "Configurações",
              }[section] || "Pedidos"}
            </strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-status ${desktop && !desktop.connected ? "offline" : ""}`}
            >
              {desktop && !desktop.connected ? (
                <WifiOff size={14} />
              ) : (
                <Wifi size={14} />
              )}{" "}
              {desktop
                ? desktop.connected
                  ? "Conectado"
                  : "Reconectando"
                : "Versão web"}
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              title="Compartilhar cardápio"
              aria-label="Compartilhar cardápio"
              onClick={() => setShare(true)}
            >
              <Smartphone size={19} />
            </button>
            <span className="operator-avatar">
              {store.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <div className="manager-content">
          {section === "cardapio" ? (
            <CatalogManager notify={notify} />
          ) : section === "impressao" ? (
            <Printing notify={notify} desktop={desktop} />
          ) : section === "loja" ? (
            <StoreSettings
              store={store}
              setStore={setStore}
              notify={notify}
              desktop={desktop}
              onConnection={() => setConnection(true)}
            />
          ) : (
            <Orders
              store={store}
              setStore={setStore}
              notify={notify}
              desktop={desktop}
            />
          )}
        </div>
        <footer className="manager-footer">
          <span>
            <span className="tiny-dot" /> Dados salvos no servidor
          </span>
          <span>
            {desktop ? "Aplicativo Windows" : "Gestor web"} • Pronto 0.1
          </span>
        </footer>
      </div>
      {share && (
        <Modal
          title="Seu próximo pedido começa aqui"
          onClose={() => setShare(false)}
        >
          <div className="modal-body share-modal">
            <p className="muted-text">
              Abra o cardápio no celular conectado à mesma rede do computador.
            </p>
            <div className="qr-wrap">
              <QRCodeSVG value={menuUrl} size={188} level="M" />
            </div>
            <strong>{store.name}</strong>
            <div className="copy-url">
              <input readOnly value={menuUrl} aria-label="Link do cardápio" />
              <button
                className="icon-button"
                aria-label="Copiar link"
                onClick={() => {
                  navigator.clipboard
                    .writeText(menuUrl)
                    .then(() => notify("Link copiado!"))
                    .catch(() =>
                      notify("Selecione e copie o endereço exibido."),
                    );
                }}
              >
                <Copy size={18} />
              </button>
            </div>
            <button
              className="button primary full"
              onClick={() =>
                window.prontoDesktop
                  ? window.prontoDesktop.openMenu()
                  : window.open(menuUrl, "_blank", "noopener")
              }
            >
              Abrir cardápio <ExternalLink size={17} />
            </button>
            {desktop?.serverUrl === desktop?.localServerUrl && (
              <p className="small-text">
                O computador e o Pronto precisam continuar ligados. Acesso fora
                da loja exige um servidor publicado.
              </p>
            )}
          </div>
        </Modal>
      )}
      {connection && (
        <Connection
          info={desktop}
          onClose={() => setConnection(false)}
          onSaved={() => {
            checkAuth();
            setConnection(false);
          }}
        />
      )}
    </div>
  );
}

function Orders({
  store,
  setStore,
  notify,
  desktop,
}: {
  store: Store;
  setStore: (s: Store) => void;
  notify: (s: string) => void;
  desktop: DesktopInfo | null;
}) {
  const [orders, setOrders] = useState<Order[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("active"),
    [selected, setSelected] = useState<Order | null>(null),
    [busy, setBusy] = useState(false),
    [lastSync, setLastSync] = useState(""),
    [sound, setSound] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ orders: Order[]; store: Store }>("/admin/orders");
      if (seen.current) {
        const fresh = r.orders.filter(
          (o) => !seen.current!.has(o.id) && o.status === "new",
        );
        if (fresh.length && soundRef.current) {
          try {
            const audio = new AudioContext();
            const oscillator = audio.createOscillator(),
              gain = audio.createGain();
            oscillator.connect(gain);
            gain.connect(audio.destination);
            oscillator.frequency.value = 740;
            gain.gain.value = 0.08;
            oscillator.start();
            oscillator.stop(audio.currentTime + 0.22);
            oscillator.onended = () => audio.close();
          } catch {}
        }
      }
      seen.current = new Set(r.orders.map((o) => o.id));
      setOrders(r.orders);
      setStore(r.store);
      setError("");
      setLastSync(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [setStore]);
  // setStore from useState has stable identity; polling is independent of card interactions.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (selected) {
      const current = orders.find((o) => o.id === selected.id);
      if (current) setSelected(current);
    }
  }, [orders]);
  async function move(order: Order, status: OrderStatus) {
    setBusy(true);
    try {
      await api(`/admin/orders/${order.id}/status`, "PATCH", {
        status,
        expectedStatus: order.status,
      });
      notify(`Pedido #${order.number}: ${statusLabels[status].toLowerCase()}`);
      await refresh();
    } catch (e) {
      notify(errorText(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function toggleStore() {
    try {
      const r = await api<{ store: Store }>("/admin/store", "PATCH", {
        open: !store.open,
      });
      setStore(r.store);
      notify(
        r.store.open
          ? "Loja aberta para pedidos"
          : "Loja pausada para novos pedidos",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    }),
    todayOrders = orders.filter(
      (o) =>
        new Date(o.createdAt).toLocaleDateString("en-CA", {
          timeZone: "America/Sao_Paulo",
        }) === today,
    ),
    active = orders.filter(
      (o) => !["completed", "cancelled"].includes(o.status),
    );
  const visible = orders.filter(
    (o) =>
      (filter === "active"
        ? !["completed", "cancelled"].includes(o.status)
        : filter === "today"
          ? todayOrders.includes(o)
          : true) &&
      `${o.number} ${o.customerName} ${o.phone}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const columns: Exclude<OrderStatus, "cancelled">[] = [
    "new",
    "preparing",
    "ready",
    "completed",
  ];
  const nextAction: Partial<
    Record<OrderStatus, { status: OrderStatus; label: string }>
  > = {
    new: { status: "preparing", label: "Iniciar preparo" },
    preparing: { status: "ready", label: "Marcar como pronto" },
    ready: { status: "completed", label: "Finalizar pedido" },
  };
  return (
    <>
      <div className="page-title-row">
        <div>
          <span className="eyebrow muted">TUDO ACONTECENDO POR AQUI</span>
          <h1>
            Pedidos<span className="orange">.</span>
          </h1>
          <p>Acompanhe cada pedido, da chegada à entrega.</p>
        </div>
        <div className="title-actions">
          <button
            className={`store-toggle ${!store.open ? "paused" : ""}`}
            onClick={toggleStore}
          >
            <span />
            <strong>{store.open ? "Loja aberta" : "Loja pausada"}</strong>
            <ChevronDown size={15} />
          </button>
          <button
            className="button primary"
            onClick={() =>
              window.prontoDesktop
                ? window.prontoDesktop.openMenu()
                : navigate("/")
            }
          >
            <Plus size={17} /> Novo pedido
          </button>
        </div>
      </div>
      <div className="stats-row">
        {[
          {
            label: "Pedidos hoje",
            value: todayOrders.length,
            icon: <ShoppingBag size={20} />,
            tone: "orange",
            detail: "Recebidos pelo cardápio",
          },
          {
            label: "Em andamento",
            value: active.length,
            icon: <Clock3 size={20} />,
            tone: "blue",
            detail: "Da cozinha à expedição",
          },
          {
            label: "Finalizados hoje",
            value: todayOrders.filter((o) => o.status === "completed").length,
            icon: <CheckCheck size={20} />,
            tone: "green",
            detail: "Pedidos concluídos",
          },
          {
            label: "Vendas do dia",
            value: money(
              todayOrders
                .filter((o) => o.status !== "cancelled")
                .reduce((s, o) => s + o.total, 0),
            ),
            icon: <Ticket size={20} />,
            tone: "purple",
            detail: "Pagamento na entrega/retirada",
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div>
              <span>{s.label}</span>
              <span className={`stat-icon ${s.tone}`}>{s.icon}</span>
            </div>
            <strong>{s.value}</strong>
            <small>{s.detail}</small>
          </div>
        ))}
      </div>
      {!desktop && (
        <div className="context-banner">
          <Monitor size={19} />
          <span>
            <strong>Você está no gestor web.</strong> A impressão automática
            funciona no aplicativo Windows, com a Elgin i8 configurada.
          </span>
          <a href="#/gestor/impressao">
            Ver impressão <ArrowRight size={15} />
          </a>
        </div>
      )}
      {desktop && !desktop.autoPrint && (
        <div className="context-banner">
          <Printer size={19} />
          <span>
            <strong>A impressão automática está pausada.</strong> Configure sua
            Elgin i8 para enviar as comandas.
          </span>
          <a href="#/gestor/impressao">
            Configurar <ArrowRight size={15} />
          </a>
        </div>
      )}
      {error && (
        <Banner
          message={`${error} Os pedidos já carregados continuam visíveis.`}
        />
      )}
      <div className="board-toolbar">
        <div className="filter-segment">
          {[
            { id: "active", label: "Em andamento", count: active.length },
            { id: "today", label: "Hoje", count: todayOrders.length },
            { id: "all", label: "Todos", count: orders.length },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={filter === f.id ? "active" : ""}
            >
              {f.label}
              <span>{f.count}</span>
            </button>
          ))}
        </div>
        <div className="board-tools">
          <label className="search-box">
            <Search size={16} />
            <input
              placeholder="Buscar pedido ou cliente"
              aria-label="Buscar pedido ou cliente"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            className={`icon-button ${sound ? "sound-active" : ""}`}
            onClick={() => {
              setSound((s) => !s);
              notify(
                sound ? "Alerta sonoro desligado" : "Alerta sonoro ligado",
              );
            }}
            title="Alerta sonoro"
            aria-label="Alternar alerta sonoro"
          >
            <Volume2 size={19} />
          </button>
          <button
            className="icon-button"
            onClick={refresh}
            title="Atualizar pedidos"
            aria-label="Atualizar pedidos"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>
      <div className="kanban-board">
        {columns.map((status) => {
          const list = visible.filter((o) => o.status === status);
          return (
            <section className={`kanban-column column-${status}`} key={status}>
              <div className="column-heading">
                <div>
                  <span className="column-dot" />
                  <h2>{status === "new" ? "Novos" : statusLabels[status]}</h2>
                  <span>{list.length}</span>
                </div>
                <MoreHorizontal size={18} />
              </div>
              <div className="column-list">
                {loading ? (
                  <div className="loading-block">
                    <Spinner />
                  </div>
                ) : list.length ? (
                  list.map((order) => (
                    <button
                      className={`order-card ${order.status === "new" ? "is-new" : ""}`}
                      key={order.id}
                      onClick={() => setSelected(order)}
                    >
                      <div className="order-card-top">
                        <strong>
                          #{String(order.number).padStart(3, "0")}
                        </strong>
                        <span>
                          <Clock3 size={11} />
                          {time(order.createdAt)}
                        </span>
                      </div>
                      <h3>{order.customerName}</h3>
                      <div className="order-meta">
                        <span>
                          <Smartphone size={12} /> Cardápio digital
                        </span>
                        <span>
                          {order.fulfillment === "delivery" ? (
                            <Truck size={12} />
                          ) : (
                            <ShoppingBag size={12} />
                          )}{" "}
                          {order.fulfillment === "delivery"
                            ? "Entrega"
                            : "Retirada"}
                        </span>
                      </div>
                      <div className="order-card-items">
                        {order.items.slice(0, 3).map((i) => (
                          <p key={i.id}>
                            <b>{i.quantity}×</b> {i.name}
                          </p>
                        ))}
                        {order.items.length > 3 && (
                          <small>+{order.items.length - 3} itens</small>
                        )}
                      </div>
                      {order.notes && (
                        <div className="order-note">
                          <span>OBS.</span>
                          {order.notes}
                        </div>
                      )}
                      <div className="order-card-bottom">
                        <strong>{money(order.total)}</strong>
                        <span>
                          {order.payment === "cash" ? "Dinheiro" : "Cartão"}
                        </span>
                      </div>
                      <div className="order-print-status">
                        <Printer size={12} />
                        {order.printJobs?.some((j) =>
                          ["failed", "uncertain"].includes(j.state),
                        ) ? (
                          <span className="danger-text">
                            Conferir impressão
                          </span>
                        ) : order.printJobs?.every(
                            (j) => j.state === "spooled",
                          ) ? (
                          "Comandas enviadas"
                        ) : (
                          "Comanda na fila"
                        )}
                      </div>
                      {nextAction[status] && (
                        <div className="card-action">
                          {nextAction[status]!.label}
                          <ArrowRight size={15} />
                        </div>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="column-empty">
                    <span>
                      {status === "new" ? (
                        <ShoppingBag size={22} />
                      ) : status === "preparing" ? (
                        <Flame size={22} />
                      ) : status === "ready" ? (
                        <PackageCheck size={22} />
                      ) : (
                        <CheckCheck size={22} />
                      )}
                    </span>
                    <strong>
                      {
                        {
                          new: "Esperando o próximo pedido",
                          preparing: "Cozinha em dia",
                          ready: "Nada na expedição",
                          completed: "Um bom dia começa aqui",
                        }[status]
                      }
                    </strong>
                    <p>
                      {
                        {
                          new: "Os pedidos do cardápio chegam aqui.",
                          preparing: "Pedidos aceitos aparecem aqui.",
                          ready: "Os pedidos prontos ficam aqui.",
                          completed: "Pedidos finalizados aparecem aqui.",
                        }[status]
                      }
                    </p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {filter === "all" && visible.some((o) => o.status === "cancelled") && (
        <div className="cancelled-list">
          <h3>Cancelados</h3>
          {visible
            .filter((o) => o.status === "cancelled")
            .map((o) => (
              <button key={o.id} onClick={() => setSelected(o)}>
                #{o.number} • {o.customerName}
                <span>{money(o.total)}</span>
              </button>
            ))}
        </div>
      )}
      <div className="board-footnote">
        <span>
          <RefreshCw size={12} /> Atualização automática a cada poucos segundos
        </span>
        <span>
          {lastSync
            ? `Última atualização às ${lastSync}`
            : "Conectando ao servidor…"}
        </span>
      </div>
      {selected && (
        <Modal
          title={`Pedido #${String(selected.number).padStart(3, "0")}`}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="modal-body order-detail">
            <div className="order-detail-heading">
              <div>
                <h2>{selected.customerName}</h2>
                <p>
                  {selected.phone} • {time(selected.createdAt)}
                </p>
              </div>
              <span className={`status-pill status-${selected.status}`}>
                {statusLabels[selected.status]}
              </span>
            </div>
            <div className="detail-info-grid">
              <div>
                <span>
                  {selected.fulfillment === "delivery"
                    ? "Endereço de entrega"
                    : "Retirada no local"}
                </span>
                <strong>
                  {selected.fulfillment === "delivery"
                    ? selected.address
                    : "O cliente retira na loja."}
                </strong>
              </div>
              <div>
                <span>
                  Pagamento na{" "}
                  {selected.fulfillment === "delivery" ? "entrega" : "retirada"}
                </span>
                <strong>
                  {selected.payment === "cash"
                    ? "Dinheiro"
                    : "Cartão — levar maquininha"}
                </strong>
                {selected.changeFor && (
                  <small>Troco para {money(selected.changeFor)}</small>
                )}
              </div>
            </div>
            <div className="detail-items">
              {selected.items.map((i) => (
                <div key={i.id}>
                  <span className="quantity-square">{i.quantity}×</span>
                  <div>
                    <strong>{i.name}</strong>
                    <small>{i.station}</small>
                    {i.notes && <p className="detail-item-note">{i.notes}</p>}
                  </div>
                  <b>{money(i.price * i.quantity)}</b>
                </div>
              ))}
            </div>
            {selected.notes && (
              <div className="note-box">
                <strong>Observação do pedido</strong>
                <p>{selected.notes}</p>
              </div>
            )}
            <div className="checkout-summary">
              <div>
                <span>Subtotal</span>
                <b>{money(selected.subtotal)}</b>
              </div>
              <div>
                <span>Entrega</span>
                <b>{money(selected.deliveryFee)}</b>
              </div>
              <div className="checkout-total">
                <strong>Total</strong>
                <strong>{money(selected.total)}</strong>
              </div>
            </div>
            <div className="detail-print-jobs">
              {selected.printJobs?.map((j) => (
                <span key={j.id}>
                  <Printer size={13} />
                  {printLabels[j.state]}
                </span>
              ))}
            </div>
            <div className="detail-actions">
              <button
                className="button secondary"
                onClick={() =>
                  window.prontoDesktop
                    ? window.prontoDesktop.previewReceipt(selected.id)
                    : window.open(
                        `/api/admin/orders/${selected.id}/receipt`,
                        "_blank",
                        "noopener",
                      )
                }
              >
                <Printer size={16} /> Ver comanda
              </button>
              {nextAction[selected.status] && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    move(selected, nextAction[selected.status]!.status)
                  }
                >
                  {busy ? <Spinner /> : <ArrowRight size={17} />}{" "}
                  {nextAction[selected.status]!.label}
                </button>
              )}
            </div>
            {!["completed", "cancelled"].includes(selected.status) && (
              <button
                className="text-link danger-text"
                onClick={() => {
                  if (
                    window.confirm(
                      `Cancelar o pedido #${selected.number}? Confira se a cozinha já começou a preparar.`,
                    )
                  )
                    move(selected, "cancelled");
                }}
              >
                Cancelar pedido
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function CatalogManager({ notify }: { notify: (s: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<Product | null>(null),
    [search, setSearch] = useState("");
  const load = useCallback(
    () =>
      api<{ products: Product[] }>("/admin/catalog")
        .then((r) => {
          setProducts(r.products);
          setError("");
        })
        .catch((e) => setError(errorText(e))),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function toggle(product: Product) {
    try {
      await api(`/admin/products/${product.id}`, "PATCH", {
        available: !product.available,
      });
      load();
    } catch (e) {
      notify(errorText(e));
    }
  }
  return (
    <>
      <div className="page-title-row">
        <div>
          <span className="eyebrow muted">O SABOR COMEÇA AQUI</span>
          <h1>
            Seu cardápio<span className="orange">.</span>
          </h1>
          <p>Produtos, preços e disponibilidade em um só lugar.</p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            setEditing({
              id: "",
              name: "",
              description: "",
              category: "Burgers",
              price: 0,
              available: true,
              station: "Cozinha",
              art: "burger",
              featured: false,
            })
          }
        >
          <Plus size={17} /> Adicionar produto
        </button>
      </div>
      {error && <Banner message={error} />}
      <div className="section-card">
        <div className="section-card-header">
          <h2>
            Todos os produtos{" "}
            <span className="count-badge">{products.length}</span>
          </h2>
          <label className="search-box">
            <Search size={16} />
            <input
              placeholder="Buscar produto"
              aria-label="Buscar produto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="catalog-table">
          <div className="catalog-table-head">
            <span>PRODUTO</span>
            <span>CATEGORIA / SETOR</span>
            <span>PREÇO</span>
            <span>DISPONÍVEL</span>
            <span />
          </div>
          {products
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((p) => (
              <div className="catalog-table-row" key={p.id}>
                <div>
                  <span className={`catalog-thumb art-${p.art}`}>
                    <FoodArt kind={p.art} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                  </span>
                </div>
                <div>
                  <strong>{p.category}</strong>
                  <small>{p.station}</small>
                </div>
                <strong>{money(p.price)}</strong>
                <button
                  className={`switch ${p.available ? "on" : ""}`}
                  role="switch"
                  aria-checked={p.available}
                  aria-label={`Disponibilidade de ${p.name}`}
                  onClick={() => toggle(p)}
                >
                  <span />
                </button>
                <button
                  className="button small secondary"
                  onClick={() => setEditing(p)}
                >
                  Editar
                </button>
              </div>
            ))}
        </div>
      </div>
      {editing && (
        <ProductForm
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            notify("Produto salvo no cardápio");
          }}
        />
      )}
    </>
  );
}
function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(product),
    [price, setPrice] = useState(
      (product.price / 100).toFixed(2).replace(".", ","),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        product.id ? `/admin/products/${product.id}` : "/admin/products",
        product.id ? "PATCH" : "POST",
        { ...draft, price: parseMoney(price) },
      );
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={product.id ? "Editar produto" : "Novo produto"}
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={save}>
        {error && <Banner message={error} />}
        <label className="field">
          Nome
          <input
            required
            minLength={2}
            maxLength={100}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          Descrição
          <textarea
            maxLength={400}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </label>
        <div className="field-grid">
          <label className="field">
            Preço (R$)
            <input
              required
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="field">
            Categoria
            <input
              required
              value={draft.category}
              maxLength={60}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            />
          </label>
        </div>
        <label className="field">
          Setor de preparo
          <input
            required
            value={draft.station}
            maxLength={60}
            onChange={(e) => setDraft({ ...draft, station: e.target.value })}
          />
          <small>Use o mesmo nome nas regras de impressão setorizada.</small>
        </label>
        <label className="field">
          Ilustração
          <select
            value={draft.art}
            onChange={(e) => setDraft({ ...draft, art: e.target.value })}
          >
            {[
              { id: "burger", name: "Burger clássico" },
              { id: "bacon", name: "Burger com bacon" },
              { id: "double", name: "Burger duplo" },
              { id: "veggie", name: "Burger vegetal" },
              { id: "fries", name: "Batata" },
              { id: "loaded-fries", name: "Batata com cheddar" },
              { id: "soda", name: "Refrigerante" },
              { id: "lemonade", name: "Limonada" },
              { id: "water", name: "Água" },
            ].map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary full" disabled={busy}>
          {busy ? <Spinner /> : <Check size={17} />} Salvar produto
        </button>
      </form>
    </Modal>
  );
}

function Printing({
  notify,
  desktop,
}: {
  notify: (s: string) => void;
  desktop: DesktopInfo | null;
}) {
  const [targets, setTargets] = useState<PrintTarget[]>([]),
    [jobs, setJobs] = useState<PrintJob[]>([]),
    [printers, setPrinters] = useState<{ name: string; displayName: string }[]>(
      [],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [testing, setTesting] = useState(""),
    [dirty, setDirty] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api<{ targets: PrintTarget[]; jobs: PrintJob[] }>(
        "/admin/printing",
      );
      setJobs(r.jobs);
      if (!dirty) setTargets(r.targets);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [dirty]);
  const loadPrinters = useCallback(() => {
    window.prontoDesktop
      ?.printers()
      .then(setPrinters)
      .catch((e) => notify(errorText(e)));
  }, [notify]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);
  function edit(id: string, patch: Partial<PrintTarget>) {
    setDirty(true);
    setTargets((old) => old.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  async function save() {
    setBusy(true);
    try {
      await api("/admin/printing/targets", "PUT", { targets });
      setDirty(false);
      notify("Saídas de impressão salvas");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function test(target: PrintTarget) {
    setTesting(target.id);
    try {
      await window.prontoDesktop?.testPrint(target);
      notify("Teste enviado à impressora. Confira o papel.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setTesting("");
    }
  }
  async function retry(job: PrintJob) {
    if (
      !window.confirm(
        `Conferiu se a comanda #${job.number} já saiu? Reenviar pode gerar uma segunda via.`,
      )
    )
      return;
    try {
      await api(`/admin/printing/jobs/${job.id}/retry`, "POST", {
        confirmed: true,
      });
      notify("Comanda colocada novamente na fila");
      load();
    } catch (e) {
      notify(errorText(e));
    }
  }
  return (
    <>
      <div className="page-title-row">
        <div>
          <span className="eyebrow muted">DA TELA PARA O PAPEL</span>
          <h1>
            Impressão<span className="orange">.</span>
          </h1>
          <p>Elgin i8 • USB • papel de 80 mm</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            loadPrinters();
            load();
          }}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {error && <Banner message={error} />}
      <div className={`printing-state ${desktop?.autoPrint ? "enabled" : ""}`}>
        <span className="printing-state-icon">
          <Printer size={27} />
        </span>
        <div>
          <h2>
            {desktop
              ? desktop.autoPrint
                ? "Impressão automática ligada"
                : "Impressão automática pausada"
              : "Configure no aplicativo Windows"}
          </h2>
          <p>
            {desktop
              ? "Novos pedidos entram na fila e são enviados sem abrir o diálogo de impressão."
              : "O navegador permite visualizar comandas. A impressão silenciosa é feita pelo gestor instalado."}
          </p>
        </div>
        {desktop && (
          <button
            className={`switch ${desktop.autoPrint ? "on" : ""}`}
            role="switch"
            aria-checked={desktop.autoPrint}
            aria-label="Impressão automática"
            onClick={() =>
              window
                .prontoDesktop!.configure({ autoPrint: !desktop.autoPrint })
                .then(() =>
                  notify(
                    desktop.autoPrint
                      ? "Impressão pausada"
                      : "Impressão automática ligada",
                  ),
                )
                .catch((e) => notify(errorText(e)))
            }
          >
            <span />
          </button>
        )}
      </div>
      {desktop?.printerError && <Banner message={desktop.printerError} />}
      <div className="section-card">
        <div className="section-card-header">
          <div>
            <h2>Saídas de impressão</h2>
            <p>
              Uma geral para a expedição. Outras, se a sua cozinha precisar.
            </p>
          </div>
          <button
            className="button secondary small"
            disabled={!desktop || targets.length >= 8}
            onClick={() => {
              setDirty(true);
              setTargets([
                ...targets,
                {
                  id: createId(),
                  label: "Comanda da cozinha",
                  deviceName: "",
                  width: 80,
                  station: "Cozinha",
                  enabled: true,
                },
              ]);
            }}
          >
            <Plus size={16} /> Nova saída
          </button>
        </div>
        <div className="print-targets">
          {targets.map((t) => (
            <div className="print-target" key={t.id}>
              <div className="print-target-top">
                <span className="printer-square">
                  <Printer size={20} />
                </span>
                <input
                  aria-label="Nome da saída"
                  value={t.label}
                  disabled={!desktop}
                  maxLength={80}
                  onChange={(e) => edit(t.id, { label: e.target.value })}
                />
                <button
                  className={`switch ${t.enabled ? "on" : ""}`}
                  disabled={!desktop}
                  role="switch"
                  aria-checked={t.enabled}
                  aria-label={`Habilitar ${t.label}`}
                  onClick={() => edit(t.id, { enabled: !t.enabled })}
                >
                  <span />
                </button>
              </div>
              <div className="print-target-fields">
                <label className="field">
                  Impressora do Windows
                  <select
                    value={t.deviceName}
                    disabled={!desktop}
                    onChange={(e) => edit(t.id, { deviceName: e.target.value })}
                  >
                    <option value="">Selecione a Elgin i8 instalada</option>
                    {t.deviceName &&
                      !printers.some((p) => p.name === t.deviceName) && (
                        <option value={t.deviceName}>
                          {t.deviceName} (não detectada)
                        </option>
                      )}
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Papel
                  <select
                    value={t.width}
                    disabled={!desktop}
                    onChange={(e) =>
                      edit(t.id, { width: Number(e.target.value) as 58 | 80 })
                    }
                  >
                    <option value={80}>80 mm — Elgin i8</option>
                    <option value={58}>58 mm</option>
                  </select>
                </label>
                <label className="field">
                  Itens da comanda
                  <input
                    value={t.station === "*" ? "Todos os setores" : t.station}
                    disabled={!desktop || t.id === "geral"}
                    placeholder="Ex.: Cozinha ou Bar"
                    onChange={(e) =>
                      edit(t.id, {
                        station:
                          e.target.value === "Todos os setores"
                            ? "*"
                            : e.target.value,
                      })
                    }
                  />
                </label>
                <button
                  className="button secondary test-print"
                  disabled={!desktop || !t.deviceName || Boolean(testing)}
                  onClick={() => test(t)}
                >
                  {testing === t.id ? <Spinner /> : <Printer size={15} />}{" "}
                  Testar
                </button>
              </div>
            </div>
          ))}
        </div>
        {desktop && (
          <div className="section-card-bottom">
            <span className="small-text">
              Instale o driver da Elgin i8 no Windows antes de selecionar a
              impressora.
            </span>
            <button
              className="button primary"
              onClick={save}
              disabled={!dirty || busy}
            >
              {busy ? <Spinner /> : <Check size={17} />} Salvar saídas
            </button>
          </div>
        )}
      </div>
      <div className="section-card">
        <div className="section-card-header">
          <div>
            <h2>
              Fila de comandas{" "}
              <span className="count-badge">
                {
                  jobs.filter((j) =>
                    ["pending", "claimed", "printing"].includes(j.state),
                  ).length
                }
              </span>
            </h2>
            <p>
              “Enviada” confirma o aceite pelo sistema de impressão. Confira a
              saída física.
            </p>
          </div>
        </div>
        {!jobs.length ? (
          <Empty
            icon={<Printer size={27} />}
            heading="Nenhuma comanda por aqui"
          >
            Os trabalhos aparecem quando um pedido chega pelo cardápio.
          </Empty>
        ) : (
          <div className="print-jobs">
            {jobs.map((j) => (
              <div className="print-job" key={j.id}>
                <span className="job-number">
                  #{String(j.number).padStart(3, "0")}
                </span>
                <div>
                  <strong>{j.label}</strong>
                  <small>
                    {time(j.createdAt)} • {j.attempt} tentativa(s)
                    {j.lastError && ` • ${j.lastError}`}
                  </small>
                </div>
                <span className={`job-state state-${j.state}`}>
                  {printLabels[j.state]}
                </span>
                {["failed", "uncertain", "spooled"].includes(j.state) && (
                  <button
                    className="button small secondary"
                    onClick={() => retry(j)}
                  >
                    <RefreshCw size={13} />
                    {j.state === "spooled" ? "2ª via" : "Reenviar"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StoreSettings({
  store,
  setStore,
  notify,
  desktop,
  onConnection,
}: {
  store: Store;
  setStore: (s: Store) => void;
  notify: (s: string) => void;
  desktop: DesktopInfo | null;
  onConnection: () => void;
}) {
  const [draft, setDraft] = useState(store),
    [fee, setFee] = useState(
      (store.deliveryFee / 100).toFixed(2).replace(".", ","),
    ),
    [minimum, setMinimum] = useState(
      (store.minimumOrder / 100).toFixed(2).replace(".", ","),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ store: Store }>("/admin/store", "PATCH", {
        ...draft,
        deliveryFee: parseMoney(fee),
        minimumOrder: parseMoney(minimum),
      });
      setStore(r.store);
      setError("");
      notify("Configurações da loja salvas");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title-row">
        <div>
          <span className="eyebrow muted">DO SEU JEITO</span>
          <h1>
            Minha loja<span className="orange">.</span>
          </h1>
          <p>As informações que seus clientes encontram no cardápio.</p>
        </div>
      </div>
      <form className="section-card settings-form" onSubmit={save}>
        <div className="section-card-header">
          <h2>Informações e atendimento</h2>
        </div>
        <div className="settings-body">
          {error && <Banner message={error} />}
          <label className="field">
            Nome da loja
            <input
              required
              minLength={2}
              maxLength={80}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            Descrição curta
            <input
              maxLength={160}
              value={draft.subtitle}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
            />
          </label>
          <label className="field">
            Telefone da loja
            <input
              type="tel"
              maxLength={30}
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="(11) 99999-9999"
            />
          </label>
          <div className="field-grid">
            <label className="field">
              Taxa fixa de entrega (R$)
              <input
                required
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </label>
            <label className="field">
              Pedido mínimo (R$)
              <input
                required
                inputMode="decimal"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Prazo estimado (minutos)
            <input
              required
              type="number"
              min={5}
              max={240}
              value={draft.estimatedMinutes}
              onChange={(e) =>
                setDraft({ ...draft, estimatedMinutes: Number(e.target.value) })
              }
            />
          </label>
          <div className="setting-switch-row">
            <div>
              <strong>Entrega</strong>
              <span>Os clientes informam o endereço no checkout.</span>
            </div>
            <button
              type="button"
              className={`switch ${draft.allowDelivery ? "on" : ""}`}
              role="switch"
              aria-checked={draft.allowDelivery}
              aria-label="Permitir entrega"
              onClick={() =>
                setDraft({ ...draft, allowDelivery: !draft.allowDelivery })
              }
            >
              <span />
            </button>
          </div>
          <div className="setting-switch-row">
            <div>
              <strong>Retirada na loja</strong>
              <span>Uma opção sem taxa de entrega.</span>
            </div>
            <button
              type="button"
              className={`switch ${draft.allowPickup ? "on" : ""}`}
              role="switch"
              aria-checked={draft.allowPickup}
              aria-label="Permitir retirada"
              onClick={() =>
                setDraft({ ...draft, allowPickup: !draft.allowPickup })
              }
            >
              <span />
            </button>
          </div>
        </div>
        <div className="section-card-bottom">
          <span className="small-text">
            Neste MVP, os pagamentos são feitos na entrega ou retirada.
          </span>
          <button className="button primary" disabled={busy}>
            {busy ? <Spinner /> : <Check size={17} />} Salvar alterações
          </button>
        </div>
      </form>
      {desktop && (
        <div className="section-card">
          <div className="section-card-header">
            <div>
              <h2>Conexão do aplicativo</h2>
              <p>{desktop.serverUrl}</p>
            </div>
            <button className="button secondary" onClick={onConnection}>
              <Settings2 size={16} /> Configurar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Connection({
  info,
  onClose,
  onSaved,
}: {
  info: DesktopInfo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(info?.serverUrl || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await window.prontoDesktop?.configure({ serverUrl: url });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Conexão do gestor" onClose={onClose}>
      <form className="modal-body" onSubmit={save}>
        <p className="muted-text">
          Use o servidor incluído para a rede da loja ou conecte um servidor
          externo publicado.
        </p>
        {error && <Banner message={error} />}
        <label className="field">
          Endereço do servidor
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://pedidos.sualoja.com.br"
          />
        </label>
        <button
          type="button"
          className="text-link"
          onClick={() => setUrl(info?.localServerUrl || "")}
        >
          Usar servidor deste computador
        </button>
        <p className="small-text">
          Ao trocar o endereço, será necessário entrar novamente. Pedidos e
          configurações pertencem ao servidor selecionado.
        </p>
        <button className="button primary full" disabled={busy}>
          {busy ? <Spinner /> : <Link2 size={17} />} Salvar conexão
        </button>
      </form>
    </Modal>
  );
}
