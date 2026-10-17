import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
export function LocalBackups() {
  const [data, setData] = useState<{
      files: { name: string; size: number; createdAt: string }[];
      directory: string;
      error: string;
    } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api("/admin/backups"));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="section-card local-backups">
      <h2>Backups locais</h2>
      <p>
        Uma cópia por dia ao abrir o servidor, com verificação de integridade.
        Mantém as 7 cópias mais recentes.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/admin/backups", "POST");
            await load();
            setMessage("Backup criado e integridade verificada.");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Criar backup agora
      </button>
      <p role="status">{message || data?.error}</p>
      {data && (
        <>
          <label className="field">
            Pasta dos backups
            <input readOnly value={data.directory} />
          </label>
          <ul>
            {data.files.map((f) => (
              <li key={f.name}>
                {new Date(f.createdAt).toLocaleString("pt-BR")} ·{" "}
                {Math.ceil(f.size / 1024)} KB
              </li>
            ))}
          </ul>
        </>
      )}
      <small>
        Copie essa pasta para outro disco para proteger contra falha do PC. Para
        restaurar, feche o gestor e use o procedimento do guia; ele desativa
        filas antigas para não repetir impressão ou mensagens. Chaves de
        integração ficam vinculadas ao computador original.
      </small>
    </section>
  );
}
