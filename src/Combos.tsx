import { Plus, Trash2 } from "lucide-react";
import { createId } from "./api";
import { Reorder, moved } from "./Reorder";
import type { Product, ComboComponent } from "./types";
export function ComboSummary({
  product,
}: {
  product: Pick<Product, "components">;
}) {
  if (!product.components?.length) return null;
  return (
    <div className="combo-summary">
      <strong>Este combo acompanha</strong>
      <span>
        {product.components.map((c) => `${c.quantity}× ${c.name}`).join(" · ")}
      </span>
    </div>
  );
}
export function ComboEditor({
  value,
  onChange,
  products,
  parentId,
}: {
  value: ComboComponent[];
  onChange: (v: ComboComponent[]) => void;
  products: Product[];
  parentId: string;
}) {
  const options = products.filter(
    (p) =>
      p.id !== parentId &&
      !p.components?.length &&
      !p.modifierGroups?.some((g) => g.min > 0),
  );
  return (
    <fieldset className="combo-editor">
      <legend>Combo / promoção e outras cozinhas</legend>
      <p>
        O produto principal é preparado no setor acima. Adicione os
        acompanhamentos: cada um segue para a sua cozinha na mesma numeração. O
        preço informado é o preço final do combo.
      </p>
      {value.map((c, index) => (
        <div className="combo-component" key={c.productId}>
          <Reorder
            index={index}
            count={value.length}
            label="acompanhamento"
            onMove={(delta) => onChange(moved(value, index, delta))}
          />
          <div className="field">
            Acompanha
            {c.preparation ? (
              <>
                <input
                  aria-label="Nome do acompanhamento de preparo"
                  maxLength={100}
                  value={c.name || ""}
                  onChange={(e) =>
                    onChange(
                      value.map((v, i) =>
                        i === index ? { ...v, name: e.target.value } : v,
                      ),
                    )
                  }
                />
                <div className="field-grid">
                  <label className="field">
                    Cozinha
                    <input
                      required
                      maxLength={60}
                      value={c.station || ""}
                      onChange={(e) =>
                        onChange(
                          value.map((v, i) =>
                            i === index ? { ...v, station: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    Categoria
                    <input
                      required
                      maxLength={60}
                      value={c.category || ""}
                      onChange={(e) =>
                        onChange(
                          value.map((v, i) =>
                            i === index
                              ? { ...v, category: e.target.value }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <small>
                  Item de preparo: não possui preço avulso nem consome estoque
                  de outro produto.
                </small>
              </>
            ) : (
              <select
                aria-label="Produto que acompanha o combo"
                value={c.productId}
                onChange={(e) =>
                  onChange(
                    value.map((v, i) =>
                      i === index
                        ? { productId: e.target.value, quantity: v.quantity }
                        : v,
                    ),
                  )
                }
              >
                {options
                  .filter(
                    (p) =>
                      p.id === c.productId ||
                      !value.some((v) => v.productId === p.id),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.station}
                    </option>
                  ))}
              </select>
            )}
          </div>
          <label className="field">
            Qtd.
            <input
              aria-label="Quantidade no combo"
              type="number"
              min="1"
              max="1000"
              value={c.quantity}
              onChange={(e) =>
                onChange(
                  value.map((v, i) =>
                    i === index
                      ? { ...v, quantity: Number(e.target.value) }
                      : v,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="Remover acompanhamento"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <Trash2 size={18} />
          </button>
        </div>
      ))}
      <button
        className="button secondary"
        type="button"
        disabled={
          value.length >= 20 ||
          !options.some((p) => !value.some((v) => v.productId === p.id))
        }
        onClick={() => {
          const p = options.find(
            (p) => !value.some((v) => v.productId === p.id),
          );
          if (p) onChange([...value, { productId: p.id, quantity: 1 }]);
        }}
      >
        <Plus size={16} /> Adicionar acompanhamento
      </button>
      <button
        type="button"
        className="button secondary"
        disabled={value.length >= 20}
        onClick={() =>
          onChange([
            ...value,
            {
              productId: "prep-" + createId(),
              preparation: true,
              quantity: 1,
              name: "Acompanhamento",
              category: "Acompanhamentos",
              station: "Cozinha Batata",
            },
          ])
        }
      >
        <Plus size={16} /> Adicionar item apenas de preparo
      </button>
      <small>
        Cadastre a batata, o salgadinho e cada bebida como produtos simples. O
        estoque desses itens também é reservado ao vender o combo. Configure as
        impressoras por setor em Impressão.
      </small>
    </fieldset>
  );
}
