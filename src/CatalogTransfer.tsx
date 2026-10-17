import { useState } from "react";
import { api } from "./api";
type Summary = {
  products: number;
  groups: number;
  categories: number;
  added: number;
  updated: number;
};
export function CatalogTransfer({ onChanged }: { onChanged: () => void }) {
  const [catalog, setCatalog] = useState<unknown>(null),
    [summary, setSummary] = useState<Summary | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function exportData() {
    setBusy(true);
    try {
      const data = await api("/admin/catalog/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "pronto-cardapio.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Catálogo exportado. Leve o JSON ao outro computador e importe nesta mesma seção.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao exportar.");
    } finally {
      setBusy(false);
    }
  }
  async function choose(file?: File) {
    setCatalog(null);
    setSummary(null);
    setMessage("");
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage("O arquivo deve ter no máximo 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      const r = await api<{ summary: Summary }>(
        "/admin/catalog/import",
        "POST",
        { catalog: data, dryRun: true },
      );
      setCatalog(data);
      setSummary(r.summary);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Arquivo inválido.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await api("/admin/catalog/import", "POST", { catalog });
      setCatalog(null);
      setSummary(null);
      onChanged();
      setMessage(
        "Catálogo importado. Confira categorias, preços, adicionais e impressoras.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operation-panel">
      <h2>Levar o cardápio para outro computador</h2>
      <p>
        Exporte produtos, categorias, grupos e opções na ordem atual. O arquivo
        não inclui pedidos, clientes, senhas, impressoras ou saldo de estoque.
      </p>
      <div className="operation-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={exportData}
        >
          Exportar catálogo JSON
        </button>
        <label className="field">
          Importar catálogo Pronto
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </label>
      </div>
      {summary && (
        <div className="operation-panel">
          <p>
            {summary.categories} categorias · {summary.groups} grupos ·{" "}
            {summary.products} produtos: {summary.added} novos e{" "}
            {summary.updated} atualizados.
          </p>
          <p>
            Produtos com o mesmo identificador serão atualizados. Os outros
            permanecem cadastrados. Estoque e histórico de pedidos são
            preservados.
          </p>
          <button className="button primary" disabled={busy} onClick={save}>
            Confirmar importação do catálogo
          </button>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
