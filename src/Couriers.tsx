import { LiveDeliveryMap, CourierLocationSharing } from "./DeliveryMap";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, money } from "./api";
import type { DesktopInfo, Order } from "./types";
type Courier = { id: string; name: string; phone?: string; active?: boolean };
type Assignment = {
  order_id: string;
  courier_id: string;
  status: string;
  version: number;
  notes: string;
  number?: number;
  courierName?: string;
};
type Delivery = Order & {
  assignment: Assignment;
  location: {
    latitude: number;
    longitude: number;
    reference: string;
    confirmedAt: string;
  } | null;
};
const error = (e: unknown) =>
  e instanceof Error ? e.message : "Não foi possível concluir.";
const stage: Record<string, string> = {
  assigned: "Atribuído",
  picked_up: "Em entrega",
  delivered: "Entregue",
  failed: "Não entregue",
};
export function CourierManager({ desktop }: { desktop: DesktopInfo | null }) {
  const [couriers, setCouriers] = useState<Courier[]>([]),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState({ name: "", phone: "", pin: "" }),
    [choices, setChoices] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([
        api<{ couriers: Courier[]; assignments: Assignment[] }>(
          "/admin/couriers",
        ),
        api<{ orders: Order[] }>("/admin/orders"),
      ]);
      setCouriers(c.couriers);
      setAssignments(c.assignments);
      setOrders(o.orders);
    } catch (e) {
      setMessage(error(e));
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/admin/couriers", "POST", draft);
      setDraft({ name: "", phone: "", pin: "" });
      await load();
      setMessage(
        "Entregador cadastrado. Compartilhe o link, nome de acesso e PIN.",
      );
    } catch (e) {
      setMessage(error(e));
    } finally {
      setBusy(false);
    }
  }
  async function assign(o: Order) {
    setBusy(true);
    try {
      await api("/admin/orders/" + o.id + "/assign", "POST", {
        courierId: choices[o.id],
        expectedVersion:
          assignments.find((a) => a.order_id === o.id)?.version || 0,
      });
      await load();
      setMessage("Entrega atribuída.");
    } catch (e) {
      setMessage(error(e));
      await load();
    } finally {
      setBusy(false);
    }
  }
  const link = desktop
    ? new URL(desktop.menuUrl).origin + "/entregador#/entregador"
    : location.origin + "/entregador#/entregador";
  return (
    <section className="operations-page">
      <h1>Entregadores</h1>
      <p>
        Atribua pedidos aceitos de entrega. Cada entregador vê somente os
        próprios pedidos.
      </p>
      <div className="service-two-col">
        <form className="operation-panel" onSubmit={create}>
          <h2>Cadastrar entregador</h2>
          {(["name", "phone", "pin"] as const).map((k) => (
            <label className="field" key={k}>
              {
                {
                  name: "Nome",
                  phone: "Telefone (opcional)",
                  pin: "PIN de 6 a 12 números",
                }[k]
              }
              <input
                required={k !== "phone"}
                type={k === "pin" ? "password" : "text"}
                inputMode={k === "pin" ? "numeric" : undefined}
                pattern={k === "pin" ? "[0-9]{6,12}" : undefined}
                maxLength={k === "pin" ? 12 : 80}
                value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              />
            </label>
          ))}
          <button className="button primary" disabled={busy}>
            Cadastrar
          </button>
        </form>
        <div className="operation-panel courier-qr">
          <h2>PWA do entregador</h2>
          <QRCodeSVG value={link} size={150} />
          <p>
            <a href={link} target="_blank" rel="noreferrer">
              {link}
            </a>
          </p>
          <small>
            Para acessar fora da loja e instalar no celular, o servidor precisa
            estar disponível por HTTPS. No teste local, use a mesma rede.
          </small>
        </div>
      </div>
      <p role="status">{message}</p>
      <div className="operation-panel">
        <h2>Equipe</h2>
        {couriers.map((c) => (
          <div className="service-row" key={c.id}>
            <span>
              <strong>{c.name}</strong> · {c.phone} ·{" "}
              {c.active ? "Ativo" : "Desativado"}
            </span>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await api("/admin/couriers/" + c.id, "PATCH", {
                    active: !c.active,
                  });
                  await load();
                } catch (e) {
                  setMessage(error(e));
                }
              }}
            >
              {c.active ? "Desativar" : "Ativar"}
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                const pin = window.prompt(
                  "Novo PIN de 6 a 12 números para " + c.name,
                );
                if (pin)
                  try {
                    await api("/admin/couriers/" + c.id, "PATCH", { pin });
                    await load();
                    setMessage(
                      "PIN alterado; os acessos anteriores foram encerrados.",
                    );
                  } catch (e) {
                    setMessage(error(e));
                  }
              }}
            >
              Alterar PIN
            </button>
          </div>
        ))}
      </div>
      <LiveDeliveryMap />
      <h2>Atribuir entregas</h2>
      {orders
        .filter(
          (o) =>
            o.fulfillment === "delivery" &&
            ["preparing", "ready"].includes(o.status),
        )
        .map((o) => {
          const a = assignments.find((a) => a.order_id === o.id);
          return (
            <article className="operation-panel" key={o.id}>
              <strong>
                #{o.number} · {o.customerName} ·{" "}
                {o.status === "ready" ? "Pronto" : "Em preparo"}
              </strong>
              <p>{o.address}</p>
              {a && (
                <p>
                  {a.courierName} · {stage[a.status]}
                  {a.notes && " · " + a.notes}
                </p>
              )}
              <div className="operation-actions">
                <select
                  aria-label={"Entregador pedido " + o.number}
                  value={choices[o.id] || ""}
                  onChange={(e) =>
                    setChoices({ ...choices, [o.id]: e.target.value })
                  }
                >
                  <option value="">Selecione o entregador</option>
                  {couriers
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <button
                  className="button primary"
                  disabled={busy || !choices[o.id]}
                  onClick={() => assign(o)}
                >
                  {a ? "Reatribuir" : "Atribuir"}
                </button>
              </div>
            </article>
          );
        })}
      <h2>Últimas atribuições</h2>
      <div className="report-table">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Entregador</th>
              <th>Etapa</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.order_id}>
                <td>#{a.number}</td>
                <td>{a.courierName}</td>
                <td>{stage[a.status]}</td>
                <td>{a.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function CourierApp() {
  const [courier, setCourier] = useState<Courier | null>(null),
    [options, setOptions] = useState<Courier[]>([]),
    [id, setId] = useState(""),
    [pin, setPin] = useState(""),
    [orders, setOrders] = useState<Delivery[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [editing, setEditing] = useState<Delivery | null>(null),
    [coords, setCoords] = useState({
      latitude: "",
      longitude: "",
      reference: "",
      confirmed: false,
    });
  const load = useCallback(async () => {
    try {
      const r = await api<{ orders: Delivery[] }>("/courier/orders");
      setOrders(r.orders);
      setOffline(false);
    } catch (e) {
      setOffline(!navigator.onLine);
      setMessage(error(e));
    }
  }, []);
  useEffect(() => {
    api<{ courier: Courier | null }>("/courier/session")
      .then((r) => setCourier(r.courier))
      .catch((e) => setMessage(error(e)));
    api<{ couriers: Courier[] }>("/courier/options")
      .then((r) => setOptions(r.couriers))
      .catch((e) => setMessage(error(e)));
  }, []);
  useEffect(() => {
    if (!courier) return;
    load();
    const timer = setInterval(load, 10000);
    const off = () => setOffline(true);
    window.addEventListener("offline", off);
    window.addEventListener("online", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("offline", off);
      window.removeEventListener("online", load);
    };
  }, [courier, load]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ courier: Courier }>("/courier/login", "POST", {
        id,
        pin,
      });
      setCourier(r.courier);
      setPin("");
      setMessage("");
    } catch (e) {
      setMessage(error(e));
    } finally {
      setBusy(false);
    }
  }
  async function move(o: Delivery, status: string) {
    let notes = "";
    if (status === "failed") {
      notes = window.prompt("Informe o que impediu a entrega:") || "";
      if (!notes) return;
    }
    setBusy(true);
    try {
      await api("/courier/orders/" + o.id + "/status", "POST", {
        status,
        expectedVersion: o.assignment.version,
        notes,
      });
      setMessage("Etapa atualizada.");
      await load();
    } catch (e) {
      setMessage(error(e));
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await api("/courier/orders/" + editing.id + "/location", "POST", {
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude),
        reference: coords.reference,
        confirmed: coords.confirmed,
      });
      setEditing(null);
      setMessage(
        "Localização confirmada e salva para próximas entregas deste cliente.",
      );
      await load();
    } catch (e) {
      setMessage(error(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="courier-app">
      <header>
        <a href="#/entregador" className="logo">
          pronto. <small>Entregador</small>
        </a>
        {courier && (
          <button
            className="button secondary"
            onClick={async () => {
              await api("/courier/logout", "POST");
              setCourier(null);
              setOrders([]);
            }}
          >
            Sair
          </button>
        )}
      </header>
      <p role="status">{message}</p>
      {!courier ? (
        <form className="operation-panel" onSubmit={login}>
          <h1>Seu acesso de entregador</h1>
          <label className="field">
            Nome
            <select required value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Selecione</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          <button className="button primary full" disabled={busy}>
            Entrar
          </button>
        </form>
      ) : (
        <>
          <h1>Olá, {courier.name}</h1>
          <CourierLocationSharing />
          <div className="operation-actions">
            <button className="button secondary" onClick={load}>
              Atualizar entregas
            </button>
            <span>
              {
                orders.filter(
                  (o) => !["delivered", "failed"].includes(o.assignment.status),
                ).length
              }{" "}
              entregas em andamento
            </span>
          </div>
          {offline && (
            <p className="error-banner">
              Sem conexão. A lista pode estar desatualizada; etapas só são
              confirmadas com o servidor online.
            </p>
          )}
          {orders.map((o) => (
            <article className="operation-panel" key={o.id}>
              <div className="service-row">
                <h2>
                  #{o.number} · {o.customerName}
                </h2>
                <strong>{stage[o.assignment.status]}</strong>
              </div>
              <p>{o.address}</p>
              {o.phone && (
                <a className="button secondary" href={"tel:+" + o.phone}>
                  Ligar para cliente
                </a>
              )}
              <p>
                {o.payment === "cash"
                  ? "Dinheiro"
                  : o.payment === "card"
                    ? "Cartão"
                    : "Pagamento pendente"}{" "}
                · <strong>{money(o.total)}</strong>
                {o.changeFor != null &&
                  ` · Troco para ${money(o.changeFor)} (devolver ${money(o.changeFor - o.total)})`}
              </p>
              <ul>
                {o.items.map((i) => (
                  <li key={i.id}>
                    {i.quantity}× {i.name}
                    {i.notes && " · " + i.notes}
                  </li>
                ))}
              </ul>
              {o.notes && <p>Observação: {o.notes}</p>}
              {o.location && (
                <p>
                  Localização confirmada: {o.location.reference}
                  <br />
                  <a
                    className="button secondary"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${o.location.latitude},${o.location.longitude}`}
                  >
                    Abrir rota no mapa
                  </a>
                </p>
              )}
              <div className="operation-actions">
                {o.assignment.status === "assigned" && (
                  <button
                    className="button primary"
                    disabled={busy || offline || o.status !== "ready"}
                    onClick={() => move(o, "picked_up")}
                  >
                    {o.status === "ready"
                      ? "Confirmar retirada"
                      : "Aguardando ficar pronto"}
                  </button>
                )}
                {o.assignment.status === "picked_up" && (
                  <button
                    className="button primary"
                    disabled={busy || offline}
                    onClick={() => move(o, "delivered")}
                  >
                    Confirmar entrega
                  </button>
                )}
                {!["delivered", "failed"].includes(o.assignment.status) && (
                  <button
                    className="button secondary"
                    disabled={busy || offline}
                    onClick={() => move(o, "failed")}
                  >
                    Não consegui entregar
                  </button>
                )}
                <button
                  className="button secondary"
                  disabled={offline}
                  onClick={() => {
                    setEditing(o);
                    setCoords({
                      latitude: o.location ? String(o.location.latitude) : "",
                      longitude: o.location ? String(o.location.longitude) : "",
                      reference: o.location?.reference || "",
                      confirmed: false,
                    });
                  }}
                >
                  Confirmar localização do cliente
                </button>
              </div>
            </article>
          ))}
          {!orders.length && (
            <div className="operation-panel">Nenhuma entrega atribuída.</div>
          )}
        </>
      )}
      {editing && (
        <section className="courier-location">
          <form className="operation-panel" onSubmit={saveLocation}>
            <h2>Local correto de #{editing.number}</h2>
            <p>
              Use esta opção quando estiver na porta do cliente. A posição fica
              salva para próximas entregas do mesmo telefone.
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                if (!window.isSecureContext) {
                  setMessage(
                    "O GPS do navegador exige HTTPS. Você pode informar as coordenadas manualmente.",
                  );
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (p) =>
                    setCoords((c) => ({
                      ...c,
                      latitude: String(p.coords.latitude),
                      longitude: String(p.coords.longitude),
                    })),
                  () =>
                    setMessage(
                      "Não foi possível obter o GPS; permita a localização ou preencha manualmente.",
                    ),
                  { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
                );
              }}
            >
              Usar minha localização atual
            </button>
            {(["latitude", "longitude", "reference"] as const).map((k) => (
              <label className="field" key={k}>
                {
                  {
                    latitude: "Latitude",
                    longitude: "Longitude",
                    reference: "Referência (opcional)",
                  }[k]
                }
                <input
                  required={k !== "reference"}
                  type={k === "reference" ? "text" : "number"}
                  step="any"
                  min={
                    k === "latitude"
                      ? -90
                      : k === "longitude"
                        ? -180
                        : undefined
                  }
                  max={
                    k === "latitude" ? 90 : k === "longitude" ? 180 : undefined
                  }
                  value={coords[k]}
                  onChange={(e) =>
                    setCoords({ ...coords, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                required
                checked={coords.confirmed}
                onChange={(e) =>
                  setCoords({ ...coords, confirmed: e.target.checked })
                }
              />{" "}
              Confirmo que este é o local correto do cliente
            </label>
            <div className="operation-actions">
              <button className="button primary" disabled={busy}>
                Salvar localização
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Voltar
              </button>
            </div>
          </form>
        </section>
      )}
      <footer>
        Os pedidos precisam de conexão com o gestor. A instalação como
        aplicativo e o GPS exigem HTTPS no celular.
      </footer>
    </main>
  );
}
