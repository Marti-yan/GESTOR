import {
  randomUUID,
  randomBytes,
  createHmac,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import {
  clean,
  phone,
  setting,
  saveSetting,
  providerBase,
  secretVault,
} from "./provider-utils.mjs";
import { transaction } from "./database.mjs";
import { installAI } from "./ai-service.mjs";
import { createAtendeChat } from "./atendechat.mjs";
const stamp = () => new Date().toISOString();
export function installCommunications({
  app,
  db,
  admin,
  wrap,
  fail,
  rateLimit,
  dataDir,
  fetchImpl = fetch,
  socketFactory,
}) {
  const vault = secretVault(db, dataDir),
    ai = installAI({ app, db, admin, wrap, fail, vault, fetchImpl });
  const config = () => ({
    provider: "none",
    enabled: false,
    baseUrl: "",
    instance: "pronto",
    phoneNumberId: "",
    graphVersion: "v23.0",
    atendeWhatsappId: "",
    ...setting(db, "whatsapp-config"),
  });
  const atende = createAtendeChat({
    db,
    vault,
    config,
    ingest,
    pauseTicket,
    fetchImpl,
    socketFactory,
  });
  const connectionKey = () => {
    const c = config();
    return c.provider === "none"
      ? "none"
      : createHash("sha256")
          .update(
            JSON.stringify(
              c.provider === "atende"
                ? [c.provider, c.baseUrl, atende.accountKey()]
                : c.provider === "evolution"
                  ? [c.provider, c.baseUrl, c.instance]
                  : [c.provider, c.phoneNumberId],
            ),
          )
          .digest("hex");
  };
  db.prepare(
    "UPDATE chat_outbox SET connection_key=? WHERE connection_key IS NULL",
  ).run(connectionKey());
  const contact = (id) =>
    db.prepare("SELECT * FROM chat_contacts WHERE id=?").get(id);
  const tags = (id) =>
    db
      .prepare(
        "SELECT t.* FROM chat_tags t JOIN chat_ticket_tags l ON l.tag_id=t.id WHERE l.ticket_id=? ORDER BY t.name",
      )
      .all(id);
  const ticket = (id) => {
    const t = db
      .prepare(
        "SELECT t.*,c.name,c.phone,c.unsubscribed FROM chat_tickets t JOIN chat_contacts c ON c.id=t.contact_id WHERE t.id=?",
      )
      .get(id);
    const remote = t
      ? db
          .prepare("SELECT * FROM atende_ticket_links WHERE local_ticket_id=?")
          .get(t.id)
      : null;
    return t
      ? {
          ...t,
          tags: tags(t.id),
          atende: remote
            ? {
                ticketId: remote.remote_ticket_id,
                owned: !!remote.owned,
                current: remote.account_key === atende.accountKey(),
              }
            : null,
        }
      : null;
  };
  function getTicket(contactId) {
    let t = db
      .prepare(
        "SELECT * FROM chat_tickets WHERE contact_id=? AND status<>'closed'",
      )
      .get(contactId);
    if (!t) {
      const id = randomUUID(),
        number = db
          .prepare("SELECT COALESCE(MAX(number),0)+1 AS n FROM chat_tickets")
          .get().n;
      db.prepare(
        "INSERT INTO chat_tickets VALUES (?,?,?,'waiting',?,1,?,?)",
      ).run(
        id,
        number,
        contactId,
        ai.config().automatic ? "auto" : "paused",
        stamp(),
        stamp(),
      );
      t = db.prepare("SELECT * FROM chat_tickets WHERE id=?").get(id);
    }
    return t;
  }
  function pauseTicket(id) {
    db.prepare(
      "UPDATE chat_tickets SET agent_mode='paused',version=version+1,updated_at=? WHERE id=?",
    ).run(stamp(), id);
    db.prepare(
      "UPDATE ai_jobs SET state='cancelled' WHERE ticket_id=? AND state='pending'",
    ).run(id);
    db.prepare(
      "UPDATE chat_outbox SET state='cancelled' WHERE ticket_id=? AND kind IN ('ai','handoff') AND state='pending'",
    ).run(id);
    db.prepare(
      "UPDATE chat_messages SET state='cancelled' WHERE id IN (SELECT message_id FROM chat_outbox WHERE ticket_id=? AND kind IN ('ai','handoff') AND state='cancelled')",
    ).run(id);
  }
  function saveContact(b, old) {
    const p = phone(b.phone ?? old?.phone),
      name = clean(b.name ?? old?.name, 100) || p;
    if (p.length < 10 || p.length > 15)
      fail(400, "Informe telefone com DDI e DDD (10 a 15 dígitos).");
    const consent =
        b.consent === undefined
          ? old?.consent || 0
          : b.consent === true
            ? 1
            : 0,
      source = clean(b.consentSource ?? old?.consent_source, 300);
    if (consent && !source)
      fail(400, "Informe como o contato autorizou as campanhas.");
    const id = old?.id || randomUUID();
    if (
      db
        .prepare("SELECT 1 FROM chat_contacts WHERE phone=? AND id<>?")
        .get(p, id)
    )
      fail(409, "Este telefone já está cadastrado.");
    db.prepare(
      "INSERT INTO chat_contacts VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,consent=excluded.consent,consent_source=excluded.consent_source,consent_at=excluded.consent_at,unsubscribed=excluded.unsubscribed,notes=excluded.notes",
    ).run(
      id,
      name,
      p,
      consent,
      source,
      consent ? stamp() : null,
      consent && b.consent === true ? 0 : old?.unsubscribed || 0,
      clean(b.notes ?? old?.notes, 1000),
      old?.created_at || stamp(),
    );
    return id;
  }
  function queueMessage({
    ticketId,
    contactId,
    body,
    kind = "human",
    id = randomUUID(),
    campaignId = null,
    due = Date.now(),
  }) {
    if (!clean(body, 4000)) fail(400, "Digite uma mensagem.");
    db.prepare(
      "INSERT INTO chat_messages(id,ticket_id,direction,body,origin,state,created_at) VALUES (?,?,'out',?,?,'pending',?)",
    ).run(id, ticketId, body, kind, stamp());
    const outboxId = randomUUID();
    db.prepare(
      "INSERT INTO chat_outbox(id,message_id,contact_id,ticket_id,kind,campaign_id,due_at,created_at,connection_key) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(
      outboxId,
      id,
      contactId,
      ticketId,
      kind,
      campaignId,
      due,
      stamp(),
      connectionKey(),
    );
    return outboxId;
  }
  function ingest({
    providerId,
    number,
    name,
    body,
    fromMe = false,
    needsHuman = false,
    suppressAI = false,
    external = null,
  }) {
    const p = phone(number);
    if (!providerId || !clean(body, 4000) || p.length < 10 || p.length > 15)
      return { ignored: true };
    if (
      db
        .prepare("SELECT 1 FROM chat_messages WHERE provider_id=?")
        .get(providerId)
    )
      return { repeated: true };
    return transaction(db, () => {
      if (
        db
          .prepare("SELECT 1 FROM chat_messages WHERE provider_id=?")
          .get(providerId)
      )
        return { repeated: true };
      let c = db.prepare("SELECT * FROM chat_contacts WHERE phone=?").get(p);
      if (!c) {
        const id = saveContact({ phone: p, name: name || p });
        c = contact(id);
      }
      if (fromMe) {
        const own = db
          .prepare(
            "SELECT m.id FROM chat_messages m JOIN chat_outbox o ON o.message_id=m.id WHERE o.contact_id=? AND m.body=? AND o.state IN ('sending','sent') AND m.provider_id IS NULL AND m.created_at>? ORDER BY m.rowid DESC LIMIT 1",
          )
          .get(
            c.id,
            clean(body, 4000),
            new Date(Date.now() - 60000).toISOString(),
          );
        if (own) {
          db.prepare("UPDATE chat_messages SET provider_id=? WHERE id=?").run(
            providerId,
            own.id,
          );
          return { echo: true };
        }
      }
      let t;
      if (external) {
        const mapped = db
          .prepare(
            "SELECT t.* FROM atende_ticket_links l JOIN chat_tickets t ON t.id=l.local_ticket_id WHERE l.account_key=? AND l.remote_ticket_id=?",
          )
          .get(external.accountKey, external.remoteTicketId);
        t = mapped?.status !== "closed" ? mapped : null;
      }
      t ||= getTicket(c.id);
      if (external) {
        const other = db
          .prepare("SELECT * FROM atende_ticket_links WHERE local_ticket_id=?")
          .get(t.id);
        if (
          other &&
          (other.account_key !== external.accountKey ||
            other.remote_ticket_id !== external.remoteTicketId)
        )
          return { ignored: true };
        db.prepare(
          "DELETE FROM atende_ticket_links WHERE account_key=? AND remote_ticket_id=? AND local_ticket_id<>?",
        ).run(external.accountKey, external.remoteTicketId, t.id);
        db.prepare(
          "INSERT INTO atende_ticket_links VALUES (?,?,?,?,?) ON CONFLICT(local_ticket_id) DO UPDATE SET owned=excluded.owned",
        ).run(
          t.id,
          external.accountKey,
          external.remoteTicketId,
          external.remoteContactId,
          external.owned ? 1 : 0,
        );
        if (!external.owned) {
          db.prepare(
            "UPDATE chat_tickets SET agent_mode='paused' WHERE id=?",
          ).run(t.id);
          t = { ...t, agent_mode: "paused" };
        }
      }
      const id = randomUUID();
      db.prepare(
        "INSERT INTO chat_messages(id,ticket_id,direction,body,provider_id,origin,state,created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        id,
        t.id,
        fromMe ? "out" : "in",
        clean(body, 4000),
        providerId,
        fromMe ? "external" : "customer",
        fromMe ? "sent" : "received",
        stamp(),
      );
      db.prepare(
        "UPDATE chat_tickets SET version=version+1,updated_at=? WHERE id=?",
      ).run(stamp(), t.id);
      if (fromMe) {
        pauseTicket(t.id);
        return { ticketId: t.id };
      }
      if (
        needsHuman ||
        /(?:quero|preciso|falar|chamar|chame).{0,25}(?:atendente|humano|pessoa)/i.test(
          body,
        )
      ) {
        pauseTicket(t.id);
        db.prepare("UPDATE chat_tickets SET status='waiting' WHERE id=?").run(
          t.id,
        );
        return { ticketId: t.id, needsHuman: true };
      }
      const optout = /^(sair|parar|pare|stop|cancelar|descadastrar)$/i.test(
        clean(body),
      );
      if (optout) {
        db.prepare(
          "UPDATE chat_contacts SET consent=0,unsubscribed=1 WHERE id=?",
        ).run(c.id);
        db.prepare(
          "UPDATE chat_outbox SET state='cancelled' WHERE contact_id=? AND kind='campaign' AND state='pending'",
        ).run(c.id);
        db.prepare(
          "UPDATE chat_campaign_recipients SET state='cancelled' WHERE contact_id=? AND state='pending'",
        ).run(c.id);
        db.prepare(
          "UPDATE chat_messages SET state='cancelled' WHERE id IN (SELECT message_id FROM chat_outbox WHERE contact_id=? AND state='cancelled')",
        ).run(c.id);
        pauseTicket(t.id);
        return { ticketId: t.id, optout: true };
      }
      db.prepare(
        "UPDATE chat_outbox SET state='cancelled' WHERE ticket_id=? AND kind='ai' AND state='pending'",
      ).run(t.id);
      db.prepare(
        "UPDATE chat_messages SET state='cancelled' WHERE id IN (SELECT message_id FROM chat_outbox WHERE ticket_id=? AND state='cancelled')",
      ).run(t.id);
      if (
        t.agent_mode === "auto" &&
        !suppressAI &&
        ai.config().enabled &&
        ai.config().automatic &&
        !c.unsubscribed
      )
        db.prepare(
          "INSERT INTO ai_jobs(id,ticket_id,message_id,created_at) VALUES (?,?,?,?)",
        ).run(randomUUID(), t.id, id, stamp());
      return { ticketId: t.id };
    });
  }
  async function providerRequest(path, { method = "GET", body } = {}) {
    const c = config();
    if (c.provider !== "evolution" || !c.baseUrl || !vault.has("whatsapp"))
      throw Error("Configure o provedor de WhatsApp.");
    const response = await fetchImpl(c.baseUrl + path, {
      method,
      headers: {
        apikey: vault.get("whatsapp"),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok) {
      const e = new Error(
        `Provedor WhatsApp recusou a operação (HTTP ${response.status}).`,
      );
      e.httpStatus = response.status;
      throw e;
    }
    return response.json();
  }
  app.get("/api/admin/whatsapp", admin, (_req, res) =>
    res.json({
      config: config(),
      hasKey: vault.has("whatsapp"),
      hasWebhookToken: vault.has("whatsapp-hook"),
      hasAppSecret: vault.has("meta-app-secret"),
      atende: atende.status(),
    }),
  );
  app.put(
    "/api/admin/whatsapp",
    admin,
    wrap((req, res) => {
      const b = req.body || {};
      if (!["none", "evolution", "cloud", "atende"].includes(b.provider))
        fail(400, "Provedor inválido.");
      let baseUrl = "";
      if (["evolution", "atende"].includes(b.provider)) {
        try {
          baseUrl = providerBase(b.baseUrl);
        } catch (e) {
          fail(400, e.message);
        }
        if (
          b.provider === "evolution" &&
          !/^[\w-]{1,80}$/.test(b.instance || "")
        )
          fail(400, "Nome de instância inválido.");
      }
      if (
        b.provider === "cloud" &&
        (!/^\d{5,30}$/.test(b.phoneNumberId || "") ||
          !/^v\d+\.\d+$/.test(b.graphVersion || ""))
      )
        fail(400, "Informe Phone Number ID e versão da Graph API.");
      const previous = config();
      if (
        b.provider === "atende" &&
        b.atendeWhatsappId &&
        !/^[1-9]\d{0,12}$/.test(String(b.atendeWhatsappId))
      )
        fail(400, "Selecione uma conexão válida.");
      if (
        ["evolution", "cloud"].includes(b.provider) &&
        (previous.provider !== b.provider || previous.baseUrl !== baseUrl) &&
        vault.has("whatsapp") &&
        !clean(b.apiKey, 4000)
      )
        fail(
          400,
          "Informe a chave novamente ao trocar de provedor ou endereço da API.",
        );
      if (clean(b.apiKey, 4000)) vault.set("whatsapp", clean(b.apiKey, 4000));
      if (clean(b.appSecret, 4000))
        vault.set("meta-app-secret", clean(b.appSecret, 4000));
      saveSetting(db, "whatsapp-config", {
        provider: b.provider,
        enabled: !!b.enabled,
        baseUrl,
        instance: clean(b.instance, 80),
        phoneNumberId: clean(b.phoneNumberId, 30),
        graphVersion: clean(b.graphVersion, 12) || "v23.0",
        atendeWhatsappId:
          b.provider === "atende" ? String(b.atendeWhatsappId || "") : "",
      });
      res.json({ ok: true });
    }),
  );
  const atendeRoute = (fn) =>
    wrap(async (req, res) => {
      try {
        await fn(req, res);
      } catch (e) {
        fail(e.status || e.httpStatus || 502, clean(e.message, 400));
      }
    });
  app.post(
    "/api/admin/whatsapp/atende/login",
    admin,
    atendeRoute(async (req, res) => {
      rateLimit(req, "atende-login", 10, 15 * 60000);
      if (
        !clean(req.body?.email, 250) ||
        typeof req.body?.password !== "string" ||
        !req.body.password ||
        req.body.password.length > 256
      )
        fail(400, "Informe e-mail e senha do Atende Chat.");
      res.json(await atende.login(req.body.email, req.body.password));
    }),
  );
  app.get(
    "/api/admin/whatsapp/atende/connections",
    admin,
    atendeRoute(async (_req, res) =>
      res.json({ connections: await atende.connections() }),
    ),
  );
  app.post(
    "/api/admin/whatsapp/atende/sync",
    admin,
    atendeRoute(async (_req, res) => {
      if (
        config().provider !== "atende" ||
        !config().enabled ||
        !atende.status().loggedIn ||
        !atende.accountKey()
      )
        fail(
          409,
          "Ative a conexão, entre no Atende Chat e selecione um número.",
        );
      atende.sync({ force: true }).catch(() => {});
      res.status(202).json(atende.status());
    }),
  );
  app.post(
    "/api/admin/whatsapp/atende/forget",
    admin,
    wrap((_req, res) => res.json(atende.forget())),
  );
  app.post("/api/admin/whatsapp/webhook-token", admin, (_req, res) => {
    const token = randomBytes(32).toString("hex");
    vault.set("whatsapp-hook", token);
    res.json({ token });
  });
  app.post(
    "/api/admin/whatsapp/connect",
    admin,
    wrap(async (_req, res) => {
      const c = config();
      if (c.provider === "atende")
        return res.json(await atende.connection(true));
      if (c.provider !== "evolution")
        fail(
          409,
          "Na Cloud API, vincule o número pelo painel Meta e configure o webhook.",
        );
      const r = await providerRequest(
        "/instance/connect/" + encodeURIComponent(c.instance),
      );
      res.json({
        code: clean(r.code, 4096),
        base64:
          typeof r.base64 === "string" &&
          /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.base64) &&
          r.base64.length < 1500000
            ? r.base64
            : null,
        pairingCode: clean(r.pairingCode, 100),
        state: clean(r.instance?.state || r.state || "connecting", 80),
      });
    }),
  );
  app.post(
    "/api/admin/whatsapp/status",
    admin,
    wrap(async (_req, res) => {
      const c = config();
      if (c.provider === "none") return res.json({ state: "unconfigured" });
      if (c.provider === "atende")
        return res.json({
          ...(await atende.connection()),
          atende: atende.status(),
        });
      if (c.provider === "evolution") {
        const r = await providerRequest(
          "/instance/connectionState/" + encodeURIComponent(c.instance),
        );
        return res.json({
          state: clean(r.instance?.state || r.state || "unknown", 80),
        });
      }
      res.json({
        state: vault.has("whatsapp") ? "configured" : "unconfigured",
      });
    }),
  );
  app.get("/api/integrations/whatsapp", (req, res) => {
    const expected = vault.get("whatsapp-hook");
    if (
      expected &&
      req.query["hub.verify_token"] === expected &&
      req.query["hub.mode"] === "subscribe"
    )
      return res.type("text").send(String(req.query["hub.challenge"] || ""));
    res.sendStatus(403);
  });
  app.post(
    "/api/integrations/whatsapp",
    wrap((req, res) => {
      rateLimit(req, "whatsapp-hook", 1000, 60000);
      const c = config();
      if (!c.enabled) fail(409, "Conexão desativada.");
      if (c.provider === "cloud") {
        const secret = vault.get("meta-app-secret"),
          signature = req.headers["x-hub-signature-256"],
          actual =
            "sha256=" +
            createHmac("sha256", secret || "")
              .update(req.rawBody || "")
              .digest("hex");
        if (
          !secret ||
          typeof signature !== "string" ||
          !/^sha256=[a-f0-9]{64}$/i.test(signature) ||
          signature.length !== actual.length ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(actual))
        )
          fail(401, "Assinatura do webhook inválida.");
        for (const entry of req.body?.entry || [])
          for (const change of entry.changes || []) {
            const v = change.value || {};
            if (String(v.metadata?.phone_number_id) !== c.phoneNumberId)
              continue;
            for (const m of v.messages || [])
              ingest({
                providerId: "cloud:" + m.id,
                number: m.from,
                name: v.contacts?.find((x) => x.wa_id === m.from)?.profile
                  ?.name,
                body:
                  m.text?.body ||
                  "[Mensagem não textual: solicite atendimento humano]",
                needsHuman: !m.text?.body,
              });
            for (const s of v.statuses || []) {
              if (!["sent", "delivered", "read", "failed"].includes(s.status))
                continue;
              const current = db
                .prepare(
                  "SELECT id,state FROM chat_messages WHERE provider_id=?",
                )
                .get("cloud:" + s.id);
              const rank = {
                pending: 0,
                sending: 0,
                uncertain: 0,
                sent: 1,
                delivered: 2,
                read: 3,
                failed: 4,
              };
              if (current && (rank[s.status] || 0) > (rank[current.state] || 0))
                db.prepare("UPDATE chat_messages SET state=? WHERE id=?").run(
                  s.status,
                  current.id,
                );
            }
          }
      } else if (c.provider === "evolution") {
        const token = vault.get("whatsapp-hook");
        if (!token || req.headers["x-pronto-hook"] !== token)
          fail(401, "Token do webhook inválido.");
        if (req.body?.instance !== c.instance)
          fail(400, "Instância diferente da configurada.");
        const d = req.body?.data;
        if (req.body?.event === "messages.upsert" && d?.key) {
          const jid = d.key.remoteJidAlt?.endsWith("@s.whatsapp.net")
            ? d.key.remoteJidAlt
            : d.key.remoteJid;
          if (jid?.endsWith("@s.whatsapp.net"))
            ingest({
              providerId: "evolution:" + c.instance + ":" + d.key.id,
              number: jid.split("@")[0],
              name: d.pushName,
              body:
                d.message?.conversation ||
                d.message?.extendedTextMessage?.text ||
                "[Mensagem não textual: solicite atendimento humano]",
              fromMe: !!d.key.fromMe,
              needsHuman: !(
                d.message?.conversation || d.message?.extendedTextMessage?.text
              ),
            });
        }
      } else fail(409, "Configure um provedor.");
      res.json({ ok: true });
    }),
  );
  app.get("/api/admin/contacts", admin, (_req, res) =>
    res.json({
      contacts: db
        .prepare("SELECT * FROM chat_contacts ORDER BY name LIMIT 5000")
        .all(),
    }),
  );
  app.post(
    "/api/admin/contacts",
    admin,
    wrap((req, res) =>
      res.status(201).json({ id: saveContact(req.body || {}) }),
    ),
  );
  app.patch(
    "/api/admin/contacts/:id",
    admin,
    wrap((req, res) => {
      const c = contact(req.params.id);
      if (!c) fail(404, "Contato não encontrado.");
      if (req.body?.phone && phone(req.body.phone) !== c.phone)
        fail(
          409,
          "O telefone identifica o histórico. Cadastre outro contato para outro número.",
        );
      res.json({ id: saveContact(req.body || {}, c) });
    }),
  );
  app.get("/api/admin/tags", admin, (_req, res) =>
    res.json({
      tags: db.prepare("SELECT * FROM chat_tags ORDER BY name").all(),
    }),
  );
  app.post(
    "/api/admin/tags",
    admin,
    wrap((req, res) => {
      const id = clean(req.body?.id, 100) || randomUUID(),
        name = clean(req.body?.name, 40),
        color = clean(req.body?.color, 10);
      if (!name || !/^#[a-f0-9]{6}$/i.test(color))
        fail(400, "Informe nome e cor da tag.");
      db.prepare(
        "INSERT INTO chat_tags VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color",
      ).run(id, name, color);
      res.json({ id });
    }),
  );
  app.delete("/api/admin/tags/:id", admin, (req, res) => {
    transaction(db, () => {
      db.prepare("DELETE FROM chat_ticket_tags WHERE tag_id=?").run(
        req.params.id,
      );
      db.prepare("DELETE FROM chat_tags WHERE id=?").run(req.params.id);
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/tickets", admin, (req, res) => {
    const rows = db
      .prepare("SELECT id FROM chat_tickets ORDER BY updated_at DESC LIMIT 500")
      .all();
    res.json({
      tickets: rows.map((r) => {
        const t = ticket(r.id);
        return {
          ...t,
          lastMessage:
            db
              .prepare(
                "SELECT body,state FROM chat_messages WHERE ticket_id=? ORDER BY rowid DESC LIMIT 1",
              )
              .get(r.id) || null,
        };
      }),
    });
  });
  app.post(
    "/api/admin/tickets",
    admin,
    wrap((req, res) => {
      if (!contact(req.body?.contactId)) fail(400, "Selecione um contato.");
      res.json({
        ticket: transaction(db, () => ticket(getTicket(req.body.contactId).id)),
      });
    }),
  );
  app.get(
    "/api/admin/tickets/:id",
    admin,
    wrap((req, res) => {
      const t = ticket(req.params.id);
      if (!t) fail(404, "Ticket não encontrado.");
      res.json({
        ticket: t,
        messages: db
          .prepare(
            "SELECT * FROM chat_messages WHERE ticket_id=? ORDER BY rowid DESC LIMIT 300",
          )
          .all(t.id)
          .reverse(),
      });
    }),
  );
  app.patch(
    "/api/admin/tickets/:id",
    admin,
    wrap(async (req, res) => {
      const before = ticket(req.params.id),
        b = req.body || {};
      if (!before) fail(404, "Ticket não encontrado.");
      if (before.version !== b.expectedVersion)
        fail(409, "A conversa mudou. Atualize antes de alterar.");
      if (
        (b.status && !["waiting", "open", "closed"].includes(b.status)) ||
        (b.agentMode && !["auto", "paused"].includes(b.agentMode))
      )
        fail(400, "Estado inválido.");
      if (
        b.tagIds &&
        (!Array.isArray(b.tagIds) ||
          b.tagIds.length > 30 ||
          b.tagIds.some(
            (id) => !db.prepare("SELECT 1 FROM chat_tags WHERE id=?").get(id),
          ))
      )
        fail(400, "Tags inválidas.");
      if (
        config().provider === "atende" &&
        (b.agentMode || b.status === "closed")
      ) {
        try {
          if (b.status === "closed") {
            await atende.closeTicket(before.id);
            if (ticket(before.id)?.status === "closed")
              return res.json({ ticket: ticket(before.id) });
          } else await atende.claim(before.id);
        } catch (e) {
          fail(e.status || e.httpStatus || 502, clean(e.message, 400));
        }
      }
      transaction(db, () => {
        const t = ticket(req.params.id),
          b = req.body || {};
        if (!t) fail(404, "Ticket não encontrado.");
        if (t.version !== b.expectedVersion)
          fail(409, "A conversa mudou. Atualize antes de alterar.");
        if (
          (b.status && !["waiting", "open", "closed"].includes(b.status)) ||
          (b.agentMode && !["auto", "paused"].includes(b.agentMode))
        )
          fail(400, "Estado inválido.");
        if (
          b.tagIds &&
          (!Array.isArray(b.tagIds) ||
            b.tagIds.length > 30 ||
            b.tagIds.some(
              (id) => !db.prepare("SELECT 1 FROM chat_tags WHERE id=?").get(id),
            ))
        )
          fail(400, "Tags inválidas.");
        pauseTicket(t.id);
        const state = b.status || t.status;
        if (
          state !== "closed" &&
          db
            .prepare(
              "SELECT 1 FROM chat_tickets WHERE contact_id=? AND status<>'closed' AND id<>?",
            )
            .get(t.contact_id, t.id)
        )
          fail(409, "Este contato já tem outro ticket aberto.");
        const mode =
          state === "closed" ? "paused" : b.agentMode || t.agent_mode;
        db.prepare(
          "UPDATE chat_tickets SET status=?,agent_mode=? WHERE id=?",
        ).run(state, mode, t.id);
        if (b.tagIds) {
          db.prepare("DELETE FROM chat_ticket_tags WHERE ticket_id=?").run(
            t.id,
          );
          for (const id of new Set(b.tagIds))
            db.prepare("INSERT INTO chat_ticket_tags VALUES (?,?)").run(
              t.id,
              id,
            );
        }
      });
      res.json({ ticket: ticket(req.params.id) });
    }),
  );
  app.post(
    "/api/admin/tickets/:id/messages",
    admin,
    wrap(async (req, res) => {
      const t = ticket(req.params.id),
        body = clean(req.body?.body, 4000),
        key = clean(req.headers["idempotency-key"], 100);
      if (!t || t.status === "closed")
        fail(409, "Abra um ticket ativo para responder.");
      if (!body) fail(400, "Digite uma mensagem.");
      if (!/^[\w-]{16,100}$/.test(key))
        fail(400, "Identificador de envio inválido.");
      const id = "send:" + key,
        old = db.prepare("SELECT * FROM chat_messages WHERE id=?").get(id);
      if (old) {
        if (old.ticket_id !== t.id || old.body !== body)
          fail(409, "Identificador já utilizado para outra mensagem.");
        return res.json({ id, repeated: true });
      }
      if (config().provider === "atende") {
        try {
          await atende.claim(t.id);
        } catch (e) {
          fail(e.status || e.httpStatus || 502, clean(e.message, 400));
        }
      }
      let repeated = false;
      transaction(db, () => {
        const existing = db
          .prepare("SELECT * FROM chat_messages WHERE id=?")
          .get(id);
        if (existing) {
          if (existing.ticket_id !== t.id || existing.body !== body)
            fail(409, "Identificador já utilizado para outra mensagem.");
          repeated = true;
          return;
        }
        if (ticket(t.id)?.status === "closed")
          fail(409, "O ticket foi concluído. Atualize a conversa.");
        pauseTicket(t.id);
        db.prepare("UPDATE chat_tickets SET status='open' WHERE id=?").run(
          t.id,
        );
        queueMessage({ ticketId: t.id, contactId: t.contact_id, body, id });
      });
      res.status(repeated ? 200 : 201).json({ id, repeated });
    }),
  );
  app.get("/api/admin/quick-replies", admin, (_req, res) =>
    res.json({
      replies: db
        .prepare("SELECT * FROM chat_quick_replies ORDER BY shortcut")
        .all(),
    }),
  );
  app.post(
    "/api/admin/quick-replies",
    admin,
    wrap((req, res) => {
      const b = req.body || {},
        id = clean(b.id, 100) || randomUUID(),
        shortcut = clean(b.shortcut, 40),
        title = clean(b.title, 100),
        body = clean(b.body, 4000);
      if (!/^[\w-]{1,40}$/.test(shortcut) || !title || !body)
        fail(400, "Preencha atalho sem espaços, título e resposta.");
      db.prepare(
        "INSERT INTO chat_quick_replies VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET shortcut=excluded.shortcut,title=excluded.title,body=excluded.body",
      ).run(id, shortcut, title, body);
      res.json({ id });
    }),
  );
  app.delete("/api/admin/quick-replies/:id", admin, (req, res) => {
    db.prepare("DELETE FROM chat_quick_replies WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });
  app.post(
    "/api/admin/tickets/:id/suggest",
    admin,
    wrap(async (req, res) => {
      const t = ticket(req.params.id);
      if (!t) fail(404, "Ticket não encontrado.");
      const history = db
          .prepare(
            "SELECT * FROM chat_messages WHERE ticket_id=? ORDER BY rowid DESC LIMIT 8",
          )
          .all(t.id)
          .reverse(),
        last = history.findLast((m) => m.direction === "in");
      if (!last) fail(409, "Aguarde uma pergunta do cliente.");
      try {
        res.json(
          await ai.generate(
            last.body,
            history.filter((m) => m.id !== last.id),
          ),
        );
      } catch (e) {
        fail(502, e.message);
      }
    }),
  );
  app.get("/api/admin/campaigns", admin, (_req, res) =>
    res.json({
      campaigns: db
        .prepare(
          "SELECT * FROM chat_campaigns ORDER BY created_at DESC LIMIT 100",
        )
        .all()
        .map((c) => ({
          ...c,
          template: JSON.parse(c.template),
          counts: db
            .prepare(
              "SELECT state,COUNT(*) AS count FROM chat_campaign_recipients WHERE campaign_id=? GROUP BY state",
            )
            .all(c.id),
        })),
      outbox: db
        .prepare(
          "SELECT o.id,o.kind,o.state,o.error,o.created_at,c.name,c.phone,m.body FROM chat_outbox o JOIN chat_contacts c ON c.id=o.contact_id JOIN chat_messages m ON m.id=o.message_id ORDER BY o.rowid DESC LIMIT 100",
        )
        .all(),
    }),
  );
  app.post(
    "/api/admin/campaigns",
    admin,
    wrap((req, res) => {
      const b = req.body || {},
        name = clean(b.name, 100),
        body = clean(b.body, 3500),
        interval = b.intervalSeconds,
        tagId = clean(b.tagId, 100) || null;
      if (
        !name ||
        !body ||
        !Number.isInteger(interval) ||
        interval < 30 ||
        interval > 3600
      )
        fail(
          400,
          "Preencha nome, mensagem e intervalo de 30 a 3.600 segundos.",
        );
      if (tagId && !db.prepare("SELECT 1 FROM chat_tags WHERE id=?").get(tagId))
        fail(400, "Tag inválida.");
      const template = {
        name: clean(b.templateName, 100),
        language: clean(b.templateLanguage, 20) || "pt_BR",
        useName: b.templateUseName === true,
      };
      if (template.name && !/^[a-z0-9_]+$/.test(template.name))
        fail(400, "Nome de template inválido.");
      const ids =
        Array.isArray(b.contactIds) && b.contactIds.length
          ? b.contactIds
          : null;
      if (ids && (ids.length > 200 || ids.some((id) => typeof id !== "string")))
        fail(400, "Selecione até 200 contatos.");
      const all = db
        .prepare(
          "SELECT * FROM chat_contacts WHERE consent=1 AND unsubscribed=0 ORDER BY name",
        )
        .all()
        .filter(
          (c) =>
            (!ids || ids.includes(c.id)) &&
            (!tagId ||
              db
                .prepare(
                  "SELECT 1 FROM chat_tickets t JOIN chat_ticket_tags l ON l.ticket_id=t.id WHERE t.contact_id=? AND l.tag_id=?",
                )
                .get(c.id, tagId)),
        );
      if (!all.length || all.length > 200)
        fail(
          400,
          "A campanha deve conter entre 1 e 200 contatos com consentimento. Refine os contatos ou a tag.",
        );
      const id = randomUUID();
      transaction(db, () => {
        db.prepare(
          "INSERT INTO chat_campaigns(id,name,body,tag_id,template,interval_seconds,created_at) VALUES (?,?,?,?,?,?,?)",
        ).run(
          id,
          name,
          body,
          tagId,
          JSON.stringify(template),
          interval,
          stamp(),
        );
        for (const c of all)
          db.prepare(
            "INSERT INTO chat_campaign_recipients(campaign_id,contact_id) VALUES (?,?)",
          ).run(id, c.id);
      });
      res.json({ id, recipients: all.length });
    }),
  );
  app.patch(
    "/api/admin/campaigns/:id",
    admin,
    wrap((req, res) => {
      const c = db
          .prepare("SELECT * FROM chat_campaigns WHERE id=?")
          .get(req.params.id),
        next = req.body?.status;
      if (!c) fail(404, "Campanha não encontrada.");
      if (
        !["running", "paused", "cancelled"].includes(next) ||
        c.status === "cancelled" ||
        c.status === "completed"
      )
        fail(409, "Alteração indisponível.");
      if (next === "running") {
        const p = config();
        if (p.provider === "atende")
          fail(
            409,
            "Use as campanhas do Atende Chat para esse provedor. A API externa de envio ainda não confirma idempotência e entrega.",
          );
        if (!p.enabled || p.provider === "none" || !vault.has("whatsapp"))
          fail(409, "Ative e configure o WhatsApp antes de iniciar.");
        if (p.provider === "cloud" && !JSON.parse(c.template).name)
          fail(
            409,
            "Campanhas na Cloud API exigem um template aprovado. Crie uma campanha com o nome do template.",
          );
      }
      transaction(db, () => {
        db.prepare("UPDATE chat_campaigns SET status=? WHERE id=?").run(
          next,
          c.id,
        );
        if (next === "cancelled") {
          db.prepare(
            "UPDATE chat_outbox SET state='cancelled' WHERE campaign_id=? AND state='pending'",
          ).run(c.id);
          db.prepare(
            "UPDATE chat_messages SET state='cancelled' WHERE id IN (SELECT message_id FROM chat_outbox WHERE campaign_id=? AND state='cancelled')",
          ).run(c.id);
          db.prepare(
            "UPDATE chat_campaign_recipients SET state='cancelled' WHERE campaign_id=? AND state='pending'",
          ).run(c.id);
        }
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/outbox/:id/resolve",
    admin,
    wrap((req, res) => {
      const o = db
        .prepare(
          "SELECT * FROM chat_outbox WHERE id=? AND state IN ('uncertain','failed')",
        )
        .get(req.params.id);
      if (!o || !["sent", "cancelled"].includes(req.body?.state))
        fail(
          409,
          "Confira uma mensagem incerta ou com falha antes de resolver.",
        );
      transaction(db, () => {
        db.prepare("UPDATE chat_outbox SET state=? WHERE id=?").run(
          req.body.state,
          o.id,
        );
        db.prepare(
          "UPDATE chat_messages SET state=?,error=NULL WHERE id=?",
        ).run(req.body.state, o.message_id);
        if (o.campaign_id)
          db.prepare(
            "UPDATE chat_campaign_recipients SET state=? WHERE outbox_id=?",
          ).run(req.body.state, o.id);
      });
      res.json({ ok: true });
    }),
  );
  async function send(o) {
    const c = config(),
      p = contact(o.contact_id),
      m = db
        .prepare("SELECT * FROM chat_messages WHERE id=?")
        .get(o.message_id);
    if (c.provider === "atende") return atende.send(o, m.body);
    if (c.provider === "evolution") {
      const r = await providerRequest(
        "/message/sendText/" + encodeURIComponent(c.instance),
        { method: "POST", body: { number: p.phone, text: m.body } },
      );
      if (!r.key?.id)
        throw Error("O provedor não confirmou o identificador da mensagem.");
      return "evolution:" + c.instance + ":" + r.key.id;
    }
    if (c.provider === "cloud") {
      let payload = { messaging_product: "whatsapp", to: p.phone };
      if (o.kind === "campaign") {
        const campaign = db
            .prepare("SELECT template FROM chat_campaigns WHERE id=?")
            .get(o.campaign_id),
          template = JSON.parse(campaign.template);
        if (!template.name) throw Error("Campanha sem template aprovado.");
        payload = {
          ...payload,
          type: "template",
          template: {
            name: template.name,
            language: { code: template.language },
            ...(template.useName
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: [{ type: "text", text: p.name }],
                    },
                  ],
                }
              : {}),
          },
        };
      } else {
        const last = db
          .prepare(
            "SELECT created_at FROM chat_messages WHERE ticket_id=? AND direction='in' ORDER BY rowid DESC LIMIT 1",
          )
          .get(o.ticket_id);
        if (!last || Date.now() - Date.parse(last.created_at) > 24 * 3600000) {
          const e = new Error(
            "Janela de atendimento encerrada. Use um template aprovado.",
          );
          e.httpStatus = 400;
          throw e;
        }
        payload = { ...payload, type: "text", text: { body: m.body } };
      }
      const response = await fetchImpl(
        `https://graph.facebook.com/${c.graphVersion}/${c.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + vault.get("whatsapp"),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000),
          redirect: "error",
        },
      );
      if (!response.ok) {
        const e = new Error(
          `WhatsApp recusou o envio (HTTP ${response.status}).`,
        );
        e.httpStatus = response.status;
        throw e;
      }
      const data = await response.json();
      if (!data.messages?.[0]?.id)
        throw Error("O provedor não confirmou o envio.");
      return "cloud:" + data.messages[0].id;
    }
    throw Error("Configure o WhatsApp.");
  }
  function prepareCampaign() {
    const campaigns = db
      .prepare(
        "SELECT * FROM chat_campaigns WHERE status='running' ORDER BY created_at",
      )
      .all();
    for (const campaign of campaigns) {
      if (
        db
          .prepare(
            "SELECT 1 FROM chat_outbox WHERE campaign_id=? AND state IN ('pending','sending')",
          )
          .get(campaign.id)
      )
        continue;
      const r = db
        .prepare(
          "SELECT * FROM chat_campaign_recipients WHERE campaign_id=? AND state='pending' AND outbox_id IS NULL ORDER BY rowid LIMIT 1",
        )
        .get(campaign.id);
      if (!r) {
        db.prepare(
          "UPDATE chat_campaigns SET status='completed' WHERE id=? AND NOT EXISTS(SELECT 1 FROM chat_campaign_recipients WHERE campaign_id=? AND state='pending')",
        ).run(campaign.id, campaign.id);
        continue;
      }
      const c = contact(r.contact_id);
      if (!c?.consent || c.unsubscribed) {
        db.prepare(
          "UPDATE chat_campaign_recipients SET state='cancelled' WHERE campaign_id=? AND contact_id=?",
        ).run(campaign.id, r.contact_id);
        continue;
      }
      transaction(db, () => {
        const t = getTicket(c.id),
          last =
            db
              .prepare(
                "SELECT MAX(due_at) AS time FROM chat_outbox WHERE kind='campaign'",
              )
              .get().time || 0,
          body =
            campaign.body.replaceAll("{{nome}}", c.name) +
            "\n\nPara não receber campanhas, responda SAIR.";
        const out = queueMessage({
          ticketId: t.id,
          contactId: c.id,
          body,
          kind: "campaign",
          campaignId: campaign.id,
          due: Math.max(Date.now(), last + campaign.interval_seconds * 1000),
        });
        db.prepare(
          "UPDATE chat_campaign_recipients SET outbox_id=? WHERE campaign_id=? AND contact_id=?",
        ).run(out, campaign.id, c.id);
      });
    }
  }
  async function processAI() {
    if (!ai.config().enabled || !ai.config().automatic) return;
    const job = transaction(db, () => {
      const j = db
        .prepare(
          "SELECT * FROM ai_jobs WHERE state='pending' ORDER BY rowid LIMIT 1",
        )
        .get();
      if (j)
        db.prepare(
          "UPDATE ai_jobs SET state='running',lease_until=? WHERE id=?",
        ).run(Date.now() + 60000, j.id);
      return j;
    });
    if (!job) return;
    const before = ticket(job.ticket_id),
      last = db
        .prepare(
          "SELECT * FROM chat_messages WHERE ticket_id=? AND direction='in' ORDER BY rowid DESC LIMIT 1",
        )
        .get(job.ticket_id);
    if (
      !before ||
      before.agent_mode !== "auto" ||
      before.status === "closed" ||
      before.unsubscribed ||
      last?.id !== job.message_id
    ) {
      db.prepare("UPDATE ai_jobs SET state='cancelled' WHERE id=?").run(job.id);
      return;
    }
    try {
      const history = db
          .prepare(
            "SELECT * FROM chat_messages WHERE ticket_id=? AND id<>? ORDER BY rowid DESC LIMIT 6",
          )
          .all(before.id, last.id)
          .reverse(),
        answer = await ai.generate(last.body, history);
      transaction(db, () => {
        const now = ticket(before.id);
        if (
          !now ||
          now.version !== before.version ||
          now.agent_mode !== "auto" ||
          now.status === "closed" ||
          now.unsubscribed
        ) {
          db.prepare("UPDATE ai_jobs SET state='cancelled' WHERE id=?").run(
            job.id,
          );
          return;
        }
        if (answer.needsHuman) {
          pauseTicket(now.id);
          db.prepare("UPDATE chat_tickets SET status='waiting' WHERE id=?").run(
            now.id,
          );
        }
        queueMessage({
          ticketId: now.id,
          contactId: now.contact_id,
          body: answer.reply,
          kind: answer.needsHuman ? "handoff" : "ai",
        });
        db.prepare("UPDATE ai_jobs SET state='completed' WHERE id=?").run(
          job.id,
        );
      });
    } catch (e) {
      db.prepare("UPDATE ai_jobs SET state='failed',error=? WHERE id=?").run(
        clean(e.message, 500),
        job.id,
      );
      pauseTicket(before.id);
    }
  }
  let busy = false,
    timer = null;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      transaction(db, () => {
        const interrupted = db
          .prepare(
            "SELECT * FROM chat_outbox WHERE state='sending' AND lease_until<?",
          )
          .all(now);
        for (const row of interrupted) {
          const error =
            "Envio interrompido. Confira o telefone antes de reenviar.";
          db.prepare(
            "UPDATE chat_outbox SET state='uncertain',error=? WHERE id=?",
          ).run(error, row.id);
          db.prepare(
            "UPDATE chat_messages SET state='uncertain',error=? WHERE id=?",
          ).run(error, row.message_id);
          if (row.campaign_id) {
            db.prepare(
              "UPDATE chat_campaign_recipients SET state='uncertain' WHERE outbox_id=?",
            ).run(row.id);
            db.prepare(
              "UPDATE chat_campaigns SET status='paused' WHERE id=?",
            ).run(row.campaign_id);
          }
        }
      });
      db.prepare(
        "UPDATE ai_jobs SET state='pending' WHERE state='running' AND lease_until<?",
      ).run(now);
      const c = config();
      if (!c.enabled || c.provider === "none") return;
      if (c.provider === "atende") atende.sync().catch(() => {});
      if (
        c.provider === "atende" &&
        (!atende.status().loggedIn || !atende.accountKey())
      )
        return;
      await processAI();
      prepareCampaign();
      const o = transaction(db, () => {
        const row = db
          .prepare(
            "SELECT o.* FROM chat_outbox o LEFT JOIN chat_campaigns c ON c.id=o.campaign_id WHERE o.state='pending' AND o.due_at<=? AND (o.kind<>'campaign' OR c.status='running') ORDER BY o.due_at,o.rowid LIMIT 1",
          )
          .get(Date.now());
        if (!row) return null;
        const p = contact(row.contact_id),
          t = ticket(row.ticket_id);
        if (
          row.connection_key !== "none" &&
          row.connection_key !== connectionKey()
        ) {
          const error =
            "A conexão do WhatsApp mudou. Confira a conversa antes de enviar novamente.";
          db.prepare(
            "UPDATE chat_outbox SET state='failed',error=? WHERE id=?",
          ).run(error, row.id);
          db.prepare(
            "UPDATE chat_messages SET state='failed',error=? WHERE id=?",
          ).run(error, row.message_id);
          if (row.campaign_id) {
            db.prepare(
              "UPDATE chat_campaign_recipients SET state='failed' WHERE outbox_id=?",
            ).run(row.id);
            db.prepare(
              "UPDATE chat_campaigns SET status='paused' WHERE id=?",
            ).run(row.campaign_id);
          }
          return null;
        }
        if (row.connection_key === "none")
          db.prepare("UPDATE chat_outbox SET connection_key=? WHERE id=?").run(
            connectionKey(),
            row.id,
          );
        if (
          (row.kind === "campaign" && (!p?.consent || p.unsubscribed)) ||
          (row.kind === "ai" &&
            (t?.agent_mode !== "auto" ||
              t?.status === "closed" ||
              p.unsubscribed ||
              !ai.config().enabled ||
              !ai.config().automatic))
        ) {
          db.prepare("UPDATE chat_outbox SET state='cancelled' WHERE id=?").run(
            row.id,
          );
          db.prepare(
            "UPDATE chat_messages SET state='cancelled' WHERE id=?",
          ).run(row.message_id);
          if (row.campaign_id)
            db.prepare(
              "UPDATE chat_campaign_recipients SET state='cancelled' WHERE outbox_id=?",
            ).run(row.id);
          return null;
        }
        db.prepare(
          "UPDATE chat_outbox SET state='sending',attempt=attempt+1,lease_until=? WHERE id=? AND state='pending'",
        ).run(Date.now() + 60000, row.id);
        db.prepare("UPDATE chat_messages SET state='sending' WHERE id=?").run(
          row.message_id,
        );
        return row;
      });
      if (!o) return;
      try {
        const providerId = await send(o);
        transaction(db, () => {
          db.prepare(
            "UPDATE chat_outbox SET state='sent',error=NULL WHERE id=?",
          ).run(o.id);
          db.prepare(
            "UPDATE OR IGNORE chat_messages SET state=CASE WHEN state IN ('read','delivered') THEN state ELSE 'sent' END,provider_id=? WHERE id=?",
          ).run(providerId, o.message_id);
          db.prepare(
            "UPDATE chat_messages SET state=CASE WHEN state IN ('read','delivered') THEN state ELSE 'sent' END WHERE id=?",
          ).run(o.message_id);
          if (o.campaign_id)
            db.prepare(
              "UPDATE chat_campaign_recipients SET state='sent' WHERE outbox_id=?",
            ).run(o.id);
        });
      } catch (e) {
        const echoed = db
          .prepare("SELECT provider_id FROM chat_messages WHERE id=?")
          .get(o.message_id)?.provider_id;
        const state = echoed
          ? "sent"
          : e.httpStatus && e.httpStatus < 500
            ? "failed"
            : "uncertain";
        transaction(db, () => {
          db.prepare("UPDATE chat_outbox SET state=?,error=? WHERE id=?").run(
            state,
            clean(e.message, 500),
            o.id,
          );
          db.prepare("UPDATE chat_messages SET state=?,error=? WHERE id=?").run(
            state,
            clean(e.message, 500),
            o.message_id,
          );
          if (o.campaign_id) {
            db.prepare(
              "UPDATE chat_campaign_recipients SET state=? WHERE outbox_id=?",
            ).run(state, o.id);
            if (state !== "sent")
              db.prepare(
                "UPDATE chat_campaigns SET status='paused' WHERE id=?",
              ).run(o.campaign_id);
          }
        });
      }
    } finally {
      busy = false;
    }
  }
  return {
    ai,
    atende,
    ingest,
    tick,
    start() {
      atende.start();
      if (!timer) {
        timer = setInterval(
          () =>
            tick().catch((e) =>
              console.error("Fila de atendimento:", clean(e.message, 200)),
            ),
          1500,
        );
        timer.unref();
      }
    },
    async stop() {
      clearInterval(timer);
      timer = null;
      while (busy) await new Promise((r) => setTimeout(r, 25));
      await atende.stop();
    },
  };
}
