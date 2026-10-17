function readRows(input) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  const source = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === ";" || ch === "\t")) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw Error("Há aspas abertas na planilha.");
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
function fold(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
function stableId(s) {
  let h = 2166136261;
  for (const c of fold(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
}
function catalogFromCsv(input) {
  if (typeof input !== "string" || input.length > 1024 * 1024)
    throw Error("Use até 1 MB de texto.");
  const [head, ...rows] = readRows(input);
  if (!head || !rows.length || rows.length > 200)
    throw Error("Use um cabeçalho e de 1 a 200 produtos.");
  const columns = head.map(fold),
    get = (r, key) => String(r[columns.indexOf(key)] || "").trim();
  if (["categoria", "nome", "preco"].some((key) => !columns.includes(key)))
    throw Error(
      "O cabeçalho precisa de categoria;nome;descricao;preco;cozinha.",
    );
  const categories = [],
    ids = new Set();
  const products = rows.map((r, index) => {
    const category = get(r, "categoria"),
      name = get(r, "nome"),
      amount = get(r, "preco")
        .replace(/^R\$\s*/, "")
        .replace(/\s/g, "");
    if (
      !category ||
      name.length < 2 ||
      (!/^(\d{1,7}|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(amount) &&
        !/^\d{1,7}\.\d{1,2}$/.test(amount))
    )
      throw Error(`Linha ${index + 2}: confira categoria, nome e preço.`);
    const normalized = amount.includes(",")
      ? amount.replaceAll(".", "").replace(",", ".")
      : amount;
    const price = Math.round(Number(normalized) * 100);
    if (!Number.isSafeInteger(price) || price > 1000000)
      throw Error(`Linha ${index + 2}: preço fora do limite.`);
    const id = "csv-" + stableId(category + "|" + name);
    if (ids.has(id))
      throw Error(`Linha ${index + 2}: produto repetido na categoria.`);
    ids.add(id);
    if (!categories.some((c) => c.name === category))
      categories.push({
        id: "csv-cat-" + stableId(category),
        name: category,
        sort: categories.length,
      });
    const station =
      get(r, "cozinha") ||
      (/past[eé]?[il]|batata|porc/.test(fold(category))
        ? "Cozinha Batata"
        : "Cozinha");
    return {
      id,
      name,
      category,
      description: get(r, "descricao"),
      price,
      station,
      art: /bebida/.test(fold(category))
        ? "soda"
        : /batata|porc/.test(fold(category))
          ? "fries"
          : "burger",
      available: true,
      featured: false,
      modifierGroupIds: [],
      components: [],
      sort: index,
    };
  });
  return {
    format: "pronto-catalog/v1",
    categories,
    modifierGroups: [],
    products,
  };
}
module.exports = { catalogFromCsv };
