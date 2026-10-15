const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (value) =>
  (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function renderReceipt(
  order,
  store,
  target = { width: 80, station: "*", label: "Comanda geral" },
  options = {},
) {
  const width = target.width === 58 ? 58 : 80;
  const kitchen = target.station && target.station !== "*";
  const items = order.items.filter(
    (i) => !kitchen || i.station === target.station,
  );
  const time = new Date(order.createdAt).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${escapeHtml(order.number)}</title><style>
  @page{size:${width}mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}
  body{width:${width - 6}mm;padding:3mm;font: ${width === 58 ? 11 : 13}px 'Courier New',monospace;line-height:1.35;overflow-wrap:anywhere}
  h1{font-size:19px;line-height:1.15;margin:0 0 4px;text-align:center}h2{font-size:25px;margin:8px 0;text-align:center}
  p{margin:4px 0}.center{text-align:center}.line{border-top:1px dashed #000;margin:9px 0}.item{margin:9px 0}.item strong{font-size:15px}
  .row{display:flex;justify-content:space-between;gap:8px}.note{font-weight:bold;border:1px solid;padding:4px;margin-top:4px;white-space:pre-wrap}
  .total{font-size:17px;font-weight:bold}.small{font-size:10px}.badge{text-align:center;border:2px solid;padding:4px;font-weight:bold}
  </style></head><body>
  <h1>${escapeHtml(store.name)}</h1><p class="center">${escapeHtml(target.label || "Comanda geral")}</p>
  ${options.test ? '<p class="badge">TESTE DE IMPRESSÃO • NÃO PRODUZIR</p>' : ""}
  ${options.reprint ? '<p class="badge">REIMPRESSÃO</p>' : ""}
  <h2>#${escapeHtml(String(order.number).padStart(3, "0"))}</h2>
  <p class="center">${escapeHtml(time)} • ${order.fulfillment === "delivery" ? "ENTREGA" : "RETIRADA"}</p>
  <div class="line"></div><p><strong>${escapeHtml(order.customerName)}</strong></p>
  ${!kitchen ? `<p>${escapeHtml(order.phone)}</p>${order.fulfillment === "delivery" ? `<p>${escapeHtml(order.address)}</p>` : ""}` : ""}
  <div class="line"></div>
  ${items.map((i) => `<div class="item"><div class="row"><strong>${i.quantity}x ${escapeHtml(i.name)}</strong>${!kitchen ? `<span>${money(i.price * i.quantity)}</span>` : ""}</div>${i.notes ? `<div class="note">${escapeHtml(i.notes)}</div>` : ""}</div>`).join("")}
  ${order.notes ? `<div class="note">OBS.: ${escapeHtml(order.notes)}</div>` : ""}
  ${!kitchen ? `<div class="line"></div><div class="row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div><div class="row"><span>Entrega</span><span>${money(order.deliveryFee)}</span></div><div class="row total"><span>TOTAL</span><span>${money(order.total)}</span></div><div class="line"></div><p><strong>PAGAMENTO NA ${order.fulfillment === "delivery" ? "ENTREGA" : "RETIRADA"}</strong></p><p>${order.payment === "cash" ? "DINHEIRO" : "CARTÃO — levar maquininha"}${order.changeFor ? ` • Troco para ${money(order.changeFor)}` : ""}</p>` : ""}
  <div class="line"></div><p class="center small">Pronto Gestor • ${escapeHtml(order.id.slice(0, 8))}</p><p class="center">*** FIM DA COMANDA ***</p>
  </body></html>`;
}
function testOrder() {
  return {
    id: "teste-impressora",
    number: 0,
    customerName: "Teste Elgin i8",
    phone: "(00) 00000-0000",
    fulfillment: "pickup",
    address: "",
    payment: "card",
    notes: "Acentuação: pão, porção, limão.\nConfira tamanho, margem e corte.",
    subtotal: 2490,
    deliveryFee: 0,
    total: 2490,
    createdAt: new Date().toISOString(),
    items: [
      {
        name: "Brasa Clássico",
        quantity: 1,
        price: 2490,
        notes: "Sem cebola",
        station: "Cozinha",
      },
    ],
  };
}
module.exports = { renderReceipt, testOrder, escapeHtml };
