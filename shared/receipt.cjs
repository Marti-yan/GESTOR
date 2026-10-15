const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (v) =>
  (Number(v || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const cleanText = (v) =>
  String(v ?? "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .replace(/\r/g, "");
const defaults = {
  preset: "expedition",
  transport: "escpos",
  fontSize: 14,
  lineSpacing: 30,
  columns: 48,
  leftPadding: 0,
  topFeed: 0,
  bottomFeed: 3,
  cut: "partial",
  codepage: "cp860",
  highlightQuantities: true,
  highlightNotes: true,
  highlightTable: true,
  highlightTicket: true,
  highlightChange: true,
  groupBeverages: true,
  noteStyle: "box",
  showStore: true,
  showPhone: true,
  showPrices: true,
  footer: "Obrigado pela preferência!",
};
function normalizeReceiptOptions(input = {}, width = 80) {
  if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
  const o = { ...defaults, columns: width === 58 ? 32 : 48 };
  if (["expedition", "kitchen", "compact"].includes(input.preset))
    o.preset = input.preset;
  if (o.preset === "kitchen") {
    o.fontSize = 16;
    o.showPrices = false;
    o.noteStyle = "inverted";
  }
  if (o.preset === "compact") {
    o.fontSize = 12;
    o.lineSpacing = 26;
    o.bottomFeed = 2;
    o.highlightQuantities = false;
  }
  for (const [key, min, max] of [
    ["fontSize", 11, 20],
    ["lineSpacing", 24, 48],
    ["columns", 24, width === 58 ? 32 : 48],
    ["leftPadding", 0, 4],
    ["topFeed", 0, 4],
    ["bottomFeed", 0, 8],
  ])
    if (Number.isInteger(input[key]))
      o[key] = Math.max(min, Math.min(max, input[key]));
  for (const key of [
    "highlightQuantities",
    "highlightNotes",
    "highlightTable",
    "highlightTicket",
    "highlightChange",
    "groupBeverages",
    "showStore",
    "showPhone",
    "showPrices",
  ])
    if (typeof input[key] === "boolean") o[key] = input[key];
  for (const [key, values] of [
    ["transport", ["escpos", "driver"]],
    ["cut", ["partial", "full", "none"]],
    ["codepage", ["cp860", "cp850", "ascii"]],
    ["noteStyle", ["box", "inverted", "bold"]],
  ])
    if (values.includes(input[key])) o[key] = input[key];
  if (typeof input.footer === "string")
    o.footer = cleanText(input.footer).slice(0, 160);
  return o;
}
function receiptBlocks(order, store, target = {}, flags = {}) {
  const o = normalizeReceiptOptions(target.options, target.width),
    kitchen = Boolean(target.station && target.station !== "*"),
    blocks = [];
  const add = (text, extra = {}) =>
    blocks.push({ text: cleanText(text), ...extra });
  const line = () => add("", { kind: "line" });
  const emphasis = (enabled) => (enabled ? { bold: true, size: 2 } : {});
  const number = String(order.number).padStart(3, "0");
  if (o.showStore) add(store.name, { align: "center", bold: true });
  add(target.label || "Comanda geral", { align: "center", small: true });
  if (flags.test)
    add("TESTE DE IMPRESSÃO - NÃO PRODUZIR", { kind: "box", bold: true });
  if (flags.reprint) add("REIMPRESSÃO - CONFERIR", { kind: "box", bold: true });
  add(`PEDIDO #${number}`, { align: "center", bold: true, size: 2 });
  if (order.tableName)
    add(`MESA ${order.tableName}`, {
      align: "center",
      ...emphasis(o.highlightTable),
    });
  add(`SENHA ${order.pickupCode || number}`, {
    align: "center",
    ...emphasis(o.highlightTicket),
  });
  add(
    new Date(order.createdAt).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    { align: "center", small: true },
  );
  add(
    { delivery: "ENTREGA", pickup: "RETIRADA", dinein: "CONSUMO NO LOCAL" }[
      order.fulfillment
    ] || "RETIRADA",
    { align: "center", bold: true },
  );
  add(
    ({ menu: "CARDÁPIO DIGITAL", waiter: "GARÇOM", manager: "GESTOR" }[
      order.source || "menu"
    ] || "GESTOR") + (order.actorName ? ` - ${order.actorName}` : ""),
    { align: "center", small: true },
  );
  line();
  add(order.customerName, { bold: true });
  if (!kitchen && o.showPhone && order.phone) add(order.phone);
  if (!kitchen && order.fulfillment === "delivery") add(order.address);
  line();
  const items = order.items.filter(
    (i) => !kitchen || i.station === target.station,
  );
  const isDrink = (i) =>
    /bebida/i.test(i.category || "") ||
    /^(bar|bebidas)$/i.test(i.station || "");
  const groups = o.groupBeverages
    ? [items.filter((i) => !isDrink(i)), items.filter(isDrink)]
    : [items];
  groups.forEach((group, index) => {
    if (!group.length) return;
    if (o.groupBeverages)
      add(index === 1 ? "BEBIDAS" : "LANCHES E ITENS", {
        kind: "section",
        bold: true,
      });
    for (const i of group) {
      add(`${i.quantity}x ${i.name}`, {
        kind: "item",
        ...emphasis(i.quantity > 1 && o.highlightQuantities),
        bold: true,
      });
      if (!kitchen && o.showPrices)
        add(`${money(i.price)} un.  =  ${money(i.price * i.quantity)}`, {
          small: true,
        });
      if (i.notes)
        add(`OBS.: ${i.notes}`, {
          kind: o.highlightNotes ? o.noteStyle : "note",
          bold: o.highlightNotes,
        });
    }
  });
  if (order.notes) {
    line();
    add(`OBS. DO PEDIDO: ${order.notes}`, {
      kind: o.highlightNotes ? o.noteStyle : "note",
      bold: o.highlightNotes,
    });
  }
  if (!kitchen) {
    line();
    if (o.showPrices) {
      add(`Subtotal: ${money(order.subtotal)}`);
      if (order.deliveryFee) add(`Entrega: ${money(order.deliveryFee)}`);
      add(`TOTAL: ${money(order.total)}`, { bold: true, size: 2 });
    }
    add(
      order.payment === "cash"
        ? "DINHEIRO"
        : order.payment === "pending"
          ? "PAGAMENTO A DEFINIR / NO BALCÃO"
          : "CARTÃO - LEVAR MAQUININHA",
      { bold: true },
    );
    if (order.payment === "cash" && order.changeFor != null) {
      add(`TROCO PARA: ${money(order.changeFor)}`, emphasis(o.highlightChange));
      add(
        `DEVOLVER: ${money(order.changeFor - order.total)}`,
        emphasis(o.highlightChange),
      );
    }
  }
  line();
  if (o.footer) add(o.footer, { align: "center", small: true });
  add(`*** FIM DA COMANDA #${number} ***`, { align: "center", bold: true });
  return { blocks, options: o };
}
function renderReceipt(order, store, target = {}, flags = {}) {
  const width = target.width === 58 ? 58 : 80,
    { blocks, options: o } = receiptBlocks(order, store, target, flags);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${escapeHtml(order.number)}</title><style>
  @page{margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;background:#fff}body{width:${width}mm;font:${o.fontSize}px 'Courier New',monospace;line-height:${o.lineSpacing / 24};overflow-wrap:anywhere}
  #receipt{width:${width}mm;padding:${o.topFeed * 3}mm 3mm ${o.bottomFeed}mm ${3 + o.leftPadding * 1.5}mm}.block{white-space:pre-wrap;margin:2px 0;break-inside:avoid}.center{text-align:center}.bold{font-weight:900}.large{font-size:1.5em;line-height:1.2}.small{font-size:.85em}.item{margin-top:9px}.line{border-top:1px dashed #000;margin:7px 0}.section{border-bottom:2px solid #000;letter-spacing:1px;padding:3px 0;margin:9px 0 4px}.box{border:2px solid #000;padding:5px;margin:5px 0}.inverted{background:#000!important;color:#fff!important;padding:5px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.note{padding:3px 0}
  </style></head><body><main id="receipt">${blocks.map((b) => (b.kind === "line" ? '<div class="line"></div>' : `<div class="block ${b.kind || ""} ${b.bold ? "bold" : ""} ${b.size === 2 ? "large" : ""} ${b.small ? "small" : ""} ${b.align === "center" ? "center" : ""}">${escapeHtml(b.text)}</div>`)).join("")}</main></body></html>`;
}
function wrapText(text, width) {
  const result = [];
  for (const paragraph of cleanText(text).split("\n")) {
    let line = "";
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > width) {
        if (line) {
          result.push(line);
          line = "";
        }
        result.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (line && line.length + 1 + word.length > width) {
        result.push(line);
        line = "";
      }
      if (word) line += (line ? " " : "") + word;
    }
    result.push(line);
  }
  return result;
}
function renderEscPos(order, store, target = {}, flags = {}) {
  const iconv = require("iconv-lite"),
    { blocks, options: o } = receiptBlocks(order, store, target, flags),
    chunks = [];
  const cmd = (...bytes) => chunks.push(Buffer.from(bytes));
  const text = (value) =>
    chunks.push(
      o.codepage === "ascii"
        ? Buffer.from(
            cleanText(value)
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^\x20-\x7e\n]/g, "?"),
            "ascii",
          )
        : iconv.encode(cleanText(value), o.codepage),
    );
  cmd(27, 64);
  cmd(27, 116, o.codepage === "cp850" ? 2 : 3);
  cmd(27, 77, o.fontSize <= 12 ? 1 : 0);
  cmd(27, 51, o.lineSpacing);
  if (o.topFeed) cmd(27, 100, o.topFeed);
  const columns = o.columns - o.leftPadding;
  for (const b of blocks) {
    cmd(27, 97, b.align === "center" ? 1 : 0);
    cmd(27, 69, b.bold ? 1 : 0);
    cmd(29, 33, b.size === 2 || o.fontSize >= 16 ? 1 : 0);
    cmd(29, 66, b.kind === "inverted" ? 1 : 0);
    const box = b.kind === "box",
      lines =
        b.kind === "line"
          ? ["-".repeat(columns)]
          : wrapText(b.text, columns - (box ? 4 : 0));
    if (box)
      text(" ".repeat(o.leftPadding) + "+" + "-".repeat(columns - 2) + "+\n");
    for (const line of lines)
      text(
        " ".repeat(o.leftPadding) +
          (box ? "| " + line.padEnd(columns - 4) + " |" : line) +
          "\n",
      );
    if (box)
      text(" ".repeat(o.leftPadding) + "+" + "-".repeat(columns - 2) + "+\n");
    cmd(29, 66, 0);
    cmd(29, 33, 0);
    cmd(27, 69, 0);
  }
  cmd(27, 97, 0);
  if (o.cut !== "none")
    cmd(29, 86, o.cut === "full" ? 65 : 66, o.bottomFeed * 8);
  else if (o.bottomFeed) cmd(27, 74, o.bottomFeed * 8);
  return Buffer.concat(chunks);
}
function testOrder() {
  return {
    id: "teste-impressora",
    number: 123,
    customerName: "TESTE DE COMANDA COMPLETA",
    phone: "(00) 00000-0000",
    fulfillment: "dinein",
    source: "waiter",
    actorName: "Garçom de teste",
    tableName: "12",
    pickupCode: "A123",
    address: "",
    payment: "cash",
    changeFor: 10000,
    notes:
      "SEM TALHERES. A comanda deve imprimir lanches, bebidas, troco e FIM antes de cortar.",
    subtotal: 9560,
    deliveryFee: 0,
    total: 9560,
    createdAt: new Date().toISOString(),
    items: [
      {
        name: "Brasa Clássico",
        quantity: 3,
        price: 2490,
        notes: "SEM CEBOLA. Dois bem passados e um ao ponto.",
        station: "Cozinha",
        category: "Burgers",
      },
      {
        name: "Refrigerante Lata",
        quantity: 2,
        price: 690,
        notes: "Uma cola e uma sem açúcar.",
        station: "Bar",
        category: "Bebidas",
      },
      {
        name: "Água Mineral",
        quantity: 1,
        price: 710,
        notes: "Sem gelo",
        station: "Bar",
        category: "Bebidas",
      },
    ],
  };
}
module.exports = {
  renderReceipt,
  renderEscPos,
  receiptBlocks,
  normalizeReceiptOptions,
  testOrder,
  escapeHtml,
  wrapText,
};
