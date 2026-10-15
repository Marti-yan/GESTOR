import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrintAgent } = require("../desktop/print-agent.cjs");
const { renderReceipt, testOrder } = require("../shared/receipt.cjs");

test("comanda Elgin 80 mm escapa texto e separa setores sem vazar endereço para cozinha", () => {
  const order = testOrder();
  order.customerName = "<script>alert(1)</script>";
  order.address = "Endereço privado";
  order.fulfillment = "delivery";
  order.items.push({
    name: "Refrigerante",
    price: 690,
    quantity: 1,
    station: "Bar",
    notes: "",
  });
  const kitchen = renderReceipt(
    order,
    { name: "Minha loja" },
    { width: 80, station: "Cozinha", label: "Cozinha" },
  );
  assert.match(kitchen, /@page\{size:80mm auto/);
  assert.ok(!kitchen.includes("<script>"));
  assert.ok(kitchen.includes("&lt;script&gt;"));
  assert.ok(!kitchen.includes("Endereço privado"));
  assert.ok(!kitchen.includes("Refrigerante"));
  assert.ok(kitchen.includes("Sem cebola"));
  const general = renderReceipt(
    order,
    { name: "Minha loja" },
    { width: 80, station: "*", label: "Geral" },
  );
  assert.ok(general.includes("Endereço privado"));
  assert.ok(general.includes("Refrigerante"));
});
test("impressão bem-sucedida usa um efeito físico e grava o aceite antes de confirmar ao servidor", async () => {
  let journal = {},
    physical = 0;
  const calls = [];
  let offered = false;
  const agent = new PrintAgent({
    loadJournal: () => journal,
    saveJournal: (value) => {
      journal = structuredClone(value);
    },
    api: async (path, method, body) => {
      calls.push(path);
      if (path.endsWith("/claim")) {
        if (offered) return { job: null };
        offered = true;
        return {
          job: {
            id: "job-1",
            claimToken: "token",
            target: {},
            order: {},
            store: {},
          },
        };
      }
      if (path.endsWith("/result"))
        assert.equal(journal["job-1"].state, "spooled");
      return { ok: true };
    },
    print: async () => {
      assert.equal(journal["job-1"].state, "printing");
      physical++;
    },
  });
  await Promise.all([agent.tick(), agent.tick()]);
  await agent.tick();
  assert.equal(physical, 1);
  assert.ok(journal["job-1"].acknowledged);
  assert.ok(
    calls.indexOf("/admin/printing/jobs/job-1/start") <
      calls.indexOf("/admin/printing/jobs/job-1/result"),
  );
});
test("falha na confirmação após impressão é recuperada sem imprimir novamente", async () => {
  let journal = {},
    physical = 0,
    offered = false,
    failed = false;
  const api = async (path) => {
    if (path.endsWith("/claim")) {
      if (offered) return { job: null };
      offered = true;
      return {
        job: {
          id: "job-2",
          claimToken: "token",
          target: {},
          order: {},
          store: {},
        },
      };
    }
    if (path.endsWith("/result") && !failed) {
      failed = true;
      throw new Error("Sem conexão");
    }
    return { ok: true };
  };
  const options = {
    api,
    loadJournal: () => journal,
    saveJournal: (value) => {
      journal = structuredClone(value);
    },
    print: async () => {
      physical++;
    },
  };
  await new PrintAgent(options).tick();
  assert.equal(journal["job-2"].state, "spooled");
  assert.equal(journal["job-2"].acknowledged, false);
  await new PrintAgent(options).tick();
  assert.equal(physical, 1);
  assert.equal(journal["job-2"].acknowledged, true);
});
test("reinício durante o efeito físico pede conferência e não gera uma segunda via automaticamente", async () => {
  let journal = {
      "job-3": { state: "printing", claimToken: "token", acknowledged: false },
    },
    physical = 0;
  const reports = [];
  const agent = new PrintAgent({
    loadJournal: () => journal,
    saveJournal: (value) => {
      journal = structuredClone(value);
    },
    print: async () => {
      physical++;
    },
    api: async (path, method, body) => {
      if (path.endsWith("/claim")) return { job: null };
      reports.push(body);
      return { ok: true };
    },
  });
  await agent.tick();
  assert.equal(physical, 0);
  assert.equal(reports[0].state, "uncertain");
  assert.equal(journal["job-3"].acknowledged, true);
});
