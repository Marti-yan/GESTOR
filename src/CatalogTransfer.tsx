import lojaDosSonhos from "../catalogos/loja-dos-sonhos/cardapio.json";
import { catalogFromCsv } from "../shared/catalog-csv.cjs";
import demoCatalog from "../examples/cardapio-demonstracao.json";
import { useState } from "react";
import { api } from "./api";
type Summary = {
  products: number;
  groups: number;
  categories: number;
  added: number;
  updated: number;
  archived?: number;
  notices?: string[];
  storeInfo?: {
    name: string;
    estimatedMinimumMinutes: number;
    estimatedMinutes: number;
  } | null;
};
export function CatalogTransfer({ onChanged }: { onChanged: () => void }) {
  const [csv, setCsv] = useState("");
  const [replaceActive, setReplaceActive] = useState(false);
  const [applyStoreInfo, setApplyStoreInfo] = useState(false);
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
    setReplaceActive(false);
    setApplyStoreInfo(false);
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
  async function preview(data: unknown, replace = false, storeInfo = false) {
    setReplaceActive(replace);
    setApplyStoreInfo(storeInfo);
    setBusy(true);
    setSummary(null);
    setCatalog(null);
    setMessage("");
    try {
      const r = await api<{ summary: Summary }>(
        "/admin/catalog/import",
        "POST",
        {
          catalog: data,
          dryRun: true,
          replaceActive: replace,
          applyStoreInfo: storeInfo,
        },
      );
      setCatalog(data);
      setSummary(r.summary);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await api("/admin/catalog/import", "POST", {
        catalog,
        replaceActive,
        applyStoreInfo,
      });
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
          className="button primary"
          disabled={busy}
          onClick={() => preview(lojaDosSonhos, true, true)}
        >
          Conferir cardápio Loja Dos Sonhos (79 produtos)
        </button>
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
      <details className="catalog-paste">
        <summary>Importar planilha / preparar uma demonstração</summary>
        <p>
          Cole uma planilha com cabeçalho:
          categoria;nome;descricao;preco;cozinha. Aceita ponto e vírgula ou
          tabulação. Pastéis, batatas e porções vão para Cozinha Batata quando a
          coluna cozinha estiver vazia; os demais vão para Cozinha.
        </p>
        <textarea
          rows={6}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={
            "categoria;nome;descricao;preco;cozinha\nBatatas;Batata exemplo;Descrição;19,90;"
          }
          aria-label="Planilha do cardápio"
        />
        <div className="operation-actions">
          <button
            className="button secondary"
            disabled={busy || !csv.trim()}
            onClick={() => {
              try {
                preview(catalogFromCsv(csv));
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Conferir planilha
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => preview(demoCatalog)}
          >
            Conferir exemplo fictício de combo
          </button>
        </div>
        <small>
          O exemplo é uma demonstração com preços ilustrativos, não é uma cópia
          do cardápio Ecta. Nenhum dado entra na loja até confirmar a
          importação.
        </small>
      </details>
      {summary && (
        <div className="operation-panel">
          <p>
            {summary.categories} categorias · {summary.groups} grupos ·{" "}
            {summary.products} produtos: {summary.added} novos e{" "}
            {summary.updated} atualizados.
          </p>
          <p>
            Produtos com o mesmo identificador serão atualizados.{" "}
            {replaceActive
              ? `${summary.archived || 0} itens fora deste arquivo serão desativados no cardápio público, preservando cadastros e histórico.`
              : "Os demais permanecem ativos."}{" "}
            Estoque e histórico são preservados.
          </p>
          {summary.storeInfo && (
            <p>
              Nome da loja: <strong>{summary.storeInfo.name}</strong> · prazo{" "}
              {summary.storeInfo.estimatedMinimumMinutes}–
              {summary.storeInfo.estimatedMinutes} min. Abertura, telefone e
              taxa atuais são preservados.
            </p>
          )}
          {Boolean((catalog as { source?: unknown })?.source) && (
            <label className="import-archive">
              <input
                type="checkbox"
                checked={applyStoreInfo}
                disabled={busy}
                onChange={(e) =>
                  preview(catalog, replaceActive, e.target.checked)
                }
              />{" "}
              Aplicar nome e prazo de entrega informados no arquivo
            </label>
          )}
          {summary.notices?.length ? (
            <ul className="import-notices">
              {summary.notices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          <label className="import-archive">
            <input
              type="checkbox"
              disabled={busy}
              checked={replaceActive}
              onChange={(e) =>
                preview(catalog, e.target.checked, applyStoreInfo)
              }
            />{" "}
            Desativar no cardápio público os itens que não estão neste arquivo
          </label>
          <button className="button primary" disabled={busy} onClick={save}>
            Confirmar importação do catálogo
          </button>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
