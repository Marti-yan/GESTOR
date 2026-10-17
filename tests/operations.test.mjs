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
const orderBody = (items = [{ productId: "brasa-classico", quantity: 1 }]) => ({
  customerName: "Cliente teste",
  phone: "11999999999",
  fulfillment: "pickup",
  payment: "card",
  items,
});
const send = (
  request,
  body = orderBody(),
  key = randomUUID(),
  internal = false,
) =>
  request(internal ? "/admin/orders" : "/orders", {
    auth: internal,
    method: "POST",
    headers: { "Idempotency-Key": key },
    body,
  });
const adjust = (request, id, quantity, version = 0) =>
  request("/admin/products/" + id + "/stock", {
    auth: true,
    method: "PUT",
    body: { quantity, expectedVersion: version, reason: "Reposição de teste" },
  });
const move = (request, order, status) =>
  request("/admin/orders/" + order.id + "/status", {
    auth: true,
    method: "PATCH",
    body: { status, expectedStatus: order.status },
  });

test("estoque: dez envios concorrentes disputam três unidades sem exceder limite", async (t) => {
  const { request, db } = await fixture(t);
  assert.equal((await adjust(request, "brasa-classico", 3)).status, 200);
  const results = await Promise.all(
    Array.from({ length: 10 }, () => send(request)),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 3);
  assert.equal(results.filter((r) => r.status === 409).length, 7);
  assert.equal(
    db
      .prepare("SELECT stock_quantity FROM products WHERE id='brasa-classico'")
      .get().stock_quantity,
    0,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 0);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM stock_movements WHERE order_id IS NOT NULL",
      )
      .get().n,
    3,
  );
});

test("estoque: soma linhas do mesmo produto, rollback de cesta, idempotência e ajuste obsoleto", async (t) => {
  const { request, db } = await fixture(t);
  await adjust(request, "brasa-classico", 3);
  await adjust(request, "agua", 0);
  const tooMany = await send(
    request,
    orderBody([
      { productId: "brasa-classico", quantity: 2 },
      { productId: "brasa-classico", quantity: 2, notes: "sem sal" },
    ]),
  );
  assert.equal(tooMany.status, 409);
  assert.equal(
    (
      await send(
        request,
        orderBody([
          { productId: "brasa-classico", quantity: 2 },
          { productId: "agua", quantity: 1 },
        ]),
      )
    ).status,
    409,
  );
  assert.equal(
    db
      .prepare("SELECT stock_quantity FROM products WHERE id='brasa-classico'")
      .get().stock_quantity,
    3,
  );
  const key = randomUUID(),
    result = await send(request, orderBody(), key);
  assert.equal(result.status, 201);
  assert.equal((await send(request, orderBody(), key)).body.repeated, true);
  assert.equal(
    db
      .prepare("SELECT stock_quantity FROM products WHERE id='brasa-classico'")
      .get().stock_quantity,
    2,
  );
  assert.equal((await adjust(request, "brasa-classico", 50, 1)).status, 409);
  assert.equal((await adjust(request, "brasa-classico", -1, 2)).status, 400);
  assert.equal((await request("/admin/stock")).status, 401);
});

test("estoque: cancelamento novo devolve uma vez; preparo cancelado não repõe ingrediente", async (t) => {
  const { request, db } = await fixture(t);
  await adjust(request, "brasa-classico", 3);
  const a = (await send(request)).body.order;
  assert.equal((await move(request, a, "cancelled")).status, 200);
  assert.equal(
    db
      .prepare("SELECT stock_quantity FROM products WHERE id='brasa-classico'")
      .get().stock_quantity,
    3,
  );
  await move(request, { ...a, status: "cancelled" }, "cancelled");
  assert.equal(
    db
      .prepare("SELECT stock_quantity FROM products WHERE id='brasa-classico'")
      .get().stock_quantity,
    3,
  );
  const b = (await send(request)).body.order;
  const accepted = await move(request, b, "preparing");
  assert.equal(accepted.status, 200);
  assert.equal(
    (await move(request, accepted.body.order, "cancelled")).status,
    200,
  );
  assert.equal(
    db
      .prepare("SELECT stock_quantity FROM products WHERE id='brasa-classico'")
      .get().stock_quantity,
    2,
  );
  const c = await send(request, orderBody(), randomUUID(), true);
  assert.equal(c.status, 201);
  assert.equal(c.body.order.status, "preparing");
  assert.equal(
    db
      .prepare("SELECT stock_quantity FROM products WHERE id='brasa-classico'")
      .get().stock_quantity,
    1,
  );
});

test("endereços: CEP opcional, cidades/bairros, snapshot e privacidade no acompanhamento", async (t) => {
  let calls = 0;
  const { request } = await fixture(t, {
    addressFetch: async (url) => {
      calls++;
      assert.match(url, /viacep.com.br\/ws\/01001000\/json\//);
      return {
        ok: true,
        json: async () => ({
          logradouro: "Praça da Sé",
          bairro: "Sé",
          localidade: "São Paulo",
          uf: "SP",
        }),
      };
    },
  });
  const areas = {
    cities: [
      { name: "São Paulo", state: "sp", neighborhoods: ["Sé", "Centro", "Sé"] },
    ],
  };
  assert.equal(
    (await request("/admin/delivery-areas", { method: "PUT", body: areas }))
      .status,
    401,
  );
  assert.equal(
    (
      await request("/admin/delivery-areas", {
        auth: true,
        method: "PUT",
        body: areas,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await request("/delivery-areas")).body.cities[0].neighborhoods,
    ["Sé", "Centro"],
  );
  assert.equal((await request("/address/cep/abc")).status, 400);
  assert.equal(
    (await request("/address/cep/01001000")).body.street,
    "Praça da Sé",
  );
  await request("/address/cep/01001000");
  assert.equal(calls, 1);
  const deliveryAddress = {
    cep: "",
    street: "Rua sem CEP",
    number: "S/N",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    reference: "Portão azul",
  };
  const r = await send(request, {
    ...orderBody(),
    fulfillment: "delivery",
    deliveryAddress,
  });
  assert.equal(r.status, 201);
  assert.match(r.body.order.address, /Portão azul/);
  const tracked = await request("/track/" + r.body.trackingToken);
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.order.deliveryAddress, undefined);
  assert.equal(tracked.body.order.address, undefined);
  const admin = await request("/admin/orders", { auth: true });
  assert.equal(admin.body.orders[0].deliveryAddress.city, "São Paulo");
  assert.equal(
    (
      await send(request, {
        ...orderBody(),
        fulfillment: "delivery",
        deliveryAddress: { ...deliveryAddress, city: "" },
      })
    ).status,
    400,
  );
});

test("CEP: indisponibilidade e CEP inexistente permitem endereço manual", async (t) => {
  const a = await fixture(t, {
    addressFetch: async () => {
      throw Error("offline");
    },
  });
  assert.equal((await a.request("/address/cep/12345678")).status, 503);
  const b = await fixture(t, {
    addressFetch: async () => ({
      ok: true,
      json: async () => ({ erro: true }),
    }),
  });
  assert.equal((await b.request("/address/cep/12345678")).status, 404);
});

test("relatórios: valores, cancelamentos, filtros por item/cidade e sem duplicar totais", async (t) => {
  const { request, db } = await fixture(t);
  const a = (
    await send(
      request,
      orderBody([
        { productId: "brasa-classico", quantity: 2 },
        { productId: "agua", quantity: 1 },
      ]),
      randomUUID(),
      true,
    )
  ).body.order;
  let r = await move(request, a, "ready");
  assert.equal(r.status, 200);
  r = await move(request, r.body.order, "completed");
  assert.equal(r.status, 200);
  const b = (await send(request)).body.order;
  await move(request, b, "cancelled");
  const addr = {
    street: "Rua teste",
    number: "3",
    city: "Cidade A",
    state: "SP",
    neighborhood: "Centro",
  };
  await send(request, {
    ...orderBody(),
    fulfillment: "delivery",
    deliveryAddress: addr,
  });
  assert.equal((await request("/admin/reports")).status, 401);
  let report = (await request("/admin/reports?offset=180", { auth: true }))
    .body;
  assert.equal(report.summary.orders, 3);
  assert.equal(report.summary.cancelled, 1);
  assert.equal(report.summary.completed, 1);
  assert.equal(report.summary.gross, 4980 + 450 + 2490 + 500);
  assert.equal(report.summary.completedTotal, 5430);
  assert.equal(report.summary.items, 4);
  assert.equal(
    report.groups.product.find((p) => p.label === "Brasa Clássico").quantity,
    3,
  );
  assert.equal(report.durations.complete.samples, 1);
  report = (await request("/admin/reports?product=agua", { auth: true })).body;
  assert.equal(report.summary.orders, 1);
  assert.equal(report.summary.gross, 5430);
  assert.equal(report.groups.product.length, 1);
  assert.equal(report.groups.product[0].total, 450);
  report = (
    await request("/admin/reports?city=Cidade%20A&neighborhood=Centro", {
      auth: true,
    })
  ).body;
  assert.equal(report.summary.orders, 1);
  assert.equal(report.summary.deliveryFees, 500);
  assert.equal(
    (await request("/admin/reports?status=cancelled", { auth: true })).body
      .summary.gross,
    0,
  );
  assert.equal(
    (await request("/admin/reports?from=2026-02-30", { auth: true })).status,
    400,
  );
  assert.equal(
    (await request("/admin/reports?from=2026-99-99", { auth: true })).status,
    400,
  );
  assert.equal(
    (
      await request("/admin/reports?from=2026-10-19&to=2026-10-18", {
        auth: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/admin/reports?status=hack", { auth: true })).status,
    400,
  );
  db.prepare(
    "UPDATE orders SET created_at='2026-10-17T02:59:59.000Z' WHERE id=?",
  ).run(a.id);
  assert.equal(
    (
      await request(
        "/admin/reports?from=2026-10-17&to=2026-10-17&offset=180&status=completed",
        { auth: true },
      )
    ).body.summary.orders,
    0,
  );
  db.prepare(
    "UPDATE orders SET created_at='2026-10-17T03:00:00.000Z' WHERE id=?",
  ).run(a.id);
  assert.equal(
    (
      await request(
        "/admin/reports?from=2026-10-17&to=2026-10-17&offset=180&status=completed",
        { auth: true },
      )
    ).body.summary.orders,
    1,
  );
});

test("pedido anterior à ativação do limite precisa reservar antes de entrar na cozinha", async (t) => {
  const { request, db } = await fixture(t);
  const old = (
    await send(
      request,
      orderBody([{ productId: "brasa-classico", quantity: 2 }]),
    )
  ).body.order;
  await adjust(request, "brasa-classico", 1);
  const result = await move(request, old, "preparing");
  assert.equal(result.status, 409);
  assert.equal(
    db.prepare("SELECT status FROM orders WHERE id=?").get(old.id).status,
    "new",
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 0);
  assert.equal(
    db
      .prepare("SELECT stock_quantity FROM products WHERE id='brasa-classico'")
      .get().stock_quantity,
    1,
  );
});
