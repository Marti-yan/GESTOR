import { useState } from "react";
import { ArrowUp, ArrowDown, Plus, Pencil, Trash2, Layers } from "lucide-react";
import { api } from "./api";
import type { Category } from "./types";
export function CategoryManager({
  categories,
  onChanged,
  onAddProduct,
  notify,
}: {
  categories: Category[];
  onChanged: () => void;
  onAddProduct: (name: string) => void;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setError("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await perform(async () => {
      await api(
        editing ? `/admin/categories/${editing}` : "/admin/categories",
        editing ? "PATCH" : "POST",
        { name },
      );
      setName("");
      setEditing(null);
      notify("Categoria salva");
    });
  }
  function move(index: number, delta: number) {
    const list = [...categories];
    [list[index], list[index + delta]] = [list[index + delta], list[index]];
    perform(() =>
      api("/admin/categories/order", "PUT", { ids: list.map((c) => c.id) }),
    );
  }
  return (
    <section className="section-card category-manager">
      <div className="section-card-header">
        <div>
          <h2>
            <Layers size={19} />
            Categorias e ordem do cardápio
          </h2>
          <p>
            A mesma ordem aparece no cardápio, no gestor e no celular do garçom.
          </p>
        </div>
      </div>
      <form className="category-add" onSubmit={save}>
        <input
          aria-label={editing ? "Renomear categoria" : "Nome da nova categoria"}
          required
          minLength={2}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            editing
              ? "Novo nome da categoria"
              : "Ex.: Lanches, Bebidas, Sobremesas…"
          }
        />
        <button className="button secondary" disabled={busy}>
          <Plus size={15} />
          {editing ? "Salvar nome" : "Criar categoria"}
        </button>
        {editing && (
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setEditing(null);
              setName("");
            }}
          >
            Cancelar
          </button>
        )}
      </form>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="category-manager-list">
        {categories.map((c, index) => (
          <div key={c.id} className="category-manager-row">
            <span className="category-position">
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong>{c.name}</strong>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => onAddProduct(c.name)}
            >
              <Plus size={14} />
              Adicionar item
            </button>
            <button
              className="icon-button"
              aria-label={`Subir ${c.name}`}
              disabled={busy || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Descer ${c.name}`}
              disabled={busy || index === categories.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Renomear ${c.name}`}
              disabled={busy}
              onClick={() => {
                setEditing(c.id);
                setName(c.name);
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`Excluir ${c.name}`}
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Excluir a categoria ${c.name}? Ela precisa estar sem produtos.`,
                  )
                )
                  perform(() => api(`/admin/categories/${c.id}`, "DELETE"));
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
