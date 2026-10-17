import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createApplication } from "../server/app.mjs";
import { readOrder, readStore, readPrintTarget } from "../server/database.mjs";
import receipt from "../shared/receipt.cjs";
import routes from "../shared/routes.cjs";
import csv from "../shared/catalog-csv.cjs";
const demo = JSON.parse(
  readFileSync(
    new URL("../examples/cardapio-demonstracao.json", import.meta.url),
  ),
);
async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "pronto-local-"));
  const { app, db, communications } = createApplication({
    dataDir: directory,
    adminPassword: "senha-local-apenas-para-testes",
    webDir: "/tmp/sem-web-pronto-local",
    ...options,
  });
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  let token = "";
  async function rq(path, method = "GET", body, options = {}) {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(options.auth === false ? {} : { Authorization: "Bearer " + token }),
        ...options.headers,
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json(), headers: r.headers };
  }
  token = (
    await rq(
      "/auth/login",
      "POST",
      { password: "senha-local-apenas-para-testes" },
      { headers: { "X-Pronto-Desktop": "1" } },
    )
  ).body.desktopToken;
  t.after(async () => {
    await communications.stop();
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const send = (items, options = {}) =>
    rq(
      options.internal ? "/admin/orders" : "/orders",
      "POST",
      {
        customerName: "Cliente de teste",
        phone: "11911112222",
        fulfillment: "pickup",
        payment: "card",
        items,
        ...options.body,
      },
      {
        headers: { "Idempotency-Key": options.key || randomUUID() },
        ...options.auth,
      },
    );
  const move = (o, status) =>
    rq("/admin/orders/" + o.id + "/status", "PATCH", {
      status,
      expectedStatus: o.status,
    });
  return { rq, db, directory, base, send, move };
}
async function importDemo(f) {
  assert.equal(
    (await f.rq("/admin/catalog/import", "POST", { catalog: demo })).status,
    200,
  );
  assert.equal(
    (
      await f.rq("/admin/catalog/kitchens", "PUT", {
        potatoCategories: demo.categories
          .filter((c) => /Batatas|Porções|Pastéis/.test(c.name))
          .map((c) => c.name),
      })
    ).status,
    200,
  );
}
const item = (productId, quantity = 1) => ({ productId, quantity });
test("combo e avulso disputam o mesmo estoque; rollback completo e devolução única antes do aceite", async (t) => {
  const f = await fixture(t);
  await importDemo(f);
  await f.rq("/admin/products/demo-batata/stock", "PUT", {
    quantity: 3,
    expectedVersion: 0,
  });
  let r = await f.send([item("demo-combo-bacon", 2), item("demo-batata", 2)]);
  assert.equal(r.status, 409);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
  const key = randomUUID();
  r = await f.send([item("demo-combo-bacon", 2)], { key });
  assert.equal(r.status, 201);
  const o = r.body.order;
  assert.equal(o.total, 9980);
  assert.equal(o.items[0].components.length, 3);
  assert.equal(
    f.db
      .prepare("SELECT stock_quantity FROM products WHERE id='demo-batata'")
      .get().stock_quantity,
    1,
  );
  assert.equal(
    (await f.send([item("demo-combo-bacon", 2)], { key })).body.repeated,
    true,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 0);
  assert.equal((await f.move(o, "cancelled")).status, 200);
  await f.move({ ...o, status: "cancelled" }, "cancelled");
  assert.equal(
    f.db
      .prepare("SELECT stock_quantity FROM products WHERE id='demo-batata'")
      .get().stock_quantity,
    3,
  );
});
test("combo abre a via da outra cozinha, conta 2 comandas e guarda a receita antiga", async (t) => {
  const f = await fixture(t);
  await importDemo(f);
  const o = (
    await f.send([item("demo-combo-bacon", 2)], {
      internal: true,
      body: { printAtCounter: true },
    })
  ).body.order;
  const jobs = f.db
    .prepare("SELECT * FROM print_jobs WHERE order_id=?")
    .all(o.id);
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every((j) => j.batch_count === 2));
  const batata = readPrintTarget(
    f.db.prepare("SELECT * FROM print_targets WHERE id='batata'").get(),
  );
  const text = receipt
    .receiptBlocks(readOrder(f.db, o.id), readStore(f.db), batata, {
      receipt: { count: 2, index: 2 },
    })
    .blocks.map((b) => b.text)
    .join("\n");
  assert.match(text, /2 COMANDAS/);
  assert.match(text, /2x Batata maluca/);
  assert.match(text, /REF. DO COMBO/);
  assert.match(text, /BEBIDAS/);
  assert.match(text, /OUTRA COZINHA/);
  f.db
    .prepare(
      "UPDATE products SET name='Nome novo',station='Outro setor' WHERE id='demo-batata'",
    )
    .run();
  assert.equal(
    readOrder(f.db, o.id).items[0].components[0].name,
    "Batata maluca — demonstração",
  );
  assert.equal(
    readOrder(f.db, o.id).items[0].components[0].station,
    "Cozinha Batata",
  );
});
test("combo inválido não altera catálogo; ida e volta preserva componentes e ordem", async (t) => {
  const f = await fixture(t);
  await importDemo(f);
  const exported = (await f.rq("/admin/catalog/export")).body;
  assert.equal(
    exported.products.find((p) => p.id === "demo-combo-bacon").components
      .length,
    3,
  );
  const bad = structuredClone(exported);
  bad.products.find((p) => p.id === "demo-combo-bacon").components = [
    { productId: "demo-combo-bacon", quantity: 1 },
  ];
  assert.equal(
    (
      await f.rq("/admin/catalog/import", "POST", {
        catalog: bad,
        dryRun: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.rq("/admin/catalog/import", "POST", { catalog: bad })).status,
    400,
  );
  assert.equal(
    (
      await f.rq("/admin/catalog/import", "POST", {
        catalog: exported,
        dryRun: true,
      })
    ).status,
    200,
  );
  const combo = (await f.rq("/catalog")).body.products.find(
    (p) => p.id === "demo-combo-bacon",
  );
  assert.equal(combo.stockRequirements[1].stockQuantity, null);
  await f.rq("/admin/products/demo-refri", "PATCH", { available: false });
  assert.equal(
    (await f.rq("/catalog")).body.products.some((p) => p.id === combo.id),
    false,
  );
});
test("mesa soma vários atendentes e protege encerramento e rascunho antigo", async (t) => {
  const f = await fixture(t);
  const o1 = (
    await f.send([item("brasa-classico")], {
      internal: true,
      body: { fulfillment: "dinein", tableName: "12" },
    })
  ).body.order;
  const old = (await f.rq("/admin/tables")).body.tables[0];
  const o2 = (
    await f.send([item("bacon-da-casa")], {
      internal: true,
      body: { fulfillment: "dinein", tableName: "12", tableSessionId: old.id },
    })
  ).body.order;
  assert.equal(o1.tableSessionId, o2.tableSessionId);
  let table = (await f.rq("/admin/tables")).body.tables[0];
  assert.equal(table.total, 5480);
  const close = (table) =>
    f.rq(`/admin/tables/${table.id}/close`, "POST", {
      expectedVersion: table.version,
      expectedTotal: table.total,
      payment: "mixed",
      received: true,
    });
  assert.equal((await close(old)).status, 409);
  assert.equal((await close(table)).status, 409);
  for (const o of [o1, o2]) {
    const ready = (await f.move(o, "ready")).body.order;
    await f.move(ready, "completed");
  }
  assert.equal((await close(table)).status, 200);
  assert.equal(
    (
      await f.send([item("agua")], {
        internal: true,
        body: {
          fulfillment: "dinein",
          tableName: "12",
          tableSessionId: old.id,
        },
      })
    ).status,
    409,
  );
  const newOrder = (
    await f.send([item("agua")], {
      internal: true,
      body: { fulfillment: "dinein", tableName: "12" },
    })
  ).body.order;
  assert.notEqual(newOrder.tableSessionId, old.id);
  assert.equal((await f.rq("/admin/tables")).body.tables[0].total, 450);
  assert.equal(
    (await f.rq("/staff/tables", "GET", undefined, { auth: false })).status,
    401,
  );
});
async function courier(f) {
  const id = (
    await f.rq("/admin/couriers", "POST", {
      name: "Motoboy teste",
      pin: "123456",
    })
  ).body.id;
  const login = await f.rq(
    "/courier/login",
    "POST",
    { id, pin: "123456" },
    { auth: false },
  );
  return { id, cookie: login.headers.get("set-cookie").split(";")[0] };
}
async function delivery(f, driver, address = "Rua A, 10, Bairro, Cidade") {
  const o = (
    await f.send([item("agua")], {
      internal: true,
      body: { fulfillment: "delivery", address },
    })
  ).body.order;
  await f.rq(`/admin/orders/${o.id}/assign`, "POST", {
    courierId: driver.id,
    expectedVersion: 0,
  });
  await f.move(o, "ready");
  return o;
}
test("entrega reconcilia confirmação repetida sem duplicar eventos ou recebimento", async (t) => {
  const f = await fixture(t),
    d = await courier(f),
    o = await delivery(f, d);
  const post = (body) =>
    f.rq(`/courier/orders/${o.id}/status`, "POST", body, {
      auth: false,
      cookie: d.cookie,
    });
  const pickup = {
    status: "picked_up",
    expectedVersion: 1,
    requestId: randomUUID(),
  };
  assert.equal((await post(pickup)).status, 200);
  assert.equal((await post(pickup)).body.repeated, true);
  const body = {
    status: "delivered",
    expectedVersion: 2,
    requestId: randomUUID(),
    paymentReceived: true,
    recipient: "Maria",
  };
  const result = await Promise.all([post(body), post(body)]);
  assert.ok(result.every((r) => r.status === 200));
  assert.equal(
    f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM delivery_events WHERE order_id=? AND status='delivered'",
      )
      .get(o.id).n,
    1,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM delivery_receipts").get().n,
    1,
  );
  assert.equal((await post({ ...body, recipient: "Outro" })).status, 409);
});
test("ação pendente do motoboy antigo não se aplica após reatribuição; ponto é por telefone e endereço", async (t) => {
  const f = await fixture(t),
    d = await courier(f),
    other = await courier(f),
    o = await delivery(f, d);
  const endpoint = `/courier/orders/${o.id}`;
  assert.equal(
    (
      await f.rq(
        endpoint + "/location",
        "POST",
        {
          latitude: -12,
          longitude: -40,
          reference: "Portão azul",
          confirmed: true,
        },
        { auth: false, cookie: d.cookie },
      )
    ).status,
    200,
  );
  const nextAddress = await delivery(f, d, "Outra rua, 99, Bairro, Cidade");
  const list = (
    await f.rq("/courier/orders", "GET", undefined, {
      auth: false,
      cookie: d.cookie,
    })
  ).body.orders;
  assert.equal(list.find((x) => x.id === nextAddress.id).location, null);
  assert.equal(
    list.find((x) => x.id === o.id).location.reference,
    "Portão azul",
  );
  await f.rq(`/admin/orders/${o.id}/assign`, "POST", {
    courierId: other.id,
    expectedVersion: 1,
  });
  assert.equal(
    (
      await f.rq(
        endpoint + "/status",
        "POST",
        { status: "picked_up", expectedVersion: 1, requestId: randomUUID() },
        { auth: false, cookie: d.cookie },
      )
    ).status,
    404,
  );
});
test("backup verificado restaura dados sem reexecutar impressão nem sessão antiga", async (t) => {
  const f = await fixture(t);
  await f.send([item("brasa-classico")], { internal: true });
  const result = await f.rq("/admin/backups", "POST");
  assert.equal(result.status, 201);
  assert.equal(result.body.verified, true);
  const file = join(f.directory, "backups", result.body.name),
    snapshot = new DatabaseSync(file, { readOnly: true });
  assert.equal(
    snapshot.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  snapshot.close();
  const target = join(f.directory, "restaurado");
  execFileSync(
    process.execPath,
    ["scripts/restore-backup.mjs", file, target, "--gestor-fechado"],
    { cwd: resolve(".") },
  );
  const restored = new DatabaseSync(join(target, "pronto.sqlite"));
  assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
  assert.equal(
    restored
      .prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE state='pending'")
      .get().n,
    0,
  );
  assert.equal(
    restored.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
    0,
  );
  restored.close();
  assert.equal(
    (await f.rq("/admin/backups", "GET", undefined, { auth: false })).status,
    401,
  );
});
test("planilha conserva aspas e preços e roteia pastéis, batatas e porções", () => {
  const result = csv.catalogFromCsv(
    'categoria;nome;descricao;preco;cozinha\nPastéis;Pastel carne;"Carne; molho";12,90;\nBatatas;Batata P;;15,00;\nPorções;Salgadinhos;;20,00;\nBebidas;Água;;4.50;',
  );
  assert.deepEqual(
    result.products.map((p) => p.price),
    [1290, 1500, 2000, 450],
  );
  assert.equal(result.products[0].description, "Carne; molho");
  assert.deepEqual(
    result.products.map((p) => p.station),
    ["Cozinha Batata", "Cozinha Batata", "Cozinha Batata", "Cozinha"],
  );
  assert.throws(() =>
    csv.catalogFromCsv("categoria;nome;preco\nBebidas;Água;NaN"),
  );
});
test("rota por proximidade conserva pedidos sem ponto e não perde nem duplica paradas", () => {
  const a = { id: "a", location: { latitude: 0, longitude: 0 } },
    b = { id: "b", location: { latitude: 0, longitude: 10 } },
    c = { id: "c", location: null };
  assert.deepEqual(
    routes
      .nearestRoute([b, c, a], { latitude: 0, longitude: 1 })
      .map((x) => x.id),
    ["a", "b", "c"],
  );
});

test("catálogo fornecido Loja Dos Sonhos: 79 preços, 15 categorias e combos por cozinha sem inventar porções", async (t) => {
  const f = await fixture(t),
    catalog = JSON.parse(
      readFileSync(
        new URL("../catalogos/loja-dos-sonhos/cardapio.json", import.meta.url),
      ),
    );
  assert.equal(catalog.products.length, 79);
  assert.equal(catalog.categories.length, 15);
  assert.equal(
    catalog.products.some((p) => p.category === "SALGADOS"),
    false,
  );
  const body = {
    catalog,
    dryRun: true,
    replaceActive: true,
    applyStoreInfo: true,
  };
  const preview = await f.rq("/admin/catalog/import", "POST", body);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.summary.archived, 9);
  assert.equal(readStore(f.db).name, "Brasa da Casa");
  assert.equal(
    (await f.rq("/admin/catalog/import", "POST", { ...body, dryRun: false }))
      .status,
    200,
  );
  const products = (await f.rq("/catalog")).body.products;
  assert.equal(products.length, 79);
  assert.equal(readStore(f.db).name, "Loja Dos Sonhos");
  assert.equal(readStore(f.db).estimatedMinimumMinutes, 60);
  assert.equal(readStore(f.db).estimatedMinutes, 90);
  for (const p of products)
    if (
      ["PASTEIS", "BATATA FRITA", "BATATA DOS SONHOS", "PORÇÕES"].includes(
        p.category,
      )
    )
      assert.equal(p.station, "Cozinha Batata");
  const combo = products.find(
    (p) => p.name === "COMBO EXPLOSÃO DE BACON - 2 GUARAVITAS",
  );
  assert.equal(combo.price, 3999);
  assert.equal(
    combo.components.find((c) => c.name === "Batata maluca P").preparation,
    true,
  );
  assert.equal(combo.components.find((c) => c.name === "X-BACON").quantity, 2);
  const categories = catalog.categories
    .filter((c) =>
      ["PASTEIS", "BATATA FRITA", "BATATA DOS SONHOS", "PORÇÕES"].includes(
        c.name,
      ),
    )
    .map((c) => c.name);
  await f.rq("/admin/catalog/kitchens", "PUT", {
    potatoCategories: categories,
  });
  const sent = await f.send([item(combo.id)], { internal: true });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.order.total, 3999);
  assert.equal(
    f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM print_jobs WHERE order_id=? AND purpose='production'",
      )
      .get(sent.body.order.id).n,
    2,
  );
  const exported = (await f.rq("/admin/catalog/export")).body;
  assert.equal(
    (
      await f.rq("/admin/catalog/import", "POST", {
        catalog: exported,
        dryRun: true,
      })
    ).status,
    200,
  );
});

test("categoria dos acompanhamentos de combo também recebe a caixa configurada", async (t) => {
  const f = await fixture(t);
  await importDemo(f);
  const o = (await f.send([item("demo-combo-bacon")], { internal: true })).body
    .order;
  const target = {
    id: "all",
    width: 80,
    station: "*",
    filter: { mode: "all", values: [] },
    options: {
      categoryHighlights: [
        { category: "Demonstração • Bebidas", scope: "category", style: "box" },
      ],
    },
  };
  const blocks = receipt.receiptBlocks(
    readOrder(f.db, o.id),
    readStore(f.db),
    target,
  ).blocks;
  const start = blocks.findIndex(
    (b) => b.kind === "group-start" && b.text.includes("BEBIDAS"),
  );
  assert.ok(start >= 0);
  assert.equal(blocks[start + 1].text, "- 1x Refrigerante lata — demonstração");
  assert.equal(blocks[start + 2].kind, "group-end");
});
