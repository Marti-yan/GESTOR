import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
await build({
  stdin: {
    contents:
      'export { App } from "./src/App"; export { OrderEntry } from "./src/Staff"; export { useCourierQueue } from "./src/useCourierQueue"; export { productSelectionLimit } from "./src/stockLimits";',
    resolveDir: resolve("."),
    loader: "tsx",
  },
  outfile: ".runtime/ui-tests.cjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  loader: { ".css": "empty" },
});
const React = require("react");
const catalog = {
  store: {
    name: "Loja teste",
    subtitle: "Cardápio rápido",
    phone: "",
    open: true,
    deliveryFee: 0,
    minimumOrder: 0,
    estimatedMinutes: 30,
    allowDelivery: true,
    allowPickup: true,
  },
  products: [
    {
      id: "burger",
      name: "Lanche teste",
      description: "Feito na hora",
      category: "Lanches",
      price: 1990,
      available: true,
      station: "Cozinha",
      art: "burger",
      featured: false,
      stockQuantity: 3,
      modifierGroups: [],
    },
  ],
  categories: [{ id: "lanches", name: "Lanches", sort: 0 }],
};
function dom(t, body = '<div id="root"></div>') {
  const dom = new JSDOM(body, {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const prior = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    prior.set(name, Object.getOwnPropertyDescriptor(global, name));
    Object.defineProperty(global, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const fetchBefore = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/catalog")) return Response.json(catalog);
    throw Error("Sem rede");
  };
  const { createRoot, hydrateRoot } = require("react-dom/client"),
    { act } = React;
  t.after(() => {
    global.fetch = fetchBefore;
    dom.window.close();
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
  });
  return {
    dom,
    root: document.getElementById("root"),
    createRoot,
    hydrateRoot,
    act,
  };
}
const click = async (act, button) =>
  act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
test("garçom confirma adição no +, salva rascunho e bloqueia acima do saldo", async (t) => {
  const env = dom(t),
    { OrderEntry } = require("../.runtime/ui-tests.cjs");
  const root = env.createRoot(env.root);
  try {
    await env.act(async () =>
      root.render(
        React.createElement(OrderEntry, {
          mode: "waiter",
          onCreated: () => {},
        }),
      ),
    );
    const category = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Lanches"),
    );
    await click(env.act, category);
    let product = document.querySelector(".entry-product");
    await click(env.act, product);
    assert.match(product.textContent, /\+1 adicionado/);
    await click(env.act, product);
    await click(env.act, product);
    assert.equal(product.disabled, true);
    assert.equal(
      JSON.parse(localStorage.getItem("pronto-entry-waiter")).lines[0].quantity,
      3,
    );
  } finally {
    await env.act(async () => root.unmount());
  }
});
test("primeiro HTML hidrata sem apagar o cardápio e restaura o carrinho após hidratar", async (t) => {
  const { renderToString } = require("react-dom/server"),
    { App } = require("../.runtime/ui-tests.cjs");
  const html = renderToString(
    React.createElement(App, { initialCatalog: catalog, initialRoute: "/" }),
  );
  assert.match(html, /Lanche teste/);
  assert.doesNotMatch(html, /Carregando o cardápio/);
  const env = dom(t, `<div id="root">${html}</div>`);
  localStorage.setItem(
    "pronto-cart",
    JSON.stringify([
      { product: catalog.products[0], quantity: 1, notes: "", key: "test" },
    ]),
  );
  const errors = [];
  let root;
  try {
    await env.act(async () => {
      root = env.hydrateRoot(
        env.root,
        React.createElement(App, {
          initialCatalog: catalog,
          initialRoute: "/",
        }),
        { onRecoverableError: (e) => errors.push(e.message) },
      );
    });
    assert.deepEqual(errors, []);
    assert.match(
      document.querySelector(".cart-panel").textContent,
      /Lanche teste/,
    );
    assert.equal(JSON.parse(localStorage.getItem("pronto-cart")).length, 1);
  } finally {
    if (root) await env.act(async () => root.unmount());
  }
});
test("fila do entregador mantém pendência offline e reenvia o mesmo identificador", async (t) => {
  const env = dom(t),
    { useCourierQueue } = require("../.runtime/ui-tests.cjs");
  let online = false,
    queue;
  Object.defineProperty(navigator, "onLine", {
    get: () => online,
    configurable: true,
  });
  let calls = [];
  global.fetch = async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) throw Error("Resposta perdida");
    return Response.json({ ok: true, repeated: true });
  };
  function Harness() {
    queue = useCourierQueue("motoboy-a", async () => {});
    return React.createElement("span", null, queue.commands.length);
  }
  const root = env.createRoot(env.root);
  try {
    await env.act(async () => root.render(React.createElement(Harness)));
    await env.act(async () =>
      queue.enqueue({
        orderId: "order-a",
        number: 1,
        status: "delivered",
        expectedVersion: 2,
        notes: "",
      }),
    );
    assert.equal(calls.length, 0);
    const pending = JSON.parse(
      localStorage.getItem("pronto-delivery-queue-motoboy-a"),
    );
    assert.equal(pending.length, 1);
    online = true;
    await env.act(async () => queue.sync());
    assert.equal(queue.commands.length, 1);
    await env.act(async () => queue.sync());
    assert.equal(queue.commands.length, 0);
    assert.equal(calls[0].requestId, calls[1].requestId);
  } finally {
    await env.act(async () => root.unmount());
  }
});
test("seleção limita combo quando item avulso já consome o mesmo acompanhamento", () => {
  const { productSelectionLimit } = require("../.runtime/ui-tests.cjs");
  const fries = {
    id: "f",
    stockQuantity: 3,
    stockRequirements: [{ productId: "f", quantity: 1, stockQuantity: 3 }],
  };
  const combo = {
    id: "c",
    stockRequirements: [
      { productId: "c", quantity: 1, stockQuantity: null },
      { productId: "f", quantity: 2, stockQuantity: 3 },
    ],
  };
  assert.equal(
    productSelectionLimit(
      combo,
      [fries, combo],
      [{ productId: "f", quantity: 2 }],
    ),
    0,
  );
  assert.equal(
    productSelectionLimit(
      fries,
      [fries, combo],
      [{ productId: "c", quantity: 1 }],
    ),
    1,
  );
});
