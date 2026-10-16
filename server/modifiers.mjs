import { randomUUID } from "node:crypto";
const fail = (message) => {
  const e = new Error(message);
  e.status = 400;
  throw e;
};
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export function readModifierGroups(db) {
  return db
    .prepare("SELECT definition FROM modifier_groups ORDER BY rowid")
    .all()
    .map((r) => JSON.parse(r.definition));
}
export function validateModifierGroup(body, id = randomUUID()) {
  const name = text(body?.name, 60),
    min = body?.min ?? 0,
    max = body?.max ?? 1;
  if (
    name.length < 2 ||
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 0 ||
    max < 1 ||
    max > 20 ||
    min > max
  )
    fail("Informe o nome do grupo e limites de escolhas válidos (0 a 20).");
  if (
    !Array.isArray(body.options) ||
    !body.options.length ||
    body.options.length > 40
  )
    fail("Cadastre de 1 a 40 opções no grupo.");
  const seen = new Set();
  const options = body.options.map((o) => {
    const optionId = text(o?.id, 80) || randomUUID(),
      name = text(o?.name, 80),
      price = o?.price ?? 0,
      maxQuantity = o?.maxQuantity ?? 1;
    if (
      seen.has(optionId) ||
      name.length < 1 ||
      !Number.isInteger(price) ||
      price < 0 ||
      price > 1000000 ||
      !Number.isInteger(maxQuantity) ||
      maxQuantity < 1 ||
      maxQuantity > 20
    )
      fail("Revise os nomes, preços e limites das opções.");
    seen.add(optionId);
    return {
      id: optionId,
      name,
      price,
      maxQuantity,
      available: o.available !== false,
    };
  });
  if (
    options.filter((o) => o.available).reduce((n, o) => n + o.maxQuantity, 0) <
    min
  )
    fail("As opções disponíveis não atendem ao mínimo obrigatório do grupo.");
  return {
    id,
    name,
    kind: body.kind === "complement" ? "complement" : "extra",
    min,
    max,
    options,
  };
}
export function productGroupIds(db, value) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    value.some((id) => typeof id !== "string")
  )
    fail("Selecione até 10 grupos por produto.");
  const ids = [...new Set(value)];
  if (
    ids.some(
      (id) => !db.prepare("SELECT 1 FROM modifier_groups WHERE id=?").get(id),
    )
  )
    fail("Um grupo não existe mais. Atualize o produto.");
  return ids;
}
export function priceModifiers(db, product, selections = []) {
  if (!Array.isArray(selections) || selections.length > 100)
    fail("Adicionais inválidos.");
  const ids = JSON.parse(product.modifier_group_ids || "[]"),
    groups = readModifierGroups(db).filter((g) => ids.includes(g.id)),
    seen = new Set();
  const result = selections.map((s) => {
    const group = groups.find((g) => g.id === s?.groupId),
      option = group?.options.find((o) => o.id === s?.optionId && o.available),
      key = s?.groupId + ":" + s?.optionId;
    if (
      !group ||
      !option ||
      seen.has(key) ||
      !Number.isInteger(s.quantity) ||
      s.quantity < 1 ||
      s.quantity > option.maxQuantity
    )
      fail(
        "Uma escolha de complemento/adicional é inválida ou ficou indisponível.",
      );
    seen.add(key);
    return {
      groupId: group.id,
      groupName: group.name,
      kind: group.kind,
      optionId: option.id,
      name: option.name,
      price: option.price,
      quantity: s.quantity,
    };
  });
  for (const group of groups) {
    const count = result
      .filter((s) => s.groupId === group.id)
      .reduce((n, s) => n + s.quantity, 0);
    if (count < group.min || count > group.max)
      fail(
        `${group.name}: escolha de ${group.min} a ${group.max} opções por unidade do produto.`,
      );
  }
  return {
    modifiers: result,
    price:
      product.price + result.reduce((sum, s) => sum + s.price * s.quantity, 0),
  };
}
