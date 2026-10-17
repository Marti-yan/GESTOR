import { useEffect, useRef, useState } from "react";
import { api } from "./api";
export type DeliveryAddress = {
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
  reference: string;
};
export type DeliveryCity = {
  name: string;
  state: string;
  neighborhoods: string[];
};
export const blankAddress = (): DeliveryAddress => ({
  cep: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  complement: "",
  reference: "",
});
export function AddressFields({
  value,
  onChange,
}: {
  value: DeliveryAddress;
  onChange: (value: DeliveryAddress) => void;
}) {
  const [cities, setCities] = useState<DeliveryCity[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const version = useRef(0);
  useEffect(() => {
    api<{ cities: DeliveryCity[] }>("/delivery-areas")
      .then((r) => setCities(r.cities))
      .catch(() => {});
    return () => {
      version.current++;
    };
  }, []);
  const update = (key: keyof DeliveryAddress, v: string) => {
    version.current++;
    onChange({ ...value, [key]: v });
  };
  async function lookup() {
    const cep = value.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      setError("Informe os 8 dígitos do CEP ou preencha manualmente.");
      return;
    }
    const current = ++version.current;
    setBusy(true);
    setError("");
    try {
      const r = await api<Partial<DeliveryAddress>>("/address/cep/" + cep);
      if (current === version.current) onChange({ ...value, ...r });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preencha manualmente.");
    } finally {
      setBusy(false);
    }
  }
  const chosen = cities.find(
    (c) => c.name === value.city && c.state === value.state,
  );
  return (
    <fieldset className="operation-panel address-fields">
      <legend>Endereço de entrega</legend>
      <p>Use o CEP para ajudar no preenchimento ou digite tudo manualmente.</p>
      <div className="field-grid">
        <label className="field">
          CEP opcional
          <input
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            value={value.cep}
            onChange={(e) => update("cep", e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={lookup}
        >
          {busy ? "Consultando…" : "Buscar CEP"}
        </button>
      </div>
      {error && <p role="status">{error}</p>}
      {!!cities.length && (
        <label className="field">
          Cidades cadastradas na loja
          <select
            value={chosen ? `${chosen.name}/${chosen.state}` : ""}
            onChange={(e) => {
              const c = cities.find(
                (x) => `${x.name}/${x.state}` === e.target.value,
              );
              if (!c) {
                version.current++;
                onChange({ ...value, city: "", state: "", neighborhood: "" });
              }
              if (c) {
                version.current++;
                onChange({
                  ...value,
                  city: c.name,
                  state: c.state,
                  neighborhood: "",
                });
              }
            }}
          >
            <option value="">Preencher manualmente</option>
            {cities.map((c) => (
              <option key={c.name + c.state}>
                {c.name}/{c.state}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="field-grid">
        {(
          [
            "city",
            "state",
            "neighborhood",
            "street",
            "number",
            "complement",
            "reference",
          ] as const
        ).map((key) => (
          <label className="field" key={key}>
            {
              {
                city: "Cidade",
                state: "UF",
                neighborhood: "Bairro",
                street: "Rua",
                number: "Número ou S/N",
                complement: "Complemento (opcional)",
                reference: "Referência (opcional)",
              }[key]
            }
            <input
              required={!["complement", "reference"].includes(key)}
              maxLength={key === "state" ? 2 : key === "reference" ? 160 : 100}
              value={value[key]}
              autoComplete={
                {
                  city: "address-level2",
                  state: "address-level1",
                  neighborhood: "address-level3",
                  street: "address-line1",
                  number: "off",
                  complement: "address-line2",
                  reference: "off",
                }[key]
              }
              list={key === "neighborhood" ? "store-neighborhoods" : undefined}
              onChange={(e) =>
                update(
                  key,
                  key === "state"
                    ? e.target.value.toUpperCase()
                    : e.target.value,
                )
              }
            />
          </label>
        ))}
      </div>
      <datalist id="store-neighborhoods">
        {chosen?.neighborhoods.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <small>
        Consulta gratuita via ViaCEP. Confirme os dados antes de enviar.
      </small>
    </fieldset>
  );
}
export function DeliverySettings() {
  const [cities, setCities] = useState<DeliveryCity[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<{ cities: DeliveryCity[] }>("/delivery-areas")
      .then((r) => {
        setCities(r.cities);
        setLoaded(true);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function save() {
    setBusy(true);
    try {
      const r = await api<{ cities: DeliveryCity[] }>(
        "/admin/delivery-areas",
        "PUT",
        { cities },
      );
      setCities(r.cities);
      setMessage("Cidades e bairros salvos.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operation-panel">
      <h2>Cidades e bairros</h2>
      <p>
        Sugestões para facilitar o endereço. Não restringem a área de entrega e
        usam a taxa geral da loja.
      </p>
      {cities.map((c, i) => (
        <div className="operation-panel" key={i}>
          <div className="field-grid">
            <label className="field">
              Cidade
              <input
                maxLength={80}
                value={c.name}
                onChange={(e) =>
                  setCities(
                    cities.map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label className="field">
              UF
              <input
                maxLength={2}
                value={c.state}
                onChange={(e) =>
                  setCities(
                    cities.map((x, j) =>
                      j === i
                        ? { ...x, state: e.target.value.toUpperCase() }
                        : x,
                    ),
                  )
                }
              />
            </label>
          </div>
          <label className="field">
            Bairros (um por linha)
            <textarea
              rows={4}
              value={c.neighborhoods.join("\n")}
              onChange={(e) =>
                setCities(
                  cities.map((x, j) =>
                    j === i
                      ? { ...x, neighborhoods: e.target.value.split("\n") }
                      : x,
                  ),
                )
              }
            />
          </label>
          <button
            className="button secondary"
            type="button"
            onClick={() => setCities(cities.filter((_, j) => j !== i))}
          >
            Remover cidade
          </button>
        </div>
      ))}
      <div className="operation-actions">
        <button
          className="button secondary"
          type="button"
          disabled={!loaded || cities.length >= 100}
          onClick={() =>
            setCities([...cities, { name: "", state: "", neighborhoods: [] }])
          }
        >
          Adicionar cidade
        </button>
        <button
          className="button primary"
          type="button"
          disabled={busy || !loaded}
          onClick={save}
        >
          Salvar cidades e bairros
        </button>
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
