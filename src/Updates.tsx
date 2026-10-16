import { useState } from "react";
import { Download, RefreshCw, CheckCircle2 } from "lucide-react";
import type { DesktopInfo, UpdateState } from "./types";
export function Updates({ desktop }: { desktop: DesktopInfo | null }) {
  const [local, setLocal] = useState<UpdateState | null>(null),
    [error, setError] = useState("");
  const state = (desktop?.update?.stage && desktop.update.stage !== "idle"
    ? desktop.update
    : local) || {
    stage: "idle",
    currentVersion: desktop?.version || "0.3.0",
    progress: 0,
  };
  async function check() {
    setError("");
    try {
      setLocal({
        stage: "checking",
        currentVersion: desktop!.version,
        progress: 0,
      });
      setLocal(await window.prontoDesktop!.checkUpdate());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível consultar.");
    }
  }
  return (
    <section className="section-card update-card">
      <div className="section-card-header">
        <div>
          <h2>
            <Download size={20} />
            Atualizações do gestor
          </h2>
          <p>
            Versão instalada: {desktop?.version || "web"}. Consulta a versão
            publicada na main/master do GitHub.
          </p>
        </div>
        {desktop && (
          <button
            className="button secondary"
            disabled={["checking", "downloading"].includes(state.stage)}
            onClick={check}
          >
            <RefreshCw size={16} />
            {state.stage === "checking" ? "Consultando…" : "Buscar atualização"}
          </button>
        )}
      </div>
      <div className="update-body">
        {!desktop ? (
          <p>
            Abra o gestor Windows para baixar atualizações. O cardápio e o
            garçom recebem a interface do próprio servidor.
          </p>
        ) : (
          <>
            <p>
              {state.stage === "idle"
                ? "Você escolhe quando consultar, baixar e instalar. O funcionamento local não precisa de VPS."
                : state.stage === "checking"
                  ? "Conferindo a versão publicada…"
                  : state.stage === "upToDate"
                    ? `Você já está na versão mais recente publicada (${state.version}).`
                    : state.stage === "available"
                      ? `Versão ${state.version} disponível (${((state.size || 0) / 1024 / 1024).toFixed(1)} MB).`
                      : state.stage === "downloading"
                        ? `Baixando e verificando: ${state.progress}%`
                        : state.stage === "ready"
                          ? `Atualização ${state.version} baixada e verificada.`
                          : state.stage === "incompatible"
                            ? "Esta atualização exige um instalador completo. Consulte a distribuição do projeto."
                            : state.error ||
                              "Não foi possível verificar a atualização."}
            </p>
            {state.notes?.length ? (
              <ul>
                {state.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            ) : null}
            {state.stage === "available" && (
              <button
                className="button primary"
                onClick={async () => {
                  try {
                    setLocal(await window.prontoDesktop!.downloadUpdate());
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Não foi possível baixar.",
                    );
                  }
                }}
              >
                <Download size={17} />
                Baixar atualização
              </button>
            )}
            {state.stage === "downloading" && (
              <progress max={100} value={state.progress} />
            )}{" "}
            {state.stage === "ready" && (
              <button
                className="button primary"
                onClick={async () => {
                  try {
                    await window.prontoDesktop!.installUpdate();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Não foi possível instalar.",
                    );
                  }
                }}
              >
                <CheckCircle2 size={17} />
                Fechar gestor e abrir instalador
              </button>
            )}
            <p className="small-text">
              O download exige internet e é conferido por SHA-256. Instalar
              fecha o gestor e pausa a impressão; termine o assistente, abra
              novamente e confira a impressão automática. Seus pedidos e
              configurações são preservados.
            </p>
          </>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
