import { useEffect, useState } from "react";
import { Eye, Check } from "lucide-react";
import { api } from "./api";
import type {
  PrintTarget,
  ReceiptOptions,
  Category,
  ModifierGroup,
} from "./types";
type Style = "box" | "inverted" | "bold";
export function ReceiptDesigner({
  target,
  targets,
  categories,
  modifierGroups,
  onChange,
}: {
  target: PrintTarget;
  targets: PrintTarget[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  onChange: (o: ReceiptOptions) => void;
}) {
  const [html, setHtml] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const o: ReceiptOptions = {
    fontSize: 14,
    lineGapMm: 0.75,
    itemGapMm: 1,
    transport: "escpos",
    cut: "partial",
    codepage: "cp860",
    columns: target.width === 58 ? 32 : 48,
    leftPadding: 0,
    topFeed: 0,
    bottomFeed: 3,
    noteStyle: "box",
    highlightQuantities: true,
    highlightNotes: true,
    highlightTable: true,
    highlightTicket: true,
    highlightChange: true,
    groupBeverages: true,
    showStore: true,
    showPhone: true,
    showPrices: true,
    footer: "Obrigado pela preferência!",
    categoryHighlights: [],
    addonGroupHighlights: [],
    ...target.options,
  };
  const signature = JSON.stringify({ target, targets });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        api<{ html: string }>("/admin/printing/preview", "POST", {
          target,
          targets,
        })
          .then((r) => {
            if (active) {
              setHtml(r.html);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [signature]);
  const edit = (p: Partial<ReceiptOptions>) => onChange({ ...o, ...p });
  async function preset(preset: ReceiptOptions["preset"]) {
    setBusy(true);
    try {
      const r = await api<{ options: ReceiptOptions }>(
        "/admin/printing/preview",
        "POST",
        {
          target: {
            ...target,
            options: {
              preset,
              transport: o.transport,
              cut: o.cut,
              codepage: o.codepage,
            },
          },
          targets,
        },
      );
      onChange(r.options);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível aplicar o modelo.",
      );
    } finally {
      setBusy(false);
    }
  }
  function categoryStyle(category: string, value: string) {
    edit({
      categoryHighlights: [
        ...(o.categoryHighlights || []).filter((r) => r.category !== category),
        ...(value ? [{ category, style: value as Style }] : []),
      ],
    });
  }
  function groupStyle(groupId: string, value: string) {
    edit({
      addonGroupHighlights: [
        ...(o.addonGroupHighlights || []).filter((r) => r.groupId !== groupId),
        ...(value ? [{ groupId, style: value as Style }] : []),
      ],
    });
  }
  const styles = (
    <>
      <option value="">Normal</option>
      <option value="bold">Negrito</option>
      <option value="box">Caixinha</option>
      <option value="inverted">Fundo preto</option>
    </>
  );
  return (
    <div className="receipt-editor-layout">
      <section className="receipt-simple-controls">
        <h3>1. Escolha o modelo</h3>
        <div className="receipt-model-grid">
          {(
            [
              {
                id: "kitchen",
                name: "Cozinha geral",
                detail: "Todos os itens, mesa e observações",
              },
              {
                id: "minimal",
                name: "Só pedido + itens",
                detail: "Ideal para a comanda-batata",
              },
              {
                id: "expedition",
                name: "Conferência / balcão",
                detail: "Cliente, endereço, valores e troco",
              },
              {
                id: "compact",
                name: "Compacta",
                detail: "Fonte menor e menos papel",
              },
            ] as const
          ).map((p) => (
            <button
              type="button"
              key={p.id}
              disabled={busy}
              className={(o.preset || "expedition") === p.id ? "active" : ""}
              onClick={() => preset(p.id)}
            >
              <strong>
                {p.name}
                {o.preset === p.id && <Check size={14} />}
              </strong>
              <small>{p.detail}</small>
            </button>
          ))}
        </div>
        <h3>2. Ajuste a leitura</h3>
        <label className="field">
          Tamanho das letras
          <select
            aria-label="Tamanho das letras"
            value={o.fontSize! <= 12 ? 12 : o.fontSize! >= 16 ? 18 : 14}
            onChange={(e) => edit({ fontSize: Number(e.target.value) })}
          >
            <option value={12}>Pequeno</option>
            <option value={14}>Normal</option>
            <option value={18}>Grande</option>
          </select>
        </label>
        <label className="receipt-range">
          Espaço extra entre linhas{" "}
          <strong>{o.lineGapMm?.toLocaleString("pt-BR")} mm</strong>
          <input
            aria-label="Espaço extra entre linhas"
            type="range"
            min={0}
            max={4}
            step={0.25}
            value={o.lineGapMm}
            onChange={(e) => edit({ lineGapMm: Number(e.target.value) })}
          />
          <small>
            Avanço real de papel. Funciona também nas letras grandes.
          </small>
        </label>
        <div className="receipt-spacing-presets">
          {[
            { name: "Juntas", gap: 0 },
            { name: "Normal", gap: 0.75 },
            { name: "Espaçadas", gap: 2 },
          ].map((p) => (
            <button
              type="button"
              key={p.name}
              className={o.lineGapMm === p.gap ? "active" : ""}
              onClick={() => edit({ lineGapMm: p.gap })}
            >
              {p.name}
            </button>
          ))}
        </div>
        <label className="receipt-range">
          Espaço entre itens{" "}
          <strong>{o.itemGapMm?.toLocaleString("pt-BR")} mm</strong>
          <input
            aria-label="Espaço entre itens"
            type="range"
            min={0}
            max={4}
            step={0.25}
            value={o.itemGapMm}
            onChange={(e) => edit({ itemGapMm: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Observações
          <select
            aria-label="Estilo das observações"
            value={o.highlightNotes ? o.noteStyle : ""}
            onChange={(e) =>
              edit({
                highlightNotes: Boolean(e.target.value),
                ...(e.target.value
                  ? { noteStyle: e.target.value as Style }
                  : {}),
              })
            }
          >
            {styles}
          </select>
        </label>
        <div className="receipt-toggles">
          {(
            [
              ["highlightQuantities", "Destacar quantidades acima de 1"],
              ["highlightTable", "Destacar mesa"],
              ["highlightTicket", "Destacar senha"],
              ["highlightChange", "Destacar troco"],
            ] as const
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
        <div className="multi-receipt-notice">
          <b>2, 3, 4… COMANDAS</b>
          <p>
            Quando houver mais de uma, o total e a posição desta via aparecem
            bem grandes. Esse aviso é obrigatório e não pode ser ocultado.
          </p>
        </div>
        <h3>3. Destaque o que sua equipe precisa</h3>
        <p className="small-text">
          Escolha qualquer categoria ou grupo. A caixinha funciona como a das
          observações.
        </p>
        <div className="receipt-highlight-list">
          {categories.map((c) => (
            <label key={c.id}>
              <span>{c.name}</span>
              <select
                aria-label={`Destaque da categoria ${c.name}`}
                value={
                  o.categoryHighlights?.find((r) => r.category === c.name)
                    ?.style || ""
                }
                onChange={(e) => categoryStyle(c.name, e.target.value)}
              >
                {styles}
              </select>
            </label>
          ))}
        </div>
        <h4>Grupos de complementos e adicionais</h4>
        {!modifierGroups.length ? (
          <p className="small-text">
            Crie os grupos em Cardápio → Complementos e adicionais. Depois
            escolha o destaque aqui.
          </p>
        ) : (
          <div className="receipt-highlight-list">
            {modifierGroups.map((g) => (
              <label key={g.id}>
                <span>{g.name}</span>
                <select
                  aria-label={`Destaque do grupo ${g.name}`}
                  value={
                    o.addonGroupHighlights?.find((r) => r.groupId === g.id)
                      ?.style || ""
                  }
                  onChange={(e) => groupStyle(g.id, e.target.value)}
                >
                  {styles}
                </select>
              </label>
            ))}
          </div>
        )}
        <details className="receipt-advanced">
          <summary>Ajustes de papel, guilhotina e informações</summary>
          <div className="receipt-control-grid">
            <label className="field">
              Modo
              <select
                value={o.transport}
                onChange={(e) =>
                  edit({
                    transport: e.target.value as ReceiptOptions["transport"],
                  })
                }
              >
                <option value="escpos">ESC/POS — Elgin i8</option>
                <option value="driver">Driver Windows — HTML</option>
              </select>
            </label>
            <label className="field">
              Guilhotina
              <select
                disabled={o.transport === "driver"}
                value={o.cut}
                onChange={(e) =>
                  edit({ cut: e.target.value as ReceiptOptions["cut"] })
                }
              >
                <option value="partial">Corte parcial no final</option>
                <option value="full">Corte total no final</option>
                <option value="none">Sem corte</option>
              </select>
            </label>
            <label className="field">
              Papel extra no início (linhas)
              <input
                type="number"
                min={0}
                max={4}
                value={o.topFeed}
                onChange={(e) => edit({ topFeed: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Papel extra no final (mm)
              <input
                type="number"
                min={0}
                max={8}
                value={o.bottomFeed}
                onChange={(e) => edit({ bottomFeed: Number(e.target.value) })}
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
              Recuo esquerdo
              <input
                type="number"
                min={0}
                max={4}
                value={o.leftPadding}
                onChange={(e) => edit({ leftPadding: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Acentos
              <select
                value={o.codepage}
                onChange={(e) =>
                  edit({
                    codepage: e.target.value as ReceiptOptions["codepage"],
                  })
                }
              >
                <option value="cp860">Português PC860</option>
                <option value="cp850">Latina PC850</option>
                <option value="ascii">Sem acentos</option>
              </select>
            </label>
          </div>
          <div className="receipt-toggles">
            {(
              [
                ["showStore", "Nome da loja"],
                ["showPhone", "Telefone na via de conferência"],
                ["showPrices", "Valores na via de conferência"],
                ["groupBeverages", "Separar bebidas"],
              ] as const
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
            Mensagem final
            <textarea
              maxLength={160}
              rows={2}
              value={o.footer}
              onChange={(e) => edit({ footer: e.target.value })}
            />
          </label>
          <p className="small-text">
            O modelo “Só pedido + itens” omite dados de cliente e pagamento. Na
            cozinha, os modelos de produção omitem valores e endereço. Em HTML,
            o driver controla a guilhotina.
          </p>
        </details>
      </section>
      <aside className="receipt-live-preview">
        <h3>
          <Eye size={17} />
          Assim vai para o papel
        </h3>
        <p>
          Prévia com pedido completo. Role dentro da comanda para conferir o
          final.
        </p>
        {error ? (
          <p className="error-banner">{error}</p>
        ) : html ? (
          <iframe title={`Prévia ${target.label}`} sandbox="" srcDoc={html} />
        ) : (
          <p>Preparando comanda…</p>
        )}
        <small>
          A fonte térmica pode variar. O espaçamento em milímetros é enviado à
          impressora.
        </small>
      </aside>
    </div>
  );
}
