import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
type Config = {
  enabled: boolean;
  automatic: boolean;
  model: string;
  trainingModel: string;
  dailyLimit: number;
  tone: string;
};
type Knowledge = {
  id: string;
  title: string;
  question: string;
  answer: string;
  enabled: number;
};
type Example = {
  id: string;
  question: string;
  answer: string;
  approved: number;
};
type Job = {
  id: string;
  provider_id: string | null;
  status: string;
  model: string;
  trained_model: string | null;
  error: string | null;
};
type Data = {
  config: Config;
  hasKey: boolean;
  profile: Record<string, string>;
  knowledge: Knowledge[];
  examples: Example[];
  jobs: Job[];
  usage: { count?: number; date?: string };
};
const emptyConfig: Config = {
  enabled: false,
  automatic: false,
  model: "gpt-4.1-mini",
  trainingModel: "gpt-4o-mini-2024-07-18",
  dailyLimit: 100,
  tone: "Atencioso, breve e em português do Brasil.",
};
const blankKnowledge = {
  id: "",
  title: "",
  question: "",
  answer: "",
  enabled: 1,
};
const msg = (e: unknown) =>
  e instanceof Error ? e.message : "Não foi possível concluir.";
export function Agent() {
  const [tab, setTab] = useState("profile"),
    [data, setData] = useState<Data | null>(null),
    [config, setConfig] = useState(emptyConfig),
    [profile, setProfile] = useState<Record<string, string>>({}),
    [key, setKey] = useState(""),
    [knowledge, setKnowledge] = useState(blankKnowledge),
    [example, setExample] = useState({
      question: "",
      answer: "",
      approved: false,
    }),
    [question, setQuestion] = useState(""),
    [preview, setPreview] = useState<{
      reply: string;
      needsHuman: boolean;
      sources: { id: string; title: string }[];
    } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmCost, setConfirmCost] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api<Data>("/admin/ai");
      setData(r);
      return r;
    } catch (e) {
      setMessage(msg(e));
      return null;
    }
  }, []);
  useEffect(() => {
    load().then((r) => {
      if (r) {
        setConfig(r.config);
        setProfile(r.profile);
      }
    });
  }, [load]);
  async function action(run: () => Promise<unknown>, success = "Salvo.") {
    setBusy(true);
    try {
      await run();
      await load();
      setMessage(success);
    } catch (e) {
      setMessage(msg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operations-page">
      <h1>Agente de atendimento</h1>
      <p>
        IA por API com conhecimento local da loja. Cadastro e RAG cuidam das
        informações atuais; fine-tuning ajusta o modo de responder com exemplos
        revisados.
      </p>
      <nav className="service-tabs">
        {Object.entries({
          profile: "Informações da loja",
          knowledge: "Perguntas e RAG",
          config: "Modelo e automação",
          training: "Aprendizado e fine-tuning",
        }).map(([id, label]) => (
          <button
            className={"button " + (tab === id ? "primary" : "secondary")}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <p role="status">{message}</p>
      {tab === "profile" && (
        <form
          className="operation-panel"
          onSubmit={(e) => {
            e.preventDefault();
            action(
              () => api("/admin/ai/profile", "PUT", profile),
              "Informações da loja salvas para o RAG.",
            );
          }}
        >
          <h2>O que o agente precisa saber</h2>
          <p>
            Nome, telefone, taxa, prazo, preços e disponibilidade já vêm dos
            cadastros da loja. Preencha as regras complementares abaixo. O
            agente não confirma pedidos nem pagamentos; orienta o cliente a
            finalizar pelo cardápio.
          </p>
          {Object.entries({
            about: "Apresentação da loja",
            hours: "Dias e horários de funcionamento",
            address: "Endereço e referências da loja",
            payments: "Pagamentos, PIX e regras de troco",
            delivery: "Regiões atendidas e regras de entrega",
            policies: "Trocas, cancelamentos, alergênicos e regras importantes",
            menuUrl: "Link público do cardápio",
            handoff: "Como encaminhar ao atendente humano",
          }).map(([k, label]) => (
            <label className="field" key={k}>
              {label}
              <textarea
                rows={k === "menuUrl" ? 1 : 3}
                maxLength={2000}
                value={profile[k] || ""}
                onChange={(e) =>
                  setProfile({ ...profile, [k]: e.target.value })
                }
              />
            </label>
          ))}
          <button className="button primary" disabled={busy}>
            Salvar informações da loja
          </button>
        </form>
      )}
      {tab === "knowledge" && (
        <>
          <form
            className="operation-panel"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api("/admin/ai/knowledge", "POST", {
                  ...knowledge,
                  enabled: !!knowledge.enabled,
                });
                setKnowledge(blankKnowledge);
              }, "Pergunta e resposta salvas e reindexadas.");
            }}
          >
            <h2>
              {knowledge.id
                ? "Editar informação"
                : "Cadastrar resposta principal"}
            </h2>
            <p>
              A busca local recupera perguntas e respostas relevantes para o
              modelo. Informações alteradas entram em uso sem treinar um modelo
              novamente.
            </p>
            {(["title", "question", "answer"] as const).map((k) => (
              <label className="field" key={k}>
                {
                  {
                    title: "Título",
                    question: "Pergunta ou palavras que o cliente usa",
                    answer: "Resposta correta da loja",
                  }[k]
                }
                <textarea
                  required
                  rows={k === "answer" ? 4 : 2}
                  maxLength={k === "answer" ? 6000 : k === "title" ? 160 : 1000}
                  value={knowledge[k]}
                  onChange={(e) =>
                    setKnowledge({ ...knowledge, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={!!knowledge.enabled}
                onChange={(e) =>
                  setKnowledge({
                    ...knowledge,
                    enabled: e.target.checked ? 1 : 0,
                  })
                }
              />{" "}
              Informação ativa
            </label>
            <div className="operation-actions">
              <button className="button primary" disabled={busy}>
                Salvar na base de conhecimento
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setKnowledge(blankKnowledge)}
              >
                Nova informação
              </button>
            </div>
          </form>
          {data?.knowledge.map((k) => (
            <article className="operation-panel" key={k.id}>
              <h3>
                {k.title} · {k.enabled ? "Ativa" : "Pausada"}
              </h3>
              <p>{k.question}</p>
              <p>{k.answer}</p>
              <div className="operation-actions">
                <button
                  className="button secondary"
                  onClick={() => setKnowledge(k)}
                >
                  Editar
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    action(
                      () => api("/admin/ai/knowledge/" + k.id, "DELETE"),
                      "Informação removida.",
                    )
                  }
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
          <form
            className="operation-panel"
            onSubmit={(e) => {
              e.preventDefault();
              action(
                async () =>
                  setPreview(
                    await api("/admin/ai/preview", "POST", { question }),
                  ),
                "Prévia gerada. Revise a resposta e as fontes.",
              );
            }}
          >
            <h2>Testar o agente</h2>
            <label className="field">
              Pergunta de teste
              <input
                required
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Gerar resposta de teste pela API
            </button>
            {preview && (
              <div className="operation-panel">
                <p>{preview.reply}</p>
                <strong>
                  {preview.needsHuman
                    ? "Encaminharia ao atendente"
                    : "Pode responder automaticamente"}
                </strong>
                <p>
                  Fontes recuperadas:{" "}
                  {preview.sources.map((s) => s.title).join(" · ") ||
                    "Cadastro atual da loja e catálogo"}
                </p>
              </div>
            )}
          </form>
        </>
      )}
      {tab === "config" && (
        <form
          className="operation-panel"
          onSubmit={(e) => {
            e.preventDefault();
            action(async () => {
              await api("/admin/ai/config", "PUT", { ...config, apiKey: key });
              setKey("");
            }, "Configuração da IA salva.");
          }}
        >
          <h2>API de IA</h2>
          <p>
            A chave fica no servidor local. Perguntas e contexto selecionado da
            loja são enviados à API OpenAI. O PC não precisa de GPU. Não inclua
            dados bancários sensíveis na base.
          </p>
          <label className="field">
            Chave da API
            <input
              type="password"
              autoComplete="new-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                data?.hasKey
                  ? "Já cadastrada; deixe vazio para manter"
                  : "Cadastre sua chave da API"
              }
            />
          </label>
          <div className="field-grid">
            <label className="field">
              Modelo para atendimento
              <input
                required
                value={config.model}
                onChange={(e) =>
                  setConfig({ ...config, model: e.target.value })
                }
              />
            </label>
            <label className="field">
              Limite de chamadas por dia
              <input
                type="number"
                required
                min={1}
                max={10000}
                value={config.dailyLimit}
                onChange={(e) =>
                  setConfig({ ...config, dailyLimit: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="field">
            Tom e estilo
            <textarea
              maxLength={500}
              value={config.tone}
              onChange={(e) => setConfig({ ...config, tone: e.target.value })}
            />
          </label>
          <div className="service-checks">
            <label>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) =>
                  setConfig({ ...config, enabled: e.target.checked })
                }
              />{" "}
              Habilitar agente
            </label>
            <label>
              <input
                type="checkbox"
                checked={config.automatic}
                onChange={(e) =>
                  setConfig({ ...config, automatic: e.target.checked })
                }
              />{" "}
              Responder automaticamente nos tickets em modo agente
            </label>
          </div>
          <p>
            Responder manualmente pausa o agente naquele ticket. Retome pela
            conversa quando quiser. Sem informação suficiente, o agente
            encaminha à equipe.
          </p>
          <p>
            Chamadas contabilizadas: {data?.usage.count || 0} ·{" "}
            {data?.usage.date || "Sem uso"}
          </p>
          <button className="button primary" disabled={busy}>
            Salvar modelo e automação
          </button>
        </form>
      )}
      {tab === "training" && (
        <>
          <form
            className="operation-panel"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api("/admin/ai/examples", "POST", example);
                setExample({ question: "", answer: "", approved: false });
              }, "Exemplo cadastrado.");
            }}
          >
            <h2>Exemplos revisados</h2>
            <p>
              O agente não aprende sozinho com toda conversa. Cadastre exemplos
              de estilo e comportamento, sem informações pessoais nem preços que
              mudam. Telefones e e-mails são mascarados automaticamente; revise
              nomes e endereços antes de aprovar.
            </p>
            <label className="field">
              Pergunta do cliente
              <textarea
                required
                maxLength={2000}
                value={example.question}
                onChange={(e) =>
                  setExample({ ...example, question: e.target.value })
                }
              />
            </label>
            <label className="field">
              Resposta ideal revisada
              <textarea
                required
                rows={4}
                maxLength={4000}
                value={example.answer}
                onChange={(e) =>
                  setExample({ ...example, answer: e.target.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={example.approved}
                onChange={(e) =>
                  setExample({ ...example, approved: e.target.checked })
                }
              />{" "}
              Revisei e aprovo este exemplo para treinamento
            </label>
            <div className="operation-actions">
              <button className="button primary" disabled={busy}>
                Salvar exemplo
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  action(async () => {
                    const r = await api<{ jsonl: string }>("/admin/ai/dataset");
                    const url = URL.createObjectURL(
                        new Blob([r.jsonl], { type: "application/jsonl" }),
                      ),
                      a = document.createElement("a");
                    a.href = url;
                    a.download = "pronto-treinamento-revisado.jsonl";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }, "Dataset exportado.")
                }
              >
                Exportar JSONL aprovado
              </button>
            </div>
          </form>
          <div className="operation-panel">
            <h2>Treinar um modelo próprio por fine-tuning</h2>
            <p>
              Comece com avaliação das respostas e pelo menos 10 exemplos
              aprovados; 50 a 100 variados dão uma base melhor. Treinamento é
              pago pelo provedor e não é iniciado automaticamente.
            </p>
            <label className="field">
              Modelo base compatível com fine-tuning
              <input
                value={config.trainingModel}
                onChange={(e) =>
                  setConfig({ ...config, trainingModel: e.target.value })
                }
              />
            </label>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                action(
                  () =>
                    api("/admin/ai/config", "PUT", { ...config, apiKey: key }),
                  "Modelo base salvo.",
                )
              }
            >
              Salvar modelo base
            </button>
            <p>
              {data?.examples.filter((e) => e.approved).length || 0} exemplos
              aprovados
            </p>
            <label>
              <input
                type="checkbox"
                checked={confirmCost}
                onChange={(e) => setConfirmCost(e.target.checked)}
              />{" "}
              Autorizo enviar os exemplos revisados à OpenAI e iniciar
              treinamento pago na minha conta
            </label>
            <div className="operation-actions">
              <button
                className="button primary"
                disabled={
                  busy ||
                  !confirmCost ||
                  (data?.examples.filter((e) => e.approved).length || 0) < 10
                }
                onClick={() =>
                  action(
                    () =>
                      api("/admin/ai/training", "POST", { confirmCost: true }),
                    "Treinamento solicitado. Acompanhe o estado abaixo.",
                  )
                }
              >
                Iniciar fine-tuning
              </button>
            </div>
            {data?.jobs.map((j) => (
              <article className="operation-panel" key={j.id}>
                <strong>
                  {j.model} · {j.status}
                </strong>
                <p>{j.provider_id || "Sem identificador confirmado"}</p>
                {j.trained_model && <p>Modelo treinado: {j.trained_model}</p>}
                {j.error && <p>{j.error}</p>}
                {!j.provider_id &&
                  ["uploading", "uncertain"].includes(j.status) && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fields = new FormData(e.currentTarget);
                        action(
                          () =>
                            api(
                              "/admin/ai/training/" + j.id + "/reconcile",
                              "POST",
                              {
                                providerId: String(
                                  fields.get("providerId") || "",
                                ),
                                confirmNoJob:
                                  fields.get("confirmNoJob") === "on",
                              },
                            ),
                          "Conferência salva.",
                        );
                      }}
                    >
                      <p>
                        Confira o painel da OpenAI antes de iniciar outro
                        treinamento. Se já existir, vincule o ID abaixo e
                        consulte o estado.
                      </p>
                      <label className="field">
                        ID do trabalho no painel
                        <input name="providerId" placeholder="ftjob-..." />
                      </label>
                      <label>
                        <input type="checkbox" name="confirmNoJob" /> Conferi no
                        painel e confirmo que nenhum treinamento foi criado
                      </label>
                      <button className="button secondary" disabled={busy}>
                        Salvar conferência
                      </button>
                    </form>
                  )}
                <div className="operation-actions">
                  <button
                    className="button secondary"
                    disabled={busy || !j.provider_id}
                    onClick={() =>
                      action(
                        () =>
                          api(
                            "/admin/ai/training/" + j.id + "/sync",
                            "POST",
                            {},
                          ),
                        "Estado atualizado.",
                      )
                    }
                  >
                    Atualizar treinamento
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy || j.status !== "succeeded" || !j.trained_model
                    }
                    onClick={() =>
                      action(async () => {
                        await api(
                          "/admin/ai/training/" + j.id + "/activate",
                          "POST",
                          {},
                        );
                        const r = await load();
                        if (r) setConfig(r.config);
                      }, "Modelo treinado ativado no agente.")
                    }
                  >
                    Usar modelo treinado
                  </button>
                </div>
              </article>
            ))}
          </div>
          <h2>Revisão dos exemplos</h2>
          {data?.examples.map((e) => (
            <article className="operation-panel" key={e.id}>
              <p>
                <strong>{e.question}</strong>
              </p>
              <p>{e.answer}</p>
              <div className="operation-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    action(
                      () =>
                        api("/admin/ai/examples/" + e.id, "PATCH", {
                          approved: !e.approved,
                        }),
                      e.approved ? "Exemplo desmarcado." : "Exemplo aprovado.",
                    )
                  }
                >
                  {e.approved ? "Retirar aprovação" : "Aprovar"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    action(
                      () => api("/admin/ai/examples/" + e.id, "DELETE"),
                      "Exemplo removido.",
                    )
                  }
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
