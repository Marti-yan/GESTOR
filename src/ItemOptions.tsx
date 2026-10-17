import { selectionLimit } from "./stockLimits";
import { useEffect, useState } from "react";
import { Plus, Minus, Check } from "lucide-react";
import { money } from "./api";
import type { Product, ModifierSelection } from "./types";

export function unitPrice(
  product: Product,
  selections: ModifierSelection[] = [],
) {
  return (
    product.price +
    selections.reduce(
      (sum, s) =>
        sum +
        (product.modifierGroups
          ?.find((g) => g.id === s.groupId)
          ?.options.find((o) => o.id === s.optionId)?.price || 0) *
          s.quantity,
      0,
    )
  );
}
export function selectionNames(
  product: Product,
  selections: ModifierSelection[] = [],
) {
  return selections
    .map((s) => {
      const group = product.modifierGroups?.find((g) => g.id === s.groupId),
        option = group?.options.find((o) => o.id === s.optionId);
      return `${s.quantity}× ${option?.name || "Opção indisponível"}`;
    })
    .join(" · ");
}
export function ItemOptionsForm({
  product,
  onConfirm,
  onCancel,
  initial,
  maxQuantity,
}: {
  product: Product;
  onConfirm: (
    quantity: number,
    notes: string,
    modifiers: ModifierSelection[],
  ) => void;
  onCancel?: () => void;
  maxQuantity?: number;
  initial?: {
    quantity: number;
    notes: string;
    modifiers?: ModifierSelection[];
  };
}) {
  const [quantity, setQuantity] = useState(initial?.quantity || 1),
    [notes, setNotes] = useState(initial?.notes || ""),
    [selections, setSelections] = useState<ModifierSelection[]>(
      initial?.modifiers || [],
    ),
    [error, setError] = useState("");
  const limit = Math.min(
    selectionLimit(product.stockQuantity),
    maxQuantity ?? 20,
  );
  useEffect(() => {
    setQuantity((q) => Math.min(q, limit));
  }, [limit]);
  const groups = product.modifierGroups || [];
  function change(groupId: string, optionId: string, delta: number) {
    setSelections((current) => {
      const group = groups.find((g) => g.id === groupId)!,
        option = group.options.find((o) => o.id === optionId)!,
        selected = current.find(
          (s) => s.groupId === groupId && s.optionId === optionId,
        ),
        next = (selected?.quantity || 0) + delta;
      if (next > option.maxQuantity) return current;
      let list = current.filter(
        (s) => !(s.groupId === groupId && s.optionId === optionId),
      );
      if (next > 0) {
        if (group.max === 1) list = list.filter((s) => s.groupId !== groupId);
        else if (
          current
            .filter((s) => s.groupId === groupId)
            .reduce((n, s) => n + s.quantity, 0) +
            delta >
          group.max
        )
          return current;
        list.push({ groupId, optionId, quantity: next });
      }
      return list;
    });
    setError("");
  }
  function confirm() {
    if (quantity < 1 || quantity > limit) {
      setError("A quantidade disponível mudou. Confira o item.");
      return;
    }
    const invalid = groups.find((g) => {
      const n = selections
        .filter((s) => s.groupId === g.id)
        .reduce((sum, s) => sum + s.quantity, 0);
      return n < g.min || n > g.max;
    });
    if (invalid) {
      setError(
        `Escolha de ${invalid.min} a ${invalid.max} opções em ${invalid.name}.`,
      );
      return;
    }
    onConfirm(quantity, notes.trim(), selections);
  }
  return (
    <div className="item-options">
      <h2>{product.name}</h2>
      <p className="muted-text">{product.description}</p>
      <strong className="product-modal-price">
        {money(product.price)} <small>por unidade, antes dos adicionais</small>
      </strong>
      {groups.map((group) => {
        const count = selections
          .filter((s) => s.groupId === group.id)
          .reduce((n, s) => n + s.quantity, 0);
        return (
          <fieldset className="modifier-choices" key={group.id}>
            <legend>
              {group.name}
              <span>
                {group.min > 0 ? "Obrigatório" : "Opcional"} · {count}/
                {group.max}
              </span>
            </legend>
            <p>
              Escolha{" "}
              {group.min === group.max
                ? group.max
                : `de ${group.min} a ${group.max}`}{" "}
              por unidade do produto.
            </p>
            {group.options
              .filter((o) => o.available)
              .map((option) => {
                const qty =
                  selections.find(
                    (s) => s.groupId === group.id && s.optionId === option.id,
                  )?.quantity || 0;
                return (
                  <div
                    className={`modifier-choice ${qty ? "selected" : ""}`}
                    key={option.id}
                  >
                    <span>
                      <strong>{option.name}</strong>
                      <small>
                        {option.price
                          ? `+ ${money(option.price)}`
                          : "Sem custo extra"}
                      </small>
                    </span>
                    {group.max === 1 ? (
                      <input
                        type="checkbox"
                        aria-label={`${group.name}: ${option.name}`}
                        checked={qty > 0}
                        onChange={() =>
                          change(group.id, option.id, qty ? -1 : 1)
                        }
                      />
                    ) : (
                      <div className="stepper small">
                        <button
                          type="button"
                          aria-label={`Remover ${option.name}`}
                          disabled={!qty}
                          onClick={() => change(group.id, option.id, -1)}
                        >
                          <Minus size={15} />
                        </button>
                        <b>{qty}</b>
                        <button
                          type="button"
                          aria-label={`Adicionar ${option.name}`}
                          disabled={
                            qty >= option.maxQuantity || count >= group.max
                          }
                          onClick={() => change(group.id, option.id, 1)}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </fieldset>
        );
      })}
      <label className="field">
        Observação deste item
        <textarea
          maxLength={250}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Sem cebola, molho à parte…"
        />
      </label>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {limit < 20 && (
        <p role="status">
          {limit
            ? `Você pode selecionar até ${limit} nesta linha.`
            : "Todas as unidades já estão selecionadas ou o produto esgotou."}
        </p>
      )}
      <div className="add-product-row">
        <div className="stepper">
          <button
            type="button"
            aria-label="Diminuir quantidade"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => q - 1)}
          >
            <Minus size={17} />
          </button>
          <strong>{quantity}</strong>
          <button
            type="button"
            aria-label="Aumentar quantidade"
            disabled={quantity >= limit}
            onClick={() => setQuantity((q) => q + 1)}
          >
            <Plus size={17} />
          </button>
        </div>
        <button
          type="button"
          className="button primary"
          disabled={limit < 1}
          onClick={confirm}
        >
          <Check size={17} />
          Adicionar {money(unitPrice(product, selections) * quantity)}
        </button>
      </div>
      {onCancel && (
        <button
          type="button"
          className="button secondary full"
          onClick={onCancel}
        >
          Voltar aos produtos
        </button>
      )}
    </div>
  );
}
