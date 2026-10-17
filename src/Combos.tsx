import { Plus, Trash2 } from "lucide-react";
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
          <label className="field">
            Acompanha
            <select
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
          </label>
          <label className="field">
            Qtd.
            <input
              aria-label="Quantidade no combo"
              type="number"
              min="1"
              max="20"
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
      <small>
        Cadastre a batata, o salgadinho e cada bebida como produtos simples. O
        estoque desses itens também é reservado ao vender o combo. Configure as
        impressoras por setor em Impressão.
      </small>
    </fieldset>
  );
}
