import { useState } from "react";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { api, createId, money, parseMoney } from "./api";
import type { ModifierGroup } from "./types";
const blank = (): ModifierGroup => ({
  id: "",
  name: "",
  kind: "extra",
  min: 0,
  max: 1,
  options: [
    { id: createId(), name: "", price: 0, maxQuantity: 1, available: true },
  ],
});
export function ModifierManager({
  groups,
  onChanged,
  notify,
}: {
  groups: ModifierGroup[];
  onChanged: () => void;
  notify: (s: string) => void;
}) {
  const [draft, setDraft] = useState<ModifierGroup | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      await api(
        draft.id
          ? `/admin/modifier-groups/${draft.id}`
          : "/admin/modifier-groups",
        draft.id ? "PUT" : "POST",
        draft,
      );
      setDraft(null);
      setError("");
      onChanged();
      notify("Grupo salvo. Vincule aos produtos desejados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  function example() {
    setDraft({
      ...blank(),
      name: "Adicionais do lanche",
      max: 3,
      options: [
        {
          id: createId(),
          name: "Bacon extra",
          price: 400,
          maxQuantity: 2,
          available: true,
        },
        {
          id: createId(),
          name: "Queijo extra",
          price: 300,
          maxQuantity: 2,
          available: true,
        },
      ],
    });
  }
  return (
    <section className="section-card modifier-manager">
      <div className="section-card-header">
        <div>
          <h2>Complementos e adicionais</h2>
          <p>
            Crie grupos uma vez e vincule aos produtos. Os preços são por
            unidade do produto.
          </p>
        </div>
        <button
          className="button secondary small"
          onClick={() => {
            setDraft(blank());
            setError("");
          }}
        >
          <Plus size={15} />
          Novo grupo
        </button>
      </div>
      {!groups.length && !draft && (
        <div className="modifier-empty">
          <p>
            Exemplos: ponto da carne (grátis), molhos (opcional) ou bacon e
            queijo (cobrados).
          </p>
          <button className="button secondary" onClick={example}>
            Começar com um exemplo de adicionais
          </button>
        </div>
      )}
      <div className="modifier-group-list">
        {groups.map((group) => (
          <div key={group.id}>
            <span>
              <strong>{group.name}</strong>
              <small>
                {group.kind === "extra" ? "Adicionais" : "Complementos"} ·{" "}
                {group.min} a {group.max} escolhas ·{" "}
                {group.options
                  .map((o) => `${o.name}${o.price ? ` ${money(o.price)}` : ""}`)
                  .join(" / ")}
              </small>
            </span>
            <button
              className="icon-button"
              aria-label={`Editar grupo ${group.name}`}
              onClick={() => {
                setDraft(structuredClone(group));
                setError("");
              }}
            >
              <Pencil size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Excluir grupo ${group.name}`}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Excluir ${group.name}? Desvincule dos produtos primeiro.`,
                  )
                )
                  return;
                try {
                  await api(`/admin/modifier-groups/${group.id}`, "DELETE");
                  onChanged();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Não foi possível excluir.",
                  );
                }
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <form
          key={draft.id || "new"}
          className="modifier-editor"
          onSubmit={save}
        >
          <div className="field-grid">
            <label className="field">
              Nome do grupo
              <input
                required
                minLength={2}
                maxLength={60}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex.: Molhos"
              />
            </label>
            <label className="field">
              Tipo
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as ModifierGroup["kind"],
                  })
                }
              >
                <option value="extra">Adicionais</option>
                <option value="complement">Complementos</option>
              </select>
            </label>
          </div>
          <div className="field-grid">
            <label className="field">
              Mínimo de escolhas
              <input
                type="number"
                min={0}
                max={20}
                value={draft.min}
                onChange={(e) =>
                  setDraft({ ...draft, min: Number(e.target.value) })
                }
              />
            </label>
            <label className="field">
              Máximo de escolhas
              <input
                type="number"
                min={1}
                max={20}
                value={draft.max}
                onChange={(e) =>
                  setDraft({ ...draft, max: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <p className="small-text">
            Mínimo zero torna o grupo opcional. Preço zero cria uma escolha
            gratuita.
          </p>
          {draft.options.map((option, index) => (
            <div className="modifier-option-editor" key={option.id}>
              <label className="field">
                Opção {index + 1}
                <input
                  required
                  maxLength={80}
                  value={option.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: draft.options.map((o) =>
                        o.id === option.id ? { ...o, name: e.target.value } : o,
                      ),
                    })
                  }
                />
              </label>
              <label className="field">
                Preço extra (R$)
                <input
                  inputMode="decimal"
                  defaultValue={(option.price / 100)
                    .toFixed(2)
                    .replace(".", ",")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: draft.options.map((o) =>
                        o.id === option.id
                          ? { ...o, price: parseMoney(e.target.value) }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              <label className="field">
                Limite por unidade
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={option.maxQuantity}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: draft.options.map((o) =>
                        o.id === option.id
                          ? { ...o, maxQuantity: Number(e.target.value) }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              <label className="modifier-available">
                <input
                  type="checkbox"
                  checked={option.available}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: draft.options.map((o) =>
                        o.id === option.id
                          ? { ...o, available: e.target.checked }
                          : o,
                      ),
                    })
                  }
                />
                Disponível
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={`Excluir opção ${index + 1}`}
                disabled={draft.options.length === 1}
                onClick={() =>
                  setDraft({
                    ...draft,
                    options: draft.options.filter((o) => o.id !== option.id),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="modifier-actions">
            <button
              type="button"
              className="button secondary"
              disabled={draft.options.length >= 40}
              onClick={() =>
                setDraft({
                  ...draft,
                  options: [
                    ...draft.options,
                    {
                      id: createId(),
                      name: "",
                      price: 0,
                      maxQuantity: 1,
                      available: true,
                    },
                  ],
                })
              }
            >
              <Plus size={15} />
              Adicionar opção
            </button>
            <button className="button primary" disabled={busy}>
              <Check size={16} />
              {busy ? "Salvando…" : "Salvar grupo"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setDraft(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
