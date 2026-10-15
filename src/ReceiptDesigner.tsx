import { useEffect, useState } from "react";
import { SlidersHorizontal, Eye, Check } from "lucide-react";
import { api } from "./api";
import type { PrintTarget, ReceiptOptions } from "./types";
export function ReceiptDesigner({
  target,
  onChange,
}: {
  target: PrintTarget;
  onChange: (o: ReceiptOptions) => void;
}) {
  const [open, setOpen] = useState(false),
    [html, setHtml] = useState(""),
    [error, setError] = useState("");
  const preset = target.options?.preset || "expedition";
  const o: ReceiptOptions = {
    fontSize: preset === "kitchen" ? 16 : preset === "compact" ? 12 : 14,
    lineSpacing: preset === "compact" ? 26 : 30,
    columns: target.width === 58 ? 32 : 48,
    leftPadding: 0,
    topFeed: 0,
    bottomFeed: preset === "compact" ? 2 : 3,
    transport: "escpos",
    cut: "partial",
    codepage: "cp860",
    highlightQuantities: preset !== "compact",
    highlightNotes: true,
    highlightTable: true,
    highlightTicket: true,
    highlightChange: true,
    groupBeverages: true,
    noteStyle: preset === "kitchen" ? "inverted" : "box",
    showStore: true,
    showPhone: true,
    showPrices: preset !== "kitchen",
    footer: "Obrigado pela preferência!",
    ...target.options,
  };
  const edit = (patch: Partial<ReceiptOptions>) => onChange({ ...o, ...patch });
  const signature = JSON.stringify(target);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(
      () =>
        api<{ html: string }>("/admin/printing/preview", "POST", { target })
          .then((r) => {
            if (active) {
              setHtml(r.html);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      220,
    );
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [open, signature]);
  const raw = o.transport === "escpos";
  return (
    <details
      className="receipt-designer"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <SlidersHorizontal size={17} />
        <strong>Modelo, destaques e corte</strong>
        <span>Personalizar comanda</span>
      </summary>
      {open && (
        <div className="receipt-designer-layout">
          <section className="receipt-controls">
            <div className="receipt-presets">
              {[
                {
                  id: "expedition",
                  name: "Expedição",
                  detail: "Conferência, total e troco",
                },
                {
                  id: "kitchen",
                  name: "Cozinha",
                  detail: "Itens grandes e observações",
                },
                {
                  id: "compact",
                  name: "Compacta",
                  detail: "Menos espaço e papel",
                },
              ].map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={preset === p.id ? "active" : ""}
                  onClick={() =>
                    onChange({
                      preset: p.id as ReceiptOptions["preset"],
                      transport: o.transport,
                      cut: o.cut,
                      codepage: o.codepage,
                    })
                  }
                >
                  <strong>
                    {p.name}
                    {preset === p.id && <Check size={13} />}
                  </strong>
                  <small>{p.detail}</small>
                </button>
              ))}
            </div>
            <div className="receipt-control-grid">
              <label className="field">
                Modo de impressão
                <select
                  value={o.transport}
                  onChange={(e) =>
                    edit({
                      transport: e.target.value as ReceiptOptions["transport"],
                    })
                  }
                >
                  <option value="escpos">
                    ESC/POS — Elgin i8 (recomendado)
                  </option>
                  <option value="driver">Driver Windows — HTML</option>
                </select>
              </label>
              <label className="field">
                Tamanho da fonte
                <select
                  value={o.fontSize! <= 12 ? 12 : o.fontSize! >= 16 ? 18 : 14}
                  onChange={(e) => edit({ fontSize: Number(e.target.value) })}
                >
                  <option value={12}>Compacta</option>
                  <option value={14}>Normal</option>
                  <option value={18}>Grande</option>
                </select>
              </label>
              <label className="field">
                Estilo das observações
                <select
                  value={o.noteStyle}
                  onChange={(e) =>
                    edit({
                      noteStyle: e.target.value as ReceiptOptions["noteStyle"],
                    })
                  }
                >
                  <option value="box">Caixa com borda</option>
                  <option value="inverted">Fundo preto</option>
                  <option value="bold">Negrito</option>
                </select>
              </label>
              <label className="field">
                Guilhotina
                <select
                  disabled={!raw}
                  value={o.cut}
                  onChange={(e) =>
                    edit({ cut: e.target.value as ReceiptOptions["cut"] })
                  }
                >
                  <option value="partial">Corte parcial, só no final</option>
                  <option value="full">Corte total, só no final</option>
                  <option value="none">Não cortar</option>
                </select>
              </label>
              <label className="field">
                Avanço no início (linhas)
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={o.topFeed}
                  onChange={(e) => edit({ topFeed: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Avanço extra no fim (mm)
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={o.bottomFeed}
                  onChange={(e) => edit({ bottomFeed: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Entrelinhas (pontos)
                <input
                  type="number"
                  min={24}
                  max={48}
                  value={o.lineSpacing}
                  onChange={(e) =>
                    edit({ lineSpacing: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field">
                Colunas de texto
                <input
                  type="number"
                  min={24}
                  max={target.width === 58 ? 32 : 48}
                  value={o.columns}
                  onChange={(e) => edit({ columns: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Recuo à esquerda (caracteres)
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={o.leftPadding}
                  onChange={(e) =>
                    edit({ leftPadding: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field">
                Acentuação
                <select
                  disabled={!raw}
                  value={o.codepage}
                  onChange={(e) =>
                    edit({
                      codepage: e.target.value as ReceiptOptions["codepage"],
                    })
                  }
                >
                  <option value="cp860">Português — PC860</option>
                  <option value="cp850">Latina — PC850</option>
                  <option value="ascii">Sem acentos (compatibilidade)</option>
                </select>
              </label>
            </div>
            <h4>Dê destaque ao que importa</h4>
            <div className="receipt-toggles">
              {(
                [
                  ["highlightQuantities", "Quantidades maiores que 1"],
                  ["highlightNotes", "Observações dos itens e do pedido"],
                  ["highlightTable", "Mesa"],
                  ["highlightTicket", "Senha de retirada"],
                  ["highlightChange", "Troco para / valor a devolver"],
                  ["groupBeverages", "Separar bebidas dos lanches"],
                  ["showStore", "Nome da loja"],
                  ["showPhone", "Telefone na comanda geral"],
                  ["showPrices", "Preços na comanda geral"],
                ] as [keyof ReceiptOptions, string][]
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(o[key])}
                    onChange={(e) => edit({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="field">
              Mensagem no rodapé
              <textarea
                rows={2}
                maxLength={160}
                value={o.footer}
                onChange={(e) => edit({ footer: e.target.value })}
              />
            </label>
            <p className="receipt-help">
              {raw
                ? "ESC/POS envia o conteúdo inteiro, sem tamanho de página. O corte vem depois do marcador FIM; a distância física entre cabeça e guilhotina ainda deixa uma margem mínima."
                : "No modo HTML, a guilhotina é controlada nas preferências do driver Windows."}{" "}
              Comandas por setor não incluem telefone, endereço ou valores.
            </p>
          </section>
          <aside className="receipt-preview">
            <div>
              <Eye size={16} />
              <strong>Prévia da comanda</strong>
            </div>
            <p>
              Mesa, 3 lanches, bebidas, observações e troco para conferir o fim.
            </p>
            {error ? (
              <p className="error-banner">{error}</p>
            ) : html ? (
              <iframe
                title={`Prévia ${target.label}`}
                sandbox=""
                srcDoc={html}
              />
            ) : (
              <p>Preparando prévia…</p>
            )}
            <small>
              Estrutura visual. A fonte térmica pode variar conforme a
              impressora. Salve as saídas para aplicar.
            </small>
          </aside>
        </div>
      )}
    </details>
  );
}
