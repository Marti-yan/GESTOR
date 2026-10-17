const { filterItems, normalizeFilter } = require("./printing.cjs");
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
  lineGapMm: 0.75,
  itemGapMm: 1,
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
  groupByCategory: true,
  categoryOrder: [],
  boldItemNames: true,
  largeItemNames: false,
  itemHighlights: [],
  categoryHighlights: [],
  addonGroupHighlights: [],
};
function normalizeReceiptOptions(input = {}, width = 80) {
  if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
  const o = { ...defaults, columns: width === 58 ? 32 : 48 };
  if (["expedition", "kitchen", "compact", "minimal"].includes(input.preset))
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
    o.lineGapMm = 0.25;
    o.itemGapMm = 0.5;
  }
  if (o.preset === "minimal") {
    o.showStore = false;
    o.showPhone = false;
    o.showPrices = false;
    o.footer = "";
    o.fontSize = 16;
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
    "groupByCategory",
    "boldItemNames",
    "largeItemNames",
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
  // Migra o controle antigo para avanço adicional real, inclusive em fonte grande.
  if (Number.isInteger(input.lineSpacing) && input.lineGapMm === undefined)
    o.lineGapMm = Math.max(0, Math.min(4, (input.lineSpacing - 24) / 8));
  for (const key of ["lineGapMm", "itemGapMm"])
    if (typeof input[key] === "number" && Number.isFinite(input[key]))
      o[key] = Math.round(Math.max(0, Math.min(4, input[key])) * 4) / 4;
  for (const [key, idKey] of [
    ["categoryHighlights", "category"],
    ["addonGroupHighlights", "groupId"],
  ])
    o[key] = (Array.isArray(input[key]) ? input[key] : [])
      .filter(
        (r) =>
          r &&
          typeof r[idKey] === "string" &&
          r[idKey].length <= 100 &&
          ["box", "inverted", "bold"].includes(r.style),
      )
      .slice(0, 60)
      .map((r) => ({
        [idKey]: cleanText(r[idKey]),
        style: r.style,
        ...(key === "categoryHighlights"
          ? { scope: r.scope === "category" ? "category" : "item" }
          : {}),
      }));
  o.categoryOrder = [
    ...new Set(
      (Array.isArray(input.categoryOrder) ? input.categoryOrder : [])
        .filter((v) => typeof v === "string")
        .map((v) => cleanText(v).slice(0, 100)),
    ),
  ].slice(0, 100);
  o.itemHighlights = (
    Array.isArray(input.itemHighlights) ? input.itemHighlights : []
  )
    .filter((r) => r && typeof r.productId === "string")
    .slice(0, 500)
    .map((r) => ({
      productId: cleanText(r.productId).slice(0, 100),
      bold: typeof r.bold === "boolean" ? r.bold : o.boldItemNames,
      large: typeof r.large === "boolean" ? r.large : o.largeItemNames,
    }));
  return o;
}
function receiptBlocks(order, store, target = {}, flags = {}) {
  const o = normalizeReceiptOptions(target.options, target.width),
    kitchen =
      target.location !== "counter" &&
      (o.preset === "kitchen" ||
        o.preset === "minimal" ||
        Boolean(target.station && target.station !== "*") ||
        (target.filter?.mode && target.filter.mode !== "all")),
    blocks = [];
  const add = (text, extra = {}) =>
    blocks.push({ text: cleanText(text), ...extra });
  const line = () => add("", { kind: "line" });
  const emphasis = (enabled) => (enabled ? { bold: true, size: 2 } : {});
  const number = String(order.number).padStart(3, "0");
  const context = flags.receipt || {},
    total = Math.max(1, Number(context.count) || 1),
    index = Math.max(1, Number(context.index) || 1),
    minimal = o.preset === "minimal";
  if (total > 1) {
    add(`${total} COMANDAS`, {
      align: "center",
      bold: true,
      size: 3,
      kind: "multi",
    });
    add(
      target.location === "counter"
        ? "CONFERIR AS VIAS DA COZINHA"
        : `VIA ${index}/${total} - CONFERIR TODAS`,
      {
        align: "center",
        bold: true,
      },
    );
  }
  if (target.location === "counter")
    add("VIA DO BALCÃO", { align: "center", bold: true, kind: "box" });
  if (context.lateExtra)
    add("VIA EXTRA SOLICITADA DEPOIS", { align: "center", bold: true });
  if (flags.test) add("TESTE - NÃO PRODUZIR", { kind: "box", bold: true });
  if (flags.reprint) add("REIMPRESSÃO - CONFERIR", { kind: "box", bold: true });
  if (!minimal) {
    if (o.showStore) add(store.name, { align: "center", bold: true });
    add(target.label || "Comanda geral", { align: "center", small: true });
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
  } else {
    add("PEDIDO", { align: "center", bold: true });
    add(`#${number}`, { align: "center", bold: true, size: 3 });
  }
  const items = filterItems(order.items, target);
  const isDrink = (i) =>
    /bebida/i.test(i.category || "") ||
    /^(bar|bebidas)$/i.test(i.station || "");
  const byCategory =
    o.groupByCategory ||
    o.categoryHighlights.some((r) => r.scope === "category");
  const categoryNames = [...new Set(items.map((i) => i.category || "Outros"))];
  const categoryRanks = new Map(categoryNames.map((c, i) => [c, i]));
  categoryNames.sort((a, b) => {
    const rank = (v) =>
      o.categoryOrder.includes(v)
        ? o.categoryOrder.indexOf(v)
        : o.categoryOrder.length + categoryRanks.get(v);
    return rank(a) - rank(b);
  });
  const groups = byCategory
    ? categoryNames.map((c) =>
        items.filter((i) => (i.category || "Outros") === c),
      )
    : o.groupBeverages
      ? [items.filter((i) => !isDrink(i)), items.filter(isDrink)]
      : [items];
  groups.forEach((group, index) => {
    if (!group.length) return;
    const category = group[0].category || "Outros";
    const whole = byCategory
      ? o.categoryHighlights.find(
          (r) => r.category === category && r.scope === "category",
        )
      : null;
    if (whole)
      add(category.toUpperCase(), {
        kind: "group-start",
        style: whole.style,
        bold: true,
      });
    else if (byCategory && !minimal)
      add(category.toUpperCase(), { kind: "section", bold: true });
    else if (o.groupBeverages && !minimal)
      add(index === 1 ? "BEBIDAS" : "LANCHES E ITENS", {
        kind: "section",
        bold: true,
      });
    for (const i of group) {
      const categoryStyle = o.categoryHighlights.find(
        (r) => r.category === i.category && r.scope !== "category",
      )?.style;
      const itemStyle = o.itemHighlights.find(
        (r) => r.productId === i.productId,
      );
      const bold = itemStyle?.bold ?? o.boldItemNames,
        large = itemStyle?.large ?? o.largeItemNames;
      add(
        `${i.quantity}x ${i.name}${i.comboReferenceOnly ? " (REF. DO COMBO)" : ""}`,
        {
          kind: categoryStyle || "item",
          item: true,
          ...emphasis(i.quantity > 1 && o.highlightQuantities),
          bold:
            bold ||
            (i.quantity > 1 && o.highlightQuantities) ||
            categoryStyle === "bold",
          size:
            (bold && large) || (i.quantity > 1 && o.highlightQuantities)
              ? 2
              : 1,
        },
      );
      if (i.components?.length) {
        if (i.comboReferenceOnly)
          add("ACOMPANHAMENTOS DESTE COMBO", { bold: true, kind: "box" });
        for (const station of [
          ...new Set(i.components.map((c) => c.station)),
        ]) {
          const components = i.components.filter((c) => c.station === station);
          const here = components.some((c) => c.prepareHere);
          add(
            `ACOMPANHA [${station}]${normalizeFilter(target.filter, target.station).mode !== "all" ? (here ? " - PREPARAR AQUI" : " - OUTRA COZINHA") : ""}`,
            { bold: true },
          );
          for (const category of [
            ...new Set(components.map((c) => c.category || "Acompanhamentos")),
          ]) {
            add(category.toUpperCase(), { bold: true, kind: "section" });
            for (const c of components.filter(
              (c) => (c.category || "Acompanhamentos") === category,
            ))
              add(
                `- ${c.quantity * i.quantity}x ${c.name}${i.quantity > 1 ? ` (${c.quantity} por combo)` : ""}`,
                {
                  bold: Boolean(c.prepareHere),
                  kind: c.prepareHere && kitchen ? "box" : "note",
                },
              );
          }
        }
      }
      const modifiers = i.modifiers || [],
        groupIds = [...new Set(modifiers.map((m) => m.groupId))];
      for (const groupId of groupIds) {
        const selections = modifiers.filter((m) => m.groupId === groupId),
          style = o.addonGroupHighlights.find(
            (r) => r.groupId === groupId,
          )?.style;
        add(
          `${selections[0].groupName} (por unidade):\n` +
            selections
              .map(
                (m) =>
                  `+ ${m.quantity}x ${m.name}${!kitchen && o.showPrices && m.price ? ` (${money(m.price * m.quantity)})` : ""}`,
              )
              .join("\n"),
          { kind: style || "note", bold: Boolean(style) },
        );
      }
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
    if (whole) add("", { kind: "group-end", style: whole.style });
  });
  if (order.notes && !minimal) {
    line();
    add(`OBS. DO PEDIDO: ${order.notes}`, {
      kind: o.highlightNotes ? o.noteStyle : "note",
      bold: o.highlightNotes,
    });
  }
  if (!kitchen && !minimal) {
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
  if (total > 1)
    add(
      target.location === "counter"
        ? `CONFERIR ${total} COMANDAS DA COZINHA`
        : `CONFERIR ${total} COMANDAS - VIA ${index}/${total}`,
      {
        bold: true,
        align: "center",
      },
    );
  if (!minimal) line();
  if (o.footer) add(o.footer, { align: "center", small: true });
  add(`*** FIM DA COMANDA #${number} ***`, { align: "center", bold: true });
  return { blocks, options: o };
}
function renderReceipt(order, store, target = {}, flags = {}) {
  const width = target.width === 58 ? 58 : 80,
    { blocks, options: o } = receiptBlocks(order, store, target, flags);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${escapeHtml(order.number)}</title><style>
  @page{margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;background:#fff}body{width:${width}mm;font:${o.fontSize}px 'Courier New',monospace;line-height:${o.lineSpacing / 24};overflow-wrap:anywhere}
  #receipt{width:${width}mm;padding:${o.topFeed * 3}mm 3mm ${o.bottomFeed}mm ${3 + o.leftPadding * 1.5}mm}.block{white-space:pre-wrap;margin:0;line-height:calc(1.15em + ${o.lineGapMm}mm);break-inside:avoid}.center{text-align:center}.bold{font-weight:900}.large{font-size:1.5em}.huge{font-size:2.4em}.small{font-size:.85em}.block.item{margin-top:${o.itemGapMm}mm}.line{border-top:1px dashed #000;margin:${o.itemGapMm}mm 0}.section{border-bottom:2px solid #000;letter-spacing:1px;padding:3px 0;margin:${o.itemGapMm}mm 0}.box{border:2px solid #000;padding:3px;margin:2px 0}.inverted{background:#000!important;color:#fff!important;padding:3px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.note{padding:0}.category-group{margin:5px 0;padding:4px;break-inside:auto}.category-group.bold .block{font-weight:900}
  </style></head><body><main id="receipt">${blocks.map((b) => (b.kind === "group-start" ? `<section class="category-group ${b.style}"><div class="block bold">${escapeHtml(b.text)}</div>` : b.kind === "group-end" ? "</section>" : b.kind === "line" ? '<div class="line"></div>' : `<div class="block ${b.kind || ""} ${b.item ? "item" : ""} ${b.bold ? "bold" : ""} ${b.size === 3 ? "huge" : b.size === 2 ? "large" : ""} ${b.small ? "small" : ""} ${b.align === "center" ? "center" : ""}">${escapeHtml(b.text)}</div>`)).join("")}</main></body></html>`;
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
  cmd(27, 51, 24);
  if (o.topFeed) cmd(27, 100, o.topFeed);
  const columns = o.columns - o.leftPadding;
  let groupStyle = null;
  const emitLine = (value) => {
    text(value + "\n");
    if (o.lineGapMm) cmd(27, 74, Math.round(o.lineGapMm * 8));
  };
  const border = () => {
    cmd(27, 97, 0);
    cmd(29, 33, 0);
    cmd(29, 66, 0);
    emitLine(" ".repeat(o.leftPadding) + "+" + "-".repeat(columns - 2) + "+");
  };
  for (const b of blocks) {
    if (b.kind === "group-start") {
      groupStyle = b.style;
      if (groupStyle === "box") border();
    }
    if (b.kind === "group-end") {
      if (groupStyle === "box") border();
      groupStyle = null;
      continue;
    }
    const outer = groupStyle === "box",
      innerColumns = columns - (outer ? 4 : 0),
      box = b.kind === "box";
    if (b.item && o.itemGapMm) cmd(27, 74, Math.round(o.itemGapMm * 8));
    cmd(27, 97, outer ? 0 : b.align === "center" ? 1 : 0);
    cmd(27, 69, b.bold || groupStyle === "bold" ? 1 : 0);
    cmd(
      29,
      33,
      b.size === 3
        ? 0x22
        : b.size === 2
          ? o.fontSize >= 16
            ? 2
            : 1
          : o.fontSize >= 16
            ? 1
            : 0,
    );
    cmd(29, 66, b.kind === "inverted" || groupStyle === "inverted" ? 1 : 0);
    const output = (value) =>
      emitLine(
        " ".repeat(o.leftPadding) +
          (outer ? "| " + value.padEnd(innerColumns) + " |" : value),
      );
    const lines =
      b.kind === "line"
        ? ["-".repeat(innerColumns)]
        : wrapText(
            b.text,
            Math.floor(innerColumns / (b.size === 3 ? 3 : 1)) - (box ? 4 : 0),
          );
    if (box) output("+" + "-".repeat(innerColumns - 2) + "+");
    for (const value of lines)
      output(box ? "| " + value.padEnd(innerColumns - 4) + " |" : value);
    if (box) output("+" + "-".repeat(innerColumns - 2) + "+");
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
    changeFor: 15000,
    notes:
      "SEM TALHERES. A comanda deve imprimir lanches, bebidas, troco e FIM antes de cortar.",
    subtotal: 11050,
    deliveryFee: 0,
    total: 11050,
    createdAt: new Date().toISOString(),
    items: [
      {
        productId: "brasa-classico",
        name: "Brasa Clássico",
        quantity: 3,
        price: 2490,
        notes: "SEM CEBOLA. Dois bem passados e um ao ponto.",
        station: "Cozinha",
        category: "Burgers",
      },
      {
        productId: "refrigerante",
        name: "Refrigerante Lata",
        quantity: 2,
        price: 690,
        notes: "Uma cola e uma sem açúcar.",
        station: "Bar",
        category: "Bebidas",
      },
      {
        productId: "agua",
        name: "Água Mineral",
        quantity: 1,
        price: 710,
        notes: "Sem gelo",
        station: "Bar",
        category: "Bebidas",
      },
      {
        productId: "batata-crocante",
        name: "Batata Crocante",
        quantity: 1,
        price: 1490,
        notes: "SEM SAL",
        station: "Cozinha",
        category: "Acompanhamentos",
        modifiers: [],
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
