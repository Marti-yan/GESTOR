import { createHash } from "node:crypto";
import { io } from "socket.io-client";
import { clean, setting, saveSetting, phone } from "./provider-utils.mjs";
const numeric = (v) =>
  Number.isSafeInteger(Number(v)) && Number(v) > 0 ? String(Number(v)) : null;
const messageKey = (v) =>
  (typeof v === "string" && /^[\w.@:-]{1,240}$/.test(v)) ||
  (Number.isSafeInteger(v) && v >= 0)
    ? String(v)
    : null;
const failure = (message, status = 409) =>
  Object.assign(new Error(message), { status, httpStatus: status });
export function createAtendeChat({
  db,
  vault,
  config,
  ingest,
  pauseTicket,
  fetchImpl = fetch,
  socketFactory = io,
}) {
  let socket = null,
    socketKey = "",
    running = false,
    lastSync = 0,
    syncing = null,
    error = "",
    sessionState = "",
    qr = "",
    epoch = 0;
  const identity = () => setting(db, "atende-identity");
  const accountKey = () => {
    const c = config(),
      i = identity();
    return c.provider === "atende" &&
      i.origin === c.baseUrl &&
      numeric(i.companyId) &&
      numeric(c.atendeWhatsappId)
      ? createHash("sha256")
          .update(
            JSON.stringify([
              c.baseUrl,
              String(i.companyId),
              String(c.atendeWhatsappId),
            ]),
          )
          .digest("hex")
          .slice(0, 32)
      : null;
  };
  const ready = () =>
    config().provider === "atende" &&
    identity().origin === config().baseUrl &&
    vault.has("atende-token");
  const sameCompany = (row) =>
    row?.companyId == null ||
    String(row.companyId) === String(identity().companyId);
  function resetSocket() {
    epoch++;
    socket?.disconnect();
    socket = null;
    socketKey = "";
    qr = "";
    sessionState = "";
    lastSync = 0;
  }
  function status() {
    return {
      loggedIn: ready(),
      identity: ready()
        ? {
            name: identity().name,
            companyId: identity().companyId,
            userId: identity().userId,
          }
        : null,
      socketConnected: !!socket?.connected,
      syncing: !!syncing,
      lastSync: lastSync ? new Date(lastSync).toISOString() : null,
      error,
      state: sessionState,
      code: qr,
    };
  }
  async function request(path, { method = "GET", body } = {}) {
    const c = config();
    if (!ready()) throw failure("Entre com sua conta do Atende Chat.");
    const r = await fetchImpl(c.baseUrl + path, {
      method,
      headers: {
        Authorization: "Bearer " + vault.get("atende-token"),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      if (r.status === 401) {
        vault.set("atende-token", "");
        resetSocket();
      }
      throw failure(
        r.status === 401
          ? "Sua sessão Atende Chat expirou. Entre novamente."
          : `Atende Chat recusou a operação (HTTP ${r.status}).`,
        r.status,
      );
    }
    return r.status === 204 ? {} : r.json();
  }
  async function login(email, password) {
    const c = config();
    if (c.provider !== "atende" || !c.baseUrl)
      throw failure("Salve o endereço do backend Atende Chat primeiro.");
    const origin = c.baseUrl;
    const r = await fetchImpl(origin + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: clean(email, 250), password }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw failure(
        "Não foi possível entrar no Atende Chat. Confira endereço e acesso.",
        r.status === 401 ? 401 : 502,
      );
    const data = await r.json(),
      u = data.user || {},
      companyId = numeric(u.companyId ?? u.company?.id),
      userId = numeric(u.id);
    if (
      typeof data.token !== "string" ||
      !/^[A-Za-z0-9._~-]{10,16000}$/.test(data.token) ||
      !companyId ||
      !userId
    )
      throw failure(
        "Resposta de login incompatível: o backend deve retornar token e user com id/companyId.",
        502,
      );
    if (config().provider !== "atende" || config().baseUrl !== origin)
      throw failure("A configuração mudou durante o login.");
    resetSocket();
    vault.set("atende-token", data.token);
    saveSetting(db, "atende-identity", {
      origin,
      companyId,
      userId,
      name: clean(u.name, 100),
    });
    error = "";
    return status();
  }
  function assertTicket(row) {
    if (
      !row ||
      !numeric(row.id) ||
      !sameCompany(row) ||
      String(row.whatsappId ?? row.whatsapp?.id) !==
        String(config().atendeWhatsappId)
    )
      throw failure("Ticket fora da empresa ou conexão selecionada.", 403);
    return row;
  }
  async function detail(id) {
    const d = await request("/tickets/" + encodeURIComponent(id));
    return assertTicket(d.ticket || d);
  }
  function link(id) {
    const r = db
      .prepare(
        "SELECT * FROM atende_ticket_links WHERE local_ticket_id=? AND account_key=?",
      )
      .get(id, accountKey());
    if (!r)
      throw failure(
        "Sincronize um ticket existente do Atende Chat antes de responder.",
      );
    return r;
  }
  function assertScope(row) {
    if (row.account_key !== accountKey())
      throw failure("A conexão mudou durante o atendimento.");
  }
  async function claim(id) {
    const row = link(id),
      t = await detail(row.remote_ticket_id);
    if (t.status === "closed")
      throw failure(
        "O ticket foi concluído no Atende Chat. Atualize a conversa.",
      );
    assertScope(row);
    await request("/tickets/" + row.remote_ticket_id, {
      method: "PUT",
      body: {
        status: "open",
        userId: Number(identity().userId),
        ...(t.queueId != null ? { queueId: t.queueId } : {}),
      },
    });
    assertScope(row);
    db.prepare(
      "UPDATE atende_ticket_links SET owned=1 WHERE local_ticket_id=? AND account_key=?",
    ).run(id, row.account_key);
  }
  function applyTicket(t) {
    if (!numeric(t?.id) || !sameCompany(t)) return;
    const row = db
      .prepare(
        "SELECT * FROM atende_ticket_links WHERE account_key=? AND remote_ticket_id=?",
      )
      .get(accountKey(), String(t.id));
    if (!row) return;
    if (
      t.status === "closed" ||
      t.isBot === true ||
      t.useIntegration === true ||
      (Object.hasOwn(t, "userId") &&
        String(t.userId) !== String(identity().userId))
    ) {
      pauseTicket(row.local_ticket_id);
      db.prepare(
        "UPDATE atende_ticket_links SET owned=0 WHERE local_ticket_id=?",
      ).run(row.local_ticket_id);
      if (t.status === "closed")
        db.prepare("UPDATE chat_tickets SET status='closed' WHERE id=?").run(
          row.local_ticket_id,
        );
    }
  }
  function applyAck(m) {
    if (m?.ack == null) return;
    const id = m.id == null ? "" : String(m.id),
      wid = clean(m.wid, 250);
    if (!id && !wid) return;
    const row = db
      .prepare(
        "SELECT local_message_id FROM atende_message_ids WHERE account_key=? AND (remote_id=? OR (remote_wid<>'' AND remote_wid=?)) LIMIT 1",
      )
      .get(accountKey(), id, wid);
    if (!row) return;
    const next =
      Number(m.ack) >= 4
        ? "read"
        : Number(m.ack) === 3
          ? "delivered"
          : Number(m.ack) === 2
            ? "sent"
            : Number(m.ack) === 0
              ? "failed"
              : null;
    if (!next) return;
    const current = db
        .prepare("SELECT state FROM chat_messages WHERE id=?")
        .get(row.local_message_id)?.state,
      rank = {
        pending: 0,
        sending: 0,
        uncertain: 0,
        sent: 1,
        delivered: 2,
        read: 3,
        failed: 4,
      };
    if ((rank[next] || 0) > (rank[current] || 0))
      db.prepare("UPDATE chat_messages SET state=? WHERE id=?").run(
        next,
        row.local_message_id,
      );
  }
  async function receive(m, t, { live = false, generation = epoch } = {}) {
    if (
      !ready() ||
      !accountKey() ||
      !messageKey(m?.id) ||
      m.isPrivate === true ||
      m.isPrivate === "true" ||
      !sameCompany(m)
    )
      return;
    const key = accountKey();
    if (!t) {
      if (!numeric(m.ticketId)) return;
      t = await detail(m.ticketId);
    }
    if (generation !== epoch || key !== accountKey()) return;
    assertTicket(t);
    if (t.isGroup || t.contact?.isGroup || t.status === "closed") return;
    const c = t.contact || m.contact || {},
      number = phone(c.number);
    if (
      number.length < 10 ||
      number.length > 15 ||
      String(c.number || "").includes("@lid")
    )
      return;
    applyTicket(t);
    const existing = db
      .prepare(
        "SELECT * FROM atende_ticket_links WHERE account_key=? AND remote_ticket_id=?",
      )
      .get(key, String(t.id));
    const textual =
        !m.mediaType ||
        ["conversation", "extendedTextMessage", "chat", "text"].includes(
          m.mediaType,
        ),
      body =
        clean(m.body, 4000) || "[Mensagem não textual: atendimento humano]",
      created = Date.parse(m.createdAt || ""),
      recent =
        !m.createdAt ||
        (Number.isFinite(created) && created >= Date.now() - 120000);
    const result = ingest({
      providerId: "atende:" + key + ":" + m.id,
      number,
      name: c.name,
      body,
      fromMe: m.fromMe === true || m.fromMe === "true",
      needsHuman: !textual,
      suppressAI: !live || !recent || !existing?.owned,
      external: {
        accountKey: key,
        remoteTicketId: String(t.id),
        remoteContactId: String(c.id || t.contactId || ""),
        owned: existing?.owned || 0,
      },
    });
    const local = db
      .prepare("SELECT id FROM chat_messages WHERE provider_id=?")
      .get("atende:" + key + ":" + m.id);
    if (local) {
      db.prepare(
        "INSERT INTO atende_message_ids VALUES (?,?,?,?) ON CONFLICT(account_key,remote_id) DO UPDATE SET remote_wid=excluded.remote_wid",
      ).run(key, String(m.id), clean(m.wid, 250), local.id);
      applyAck(m);
    }
    return result;
  }
  async function connections() {
    const data = await request("/whatsapp/"),
      rows = Array.isArray(data) ? data : data.whatsapps;
    if (!Array.isArray(rows))
      throw failure("Lista de conexões incompatível com o levantamento.", 502);
    return rows
      .filter((w) => sameCompany(w) && (!w.channel || w.channel === "whatsapp"))
      .map((w) => ({
        id: String(w.id),
        name: clean(w.name, 100),
        status: clean(w.status, 40),
      }));
  }
  async function connection(start = false) {
    if (!numeric(config().atendeWhatsappId))
      throw failure("Selecione uma conexão do Atende Chat.");
    if (start)
      await request("/whatsappsession/" + config().atendeWhatsappId, {
        method: "POST",
      });
    const data = await request("/whatsapp/" + config().atendeWhatsappId),
      r = data.whatsapp || data;
    if (!sameCompany(r) || String(r.id) !== String(config().atendeWhatsappId))
      throw failure("Conexão fora da empresa autenticada.", 403);
    sessionState = clean(r.status, 40);
    qr = clean(r.qrcode, 4096);
    return { state: sessionState, code: qr };
  }
  function ensureSocket() {
    if (!running || !ready() || !accountKey() || !config().enabled) {
      if (socket) resetSocket();
      return;
    }
    const token = vault.get("atende-token"),
      key = accountKey() + createHash("sha256").update(token).digest("hex");
    if (socket && socketKey === key) return;
    resetSocket();
    const generation = epoch,
      c = config(),
      company = String(identity().companyId);
    socketKey = key;
    socket = socketFactory(c.baseUrl + "/" + company, {
      query: { token: "Bearer " + token },
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 15000,
      autoConnect: false,
      transports: ["polling", "websocket"],
    });
    socket.on("connect", () => {
      if (generation !== epoch) return;
      error = "";
      for (const state of ["open", "pending"])
        socket.emit("joinTickets", state);
      lastSync = 0;
    });
    socket.on(
      "connect_error",
      () =>
        (error =
          "Tempo real desconectado. O gestor tentará sincronizar pela API."),
    );
    socket.on(`company-${company}-whatsappSession`, (e) => {
      const s = e?.session;
      if (
        generation === epoch &&
        String(s?.id) === String(config().atendeWhatsappId) &&
        sameCompany(s)
      ) {
        sessionState = clean(s.status, 40);
        qr = clean(s.qrcode, 4096);
      }
    });
    socket.on(`company-${company}-ticket`, (e) => {
      if (generation === epoch) applyTicket(e.ticket || {});
    });
    socket.on(`company-${company}-appMessage`, (e) => {
      if (generation !== epoch || !sameCompany(e?.message)) return;
      if (e.action === "update") applyAck(e.message);
      else if (e.action === "create")
        receive(e.message, null, { live: true, generation }).catch(() => {
          error =
            "Não foi possível sincronizar uma mensagem. Atualize pela API.";
        });
    });
    socket.connect();
  }
  async function sync({ force = false } = {}) {
    ensureSocket();
    if (!ready() || !config().enabled || !accountKey()) return status();
    if (syncing) return syncing;
    if (!force && Date.now() - lastSync < 15000) return status();
    const key = accountKey(),
      generation = epoch,
      first = lastSync === 0;
    syncing = (async () => {
      try {
        await connection();
        const all = [];
        for (const state of ["pending", "open"])
          for (let page = 1; page <= 10; page++) {
            const d = await request(
              "/tickets?" +
                new URLSearchParams({
                  status: state,
                  pageNumber: String(page),
                  showAll: "true",
                }),
            );
            if (!Array.isArray(d.tickets))
              throw failure(
                "Lista de tickets incompatível com o levantamento.",
                502,
              );
            all.push(...d.tickets);
            if (!d.hasMore) break;
            if (page === 10)
              throw failure(
                "Há mais tickets do que a sincronização inicial suporta. Restrinja o acesso da conta de integração.",
              );
          }
        const seen = new Set();
        for (const summary of all) {
          if (generation !== epoch || key !== accountKey()) return status();
          if (
            !numeric(summary.id) ||
            seen.has(String(summary.id)) ||
            String(summary.whatsappId ?? summary.whatsapp?.id) !==
              String(config().atendeWhatsappId)
          )
            continue;
          seen.add(String(summary.id));
          const t = await detail(summary.id);
          applyTicket(t);
          socket?.emit("joinChatBox", String(t.id));
          const collected = [];
          for (let page = 1; page <= 20; page++) {
            const d = await request(
              "/messages/" + t.id + "?pageNumber=" + page,
            );
            if (!Array.isArray(d.messages))
              throw failure("Histórico de mensagens incompatível.", 502);
            const known =
              d.messages.length > 0 &&
              d.messages.every((m) =>
                db
                  .prepare("SELECT 1 FROM chat_messages WHERE provider_id=?")
                  .get("atende:" + key + ":" + m.id),
              );
            collected.push(...d.messages);
            if (!d.hasMore || (!first && known)) break;
          }
          collected.sort(
            (a, b) =>
              (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0) ||
              Number(a.id) - Number(b.id),
          );
          for (const m of collected)
            await receive(m, t, { live: !first, generation });
        }
        const links = db
          .prepare(
            "SELECT l.* FROM atende_ticket_links l JOIN chat_tickets t ON t.id=l.local_ticket_id WHERE l.account_key=? AND t.status<>'closed' LIMIT 500",
          )
          .all(key);
        for (const row of links) {
          if (generation !== epoch || key !== accountKey()) return status();
          if (seen.has(row.remote_ticket_id)) continue;
          try {
            applyTicket(await detail(row.remote_ticket_id));
          } catch (e) {
            if ([403, 404].includes(e.httpStatus)) {
              pauseTicket(row.local_ticket_id);
              db.prepare(
                "UPDATE atende_ticket_links SET owned=0 WHERE local_ticket_id=?",
              ).run(row.local_ticket_id);
              if (e.httpStatus === 404)
                db.prepare(
                  "UPDATE chat_tickets SET status='closed' WHERE id=?",
                ).run(row.local_ticket_id);
            } else throw e;
          }
        }
        if (generation === epoch && key === accountKey()) {
          lastSync = Date.now();
          error = "";
        }
        return status();
      } catch (e) {
        error = clean(e.message, 300);
        throw e;
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }
  async function send(outbox, body) {
    const row = link(outbox.ticket_id);
    if (!row.owned) throw failure("Assuma o ticket no gestor antes de enviar.");
    const t = await detail(row.remote_ticket_id);
    if (
      t.status === "closed" ||
      t.isBot === true ||
      t.useIntegration === true ||
      (Object.hasOwn(t, "userId") &&
        String(t.userId) !== String(identity().userId))
    )
      throw failure(
        "O atendimento mudou no Atende Chat. Assuma o ticket novamente.",
      );
    assertScope(row);
    const data = await request("/messages/" + row.remote_ticket_id, {
        method: "POST",
        body: { body, isPrivate: "false" },
      }),
      m = data.message || data;
    if (!messageKey(m.id))
      throw Error(
        "Atende Chat não confirmou a mensagem. Confira o ticket antes de reenviar.",
      );
    db.prepare(
      "INSERT INTO atende_message_ids VALUES (?,?,?,?) ON CONFLICT(account_key,remote_id) DO UPDATE SET local_message_id=excluded.local_message_id,remote_wid=excluded.remote_wid",
    ).run(row.account_key, String(m.id), clean(m.wid, 250), outbox.message_id);
    return "atende:" + row.account_key + ":" + m.id;
  }
  async function closeTicket(id) {
    const row = link(id);
    await detail(row.remote_ticket_id);
    assertScope(row);
    await request("/tickets/" + row.remote_ticket_id, {
      method: "PUT",
      body: { status: "closed", userId: Number(identity().userId) },
    });
    if (accountKey() === row.account_key)
      db.prepare(
        "UPDATE atende_ticket_links SET owned=0 WHERE local_ticket_id=?",
      ).run(id);
  }
  return {
    accountKey,
    status,
    login,
    connections,
    connection,
    claim,
    closeTicket,
    send,
    sync,
    applyTicket,
    applyAck,
    receive,
    start() {
      running = true;
      ensureSocket();
    },
    async stop() {
      running = false;
      resetSocket();
      if (syncing) await syncing.catch(() => {});
    },
    forget() {
      vault.set("atende-token", "");
      resetSocket();
      saveSetting(db, "atende-identity", {});
      return status();
    },
  };
}
