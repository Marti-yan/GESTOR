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
    return { status: response.status, body: await response.json() };
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
  assert.equal(dashboard.body.orders[0].printJobs.length, 1);
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
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 1);
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
    body: { status: "cancelled", expectedStatus: "new" },
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
