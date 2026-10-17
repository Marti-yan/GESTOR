import { LocalBackups } from "./LocalBackups";
import { KitchenSetup } from "./KitchenSetup";
import { Tables } from "./Tables";
import { ComboEditor, ComboSummary } from "./Combos";
import { CatalogTransfer } from "./CatalogTransfer";
import { selectionLimit } from "./stockLimits";
import { Reorder, moved } from "./Reorder";
import { Reports } from "./Reports";
import { Stock } from "./Stock";
import { Precific } from "./Precific";
import { AddressFields, DeliverySettings, blankAddress } from "./Delivery";
import {
  lazy,
  Suspense,
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
import { OrderEntry, StaffApp, StaffSettings } from "./Staff";
import { Printing } from "./Printing";
import { CategoryManager } from "./Categories";
import { ModifierManager } from "./ModifierManager";
import { ItemOptionsForm, unitPrice, selectionNames } from "./ItemOptions";
import { Updates } from "./Updates";
import type {
  CartItem,
  Category,
  DesktopInfo,
  Order,
  OrderStatus,
  PrintJob,
  PrintState,
  PrintTarget,
  Product,
  Store,
  ModifierGroup,
  ModifierSelection,
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
  printLabels,
} from "./Ui";
const CourierManager = lazy(() =>
  import("./Couriers").then((m) => ({ default: m.CourierManager })),
);
const Support = lazy(() =>
  import("./Support").then((m) => ({ default: m.Support })),
);
const Agent = lazy(() => import("./Agent").then((m) => ({ default: m.Agent })));
export function Manager({
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
          <small>PRONTO GESTOR • OPERAÇÃO LOCAL</small>
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
              id: "mesas",
              icon: <UtensilsCrossed size={19} />,
              label: "Mesas e contas",
            },
            {
              id: "atendimento",
              icon: <Smartphone size={19} />,
              label: "WhatsApp",
            },
            {
              id: "agente",
              icon: <Settings2 size={19} />,
              label: "Agente de IA",
            },
            {
              id: "entregadores",
              icon: <Truck size={19} />,
              label: "Entregadores",
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
            {
              id: "relatorios",
              icon: <LayoutDashboard size={19} />,
              label: "Relatórios",
            },
            {
              id: "precific",
              icon: <ShoppingBag size={19} />,
              label: "Precific",
            },
            {
              id: "estoque",
              icon: <ShoppingBag size={19} />,
              label: "Estoque",
            },
            { id: "entrega", icon: <Truck size={19} />, label: "Endereços" },
            { id: "garcom", icon: <Smartphone size={19} />, label: "Garçons" },
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
            PRONTO GESTOR <b>v{desktop?.version || "0.8.0"}</b>
          </span>
        </div>
      </aside>
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="breadcrumb">
            Minha loja <ChevronRight size={14} />
            <strong>
              {{
                atendimento: "Atendimento",
                agente: "Agente de IA",
                entregadores: "Entregadores",
                relatorios: "Relatórios",
                estoque: "Estoque",
                entrega: "Endereços",
                pedidos: "Pedidos",
                mesas: "Mesas e contas",
                precific: "Precific",
                cardapio: "Cardápio",
                impressao: "Impressão",
                garcom: "Garçons",
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
          {section === "mesas" ? (
            <ManagerTables />
          ) : section === "precific" ? (
            <Precific hidden={share || connection} />
          ) : section === "atendimento" ? (
            <Support />
          ) : section === "agente" ? (
            <Agent />
          ) : section === "entregadores" ? (
            <CourierManager desktop={desktop} />
          ) : section === "relatorios" ? (
            <Reports />
          ) : section === "estoque" ? (
            <Stock />
          ) : section === "entrega" ? (
            <DeliverySettings />
          ) : section === "cardapio" ? (
            <CatalogManager notify={notify} />
          ) : section === "impressao" ? (
            <Printing notify={notify} desktop={desktop} />
          ) : section === "garcom" ? (
            <StaffSettings desktop={desktop} notify={notify} />
          ) : section === "loja" ? (
            <StoreSettings
              store={store}
              setStore={setStore}
              notify={notify}
              desktop={desktop}
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
            {desktop ? "Aplicativo Windows" : "Gestor web"} • Pronto{" "}
            {desktop?.version || "0.8.0"}
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
    [sound, setSound] = useState(false),
    [entry, setEntry] = useState(false);
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
    new: { status: "preparing", label: "Aceitar e iniciar preparo" },
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
          <button className="button primary" onClick={() => setEntry(true)}>
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
            detail: "Cardápio, salão e balcão",
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
                    <article
                      className={`order-card ${order.status === "new" ? "is-new" : ""}`}
                      key={order.id}
                      onClick={() => setSelected(order)}
                      tabIndex={0}
                      aria-label={`Resumo do pedido ${order.number}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.target === e.currentTarget)
                          setSelected(order);
                      }}
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
                          <Smartphone size={12} />{" "}
                          {order.source === "waiter"
                            ? "Garçom"
                            : order.source === "manager"
                              ? "Gestor"
                              : "Cardápio digital"}
                        </span>
                        <span>
                          {order.fulfillment === "delivery" ? (
                            <Truck size={12} />
                          ) : (
                            <ShoppingBag size={12} />
                          )}{" "}
                          {order.fulfillment === "delivery"
                            ? "Entrega"
                            : order.fulfillment === "dinein"
                              ? "Salão"
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
                      {order.tableName && (
                        <div className="order-table-badge">
                          Mesa {order.tableName}
                          {order.actorName ? ` · ${order.actorName}` : ""}
                        </div>
                      )}
                      {order.notes && (
                        <div className="order-note">
                          <span>OBS.</span>
                          {order.notes}
                        </div>
                      )}
                      <div className="order-card-bottom">
                        <strong>{money(order.total)}</strong>
                        <span>
                          {order.payment === "cash"
                            ? "Dinheiro"
                            : order.payment === "pending"
                              ? "A definir"
                              : "Cartão"}
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
                        ) : order.printJobs?.length &&
                          order.printJobs.every(
                            (j) => j.state === "spooled",
                          ) ? (
                          "Comandas enviadas"
                        ) : order.status === "new" ? (
                          "Aguardando aceite para imprimir"
                        ) : (
                          "Comanda na fila"
                        )}
                      </div>
                      {nextAction[status] && (
                        <button
                          type="button"
                          className="card-action"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            move(order, nextAction[status]!.status);
                          }}
                        >
                          {nextAction[status]!.label}
                          <ArrowRight size={15} />
                        </button>
                      )}
                    </article>
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
      {entry && (
        <Modal
          title="Lançar pedido no gestor"
          wide
          onClose={() => setEntry(false)}
        >
          <OrderEntry
            mode="manager"
            onCreated={(order) => {
              setEntry(false);
              notify(`Pedido #${order.number} aceito e enviado à cozinha`);
              refresh();
            }}
          />
        </Modal>
      )}
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
                    : selected.fulfillment === "dinein"
                      ? "Consumo no local"
                      : "Retirada no local"}
                </span>
                <strong>
                  {selected.fulfillment === "delivery"
                    ? selected.address
                    : selected.fulfillment === "dinein"
                      ? `Mesa ${selected.tableName}${selected.actorName ? ` • ${selected.actorName}` : ""}`
                      : "O cliente retira na loja."}
                </strong>
              </div>
              <div>
                <span>
                  Pagamento{" "}
                  {selected.fulfillment === "delivery"
                    ? "na entrega"
                    : selected.fulfillment === "dinein"
                      ? "no local"
                      : "na retirada"}
                </span>
                <strong>
                  {selected.payment === "cash"
                    ? "Dinheiro"
                    : selected.payment === "pending"
                      ? "A definir / no balcão"
                      : "Cartão — levar maquininha"}
                </strong>
                {selected.changeFor && (
                  <small>
                    Troco para {money(selected.changeFor)} • Devolver{" "}
                    {money(selected.changeFor - selected.total)}
                  </small>
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
                    {i.modifiers?.length ? (
                      <p className="detail-item-modifiers">
                        {i.modifiers
                          .map(
                            (m) => `${m.quantity}× ${m.name} (${m.groupName})`,
                          )
                          .join(" · ")}
                      </p>
                    ) : null}
                    {i.notes && <p className="detail-item-note">{i.notes}</p>}
                  </div>
                  <b>{money(i.price * i.quantity)}</b>
                </div>
              ))}
            </div>
            {selected.status !== "cancelled" && (
              <div className="detail-counter">
                {selected.status === "new" ? (
                  <label className="counter-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(selected.printAtCounter)}
                      onChange={async (e) => {
                        try {
                          const r = await api<{ order: Order }>(
                            `/admin/orders/${selected.id}/counter`,
                            "POST",
                            { enabled: e.target.checked },
                          );
                          setSelected(r.order);
                          await refresh();
                        } catch (error) {
                          notify(errorText(error));
                        }
                      }}
                    />
                    <span>
                      Imprimir também no balcão
                      <small>
                        A via extra entra na fila quando você aceitar o pedido.
                      </small>
                    </span>
                  </label>
                ) : (
                  <button
                    className="button secondary"
                    disabled={Boolean(selected.printAtCounter)}
                    onClick={async () => {
                      try {
                        const r = await api<{ order: Order }>(
                          `/admin/orders/${selected.id}/counter`,
                          "POST",
                          { enabled: true },
                        );
                        setSelected(r.order);
                        await refresh();
                        notify("Via do balcão colocada na fila.");
                      } catch (error) {
                        notify(errorText(error));
                      }
                    }}
                  >
                    <Printer size={16} />
                    {selected.printAtCounter
                      ? "Via do balcão já solicitada"
                      : "Imprimir no balcão"}
                  </button>
                )}
              </div>
            )}
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
                  {(j.receiptCount || 1) > 1 && (
                    <b className="receipt-count-badge">
                      {j.receiptCount} comandas · via {j.receiptIndex}/
                      {j.receiptCount}
                    </b>
                  )}
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
    [categories, setCategories] = useState<Category[]>([]),
    [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]),
    [categoryFilter, setCategoryFilter] = useState(""),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<Product | null>(null),
    [search, setSearch] = useState("");
  const load = useCallback(
    () =>
      api<{
        products: Product[];
        categories: Category[];
        modifierGroups: ModifierGroup[];
      }>("/admin/catalog")
        .then((r) => {
          setProducts(r.products);
          setCategories(r.categories);
          setModifierGroups(r.modifierGroups || []);
          setCategoryFilter((current) =>
            r.categories.some((c) => c.name === current) ? current : "",
          );
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
  async function moveProduct(p: Product, delta: number) {
    const list = products.filter((x) => x.category === p.category),
      index = list.findIndex((x) => x.id === p.id);
    try {
      await api("/admin/products/order", "PUT", {
        category: p.category,
        ids: moved(list, index, delta).map((x) => x.id),
      });
      await load();
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
              category: categories[0]?.name || "",
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
      <CatalogTransfer onChanged={load} />
      <KitchenSetup categories={categories} onChanged={load} />
      <CategoryManager
        categories={categories}
        onChanged={load}
        notify={notify}
        onAddProduct={(category) =>
          setEditing({
            id: "",
            name: "",
            description: "",
            category,
            price: 0,
            available: true,
            station: /bebida/i.test(category) ? "Bar" : "Cozinha",
            art: /bebida/i.test(category) ? "soda" : "burger",
            featured: false,
          })
        }
      />
      <ModifierManager
        groups={modifierGroups}
        onChanged={load}
        notify={notify}
      />
      <div className="entry-categories">
        {["", ...categories.map((c) => c.name)].map((c) => (
          <button
            key={c}
            className={categoryFilter === c ? "active" : ""}
            onClick={() => setCategoryFilter(c)}
          >
            {c || "Todas as categorias"}
          </button>
        ))}
      </div>
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
            .filter(
              (p) =>
                (!categoryFilter || p.category === categoryFilter) &&
                p.name.toLowerCase().includes(search.toLowerCase()),
            )
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
                <div className="catalog-row-actions">
                  <Reorder
                    index={products
                      .filter((x) => x.category === p.category)
                      .findIndex((x) => x.id === p.id)}
                    count={
                      products.filter((x) => x.category === p.category).length
                    }
                    label={p.name}
                    onMove={(delta) => moveProduct(p, delta)}
                  />
                  <button
                    className="button small secondary"
                    onClick={() => setEditing(p)}
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
      {editing && (
        <ProductForm
          product={editing}
          products={products}
          categories={categories}
          modifierGroups={modifierGroups}
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
  products,
  categories,
  modifierGroups,
  onClose,
  onSaved,
}: {
  product: Product;
  products: Product[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
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
            <select
              required
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              <option value="">Selecione a categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
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
        <ComboEditor
          parentId={product.id}
          products={products}
          value={draft.components || []}
          onChange={(components) => setDraft({ ...draft, components })}
        />
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
        <fieldset className="product-modifier-links">
          <legend>Complementos e adicionais deste produto</legend>
          {!modifierGroups.length ? (
            <p>Crie os grupos em Cardápio → Complementos e adicionais.</p>
          ) : (
            [
              ...(draft.modifierGroupIds || [])
                .map((id) => modifierGroups.find((g) => g.id === id))
                .filter((g): g is ModifierGroup => Boolean(g)),
              ...modifierGroups.filter(
                (g) => !draft.modifierGroupIds?.includes(g.id),
              ),
            ].map((group) => (
              <label key={group.id}>
                <input
                  type="checkbox"
                  checked={Boolean(draft.modifierGroupIds?.includes(group.id))}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      modifierGroupIds: e.target.checked
                        ? [...(draft.modifierGroupIds || []), group.id]
                        : (draft.modifierGroupIds || []).filter(
                            (id) => id !== group.id,
                          ),
                    })
                  }
                />
                {draft.modifierGroupIds?.includes(group.id) && (
                  <Reorder
                    index={draft.modifierGroupIds.indexOf(group.id)}
                    count={draft.modifierGroupIds.length}
                    label={`grupo ${group.name} neste produto`}
                    onMove={(delta) =>
                      setDraft({
                        ...draft,
                        modifierGroupIds: moved(
                          draft.modifierGroupIds!,
                          draft.modifierGroupIds!.indexOf(group.id),
                          delta,
                        ),
                      })
                    }
                  />
                )}
                <span>
                  <strong>{group.name}</strong>
                  <small>
                    {group.min} a {group.max} escolhas por unidade
                  </small>
                </span>
              </label>
            ))
          )}
        </fieldset>
        <button className="button primary full" disabled={busy}>
          {busy ? <Spinner /> : <Check size={17} />} Salvar produto
        </button>
      </form>
    </Modal>
  );
}

function StoreSettings({
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
      <Updates desktop={desktop} />
      <LocalBackups />
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

function ManagerTables() {
  const [context, setContext] = useState<{
    tableName: string;
    tableSessionId: string;
  } | null>(null);
  return (
    <>
      <Tables
        mode="admin"
        onAdd={(tableName, tableSessionId) =>
          setContext({ tableName, tableSessionId })
        }
      />
      {context && (
        <Modal
          title={`Lançar na mesa ${context.tableName}`}
          wide
          onClose={() => setContext(null)}
        >
          <OrderEntry
            mode="manager"
            tableContext={context}
            onCreated={() => setContext(null)}
          />
        </Modal>
      )}
    </>
  );
}
