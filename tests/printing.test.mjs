import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
const require = createRequire(import.meta.url);
const { PrintAgent } = require("../desktop/print-agent.cjs");
const {
  renderReceipt,
  renderEscPos,
  normalizeReceiptOptions,
  wrapText,
  testOrder,
} = require("../shared/receipt.cjs");
const { printRaw } = require("../desktop/raw-print.cjs");
const iconv = require("iconv-lite");

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
  assert.match(kitchen, /body\{width:80mm/);
  assert.ok(!kitchen.includes("<script>"));
  assert.ok(kitchen.includes("&lt;script&gt;"));
  assert.ok(!kitchen.includes("Endereço privado"));
  assert.ok(!kitchen.includes("Refrigerante"));
  assert.ok(kitchen.includes("SEM CEBOLA"));
  assert.ok(!kitchen.includes("DEVOLVER:"));
  assert.ok(!kitchen.includes("R$"));
  const general = renderReceipt(
    order,
    { name: "Minha loja" },
    { width: 80, station: "*", label: "Geral" },
  );
  assert.ok(general.includes("Endereço privado"));
  assert.ok(general.includes("Refrigerante"));
});

test("ESC/POS inclui todos os itens, troco e fim antes de um único corte", () => {
  const data = renderEscPos(
    testOrder(),
    { name: "Lanchonete São João" },
    { width: 80, station: "*", options: { bottomFeed: 0 } },
  );
  assert.deepEqual([...data.subarray(0, 2)], [27, 64]);
  assert.deepEqual([...data.subarray(-4)], [29, 86, 66, 0]);
  const cutPositions = [];
  for (let n = 0; n < data.length - 1; n++)
    if (data[n] === 29 && data[n + 1] === 86) cutPositions.push(n);
  assert.deepEqual(cutPositions, [data.length - 4]);
  const text = iconv.decode(data, "cp860");
  for (const content of [
    "Lanchonete São João",
    "MESA 12",
    "SENHA A123",
    "3x Brasa Clássico",
    "SEM CEBOLA",
    "2x Refrigerante",
    "Água Mineral",
    "TROCO PARA:",
    "DEVOLVER:",
    "39,50",
    "FIM DA COMANDA #123",
  ])
    assert.ok(text.includes(content), content);
  assert.ok(text.indexOf("BEBIDAS") > text.indexOf("Brasa"));
  assert.ok(!data.includes(Buffer.from([27, 100]))); // Não avança papel no início.
});

test("comanda longa de 58 mm mantém o último item e notas sem injetar controles", () => {
  const order = testOrder();
  order.customerName = "Nome\x1d\x56\x41\x00\x0c";
  order.items = Array.from({ length: 40 }, (_, i) => ({
    name: `Item ${i + 1} de nome longo com vários detalhes`,
    quantity: 2,
    price: 100,
    station: "Cozinha",
    notes: "Observação longa ".repeat(14),
    category: "Lanches",
  }));
  const data = renderEscPos(
    order,
    { name: "Loja" },
    {
      width: 58,
      station: "*",
      options: { codepage: "ascii", leftPadding: 2, cut: "none" },
    },
  );
  const text = data.toString("ascii");
  assert.ok(text.includes("Item 40"));
  assert.ok(text.includes("FIM DA COMANDA #123"));
  assert.ok(!data.includes(Buffer.from([29, 86])));
  assert.ok(!data.includes(12));
  const stripped = text
    .replace(/\x1b[@]/g, "")
    .replace(/\x1b[taEM3dJ][\s\S]/g, "")
    .replace(/\x1d[!B][\s\S]/g, "");
  assert.ok(stripped.split("\n").every((line) => line.length <= 32));
  assert.ok(data.length > 10000);
  assert.deepEqual(
    wrapText("X".repeat(70), 28).map((s) => s.length),
    [28, 28, 14],
  );
  const o = normalizeReceiptOptions(
    {
      columns: 500,
      topFeed: -20,
      bottomFeed: 999,
      cut: "invalid",
      footer: "Mensagem\x1b\x1d",
    },
    58,
  );
  assert.equal(o.columns, 32);
  assert.equal(o.topFeed, 0);
  assert.equal(o.bottomFeed, 8);
  assert.equal(o.cut, "partial");
  assert.equal(o.footer, "Mensagem");
});

function mockSpool(result, code = 0) {
  let input = "",
    invocation;
  const spawnProcess = (command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    child.stdin.on("data", (chunk) => (input += chunk));
    child.stdin.on("finish", () =>
      queueMicrotask(() => {
        child.stdout.write(JSON.stringify(result));
        child.emit("close", code);
      }),
    );
    return child;
  };
  return {
    spawnProcess,
    input: () => JSON.parse(input),
    invocation: () => invocation,
  };
}
test("ponte Windows envia o buffer completo pelo stdin e respeita confirmação do spooler", async () => {
  const mock = mockSpool({ ok: true, jobId: 123, bytes: 90000 });
  const bytes = Buffer.alloc(90000, 0x7a),
    name = 'ELGIN " i8 $(literal)';
  const result = await printRaw(name, bytes, {
    spawnProcess: mock.spawnProcess,
  });
  assert.equal(result.jobId, 123);
  assert.equal(mock.input().printer, name);
  assert.deepEqual(Buffer.from(mock.input().data, "base64"), bytes);
  assert.equal(mock.invocation().command, "powershell.exe");
  assert.ok(!mock.invocation().args.some((s) => s.includes(name)));
});
test("ponte distingue falha antes do envio de resultado incerto", async () => {
  for (const uncertain of [false, true]) {
    const mock = mockSpool(
      { ok: false, error: "USB desconectado", uncertain },
      1,
    );
    await assert.rejects(
      printRaw("ELGIN i8", Buffer.from("comanda"), {
        spawnProcess: mock.spawnProcess,
      }),
      (error) =>
        error.message.includes("USB desconectado") &&
        error.uncertain === uncertain,
    );
  }
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

test("espaço extra é avanço físico inclusive em fonte grande e não some com a altura da fonte", () => {
  const small = renderEscPos(
    testOrder(),
    { name: "Loja" },
    { width: 80, options: { fontSize: 18, lineGapMm: 0, itemGapMm: 0 } },
  );
  const spaced = renderEscPos(
    testOrder(),
    { name: "Loja" },
    { width: 80, options: { fontSize: 18, lineGapMm: 2, itemGapMm: 0 } },
  );
  assert.ok(spaced.length > small.length);
  assert.ok(spaced.includes(Buffer.from([27, 74, 16])));
  assert.ok(!small.includes(Buffer.from([27, 74, 16])));
  assert.ok(spaced.includes(Buffer.from([29, 33, 1])));
  assert.equal(normalizeReceiptOptions({ lineSpacing: 48 }).lineGapMm, 3);
  assert.equal(
    normalizeReceiptOptions({ lineSpacing: 48, lineGapMm: 0.5 }).lineGapMm,
    0.5,
  );
});

test("comanda-batata só traz batata e número, preservando o aviso obrigatório de múltiplas vias", () => {
  const target = {
    width: 80,
    label: "Comanda-batata",
    location: "kitchen",
    filter: { mode: "products", values: ["batata-crocante"] },
    options: { preset: "minimal" },
  };
  const flags = { receipt: { count: 3, index: 2 } };
  const html = renderReceipt(testOrder(), { name: "Loja" }, target, flags),
    bytes = renderEscPos(testOrder(), { name: "Loja" }, target, flags),
    text = iconv.decode(bytes, "cp860");
  for (const value of ["3 COMANDAS", "VIA 2/3", "Batata Crocante", "#123"])
    assert.ok(html.includes(value), value);
  for (const value of [
    "Brasa Clássico",
    "Refrigerante Lata",
    "TESTE DE COMANDA COMPLETA",
    "TROCO PARA",
    "MESA 12",
  ])
    assert.ok(!html.includes(value), value);
  assert.ok(bytes.includes(Buffer.from([29, 33, 0x22])));
  assert.ok(text.includes("3 COMANDAS"));
  assert.ok(text.includes("FIM DA COMANDA"));
  assert.ok(
    renderReceipt(testOrder(), { name: "Loja" }, target, {
      ...flags,
      test: true,
    }).includes("NÃO PRODUZIR"),
  );
});

test("categoria e grupo de adicionais recebem destaques independentes", () => {
  const order = testOrder();
  order.items[0].modifiers = [
    {
      groupId: "molhos",
      groupName: "Molhos escolhidos",
      name: "Barbecue",
      quantity: 1,
      price: 0,
    },
  ];
  const html = renderReceipt(
    order,
    { name: "Loja" },
    {
      width: 80,
      options: {
        categoryHighlights: [{ category: "Bebidas", style: "box" }],
        addonGroupHighlights: [{ groupId: "molhos", style: "inverted" }],
      },
    },
  );
  assert.match(html, /class="block box item bold/);
  assert.match(html, /class="block inverted\s+bold[^>]*>Molhos escolhidos/);
  assert.ok(html.includes("Barbecue"));
});

test("comanda agrupa hambúrgueres antes da batata e respeita a ordem de categorias configurada", () => {
  const o = testOrder();
  o.items = [
    {
      name: "Hambúrguer 2",
      productId: "h2",
      category: "Lanches",
      quantity: 1,
      price: 100,
      notes: "",
    },
    {
      name: "Batata",
      productId: "b",
      category: "Batatas",
      quantity: 1,
      price: 100,
      notes: "",
    },
    {
      name: "Hambúrguer 1",
      productId: "h1",
      category: "Lanches",
      quantity: 1,
      price: 100,
      notes: "",
    },
  ];
  const plain = renderEscPos(
    o,
    { name: "Loja" },
    {
      options: {
        groupByCategory: true,
        categoryOrder: ["Lanches", "Batatas"],
        codepage: "ascii",
      },
    },
  ).toString("ascii");
  assert.ok(plain.indexOf("Hamburguer 2") < plain.indexOf("Hamburguer 1"));
  assert.ok(plain.indexOf("Hamburguer 1") < plain.indexOf("Batata"));
  const reverse = renderReceipt(
    o,
    { name: "Loja" },
    { options: { categoryOrder: ["Batatas", "Lanches"] } },
  );
  assert.ok(reverse.indexOf("1x Batata") < reverse.indexOf("1x Hambúrguer 2"));
});
test("caixa de categoria contém todos os itens e notas; negrito grande pode enfatizar uma unidade", () => {
  const order = testOrder();
  const target = {
    width: 80,
    options: {
      categoryHighlights: [
        { category: "Bebidas", scope: "category", style: "box" },
      ],
      boldItemNames: true,
      largeItemNames: true,
    },
  };
  const html = renderReceipt(order, { name: "Loja" }, target);
  assert.match(html, /<section class="category-group box">/);
  const group = html
    .split('<section class="category-group box">')[1]
    .split("</section>")[0];
  assert.match(group, /Água Mineral/);
  assert.match(group, /Refrigerante/);
  assert.match(group, /class="block item item bold large/);
  const raw = renderEscPos(
    order,
    { name: "Loja" },
    { ...target, options: { ...target.options, codepage: "ascii" } },
  ).toString("ascii");
  assert.match(raw, /\|.*Agua Mineral.*\|/);
  const { receiptBlocks } = require("../shared/receipt.cjs");
  const blocks = receiptBlocks(order, { name: "Loja" }, target).blocks;
  assert.equal(blocks.find((b) => b.text === "1x Água Mineral").size, 2);
  const small = receiptBlocks(
    order,
    { name: "Loja" },
    {
      options: {
        boldItemNames: false,
        itemHighlights: [{ productId: "agua", bold: true, large: true }],
      },
    },
  ).blocks;
  assert.equal(small.find((b) => b.text === "1x Água Mineral").size, 2);
});
test("via balcão mostra contagem da cozinha sem se numerar como comanda de produção", () => {
  const html = renderReceipt(
    testOrder(),
    { name: "Loja" },
    { location: "counter" },
    { receipt: { count: 2, index: 0 } },
  );
  assert.match(html, /2 COMANDAS/);
  assert.match(html, /VIA DO BALCÃO/);
  assert.doesNotMatch(html, /VIA [0-9]+\/2/);
});

test("fonte de item destacado cresce fisicamente mesmo no modelo de cozinha com fonte grande", () => {
  const order = testOrder(),
    store = { name: "Loja" };
  const regular = renderEscPos(order, store, {
    options: {
      fontSize: 16,
      boldItemNames: true,
      largeItemNames: false,
      highlightQuantities: false,
    },
  });
  const large = renderEscPos(order, store, {
    options: {
      fontSize: 16,
      boldItemNames: true,
      largeItemNames: true,
      highlightQuantities: false,
    },
  });
  const occurrences = (buffer) => {
    let n = 0,
      p = 0;
    while ((p = buffer.indexOf(Buffer.from([29, 33, 2]), p)) >= 0) {
      n++;
      p += 3;
    }
    return n;
  };
  assert.ok(occurrences(large) > occurrences(regular));
});
