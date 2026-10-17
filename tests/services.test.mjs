import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import { createApplication } from "../server/app.mjs";
const password = "senha-de-teste-exclusiva-servicos";
async function fixture(
  t,
  providerFetch = async () => {
    throw Error("Nenhuma chamada externa prevista neste teste.");
  },
) {
  const directory = mkdtempSync(join(tmpdir(), "pronto-service-"));
  const { app, db, communications } = createApplication({
    dataDir: directory,
    adminPassword: password,
    providerFetch,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let token = "";
  const request = async (
    path,
    { method = "GET", body, auth = true, cookie = "", headers = {} } = {},
  ) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer " + token } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json(), headers: r.headers };
  };
  token = (
    await request("/auth/login", {
      auth: false,
      method: "POST",
      body: { password },
      headers: { "X-Pronto-Desktop": "1" },
    })
  ).body.desktopToken;
  t.after(async () => {
    await communications.stop();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { request, db, communications, base, directory };
}
const json = (value) => Response.json(value);
const aiConfig = {
  enabled: true,
  automatic: true,
  model: "gpt-4.1-mini",
  trainingModel: "gpt-4o-mini-2024-07-18",
  dailyLimit: 100,
  tone: "Breve",
  apiKey: "sk-teste-apenas-na-fixture",
};
async function evolution(f) {
  assert.equal(
    (
      await f.request("/admin/whatsapp", {
        method: "PUT",
        body: {
          provider: "evolution",
          enabled: true,
          baseUrl: "https://evolution.example",
          instance: "pronto",
          apiKey: "chave-ficticia-evolution",
        },
      })
    ).status,
    200,
  );
  return (await f.request("/admin/whatsapp/webhook-token", { method: "POST" }))
    .body.token;
}
async function driver(f, name = "Motoboy QA") {
  const made = await f.request("/admin/couriers", {
    method: "POST",
    body: { name, pin: "123456", phone: "11900000000" },
  });
  assert.equal(made.status, 201);
  const login = await f.request("/courier/login", {
    auth: false,
    method: "POST",
    body: { id: made.body.id, pin: "123456" },
  });
  assert.equal(login.status, 200);
  return {
    id: made.body.id,
    cookie: login.headers.get("set-cookie").split(";")[0],
  };
}
async function order(f) {
  const r = await f.request("/admin/orders", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: {
      customerName: "Cliente QA",
      phone: "11999999999",
      fulfillment: "delivery",
      address: "Rua de Teste, 10, Centro",
      payment: "cash",
      changeFor: 10000,
      items: [{ productId: "brasa-classico", quantity: 1 }],
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.order;
}
async function assign(f, o, d, expectedVersion = 0) {
  return f.request("/admin/orders/" + o.id + "/assign", {
    method: "POST",
    body: { courierId: d.id, expectedVersion },
  });
}
const cpost = (f, d, path, body) =>
  f.request(path, { auth: false, cookie: d.cookie, method: "POST", body });

test("entregadores: isolamento de pedidos, concorrência de atribuição e transições válidas", async (t) => {
  const f = await fixture(t),
    a = await driver(f),
    b = await driver(f, "Outro motoboy"),
    o = await order(f);
  assert.equal((await assign(f, o, a)).status, 200);
  assert.equal((await assign(f, o, b)).status, 409);
  const own = await f.request("/courier/orders", {
    auth: false,
    cookie: a.cookie,
  });
  assert.equal(own.body.orders.length, 1);
  assert.equal(own.body.orders[0].printJobs, undefined);
  assert.equal(
    (await f.request("/courier/orders", { auth: false, cookie: b.cookie })).body
      .orders.length,
    0,
  );
  assert.equal(
    (
      await cpost(f, b, "/courier/orders/" + o.id + "/status", {
        status: "picked_up",
        expectedVersion: 1,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await cpost(f, a, "/courier/orders/" + o.id + "/status", {
        status: "picked_up",
        expectedVersion: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/admin/orders/" + o.id + "/status", {
        method: "PATCH",
        body: { status: "ready", expectedStatus: "preparing" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await cpost(f, a, "/courier/orders/" + o.id + "/status", {
        status: "picked_up",
        expectedVersion: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await cpost(f, a, "/courier/orders/" + o.id + "/status", {
        status: "delivered",
        expectedVersion: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await cpost(f, a, "/courier/orders/" + o.id + "/status", {
        status: "delivered",
        expectedVersion: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    f.db.prepare("SELECT status FROM orders WHERE id=?").get(o.id).status,
    "completed",
  );
  assert.equal(
    (
      await cpost(f, a, "/courier/orders/" + o.id + "/status", {
        status: "delivered",
        expectedVersion: 3,
      })
    ).status,
    409,
  );
});
test("entregadores: endereço confirmado exige atribuição e é reutilizado pelo telefone", async (t) => {
  const f = await fixture(t),
    a = await driver(f),
    b = await driver(f, "Segundo"),
    o = await order(f);
  await assign(f, o, a);
  const point = {
    latitude: -23.55,
    longitude: -46.63,
    reference: "Portão azul",
    confirmed: true,
  };
  assert.equal(
    (await cpost(f, b, "/courier/orders/" + o.id + "/location", point)).status,
    404,
  );
  assert.equal(
    (
      await cpost(f, a, "/courier/orders/" + o.id + "/location", {
        ...point,
        confirmed: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (await cpost(f, a, "/courier/orders/" + o.id + "/location", point)).status,
    200,
  );
  const next = await order(f);
  await assign(f, next, b);
  const orders = (
    await f.request("/courier/orders", { auth: false, cookie: b.cookie })
  ).body.orders;
  assert.equal(orders[0].location.reference, "Portão azul");
  assert.equal(orders[0].location.latitude, point.latitude);
});
test("GPS: consentimento explícito, acesso restrito e parada revoga pacotes atrasados", async (t) => {
  const f = await fixture(t),
    a = await driver(f),
    b = await driver(f, "Segundo");
  const point = {
    sharing: true,
    latitude: -23.55,
    longitude: -46.63,
    accuracy: 12,
    capturedAt: Date.now(),
  };
  assert.equal((await cpost(f, a, "/courier/location", point)).status, 409);
  const trackingId = (await cpost(f, a, "/courier/location/start", {})).body
    .trackingId;
  assert.equal(
    (await cpost(f, a, "/courier/location", { ...point, trackingId })).status,
    200,
  );
  assert.equal(
    (await f.request("/admin/couriers/locations", { auth: false })).status,
    401,
  );
  assert.equal(
    (
      await f.request("/admin/couriers/locations", {
        auth: false,
        cookie: b.cookie,
      })
    ).status,
    401,
  );
  let p = (await f.request("/admin/couriers/locations")).body.positions[0];
  assert.equal(p.latitude, point.latitude);
  assert.equal(p.track.length, 1);
  assert.equal(
    (
      await cpost(f, a, "/courier/location", {
        ...point,
        trackingId,
        capturedAt: Date.now() + 120000,
      })
    ).status,
    400,
  );
  assert.equal(
    (await cpost(f, a, "/courier/location", { sharing: false, trackingId }))
      .status,
    200,
  );
  assert.equal(
    (await cpost(f, a, "/courier/location", { ...point, trackingId })).status,
    409,
  );
  p = (await f.request("/admin/couriers/locations")).body.positions[0];
  assert.equal(p.sharing, 0);
  assert.equal(p.latitude, undefined);
  assert.deepEqual(p.track, []);
});
test("GPS: nova sessão substitui a anterior; logout e troca de PIN revogam acesso", async (t) => {
  const f = await fixture(t),
    a = await driver(f);
  const first = (await cpost(f, a, "/courier/location/start", {})).body
      .trackingId,
    second = (await cpost(f, a, "/courier/location/start", {})).body.trackingId;
  const point = {
    sharing: true,
    latitude: 0,
    longitude: 0,
    accuracy: 4,
    capturedAt: Date.now(),
  };
  assert.equal(
    (await cpost(f, a, "/courier/location", { ...point, trackingId: first }))
      .status,
    409,
  );
  await cpost(f, a, "/courier/location", { ...point, trackingId: second });
  await f.request("/admin/couriers/" + a.id, {
    method: "PATCH",
    body: { pin: "654321" },
  });
  assert.equal(
    (await f.request("/courier/orders", { auth: false, cookie: a.cookie }))
      .status,
    401,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM courier_sharing").get().n,
    0,
  );
  assert.equal(
    (await f.request("/admin/couriers/locations")).body.positions[0].sharing,
    0,
  );
  const logged = await f.request("/courier/login", {
    auth: false,
    method: "POST",
    body: { id: a.id, pin: "654321" },
  });
  a.cookie = logged.headers.get("set-cookie").split(";")[0];
  await cpost(f, a, "/courier/logout", {});
  assert.equal(
    (await f.request("/courier/orders", { auth: false, cookie: a.cookie }))
      .status,
    401,
  );
});

test("WhatsApp Evolution: autenticação de webhook, deduplicação, grupos e handoff de anexos", async (t) => {
  const f = await fixture(t),
    token = await evolution(f);
  await f.request("/admin/ai/config", { method: "PUT", body: aiConfig });
  const hook = {
    event: "messages.upsert",
    instance: "pronto",
    data: {
      key: {
        id: "entrada-1",
        remoteJid: "5511999999999@s.whatsapp.net",
        fromMe: false,
      },
      pushName: "Cliente",
      message: { conversation: "Qual o horário?" },
    },
  };
  const call = (body, secret = token) =>
    f.request("/integrations/whatsapp", {
      auth: false,
      method: "POST",
      headers: { "x-pronto-hook": secret },
      body,
    });
  assert.equal((await call(hook, "errado")).status, 401);
  assert.equal((await call({ ...hook, instance: "outra" })).status, 400);
  assert.equal((await call(hook)).status, 200);
  await call(hook);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM chat_messages").get().n,
    1,
  );
  await call({
    ...hook,
    data: {
      ...hook.data,
      key: { ...hook.data.key, id: "grupo", remoteJid: "123@g.us" },
    },
  });
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM chat_messages").get().n,
    1,
  );
  await call({
    ...hook,
    data: {
      ...hook.data,
      key: { ...hook.data.key, id: "audio" },
      message: { audioMessage: {} },
    },
  });
  assert.equal(
    f.db.prepare("SELECT agent_mode FROM chat_tickets").get().agent_mode,
    "paused",
  );
  assert.equal(
    f.db
      .prepare("SELECT count(*) AS n FROM ai_jobs WHERE state='pending'")
      .get().n,
    0,
  );
});
test("tickets: tags, respostas rápidas, pausa/retomada, idempotência e um ticket aberto por contato", async (t) => {
  const sent = [];
  const f = await fixture(t, async (url, opts) => {
    sent.push(JSON.parse(opts.body));
    return json({ key: { id: "saida-" + sent.length } });
  });
  await evolution(f);
  const id = f.communications.ingest({
    providerId: "in-1",
    number: "5511999999999",
    body: "Olá",
  }).ticketId;
  const tag = (
    await f.request("/admin/tags", {
      method: "POST",
      body: { name: "Delivery", color: "#ef5a36" },
    })
  ).body.id;
  await f.request("/admin/quick-replies", {
    method: "POST",
    body: { shortcut: "menu", title: "Cardápio", body: "Veja nosso cardápio" },
  });
  assert.equal(
    (await f.request("/admin/quick-replies")).body.replies[0].shortcut,
    "menu",
  );
  let ticket = (await f.request("/admin/tickets/" + id)).body.ticket;
  let patch = await f.request("/admin/tickets/" + id, {
    method: "PATCH",
    body: { expectedVersion: ticket.version, agentMode: "auto", tagIds: [tag] },
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.ticket.tags[0].name, "Delivery");
  assert.equal(
    (
      await f.request("/admin/tickets/" + id, {
        method: "PATCH",
        body: { expectedVersion: ticket.version, status: "closed" },
      })
    ).status,
    409,
  );
  const key = randomUUID(),
    manual = {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: { body: "Resposta humana" },
    };
  assert.equal(
    (await f.request("/admin/tickets/" + id + "/messages", manual)).status,
    201,
  );
  assert.equal(
    (await f.request("/admin/tickets/" + id + "/messages", manual)).body
      .repeated,
    true,
  );
  assert.equal(
    (
      await f.request("/admin/tickets/" + id + "/messages", {
        ...manual,
        body: { body: "Outra" },
      })
    ).status,
    409,
  );
  await f.communications.tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, "Resposta humana");
  ticket = (await f.request("/admin/tickets/" + id)).body.ticket;
  assert.equal(ticket.agent_mode, "paused");
  await f.request("/admin/tickets/" + id, {
    method: "PATCH",
    body: { expectedVersion: ticket.version, status: "closed" },
  });
  const next = f.communications.ingest({
    providerId: "in-2",
    number: "5511999999999",
    body: "Voltei",
  }).ticketId;
  assert.notEqual(next, id);
  ticket = (await f.request("/admin/tickets/" + id)).body.ticket;
  assert.equal(
    (
      await f.request("/admin/tickets/" + id, {
        method: "PATCH",
        body: { expectedVersion: ticket.version, status: "open" },
      })
    ).status,
    409,
  );
});
test("IA: atendente assume enquanto API responde; resposta atrasada não é enviada", async (t) => {
  let release, entered;
  const awaiting = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  const sent = [];
  const f = await fixture(t, async (url, opts) => {
    if (String(url).includes("chat/completions")) {
      entered();
      await gate;
      return json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "Resposta da IA",
                needsHuman: false,
              }),
            },
          },
        ],
      });
    }
    sent.push(JSON.parse(opts.body));
    return json({ key: { id: "humano-enviado" } });
  });
  await evolution(f);
  await f.request("/admin/ai/config", { method: "PUT", body: aiConfig });
  const id = f.communications.ingest({
    providerId: "in-ia",
    number: "5511999999999",
    body: "Qual o horário?",
  }).ticketId;
  const tick = f.communications.tick();
  await awaiting;
  await f.request("/admin/tickets/" + id + "/messages", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: { body: "Vou te atender" },
  });
  release();
  await tick;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, "Vou te atender");
  assert.equal(
    f.db.prepare("SELECT state FROM ai_jobs").get().state,
    "cancelled",
  );
});
test("Evolution: eco de envio próprio não duplica mensagem nem pausa o agente", async (t) => {
  let f;
  f = await fixture(t, async (url, opts) => {
    if (String(url).includes("chat/completions"))
      return json({
        choices: [
          {
            message: {
              content: '{"reply":"Veja nosso cardápio","needsHuman":false}',
            },
          },
        ],
      });
    const data = JSON.parse(opts.body);
    f.communications.ingest({
      providerId: "evolution:pronto:eco-1",
      number: data.number,
      body: data.text,
      fromMe: true,
    });
    throw Error("Resposta HTTP se perdeu depois do envio");
  });
  await evolution(f);
  await f.request("/admin/ai/config", { method: "PUT", body: aiConfig });
  f.communications.ingest({
    providerId: "in-eco",
    number: "5511999999999",
    body: "Cardápio?",
  });
  await f.communications.tick();
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM chat_messages").get().n,
    2,
  );
  assert.equal(
    f.db.prepare("SELECT state FROM chat_outbox").get().state,
    "sent",
  );
  assert.equal(
    f.db.prepare("SELECT agent_mode FROM chat_tickets").get().agent_mode,
    "auto",
  );
});
test("campanhas: opt-in, intervalo, descadastro e incerteza sem reenvio automático", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    if (calls === 1) return json({ key: { id: "campanha-1" } });
    throw Error("Conexão interrompida");
  });
  await evolution(f);
  for (let i = 0; i < 3; i++)
    await f.request("/admin/contacts", {
      method: "POST",
      body: {
        name: "Contato " + i,
        phone: "551199999999" + i,
        consent: i < 2,
        consentSource: i < 2 ? "Cadastro autorizado" : "",
      },
    });
  const campaign = await f.request("/admin/campaigns", {
    method: "POST",
    body: { name: "Novidades", body: "Olá {{nome}}", intervalSeconds: 30 },
  });
  assert.equal(campaign.body.recipients, 2);
  await f.request("/admin/campaigns/" + campaign.body.id, {
    method: "PATCH",
    body: { status: "running" },
  });
  await f.communications.tick();
  assert.equal(calls, 1);
  await f.communications.tick();
  assert.equal(calls, 1);
  const pending = f.db
    .prepare("SELECT * FROM chat_outbox WHERE state='pending'")
    .get();
  assert.ok(pending.due_at > Date.now());
  f.db.prepare("UPDATE chat_outbox SET due_at=0 WHERE id=?").run(pending.id);
  await f.communications.tick();
  assert.equal(calls, 2);
  assert.equal(
    f.db.prepare("SELECT status FROM chat_campaigns").get().status,
    "paused",
  );
  assert.equal(
    f.db.prepare("SELECT state FROM chat_outbox WHERE id=?").get(pending.id)
      .state,
    "uncertain",
  );
  await f.communications.tick();
  assert.equal(calls, 2);
  const number = f.db
    .prepare("SELECT phone FROM chat_contacts WHERE id=?")
    .get(pending.contact_id).phone;
  f.communications.ingest({ providerId: "optout", number, body: "SAIR" });
  assert.equal(
    f.db
      .prepare("SELECT consent FROM chat_contacts WHERE id=?")
      .get(pending.contact_id).consent,
    0,
  );
  assert.equal(
    (
      await f.request("/admin/outbox/" + pending.id + "/resolve", {
        method: "POST",
        body: { state: "cancelled" },
      })
    ).status,
    200,
  );
});
test("worker: envio interrompido expira para incerto em todas as telas", async (t) => {
  const f = await fixture(t);
  const id = f.communications.ingest({
    providerId: "in-restart",
    number: "5511999999999",
    body: "Olá",
  }).ticketId;
  await f.request("/admin/tickets/" + id + "/messages", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: { body: "Resposta" },
  });
  f.db.prepare("UPDATE chat_outbox SET state='sending',lease_until=0").run();
  await f.communications.tick();
  assert.equal(
    f.db.prepare("SELECT state FROM chat_outbox").get().state,
    "uncertain",
  );
  assert.equal(
    f.db.prepare("SELECT state FROM chat_messages WHERE direction='out'").get()
      .state,
    "uncertain",
  );
});
test("Cloud API: assinatura raw HMAC, número configurado e envio de template", async (t) => {
  const requests = [];
  const f = await fixture(t, async (url, opts) => {
    requests.push({ url, body: JSON.parse(opts.body) });
    return json({ messages: [{ id: "wamid-envio" }] });
  });
  await f.request("/admin/whatsapp", {
    method: "PUT",
    body: {
      provider: "cloud",
      enabled: true,
      phoneNumberId: "123456789",
      graphVersion: "v23.0",
      apiKey: "meta-key-falsa",
      appSecret: "secret-falso",
    },
  });
  const hook = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123456789" },
              contacts: [
                { wa_id: "5511999999999", profile: { name: "Cliente" } },
              ],
              messages: [
                {
                  id: "wamid-in",
                  from: "5511999999999",
                  text: { body: "Olá" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const sign = (body) =>
    "sha256=" +
    createHmac("sha256", "secret-falso")
      .update(JSON.stringify(body))
      .digest("hex");
  assert.equal(
    (
      await f.request("/integrations/whatsapp", {
        auth: false,
        method: "POST",
        body: hook,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.request("/integrations/whatsapp", {
        auth: false,
        method: "POST",
        body: hook,
        headers: { "x-hub-signature-256": sign(hook) },
      })
    ).status,
    200,
  );
  const contact = f.db.prepare("SELECT id FROM chat_contacts").get();
  await f.request("/admin/contacts/" + contact.id, {
    method: "PATCH",
    body: { consent: true, consentSource: "Opt-in explícito" },
  });
  const create = async (templateName) =>
    f.request("/admin/campaigns", {
      method: "POST",
      body: {
        name: "Teste template",
        body: "Conteúdo do template",
        intervalSeconds: 30,
        templateName,
        templateUseName: true,
      },
    });
  const noTemplate = await create("");
  assert.equal(
    (
      await f.request("/admin/campaigns/" + noTemplate.body.id, {
        method: "PATCH",
        body: { status: "running" },
      })
    ).status,
    409,
  );
  const campaign = await create("novidades_pronto");
  await f.request("/admin/campaigns/" + campaign.body.id, {
    method: "PATCH",
    body: { status: "running" },
  });
  await f.communications.tick();
  assert.equal(requests[0].body.type, "template");
  assert.equal(requests[0].body.template.name, "novidades_pronto");
  assert.equal(
    requests[0].body.template.components[0].parameters[0].text,
    "Cliente",
  );
});
test("RAG: acentos, reindexação, informações atuais e segredos fora das respostas administrativas", async (t) => {
  let payload;
  const f = await fixture(t, async (_url, opts) => {
    payload = JSON.parse(opts.body);
    return json({
      choices: [
        {
          message: {
            content: '{"reply":"Entregamos no Centro","needsHuman":false}',
          },
        },
      ],
    });
  });
  await f.request("/admin/ai/config", { method: "PUT", body: aiConfig });
  await f.request("/admin/ai/profile", {
    method: "PUT",
    body: { hours: "Das 18h às 23h", delivery: "Centro" },
  });
  const saved = await f.request("/admin/ai/knowledge", {
    method: "POST",
    body: {
      title: "Área de entrega",
      question: "Quais bairros?",
      answer: "Centro e Jardim",
      enabled: true,
    },
  });
  let r = await f.request("/admin/ai/retrieve", {
    method: "POST",
    body: { question: "area de entrega" },
  });
  assert.equal(r.body.sources[0].id, saved.body.id);
  r = await f.request("/admin/ai/preview", {
    method: "POST",
    body: { question: "Vocês entregam no Centro?" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.reply, "Entregamos no Centro");
  assert.ok(payload.messages[0].content.includes("Das 18h às 23h"));
  assert.ok(payload.messages[0].content.includes("unitPriceBRL"));
  const admin = await f.request("/admin/ai");
  assert.equal(admin.body.hasKey, true);
  assert.ok(!JSON.stringify(admin.body).includes(aiConfig.apiKey));
  assert.ok(
    !f.db
      .prepare("SELECT value FROM provider_secrets WHERE name='openai'")
      .get()
      .value.includes(aiConfig.apiKey),
  );
  assert.equal(readFileSync(join(f.directory, "provider.key")).length, 32);
  await f.request("/admin/ai/knowledge", {
    method: "POST",
    body: {
      id: saved.body.id,
      title: "Retirada",
      question: "Retirada",
      answer: "Retire no balcão",
      enabled: true,
    },
  });
  r = await f.request("/admin/ai/retrieve", {
    method: "POST",
    body: { question: "area de entrega" },
  });
  assert.equal(r.body.sources.length, 0);
});
test("IA: limite diário e resposta com estrutura incompleta não é enviada", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => {
    calls++;
    return json({
      choices: [
        { message: { content: '{"reply":"Resposta sem decisão de handoff"}' } },
      ],
    });
  });
  await f.request("/admin/ai/config", {
    method: "PUT",
    body: { ...aiConfig, dailyLimit: 1 },
  });
  assert.equal(
    (
      await f.request("/admin/ai/preview", {
        method: "POST",
        body: { question: "Olá" },
      })
    ).status,
    502,
  );
  const r = await f.request("/admin/ai/preview", {
    method: "POST",
    body: { question: "Outra pergunta" },
  });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /Limite diário/);
  assert.equal(calls, 1);
});
test("fine-tuning: exemplos revisados, confirmação de custo, bloqueio de duplicação e ativação explícita", async (t) => {
  const urls = [];
  const f = await fixture(t, async (url, opts) => {
    urls.push(String(url));
    if (String(url).endsWith("/files")) return json({ id: "file-teste" });
    if (opts.method === "POST")
      return json({ id: "ftjob-teste", status: "queued" });
    return json({
      status: "succeeded",
      fine_tuned_model: "ft:gpt-4o-mini:pronto:teste",
    });
  });
  await f.request("/admin/ai/config", { method: "PUT", body: aiConfig });
  assert.equal(
    (
      await f.request("/admin/ai/training", {
        method: "POST",
        body: { confirmCost: true },
      })
    ).status,
    400,
  );
  for (let i = 0; i < 10; i++)
    await f.request("/admin/ai/examples", {
      method: "POST",
      body: {
        question: "Pergunta " + i + " contato cliente@example.com",
        answer: "Resposta ideal " + i,
        approved: true,
      },
    });
  const dataset = await f.request("/admin/ai/dataset");
  assert.equal(dataset.body.count, 10);
  assert.ok(!dataset.body.jsonl.includes("cliente@example.com"));
  assert.equal(dataset.body.jsonl.trim().split("\n").length, 10);
  assert.equal(
    (await f.request("/admin/ai/training", { method: "POST", body: {} }))
      .status,
    400,
  );
  assert.equal(urls.length, 0);
  const job = await f.request("/admin/ai/training", {
    method: "POST",
    body: { confirmCost: true },
  });
  assert.equal(job.status, 200);
  assert.equal(urls.length, 2);
  assert.equal(
    (
      await f.request("/admin/ai/training", {
        method: "POST",
        body: { confirmCost: true },
      })
    ).status,
    409,
  );
  await f.request("/admin/ai/training/" + job.body.id + "/sync", {
    method: "POST",
  });
  assert.equal(
    (await f.request("/admin/ai")).body.config.model,
    aiConfig.model,
  );
  assert.equal(
    (
      await f.request("/admin/ai/training/" + job.body.id + "/activate", {
        method: "POST",
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request("/admin/ai")).body.config.model,
    "ft:gpt-4o-mini:pronto:teste",
  );
});

test("fine-tuning: envio incerto bloqueia repetição até conferência no painel", async (t) => {
  const f = await fixture(t, async (url) => {
    if (String(url).endsWith("/files")) return json({ id: "file-teste" });
    throw Error("Timeout após solicitar treinamento");
  });
  await f.request("/admin/ai/config", { method: "PUT", body: aiConfig });
  for (let i = 0; i < 10; i++)
    await f.request("/admin/ai/examples", {
      method: "POST",
      body: {
        question: "Pergunta " + i,
        answer: "Resposta " + i,
        approved: true,
      },
    });
  assert.equal(
    (
      await f.request("/admin/ai/training", {
        method: "POST",
        body: { confirmCost: true },
      })
    ).status,
    502,
  );
  const job = f.db.prepare("SELECT * FROM ai_training_jobs").get();
  assert.equal(job.status, "uncertain");
  assert.equal(
    (
      await f.request("/admin/ai/training", {
        method: "POST",
        body: { confirmCost: true },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/admin/ai/training/" + job.id + "/reconcile", {
        method: "POST",
        body: {},
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request("/admin/ai/training/" + job.id + "/reconcile", {
        method: "POST",
        body: { providerId: "ftjob-recuperado" },
      })
    ).status,
    200,
  );
  assert.equal(
    f.db.prepare("SELECT provider_id FROM ai_training_jobs").get().provider_id,
    "ftjob-recuperado",
  );
});
test("campanha: SAIR cancela destinatários e mensagens ainda pendentes", async (t) => {
  const f = await fixture(t, async () => json({ key: { id: "campanha-ok" } }));
  await evolution(f);
  for (let i = 0; i < 2; i++)
    await f.request("/admin/contacts", {
      method: "POST",
      body: {
        name: "Contato " + i,
        phone: "551199999999" + i,
        consent: true,
        consentSource: "Consentimento explícito",
      },
    });
  const campaign = await f.request("/admin/campaigns", {
    method: "POST",
    body: { name: "Campanha", body: "Olá", intervalSeconds: 30 },
  });
  await f.request("/admin/campaigns/" + campaign.body.id, {
    method: "PATCH",
    body: { status: "running" },
  });
  await f.communications.tick();
  await f.communications.tick();
  const o = f.db
    .prepare("SELECT * FROM chat_outbox WHERE state='pending'")
    .get();
  f.communications.ingest({
    providerId: "sair-pendente",
    number: f.db
      .prepare("SELECT phone FROM chat_contacts WHERE id=?")
      .get(o.contact_id).phone,
    body: "SAIR",
  });
  assert.equal(
    f.db.prepare("SELECT state FROM chat_outbox WHERE id=?").get(o.id).state,
    "cancelled",
  );
  assert.equal(
    f.db.prepare("SELECT state FROM chat_messages WHERE id=?").get(o.message_id)
      .state,
    "cancelled",
  );
  assert.equal(
    f.db
      .prepare("SELECT state FROM chat_campaign_recipients WHERE outbox_id=?")
      .get(o.id).state,
    "cancelled",
  );
});
