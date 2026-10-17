import { useState } from "react";
import { api } from "./api";
import type { Category } from "./types";
export function KitchenSetup({
  categories,
  onChanged,
}: {
  categories: Category[];
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string[] | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const values =
    selected ||
    categories
      .filter((c) =>
        /paste|batata|porc/.test(
          c.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase(),
        ),
      )
      .map((c) => c.name);
  return (
    <details className="operation-panel">
      <summary>
        <strong>Configuração rápida: cozinha padrão + cozinha batata</strong>
      </summary>
      <p>
        Marque as categorias preparadas na cozinha batata. As demais vão para a
        cozinha padrão. A comanda geral mantém todos os itens; a comanda-batata
        recebe os itens e acompanhamentos da sua cozinha.
      </p>
      <div className="kitchen-category-options">
        {categories.map((c) => (
          <label key={c.id}>
            <input
              type="checkbox"
              checked={values.includes(c.name)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...values, c.name]
                    : values.filter((v) => v !== c.name),
                )
              }
            />{" "}
            {c.name}
          </label>
        ))}
      </div>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/admin/catalog/kitchens", "PUT", {
              potatoCategories: values,
            });
            setMessage(
              "Setores aplicados. Selecione a impressora física de cada modelo em Impressão.",
            );
            onChanged();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Aplicar divisão das cozinhas
      </button>
      <p role="status">{message}</p>
      <small>
        Aplica aos próximos pedidos. Preserva a impressora e o estilo dos
        modelos já cadastrados.
      </small>
    </details>
  );
}
