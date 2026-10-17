import { useCallback, useEffect, useState } from "react";
import { Printer, Plus, Check, RefreshCw, ChevronDown } from "lucide-react";
import { api, createId, time } from "./api";
import { ReceiptDesigner } from "./ReceiptDesigner";
import type {
  PrintTarget,
  PrintJob,
  DesktopInfo,
  Product,
  Category,
  ModifierGroup,
} from "./types";
const labels = {
  pending: "Na fila",
  claimed: "Reservada",
  printing: "Imprimindo",
  spooled: "Enviada ao Windows",
  failed: "Falhou",
  uncertain: "Conferir papel",
  cancelled: "Cancelada",
};
export function Printing({
  desktop,
  notify,
}: {
  desktop: DesktopInfo | null;
  notify: (s: string) => void;
}) {
  const [targets, setTargets] = useState<PrintTarget[]>([]),
    [jobs, setJobs] = useState<PrintJob[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [groups, setGroups] = useState<ModifierGroup[]>([]),
    [printers, setPrinters] = useState<{ name: string; displayName: string }[]>(
      [],
    ),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [testing, setTesting] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await api<{ targets: PrintTarget[]; jobs: PrintJob[] }>(
        "/admin/printing",
      );
      setJobs(r.jobs);
      if (!dirty) setTargets(r.targets);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }, [dirty]);
  const devices = useCallback(
    () =>
      window.prontoDesktop
        ?.printers()
        .then(setPrinters)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    devices();
    api<{
      products: Product[];
      categories: Category[];
      modifierGroups: ModifierGroup[];
    }>("/admin/catalog")
      .then((r) => {
        setProducts(r.products);
        setCategories(r.categories);
        setGroups(r.modifierGroups || []);
      })
      .catch((e) => setError(e.message));
  }, [devices]);
  function edit(id: string, patch: Partial<PrintTarget>) {
    setDirty(true);
    setTargets((current) =>
      current.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }
  async function save() {
    setSaving(true);
    try {
      await api("/admin/printing/targets", "PUT", { targets });
      const r = await api<{ targets: PrintTarget[]; jobs: PrintJob[] }>(
        "/admin/printing",
      );
      setTargets(r.targets);
      setJobs(r.jobs);
      setDirty(false);
      setError("");
      notify("Modelos salvos e aplicados às comandas ainda na fila.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  async function test(t: PrintTarget) {
    setTesting(t.id);
    try {
      await window.prontoDesktop!.testPrint(t, targets);
      notify(
        "Teste enviado. Confira o número de comandas, os itens e o marcador FIM.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível imprimir.");
    } finally {
      setTesting("");
    }
  }
  function add(location: "kitchen" | "counter") {
    setDirty(true);
    setTargets((current) => [
      ...current,
      {
        id: createId(),
        label:
          location === "counter" ? "Via do balcão" : "Nova comanda de cozinha",
        location,
        station: "*",
        filter: { mode: "all", values: [] },
        deviceName: current.find((t) => t.id === "geral")?.deviceName || "",
        width: 80,
        enabled: true,
        options: { preset: location === "counter" ? "expedition" : "kitchen" },
      },
    ]);
  }
  return (
    <>
      <div className="page-title-row">
        <div>
          <span className="eyebrow muted">CADA VIA NO LUGAR CERTO</span>
          <h1>
            Comandas e impressoras<span className="orange">.</span>
          </h1>
          <p>Escolha os itens, ajuste o modelo e confira antes de imprimir.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            devices();
            load();
          }}
        >
          <RefreshCw size={16} />
          Atualizar impressoras
        </button>
      </div>
      <div className="printing-flow-note">
        <Printer size={24} />
        <div>
          <strong>Cozinha é o destino padrão</strong>
          <p>
            O balcão recebe uma via extra apenas quando a equipe marcar essa
            opção. Pedidos do cardápio aguardam aceite.
          </p>
        </div>
        {desktop ? (
          <label className="printing-auto">
            <input
              type="checkbox"
              checked={desktop.autoPrint}
              onChange={(e) =>
                window
                  .prontoDesktop!.configure({ autoPrint: e.target.checked })
                  .catch((e) => setError(e.message))
              }
            />
            Impressão automática
          </label>
        ) : (
          <span>Impressão silenciosa no aplicativo Windows</span>
        )}
      </div>
      {desktop?.printerError && (
        <p className="error-banner">{desktop.printerError}</p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className={`printing-save-bar ${dirty ? "unsaved" : ""}`}>
        <span>
          <strong>
            {dirty ? "Alterações ainda não salvas" : "Configurações salvas"}
          </strong>
          <small>
            Salvar aplica o layout às comandas que ainda estão na fila. Vias já
            enviadas não mudam.
          </small>
        </span>
        <button
          className="button primary"
          disabled={!dirty || saving}
          onClick={save}
        >
          <Check size={16} />
          {saving ? "Salvando…" : "Salvar e aplicar modelos"}
        </button>
      </div>
      <fieldset className="printing-models" disabled={saving}>
        {targets.map((t) => {
          const filter = t.filter || {
            mode: t.station === "*" ? "all" : "station",
            values: t.station === "*" ? [] : [t.station],
          };
          return (
            <details
              key={t.id}
              className={`print-model-card ${t.enabled ? "" : "inactive"}`}
              open={t.id === "geral" ? true : undefined}
            >
              <summary>
                <span className="printer-square">
                  <Printer size={21} />
                </span>
                <span>
                  <strong>{t.label}</strong>
                  <small>
                    {t.location === "counter"
                      ? "Balcão · somente quando solicitado"
                      : filter.mode === "all"
                        ? "Cozinha · todos os itens"
                        : `Cozinha · ${filter.values.length} ${filter.mode === "products" ? "produtos" : filter.mode === "categories" ? "categorias" : "setores"} selecionados`}
                  </small>
                </span>
                <b>{t.enabled ? "Ativa" : "Pausada"}</b>
                <ChevronDown size={18} />
              </summary>
              <div className="print-model-content">
                <div className="print-model-basics">
                  <label className="field">
                    Nome da comanda
                    <input
                      aria-label={`Nome ${t.id}`}
                      value={t.label}
                      maxLength={80}
                      onChange={(e) => edit(t.id, { label: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Destino
                    <select
                      aria-label={`Destino ${t.id}`}
                      value={t.location || "kitchen"}
                      onChange={(e) =>
                        edit(t.id, {
                          location: e.target.value as "kitchen" | "counter",
                        })
                      }
                    >
                      <option value="kitchen">
                        Cozinha · automática após aceite
                      </option>
                      <option value="counter">
                        Balcão · apenas quando solicitado
                      </option>
                    </select>
                  </label>
                  <label className="field">
                    Impressora
                    <select
                      aria-label={`Impressora ${t.id}`}
                      value={t.deviceName}
                      disabled={!desktop}
                      onChange={(e) =>
                        edit(t.id, { deviceName: e.target.value })
                      }
                    >
                      <option value="">Selecione a impressora instalada</option>
                      {t.deviceName &&
                        !printers.some((p) => p.name === t.deviceName) && (
                          <option value={t.deviceName}>
                            {t.deviceName} (não detectada)
                          </option>
                        )}
                      {printers.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.displayName || p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Papel
                    <select
                      value={t.width}
                      aria-label={`Papel ${t.id}`}
                      onChange={(e) =>
                        edit(t.id, {
                          width: Number(e.target.value) as 58 | 80,
                          options: {
                            ...t.options,
                            columns: Number(e.target.value) === 58 ? 32 : 48,
                          },
                        })
                      }
                    >
                      <option value={80}>80 mm — Elgin i8</option>
                      <option value={58}>58 mm</option>
                    </select>
                  </label>
                </div>
                <div className="print-filter">
                  <label className="field">
                    Quais itens entram nesta comanda?
                    <select
                      aria-label={`Filtro ${t.id}`}
                      value={filter.mode}
                      onChange={(e) =>
                        edit(t.id, {
                          station: "*",
                          filter: {
                            mode: e.target.value as typeof filter.mode,
                            values: [],
                          },
                        })
                      }
                    >
                      <option value="all">Todos os itens do pedido</option>
                      <option value="categories">
                        Somente categorias escolhidas
                      </option>
                      <option value="products">
                        Somente produtos escolhidos
                      </option>
                      <option value="station">
                        Somente setores escolhidos
                      </option>
                    </select>
                  </label>
                  {filter.mode !== "all" && (
                    <div className="print-filter-choices">
                      {(filter.mode === "products"
                        ? products.map((p) => ({ value: p.id, label: p.name }))
                        : filter.mode === "categories"
                          ? categories.map((c) => ({
                              value: c.name,
                              label: c.name,
                            }))
                          : [...new Set(products.map((p) => p.station))].map(
                              (station) => ({ value: station, label: station }),
                            )
                      ).map((item) => (
                        <label key={item.value}>
                          <input
                            type="checkbox"
                            checked={filter.values.includes(item.value)}
                            onChange={(e) =>
                              edit(t.id, {
                                filter: {
                                  mode: filter.mode,
                                  values: e.target.checked
                                    ? [...filter.values, item.value]
                                    : filter.values.filter(
                                        (v) => v !== item.value,
                                      ),
                                },
                              })
                            }
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  )}
                  {filter.mode !== "all" && !filter.values.length && (
                    <p className="small-text">
                      Selecione pelo menos um item para esta saída receber
                      comandas.
                    </p>
                  )}
                </div>
                <ReceiptDesigner
                  products={products}
                  target={t}
                  targets={targets}
                  categories={categories}
                  modifierGroups={groups}
                  onChange={(options) => edit(t.id, { options })}
                />
                <div className="print-model-footer">
                  <label>
                    <input
                      type="checkbox"
                      checked={t.enabled}
                      onChange={(e) =>
                        edit(t.id, { enabled: e.target.checked })
                      }
                    />
                    Ativar esta saída
                  </label>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!desktop || !t.deviceName || Boolean(testing)}
                    onClick={() => test(t)}
                  >
                    <Printer size={16} />
                    {testing === t.id ? "Enviando…" : "Testar este modelo"}
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </fieldset>
      <div className="printing-add-targets">
        <button
          className="button secondary"
          disabled={targets.length >= 8}
          onClick={() => add("kitchen")}
        >
          <Plus size={16} />
          Outra comanda de cozinha
        </button>
        <button
          className="button secondary"
          disabled={targets.length >= 8}
          onClick={() => add("counter")}
        >
          <Plus size={16} />
          Outra impressora de balcão
        </button>
      </div>
      <section className="section-card print-queue">
        <div className="section-card-header">
          <h2>
            Fila de impressão <span className="count-badge">{jobs.length}</span>
          </h2>
          <p>Enviada significa aceita pelo Windows. Confira o papel.</p>
        </div>
        {!jobs.length ? (
          <p className="small-text">Os pedidos aceitos aparecerão aqui.</p>
        ) : (
          jobs.map((j) => (
            <div className="print-queue-row" key={j.id}>
              <strong>#{String(j.number).padStart(3, "0")}</strong>
              <span>
                {j.label}
                <small>
                  {time(j.createdAt)}
                  {j.lastError ? ` · ${j.lastError}` : ""}
                </small>
              </span>
              <b className={`print-state ${j.state}`}>{labels[j.state]}</b>
              {["failed", "uncertain", "spooled"].includes(j.state) && (
                <button
                  className="button secondary small"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Confira o papel. Reimprimir #${j.number} pode gerar outra via. Continuar?`,
                      )
                    )
                      return;
                    try {
                      await api(`/admin/printing/jobs/${j.id}/retry`, "POST", {
                        confirmed: true,
                      });
                      load();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Não foi possível reenviar.",
                      );
                    }
                  }}
                >
                  Reimprimir
                </button>
              )}
            </div>
          ))
        )}
      </section>
    </>
  );
}
