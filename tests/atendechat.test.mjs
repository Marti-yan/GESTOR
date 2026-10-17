import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApplication } from "../server/app.mjs";
async function fixture(t, { send = "ok", deferAI = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "pronto-atende-")),
    calls = [],
    sockets = [];
  let expired = false,
    releaseAI,
    enteredAI;
  const pendingAI = new Promise((r) => (enteredAI = r)),
    aiGate = new Promise((r) => (releaseAI = r));
  const remote = {
      id: 321,
      companyId: 2,
      whatsappId: 15,
      status: "pending",
      userId: null,
      queueId: 10,
      isBot: true,
      useIntegration: true,
      contact: { id: 8, name: "Cliente Atende", number: "5511999999999" },
    },
    messages = [
      {
        id: 789,
        wid: "wid-inicial",
        ticketId: 321,
        companyId: 2,
        fromMe: false,
        body: "Olá",
        ack: 2,
        mediaType: "conversation",
        createdAt: new Date().toISOString(),
      },
    ];
  const socketFactory = (url, options) => {
    const s = new EventEmitter();
    s.connected = false;
    s.connect = () => {
      s.connected = true;
      s.emit("connect");
    };
    s.disconnect = () => (s.connected = false);
    s.url = url;
    s.options = options;
    sockets.push(s);
    return s;
  };
  let f;
  const providerFetch = async (url, opts = {}) => {
    const u = new URL(url),
      body =
        opts.body && typeof opts.body === "string"
          ? JSON.parse(opts.body)
          : undefined;
    calls.push({
      url: String(url),
      method: opts.method || "GET",
      body,
      headers: opts.headers,
    });
    if (u.hostname === "api.openai.com") {
      if (deferAI) {
        enteredAI();
        await aiGate;
      }
      return Response.json({
        choices: [
          {
            message: {
              content: '{"reply":"Resposta do Pronto","needsHuman":false}',
            },
          },
        ],
      });
    }
    if (u.pathname === "/login")
      return Response.json({
        token: "header.payload.signature",
        user: { id: 4, companyId: 2, name: "Operador QA" },
      });
    if (expired) return Response.json({ error: "expired" }, { status: 401 });
    if (u.pathname === "/whatsapp/")
      return Response.json([
        {
          id: 15,
          name: "Loja QA",
          status: "CONNECTED",
          companyId: 2,
          channel: "whatsapp",
          token: "nao-retornar-token",
          session: "nao-retornar-sessao",
        },
        { id: 99, name: "Outra empresa", companyId: 3 },
      ]);
    if (u.pathname === "/whatsapp/15")
      return Response.json({
        id: 15,
        companyId: 2,
        status: "CONNECTED",
        qrcode: "",
      });
    if (u.pathname === "/whatsappsession/15")
      return Response.json({ ok: true });
    if (u.pathname === "/tickets")
      return Response.json({
        tickets:
          u.searchParams.get("status") === remote.status
            ? [structuredClone(remote)]
            : [],
        hasMore: false,
      });
    if (u.pathname === "/tickets/321") {
      if (opts.method === "PUT")
        Object.assign(remote, body, { isBot: false, useIntegration: false });
      return Response.json(structuredClone(remote));
    }
    if (u.pathname === "/messages/321") {
      if (opts.method === "POST") {
        if (send === "timeout") throw Error("Resposta perdida");
        if (send === "queue")
          return Response.json({
            message: "Mensagem enviada a fila",
            filaId: 42,
          });
        const m = {
          id: 790,
          wid: "wid-saida",
          ticketId: 321,
          companyId: 2,
          fromMe: true,
          body: body.body,
          ack: 3,
          createdAt: new Date().toISOString(),
        };
        if (send === "echo") {
          await f.communications.atende.receive(m, remote, { live: true });
          f.communications.atende.applyAck({ ...m, ack: 4 });
        }
        return Response.json(m);
      }
      return Response.json({
        messages: structuredClone(messages),
        hasMore: false,
      });
    }
    throw Error("Rota de teste inesperada " + u.pathname);
  };
  const { app, db, communications } = createApplication({
    dataDir: directory,
    adminPassword: "senha-exclusiva-atende-testes",
    providerFetch,
    atendeSocketFactory: socketFactory,
  });
  const server = await new Promise((r) => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    }),
    base = `http://127.0.0.1:${server.address().port}`;
  let token = "";
  const request = async (
    path,
    { method = "GET", body, auth = true, headers = {} } = {},
  ) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer " + token } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  token = (
    await request("/auth/login", {
      auth: false,
      method: "POST",
      body: { password: "senha-exclusiva-atende-testes" },
      headers: { "X-Pronto-Desktop": "1" },
    })
  ).body.desktopToken;
  t.after(async () => {
    releaseAI();
    await communications.stop();
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const save = (extra = {}) =>
    request("/admin/whatsapp", {
      method: "PUT",
      body: {
        provider: "atende",
        enabled: true,
        baseUrl: "https://atende.example",
        atendeWhatsappId: "15",
        ...extra,
      },
    });
  f = {
    request,
    db,
    communications,
    calls,
    sockets,
    remote,
    messages,
    save,
    pendingAI,
    releaseAI,
    expire: () => (expired = true),
  };
  await save();
  assert.equal(
    (
      await request("/admin/whatsapp/atende/login", {
        method: "POST",
        body: { email: "operador@example.com", password: "senha-ficticia" },
      })
    ).status,
    200,
  );
  return f;
}
async function sync(f) {
  const r = await f.request("/admin/whatsapp/atende/sync", { method: "POST" });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  await f.communications.atende.sync({ force: true });
  return (await f.request("/admin/tickets")).body.tickets[0];
}
const sendText = (f, t, body = "Resposta humana", key = randomUUID()) =>
  f.request("/admin/tickets/" + t.id + "/messages", {
    method: "POST",
    body: { body },
    headers: { "Idempotency-Key": key },
  });
const setAgent = (f, t, mode) =>
  f.request("/admin/tickets/" + t.id, {
    method: "PATCH",
    body: { agentMode: mode, expectedVersion: t.version },
  });
const configAI = {
  enabled: true,
  automatic: true,
  model: "gpt-4.1-mini",
  trainingModel: "gpt-4o-mini-2024-07-18",
  dailyLimit: 100,
  tone: "Breve",
  apiKey: "sk-ficticia",
};
test("Atende: conexão sanitizada e histórico inicial sem acionar agente nem duplicar sessão", async (t) => {
  const f = await fixture(t),
    r = await f.request("/admin/whatsapp/atende/connections");
  assert.equal(r.body.connections.length, 1);
  assert.deepEqual(Object.keys(r.body.connections[0]).sort(), [
    "id",
    "name",
    "status",
  ]);
  const ticket = await sync(f);
  assert.equal(ticket.atende.ticketId, "321");
  assert.equal(ticket.agent_mode, "paused");
  await sync(f);
  assert.equal(f.db.prepare("SELECT count(*) n FROM chat_messages").get().n, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM ai_jobs").get().n, 0);
  assert.equal(
    f.calls.filter((c) => c.url.includes("/whatsappsession/")).length,
    0,
  );
  assert.ok(
    !JSON.stringify((await f.request("/admin/whatsapp")).body).includes(
      "header.payload.signature",
    ),
  );
  assert.ok(
    !f.db
      .prepare("SELECT value FROM provider_secrets WHERE name='atende-token'")
      .get()
      .value.includes("header.payload.signature"),
  );
  assert.equal(
    (await f.request("/admin/whatsapp/atende/connections", { auth: false }))
      .status,
    401,
  );
});
test("Atende: assumir pausa bot original e envio idempotente preserva ACK antecipado", async (t) => {
  const f = await fixture(t, { send: "echo" }),
    ticket = await sync(f),
    key = randomUUID();
  assert.equal((await sendText(f, ticket, "Resposta humana", key)).status, 201);
  assert.equal(f.remote.userId, 4);
  assert.equal(f.remote.isBot, false);
  assert.equal(f.remote.useIntegration, false);
  assert.equal(
    (await sendText(f, ticket, "Resposta humana", key)).body.repeated,
    true,
  );
  await f.communications.tick();
  const calls = f.calls.filter(
    (c) => c.method === "POST" && c.url.includes("/messages/"),
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, {
    body: "Resposta humana",
    isPrivate: "false",
  });
  assert.equal(
    f.db.prepare("SELECT state FROM chat_outbox").get().state,
    "sent",
  );
  assert.equal(
    f.db.prepare("SELECT state FROM chat_messages WHERE direction='out'").get()
      .state,
    "read",
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM chat_messages").get().n, 2);
  assert.ok(f.calls.every((c) => !c.url.includes("/api/messages/send")));
});
test("Atende: timeout ou resposta de fila sem ID não confirma envio nem repete", async (t) => {
  for (const send of ["timeout", "queue"]) {
    const f = await fixture(t, { send }),
      ticket = await sync(f);
    await sendText(f, ticket);
    await f.communications.tick();
    await f.communications.tick();
    assert.equal(
      f.db.prepare("SELECT state FROM chat_outbox").get().state,
      "uncertain",
    );
    assert.equal(
      f.calls.filter((c) => c.method === "POST" && c.url.includes("/messages/"))
        .length,
      1,
    );
  }
});
test("Atende: empresa, conexão, grupos e LID ficam isolados", async (t) => {
  const f = await fixture(t);
  await sync(f);
  const m = {
    id: 800,
    companyId: 2,
    fromMe: false,
    body: "Pergunta",
    createdAt: new Date().toISOString(),
  };
  await assert.rejects(
    () =>
      f.communications.atende.receive(
        m,
        { ...f.remote, companyId: 3 },
        { live: true },
      ),
    /fora da empresa/,
  );
  await assert.rejects(
    () =>
      f.communications.atende.receive(
        m,
        { ...f.remote, whatsappId: 99 },
        { live: true },
      ),
    /conexão selecionada/,
  );
  await f.communications.atende.receive(
    m,
    { ...f.remote, isGroup: true },
    { live: true },
  );
  await f.communications.atende.receive(
    m,
    { ...f.remote, contact: { number: "1234567890123@lid" } },
    { live: true },
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM chat_messages").get().n, 1);
});
test("Atende: outro atendente assume durante geração e cancela resposta atrasada", async (t) => {
  const f = await fixture(t, { deferAI: true }),
    ticket = await sync(f);
  await f.request("/admin/ai/config", { method: "PUT", body: configAI });
  assert.equal((await setAgent(f, ticket, "auto")).status, 200);
  await f.communications.atende.receive(
    {
      id: 801,
      companyId: 2,
      fromMe: false,
      body: "Qual o horário?",
      createdAt: new Date().toISOString(),
    },
    f.remote,
    { live: true },
  );
  const tick = f.communications.tick();
  await f.pendingAI;
  f.remote.userId = 9;
  f.communications.atende.applyTicket(f.remote);
  f.releaseAI();
  await tick;
  assert.equal(
    f.db.prepare("SELECT state FROM ai_jobs").get().state,
    "cancelled",
  );
  assert.equal(
    f.calls.filter((c) => c.method === "POST" && c.url.includes("/messages/"))
      .length,
    0,
  );
  assert.equal(
    (await f.request("/admin/tickets/" + ticket.id)).body.ticket.agent_mode,
    "paused",
  );
});
test("Atende: namespace autenticado e desvinculação preservam WhatsApp original", async (t) => {
  const f = await fixture(t);
  await sync(f);
  f.communications.atende.start();
  const s = f.sockets[0];
  assert.equal(s.url, "https://atende.example/2");
  assert.equal(s.options.query.token, "Bearer header.payload.signature");
  s.emit("company-2-whatsappSession", {
    session: { id: 15, status: "qrcode", qrcode: "qr-ficticio" },
  });
  assert.equal(f.communications.atende.status().code, "qr-ficticio");
  s.emit("company-2-whatsappSession", {
    session: { id: 99, status: "qrcode", qrcode: "outro" },
  });
  assert.equal(f.communications.atende.status().code, "qr-ficticio");
  await f.request("/admin/whatsapp/atende/forget", { method: "POST" });
  assert.equal(s.connected, false);
  assert.equal(f.communications.atende.status().loggedIn, false);
  assert.ok(f.calls.every((c) => c.method !== "DELETE"));
});
test("Atende: expiração e troca de backend não reutilizam credenciais antigas", async (t) => {
  const f = await fixture(t);
  f.expire();
  assert.equal(
    (await f.request("/admin/whatsapp/atende/connections")).status,
    401,
  );
  assert.equal(
    (await f.request("/admin/whatsapp")).body.atende.loggedIn,
    false,
  );
  const g = await fixture(t);
  await g.save({ baseUrl: "https://outro-atende.example" });
  assert.equal(
    (await g.request("/admin/whatsapp/atende/connections")).status,
    409,
  );
  assert.equal(
    g.calls.some((c) => new URL(c.url).hostname === "outro-atende.example"),
    false,
  );
});
test("Atende: troca de número não despacha mensagens pendentes na conexão nova", async (t) => {
  const f = await fixture(t),
    ticket = await sync(f);
  await sendText(f, ticket);
  await f.save({ atendeWhatsappId: "99" });
  await f.communications.tick();
  assert.equal(
    f.calls.filter((c) => c.method === "POST" && c.url.includes("/messages/"))
      .length,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT state FROM chat_outbox").get().state,
    "failed",
  );
});
test("Atende: mensagens opacas e encerramento remoto são reconciliados", async (t) => {
  const f = await fixture(t),
    ticket = await sync(f);
  await f.communications.atende.receive(
    {
      id: "3EB0_QA:opaque",
      wid: "wid-opaco",
      companyId: 2,
      fromMe: false,
      body: "ID opaco",
      createdAt: new Date().toISOString(),
    },
    f.remote,
    { live: true },
  );
  f.communications.atende.applyAck({ wid: "wid-opaco", ack: 4 });
  assert.equal(
    f.db.prepare("SELECT state FROM chat_messages WHERE body='ID opaco'").get()
      .state,
    "read",
  );
  f.remote.status = "closed";
  await f.communications.atende.sync({ force: true });
  assert.equal(
    (await f.request("/admin/tickets/" + ticket.id)).body.ticket.status,
    "closed",
  );
});
test("Atende: notas internas não entram no histórico e evento ao vivo sem data aciona agente assumido", async (t) => {
  const f = await fixture(t),
    ticket = await sync(f);
  await f.communications.atende.receive(
    {
      id: "private-note",
      fromMe: false,
      body: "Informação interna",
      isPrivate: true,
    },
    f.remote,
    { live: true },
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM chat_messages WHERE body='Informação interna'",
      )
      .get().n,
    0,
  );
  await f.request("/admin/ai/config", { method: "PUT", body: configAI });
  await setAgent(f, ticket, "auto");
  await f.communications.atende.receive(
    { id: "live-no-time", fromMe: false, body: "Qual o cardápio?", ack: null },
    f.remote,
    { live: true },
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM ai_jobs WHERE state='pending'").get()
      .n,
    1,
  );
  assert.equal(
    f.db
      .prepare("SELECT state FROM chat_messages WHERE body='Qual o cardápio?'")
      .get().state,
    "received",
  );
});
