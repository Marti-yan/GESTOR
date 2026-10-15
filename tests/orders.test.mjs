import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApplication } from "../server/app.mjs";

const password = "teste-exclusivo-com-12-caracteres";
async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "pronto-test-"));
  const { app, db } = createApplication({
    dataDir: directory,
    adminPassword: password,
    ...options,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let token = "";
  async function request(
    path,
    { method = "GET", body, headers = {}, auth = false } = {},
  ) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer " + token } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  }
  const login = await request("/auth/login", {
    method: "POST",
    body: { password },
    headers: { "X-Pronto-Desktop": "1" },
  });
  token = login.body.desktopToken;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { request, db, base };
}
test("tela inicial funciona quando o aplicativo está em um diretório oculto", async (t) => {
  const webDir = mkdtempSync(join(tmpdir(), ".pronto-web-"));
  t.after(() => rmSync(webDir, { recursive: true, force: true }));
  writeFileSync(
    join(webDir, "index.html"),
    "<!doctype html><title>Gestor empacotado</title>",
  );
  writeFileSync(join(webDir, "app.js"), "console.log('gestor');");
  const { base } = await fixture(t, { webDir });
  for (const path of ["/", "/#/gestor", "/index.html"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(await response.text(), /Gestor empacotado/);
  }
  assert.equal((await fetch(base + "/app.js")).status, 200);
  const missing = await fetch(base + "/api/inexistente");
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type"), /application\/json/);
});

function orderBody(extra = {}) {
  return {
    customerName: "Cliente de Teste",
    phone: "11987654321",
    fulfillment: "pickup",
    payment: "card",
    notes: "Sem talheres",
    items: [{ productId: "brasa-classico", quantity: 2, notes: "Sem cebola" }],
    ...extra,
  };
}
async function create(request, body = orderBody(), key = randomUUID()) {
  return request("/orders", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body,
  });
}

test("pedido calcula valores no servidor e é visível no gestor protegido", async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request("/admin/orders")).status, 401);
  const result = await create(
    request,
    orderBody({
      total: 1,
      items: [
        {
          productId: "brasa-classico",
          quantity: 2,
          notes: "Sem cebola",
          price: 1,
        },
      ],
    }),
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.order.total, 4980);
  assert.equal(result.body.order.items[0].price, 2490);
  const dashboard = await request("/admin/orders", { auth: true });
  assert.equal(dashboard.body.orders.length, 1);
  assert.equal(dashboard.body.orders[0].printJobs.length, 0);
  assert.equal(dashboard.body.orders[0].status, "new");
  const tracking = await request("/track/" + result.body.trackingToken);
  assert.equal(tracking.status, 200);
  assert.equal(tracking.body.order.phone, undefined);
  assert.equal(tracking.body.order.address, undefined);
});
test("reenvio e concorrência com a mesma chave criam somente um pedido e uma comanda", async (t) => {
  const { request, db } = await fixture(t);
  const key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => create(request, orderBody(), key)),
  );
  assert.equal(new Set(results.map((r) => r.body.order.id)).size, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 0);
  const id = results[0].body.order.id;
  const accept = () =>
    request(`/admin/orders/${id}/status`, {
      method: "PATCH",
      auth: true,
      body: { expectedStatus: "new", status: "preparing" },
    });
  await Promise.all([accept(), accept()]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 1);
  assert.ok(
    db.prepare("SELECT accepted_at FROM orders WHERE id=?").get(id).accepted_at,
  );
  const changed = await create(
    request,
    orderBody({ customerName: "Outro nome" }),
    key,
  );
  assert.equal(changed.status, 409);
});
test("preço alterado, produto pausado, loja fechada e dados incompletos impedem pedido", async (t) => {
  const { request, db } = await fixture(t);
  assert.equal(
    (await create(request, orderBody({ expectedTotal: 1 }))).status,
    409,
  );
  assert.equal(
    (await create(request, orderBody({ phone: "123" }))).status,
    400,
  );
  assert.equal(
    (
      await create(
        request,
        orderBody({ fulfillment: "delivery", address: "Rua" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await create(
        request,
        orderBody({ items: [{ productId: "brasa-classico", quantity: -2 }] }),
      )
    ).status,
    400,
  );
  await request("/admin/products/brasa-classico", {
    method: "PATCH",
    auth: true,
    body: { available: false },
  });
  assert.equal((await create(request)).status, 409);
  await request("/admin/products/brasa-classico", {
    method: "PATCH",
    auth: true,
    body: { available: true },
  });
  await request("/admin/store", {
    method: "PATCH",
    auth: true,
    body: { open: false },
  });
  assert.equal((await create(request)).status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
});
test("taxa, troco, estados e concorrência de edição respeitam o pedido real", async (t) => {
  const { request } = await fixture(t);
  const result = await create(
    request,
    orderBody({
      fulfillment: "delivery",
      address: "Rua de Teste, 10, Centro",
      payment: "cash",
      changeFor: 10000,
    }),
  );
  assert.equal(result.body.order.total, 5480);
  const id = result.body.order.id;
  assert.equal(
    (
      await request(`/admin/orders/${id}/status`, {
        method: "PATCH",
        auth: true,
        body: { expectedStatus: "new", status: "completed" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/admin/orders/${id}/status`, {
        method: "PATCH",
        auth: true,
        body: { expectedStatus: "new", status: "preparing" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/admin/orders/${id}/status`, {
        method: "PATCH",
        auth: true,
        body: { expectedStatus: "new", status: "cancelled" },
      })
    ).status,
    409,
  );
  assert.equal(
    (await create(request, orderBody({ payment: "cash", changeFor: 1 })))
      .status,
    400,
  );
});
test("fila setorizada é persistente e duas instâncias não reservam a mesma comanda", async (t) => {
  const { request, db } = await fixture(t);
  await request("/admin/printing/targets", {
    method: "PUT",
    auth: true,
    body: {
      targets: [
        {
          id: "geral",
          label: "Geral",
          deviceName: "ELGIN i8",
          width: 80,
          station: "*",
          enabled: true,
        },
        {
          id: "bar",
          label: "Bar",
          deviceName: "ELGIN i8 - Bar",
          width: 80,
          station: "Bar",
          enabled: true,
        },
      ],
    },
  });
  const result = await create(
    request,
    orderBody({
      items: [
        { productId: "brasa-classico", quantity: 1 },
        { productId: "refrigerante", quantity: 1 },
      ],
    }),
  );
  assert.equal(result.status, 201);
  await request(`/admin/orders/${result.body.order.id}/status`, {
    method: "PATCH",
    auth: true,
    body: { expectedStatus: "new", status: "preparing" },
  });
  const claims = await Promise.all([
    request("/admin/printing/claim", {
      method: "POST",
      auth: true,
      body: { agentId: "pc-a" },
    }),
    request("/admin/printing/claim", {
      method: "POST",
      auth: true,
      body: { agentId: "pc-b" },
    }),
  ]);
  assert.notEqual(claims[0].body.job.id, claims[1].body.job.id);
  const job = claims[0].body.job;
  assert.equal(
    (
      await request(`/admin/printing/jobs/${job.id}/start`, {
        method: "POST",
        auth: true,
        body: { claimToken: "invalido" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/admin/printing/jobs/${job.id}/start`, {
        method: "POST",
        auth: true,
        body: { claimToken: job.claimToken },
      })
    ).status,
    200,
  );
  db.prepare("UPDATE print_jobs SET lease_until=? WHERE id=?").run(
    Date.now() - 100,
    job.id,
  );
  const after = await request("/admin/printing", { auth: true });
  assert.equal(after.body.jobs.find((j) => j.id === job.id).state, "uncertain");
  assert.equal(
    (
      await request(`/admin/printing/jobs/${job.id}/retry`, {
        method: "POST",
        auth: true,
        body: {},
      })
    ).status,
    400,
  );
});
test("cancelamento remove comandas ainda não iniciadas e logout revoga a sessão", async (t) => {
  const { request, db } = await fixture(t);
  const created = await create(request);
  const id = created.body.order.id;
  await request(`/admin/orders/${id}/status`, {
    method: "PATCH",
    auth: true,
    body: { status: "preparing", expectedStatus: "new" },
  });
  await request(`/admin/orders/${id}/status`, {
    method: "PATCH",
    auth: true,
    body: { status: "cancelled", expectedStatus: "preparing" },
  });
  assert.equal(
    db.prepare("SELECT state FROM print_jobs WHERE order_id=?").get(id).state,
    "cancelled",
  );
  assert.equal(
    (await request("/auth/logout", { method: "POST", auth: true })).status,
    200,
  );
  assert.equal((await request("/admin/orders", { auth: true })).status, 401);
});
test("escritas de outra origem são rejeitadas", async (t) => {
  const { request } = await fixture(t);
  const result = await request("/admin/store", {
    method: "PATCH",
    auth: true,
    headers: { Origin: "https://outro-site.example" },
    body: { open: false },
  });
  assert.equal(result.status, 403);
});

test("cardápio não pode forçar aceite; comandas antigas pendentes aguardam aceite", async (t) => {
  const { request, db } = await fixture(t);
  const r = await create(
    request,
    orderBody({
      source: "waiter",
      status: "preparing",
      acceptedAt: new Date().toISOString(),
    }),
  );
  const id = r.body.order.id;
  assert.equal(r.body.order.source, "menu");
  assert.equal(r.body.order.status, "new");
  assert.equal(r.body.order.acceptedAt, null);
  // Fila existente da versão anterior: não pode escapar antes do aceite.
  db.prepare(
    "UPDATE print_targets SET device_name='ELGIN i8' WHERE id='geral'",
  ).run();
  db.prepare(
    "INSERT INTO print_jobs(id,order_id,target_id,state,created_at,updated_at) VALUES (?,?,'geral','pending',?,?)",
  ).run(randomUUID(), id, new Date().toISOString(), new Date().toISOString());
  const claim = () =>
    request("/admin/printing/claim", {
      method: "POST",
      auth: true,
      body: { agentId: "teste" },
    });
  assert.equal((await claim()).body.job, null);
  await request(`/admin/orders/${id}/status`, {
    method: "PATCH",
    auth: true,
    body: { status: "preparing", expectedStatus: "new" },
  });
  assert.equal((await claim()).body.job.order.id, id);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE order_id=?").get(id)
      .n,
    1,
  );
});

test("garçom tem sessão própria, lança por mesa e não acessa administração", async (t) => {
  const { request, db } = await fixture(t);
  assert.equal(
    (await request("/staff/orders", { method: "POST", body: orderBody() }))
      .status,
    401,
  );
  assert.equal(
    (
      await request("/admin/staff", {
        method: "PUT",
        auth: true,
        body: { enabled: true, pin: "123" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/admin/staff", {
        method: "PUT",
        auth: true,
        body: { enabled: true, pin: "654321" },
      })
    ).status,
    200,
  );
  const stored = JSON.parse(
    db.prepare("SELECT value FROM settings WHERE key='staff'").get().value,
  );
  assert.ok(!stored.password.includes("654321"));
  const login = await request("/staff/login", {
    method: "POST",
    body: { name: "Ana", pin: "654321" },
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  const Cookie = login.headers.get("set-cookie").split(";")[0];
  for (const path of [
    "/admin/orders",
    "/admin/catalog",
    "/admin/printing",
    "/admin/staff",
  ])
    assert.equal(
      (await request(path, { headers: { Cookie } })).status,
      401,
      path,
    );
  const key = randomUUID(),
    body = orderBody({
      fulfillment: "dinein",
      tableName: "Varanda 2",
      payment: "pending",
      customerName: "",
      phone: "",
    });
  const send = () =>
    request("/staff/orders", {
      method: "POST",
      headers: { Cookie, "Idempotency-Key": key },
      body,
    });
  const first = await send(),
    again = await send();
  assert.equal(first.status, 201);
  assert.equal(again.body.order.id, first.body.order.id);
  assert.equal(first.body.order.status, "preparing");
  assert.equal(first.body.order.source, "waiter");
  assert.equal(first.body.order.actorName, "Ana");
  assert.equal(first.body.order.tableName, "Varanda 2");
  assert.ok(first.body.order.acceptedAt);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 1);
  const own = await request("/staff/orders", { headers: { Cookie } });
  assert.equal(own.body.orders.length, 1);
  assert.equal(own.body.orders[0].phone, undefined);
  assert.equal(
    (
      await request("/admin/orders", {
        auth: true,
        method: "POST",
        headers: { "Idempotency-Key": key },
        body,
      })
    ).status,
    409,
  );
  await request("/admin/staff", {
    method: "PUT",
    auth: true,
    body: { enabled: false },
  });
  assert.equal(
    (await request("/staff/orders", { headers: { Cookie } })).status,
    401,
  );
  assert.equal((await request("/admin/orders", { auth: true })).status, 200);
});

test("gestor aceita diretamente mesmo com cardápio pausado e valida os preços", async (t) => {
  const { request, db } = await fixture(t);
  await request("/admin/store", {
    method: "PATCH",
    auth: true,
    body: { open: false, minimumOrder: 99999 },
  });
  const body = orderBody({
    phone: "",
    fulfillment: "pickup",
    payment: "pending",
  });
  const r = await request("/admin/orders", {
    auth: true,
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.source, "manager");
  assert.equal(r.body.order.status, "preparing");
  assert.equal(r.body.order.total, 4980);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 1);
  const bad = await request("/admin/orders", {
    auth: true,
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: { ...body, expectedTotal: 1 },
  });
  assert.equal(bad.status, 409);
});

test("categorias podem ser ordenadas e renomeadas sem mudar o histórico", async (t) => {
  const { request } = await fixture(t);
  const created = await create(request),
    oldName = created.body.order.items[0].category;
  assert.equal(
    (
      await request("/admin/categories", {
        method: "POST",
        auth: true,
        body: { name: "Sobremesas" },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("/admin/categories", {
        method: "POST",
        auth: true,
        body: { name: "sobremesas" },
      })
    ).status,
    409,
  );
  let categories = (await request("/catalog")).body.categories;
  const reversed = categories.map((c) => c.id).reverse();
  assert.equal(
    (
      await request("/admin/categories/order", {
        method: "PUT",
        auth: true,
        body: { ids: reversed },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await request("/catalog")).body.categories.map((c) => c.id),
    reversed,
  );
  assert.equal(
    (
      await request("/admin/categories/order", {
        method: "PUT",
        auth: true,
        body: { ids: [reversed[0], reversed[0]] },
      })
    ).status,
    409,
  );
  const burgers = categories.find((c) => c.name === oldName);
  assert.equal(
    (
      await request(`/admin/categories/${burgers.id}`, {
        method: "PATCH",
        auth: true,
        body: { name: "Lanches" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/catalog")).body.products.find(
      (p) => p.id === "brasa-classico",
    ).category,
    "Lanches",
  );
  assert.equal(
    (await request("/admin/orders", { auth: true })).body.orders[0].items[0]
      .category,
    oldName,
  );
  assert.equal(
    (
      await request(`/admin/categories/${burgers.id}`, {
        method: "DELETE",
        auth: true,
      })
    ).status,
    409,
  );
  const dessert = categories.find((c) => c.name === "Sobremesas");
  const product = {
    name: "Pudim",
    description: "Fatia",
    category: "Sobremesas",
    price: 900,
    station: "Cozinha",
    art: "burger",
  };
  assert.equal(
    (
      await request("/admin/products", {
        method: "POST",
        auth: true,
        body: { ...product, category: "Não cadastrada" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/admin/products", {
        method: "POST",
        auth: true,
        body: product,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(`/admin/categories/${dessert.id}`, {
        method: "DELETE",
        auth: true,
      })
    ).status,
    409,
  );
});

test("modelos por saída são persistidos e usados pela prévia e fila", async (t) => {
  const { request } = await fixture(t);
  const target = {
    id: "geral",
    label: "Expedição",
    station: "*",
    deviceName: "ELGIN i8",
    width: 80,
    enabled: true,
    options: {
      preset: "compact",
      cut: "full",
      topFeed: 0,
      bottomFeed: 1,
      highlightNotes: true,
      footer: "CONFERIR TODOS OS ITENS",
    },
  };
  assert.equal(
    (
      await request("/admin/printing/targets", {
        method: "PUT",
        auth: true,
        body: { targets: [target] },
      })
    ).status,
    200,
  );
  const saved = (await request("/admin/printing", { auth: true })).body
    .targets[0];
  assert.equal(saved.options.cut, "full");
  assert.equal(saved.options.fontSize, 12);
  const preview = await request("/admin/printing/preview", {
    method: "POST",
    auth: true,
    body: { target: saved },
  });
  assert.equal(preview.status, 200);
  assert.ok(preview.body.html.includes("CONFERIR TODOS OS ITENS"));
  assert.ok(preview.body.html.includes("FIM DA COMANDA"));
  const o = await request("/admin/orders", {
    method: "POST",
    auth: true,
    headers: { "Idempotency-Key": randomUUID() },
    body: orderBody(),
  });
  const claimed = await request("/admin/printing/claim", {
    method: "POST",
    auth: true,
    body: { agentId: "pc" },
  });
  assert.equal(claimed.body.job.order.id, o.body.order.id);
  assert.equal(claimed.body.job.target.options.footer, target.options.footer);
});
