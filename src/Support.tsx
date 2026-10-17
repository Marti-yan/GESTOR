import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, createId } from "./api";
type Tag = { id: string; name: string; color: string };
type Contact = {
  id: string;
  name: string;
  phone: string;
  consent: number;
  consent_source: string;
  unsubscribed: number;
  notes: string;
};
type Ticket = {
  id: string;
  number: number;
  contact_id: string;
  name: string;
  phone: string;
  status: string;
  agent_mode: string;
  version: number;
  tags: Tag[];
  lastMessage?: { body: string; state: string };
};
type Message = {
  id: string;
  direction: string;
  body: string;
  origin: string;
  state: string;
  error: string | null;
  created_at: string;
};
type Reply = { id: string; shortcut: string; title: string; body: string };
const err = (e: unknown) =>
  e instanceof Error ? e.message : "Não foi possível concluir.";
const status: Record<string, string> = {
  waiting: "Aguardando",
  open: "Em atendimento",
  closed: "Concluído",
  pending: "Na fila",
  sending: "Enviando",
  sent: "Enviado",
  received: "Recebido",
  failed: "Falhou",
  uncertain: "Conferir envio",
  cancelled: "Cancelado",
  delivered: "Entregue",
  read: "Lido",
};
export function Support() {
  const [tab, setTab] = useState("tickets");
  return (
    <section className="operations-page support-page">
      <h1>Atendimento</h1>
      <nav className="service-tabs">
        {Object.entries({
          tickets: "Conversas e Kanban",
          contacts: "Contatos",
          tools: "Tags e respostas rápidas",
          campaigns: "Campanhas",
          connection: "Conexão WhatsApp",
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
      {tab === "tickets" ? (
        <Tickets />
      ) : tab === "contacts" ? (
        <Contacts />
      ) : tab === "tools" ? (
        <SupportTools />
      ) : tab === "campaigns" ? (
        <Campaigns />
      ) : (
        <WhatsAppConnection />
      )}
    </section>
  );
}
function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [tags, setTags] = useState<Tag[]>([]),
    [contacts, setContacts] = useState<Contact[]>([]),
    [replies, setReplies] = useState<Reply[]>([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<{
      ticket: Ticket;
      messages: Message[];
    } | null>(null),
    [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [group, setGroup] = useState("status"),
    [filter, setFilter] = useState("active"),
    [contactId, setContactId] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const sendLock = useRef(false),
    sendKey = useRef({ signature: "", key: "" });
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const load = useCallback(async () => {
    try {
      const [t, g, c, q] = await Promise.all([
        api<{ tickets: Ticket[] }>("/admin/tickets"),
        api<{ tags: Tag[] }>("/admin/tags"),
        api<{ contacts: Contact[] }>("/admin/contacts"),
        api<{ replies: Reply[] }>("/admin/quick-replies"),
      ]);
      setTickets(t.tickets);
      setTags(g.tags);
      setContacts(c.contacts);
      setReplies(q.replies);
    } catch (e) {
      setError(err(e));
    }
  }, []);
  const loadDetail = useCallback(async () => {
    if (!selected) return;
    try {
      const response = await api<{ ticket: Ticket; messages: Message[] }>(
        "/admin/tickets/" + selected,
      );
      if (selectedRef.current === selected) setDetail(response);
    } catch (e) {
      setError(err(e));
    }
  }, [selected]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    setDetail(null);
    setText("");
    loadDetail();
    const t = setInterval(loadDetail, 4000);
    return () => clearInterval(t);
  }, [loadDetail]);
  async function patch(body: Record<string, unknown>) {
    if (!detail) return;
    setBusy(true);
    try {
      await api("/admin/tickets/" + selected, "PATCH", {
        ...body,
        expectedVersion: detail.ticket.version,
      });
      await Promise.all([load(), loadDetail()]);
      setError("");
    } catch (e) {
      setError(err(e));
      await loadDetail();
    } finally {
      setBusy(false);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !detail || sendLock.current) return;
    sendLock.current = true;
    setBusy(true);
    const signature = selected + ":" + text;
    if (sendKey.current.signature !== signature)
      sendKey.current = { signature, key: createId() };
    try {
      await api(
        "/admin/tickets/" + selected + "/messages",
        "POST",
        { body: text },
        { "Idempotency-Key": sendKey.current.key },
      );
      setText("");
      sendKey.current = { signature: "", key: "" };
      await Promise.all([load(), loadDetail()]);
      setError("");
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
      sendLock.current = false;
    }
  }
  const filtered = tickets.filter(
    (t) =>
      (filter === "all" ||
        (filter === "active" && t.status !== "closed") ||
        (filter === "closed" && t.status === "closed")) &&
      (!tag || t.tags.some((g) => g.id === tag)) &&
      `${t.name} ${t.phone} ${t.number}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const lanes =
    group === "tag"
      ? [
          ...tags.map((t) => ({ id: t.id, label: t.name, color: t.color })),
          { id: "untagged", label: "Sem tag", color: "#77816e" },
        ]
      : [
          { id: "waiting", label: "Aguardando", color: "#b59531" },
          { id: "open", label: "Em atendimento", color: "#ef5a36" },
          { id: "closed", label: "Concluídos", color: "#57854a" },
        ];
  return (
    <>
      <div className="report-filters">
        <label className="field">
          Buscar conversa
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          Tag
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Todas</option>
            {tags.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Kanban por
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="status">Etapa do ticket</option>
            <option value="tag">Tags</option>
          </select>
        </label>
        <label className="field">
          Mostrar
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="active">Tickets ativos</option>
            <option value="closed">Concluídos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <label className="field">
          Abrir conversa
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">Selecione um contato</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={!contactId || busy}
          onClick={async () => {
            try {
              const r = await api<{ ticket: Ticket }>(
                "/admin/tickets",
                "POST",
                { contactId },
              );
              setSelected(r.ticket.id);
              await load();
            } catch (e) {
              setError(err(e));
            }
          }}
        >
          Abrir ticket
        </button>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="chat-kanban">
        {lanes.map((l) => (
          <section className="chat-lane" key={l.id}>
            <h2 style={{ borderColor: l.color }}>
              {l.label}{" "}
              <small>
                {
                  filtered.filter((t) =>
                    group === "status"
                      ? t.status === l.id
                      : l.id === "untagged"
                        ? !t.tags.length
                        : t.tags.some((g) => g.id === l.id),
                  ).length
                }
              </small>
            </h2>
            {filtered
              .filter((t) =>
                group === "status"
                  ? t.status === l.id
                  : l.id === "untagged"
                    ? !t.tags.length
                    : t.tags.some((g) => g.id === l.id),
              )
              .map((t) => (
                <button
                  className="chat-ticket"
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                >
                  <strong>
                    #{t.number} · {t.name}
                  </strong>
                  <small>
                    {t.phone} · {status[t.status]}
                  </small>
                  <span className="chat-tag-list">
                    {t.tags.map((g) => (
                      <span
                        style={{ borderColor: g.color, color: g.color }}
                        key={g.id}
                      >
                        {g.name}
                      </span>
                    ))}
                  </span>
                  <p>{t.lastMessage?.body || "Sem mensagens"}</p>
                  <small>
                    {t.agent_mode === "auto"
                      ? "Agente habilitado"
                      : "Agente pausado"}
                  </small>
                </button>
              ))}
          </section>
        ))}
      </div>
      {selected && (
        <aside
          className="chat-pane"
          role="dialog"
          aria-label="Conversa do ticket"
        >
          <header>
            <strong>
              {detail
                ? `#${detail.ticket.number} · ${detail.ticket.name}`
                : "Carregando ticket…"}
            </strong>
            <button
              className="icon-button"
              aria-label="Fechar conversa"
              onClick={() => {
                setSelected("");
                setDetail(null);
              }}
            >
              ✕
            </button>
          </header>
          {detail && (
            <>
              <div className="chat-actions">
                <button
                  className="button secondary small"
                  disabled={busy || detail.ticket.status === "closed"}
                  onClick={() =>
                    patch({
                      agentMode:
                        detail.ticket.agent_mode === "auto" ? "paused" : "auto",
                      status: "open",
                    })
                  }
                >
                  {detail.ticket.agent_mode === "auto"
                    ? "Assumir e pausar agente"
                    : "Retomar agente"}
                </button>
                <select
                  aria-label="Etapa do ticket"
                  disabled={busy}
                  value={detail.ticket.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  <option value="waiting">Aguardando</option>
                  <option value="open">Em atendimento</option>
                  <option value="closed">Concluído</option>
                </select>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await api<{
                        reply: string;
                        needsHuman: boolean;
                      }>("/admin/tickets/" + selected + "/suggest", "POST", {});
                      setText(r.reply);
                      if (r.needsHuman)
                        setError(
                          "A sugestão pede atendimento humano; revise antes de enviar.",
                        );
                    } catch (e) {
                      setError(err(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Sugerir resposta com IA
                </button>
              </div>
              <p className="chat-hint">
                {detail.ticket.agent_mode === "auto"
                  ? "O agente responde quando a automação global estiver ativa."
                  : "Você está no controle. Responder manualmente também pausa o agente."}
              </p>
              <div className="chat-tag-list editable">
                {tags.map((g) => (
                  <label key={g.id} style={{ borderColor: g.color }}>
                    <input
                      type="checkbox"
                      checked={detail.ticket.tags.some((x) => x.id === g.id)}
                      disabled={busy}
                      onChange={(e) =>
                        patch({
                          tagIds: e.target.checked
                            ? [...detail.ticket.tags.map((x) => x.id), g.id]
                            : detail.ticket.tags
                                .filter((x) => x.id !== g.id)
                                .map((x) => x.id),
                        })
                      }
                    />
                    {g.name}
                  </label>
                ))}
              </div>
              <div className="chat-messages">
                {detail.messages.map((m) => (
                  <article
                    className={
                      "chat-message " + (m.direction === "out" ? "out" : "in")
                    }
                    key={m.id}
                  >
                    <p>{m.body}</p>
                    <small>
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ·{" "}
                      {m.origin === "ai"
                        ? "IA"
                        : m.origin === "human"
                          ? "Atendente"
                          : m.origin === "campaign"
                            ? "Campanha"
                            : m.origin === "external"
                              ? "WhatsApp externo"
                              : "Cliente"}{" "}
                      · {status[m.state] || m.state}
                    </small>
                    {m.error && <p className="error-banner">{m.error}</p>}
                  </article>
                ))}
              </div>
              <form className="chat-composer" onSubmit={send}>
                <select
                  aria-label="Inserir resposta rápida"
                  value=""
                  onChange={(e) => {
                    const q = replies.find((q) => q.id === e.target.value);
                    if (q)
                      setText(
                        q.body.replaceAll("{{nome}}", detail.ticket.name),
                      );
                  }}
                >
                  <option value="">Respostas rápidas salvas…</option>
                  {replies.map((q) => (
                    <option value={q.id} key={q.id}>
                      /{q.shortcut} · {q.title}
                    </option>
                  ))}
                </select>
                <textarea
                  aria-label="Mensagem do atendente"
                  required
                  rows={3}
                  maxLength={4000}
                  value={text}
                  disabled={detail.ticket.status === "closed"}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Digite uma mensagem ou insira uma resposta rápida"
                />
                {text.startsWith("/") &&
                  replies
                    .filter((r) => r.shortcut.startsWith(text.slice(1).trim()))
                    .map((r) => (
                      <button
                        type="button"
                        className="button secondary small"
                        key={r.id}
                        onClick={() =>
                          setText(
                            r.body.replaceAll("{{nome}}", detail.ticket.name),
                          )
                        }
                      >
                        /{r.shortcut} · {r.title}
                      </button>
                    ))}
                <button
                  className="button primary"
                  disabled={
                    busy || !text.trim() || detail.ticket.status === "closed"
                  }
                >
                  Enviar e pausar agente
                </button>
              </form>
            </>
          )}
        </aside>
      )}
    </>
  );
}
function Contacts() {
  const blank = {
    name: "",
    phone: "",
    consent: false,
    consentSource: "",
    notes: "",
  };
  const [contacts, setContacts] = useState<Contact[]>([]),
    [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState(""),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<{ contacts: Contact[] }>("/admin/contacts")
        .then((r) => setContacts(r.contacts))
        .catch((e) => setMessage(err(e))),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        "/admin/contacts" + (editing ? "/" + editing : ""),
        editing ? "PATCH" : "POST",
        draft,
      );
      setDraft(blank);
      setEditing("");
      await load();
      setMessage("Contato salvo.");
    } catch (e) {
      setMessage(err(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="operation-panel" onSubmit={save}>
        <h2>{editing ? "Editar contato" : "Cadastrar contato"}</h2>
        <div className="field-grid">
          <label className="field">
            Nome
            <input
              required
              value={draft.name}
              maxLength={100}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            Telefone com DDI e DDD
            <input
              required
              disabled={!!editing}
              placeholder="5511999999999"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={draft.consent}
            onChange={(e) => setDraft({ ...draft, consent: e.target.checked })}
          />{" "}
          Contato autorizou receber campanhas
        </label>
        {draft.consent && (
          <label className="field">
            Origem da autorização
            <input
              required
              maxLength={300}
              placeholder="Ex.: formulário de cadastro, em 17/10"
              value={draft.consentSource}
              onChange={(e) =>
                setDraft({ ...draft, consentSource: e.target.value })
              }
            />
          </label>
        )}
        <label className="field">
          Observações
          <textarea
            maxLength={1000}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <div className="operation-actions">
          <button className="button primary" disabled={busy}>
            Salvar contato
          </button>
          {editing && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setEditing("");
                setDraft(blank);
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
      <p role="status">{message}</p>
      <label className="field">
        Buscar contato
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <div className="report-table">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Campanhas</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {contacts
              .filter((c) =>
                (c.name + " " + c.phone)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>
                    {c.unsubscribed
                      ? "Descadastrado"
                      : c.consent
                        ? "Autorizado"
                        : "Sem autorização"}
                  </td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setEditing(c.id);
                        setDraft({
                          name: c.name,
                          phone: c.phone,
                          consent: !!c.consent,
                          consentSource: c.consent_source,
                          notes: c.notes,
                        });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function SupportTools() {
  const [tags, setTags] = useState<Tag[]>([]),
    [replies, setReplies] = useState<Reply[]>([]),
    [tag, setTag] = useState({ id: "", name: "", color: "#ef5a36" }),
    [reply, setReply] = useState({ id: "", shortcut: "", title: "", body: "" }),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const [t, q] = await Promise.all([
        api<{ tags: Tag[] }>("/admin/tags"),
        api<{ replies: Reply[] }>("/admin/quick-replies"),
      ]);
      setTags(t.tags);
      setReplies(q.replies);
    } catch (e) {
      setMessage(err(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="service-two-col">
      <section className="operation-panel">
        <h2>Tags das conversas</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/admin/tags", "POST", tag);
              setTag({ id: "", name: "", color: "#ef5a36" });
              await load();
            } catch (e) {
              setMessage(err(e));
            }
          }}
        >
          <label className="field">
            Nome da tag
            <input
              required
              maxLength={40}
              value={tag.name}
              onChange={(e) => setTag({ ...tag, name: e.target.value })}
            />
          </label>
          <label className="field">
            Cor
            <input
              type="color"
              value={tag.color}
              onChange={(e) => setTag({ ...tag, color: e.target.value })}
            />
          </label>
          <button className="button primary">Salvar tag</button>
        </form>
        <div className="chat-tag-list">
          {tags.map((t) => (
            <span style={{ borderColor: t.color, color: t.color }} key={t.id}>
              <button className="text-link" onClick={() => setTag(t)}>
                {t.name}
              </button>
              <button
                className="icon-button"
                aria-label={"Excluir tag " + t.name}
                onClick={async () => {
                  try {
                    await api("/admin/tags/" + t.id, "DELETE");
                    await load();
                  } catch (e) {
                    setMessage(err(e));
                  }
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <p role="status">{message}</p>
      </section>
      <section className="operation-panel">
        <h2>Respostas rápidas</h2>
        <p>
          Use o atalho na conversa ou selecione na lista. {"{{nome}}"} insere o
          nome do contato.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/admin/quick-replies", "POST", reply);
              setReply({ id: "", shortcut: "", title: "", body: "" });
              await load();
              setMessage("Resposta salva.");
            } catch (e) {
              setMessage(err(e));
            }
          }}
        >
          <label className="field">
            Atalho sem espaços
            <input
              required
              pattern="[a-zA-Z0-9_-]+"
              value={reply.shortcut}
              onChange={(e) => setReply({ ...reply, shortcut: e.target.value })}
            />
          </label>
          <label className="field">
            Título
            <input
              required
              maxLength={100}
              value={reply.title}
              onChange={(e) => setReply({ ...reply, title: e.target.value })}
            />
          </label>
          <label className="field">
            Resposta
            <textarea
              required
              rows={5}
              maxLength={4000}
              value={reply.body}
              onChange={(e) => setReply({ ...reply, body: e.target.value })}
            />
          </label>
          <button className="button primary">Salvar resposta</button>
        </form>
        {replies.map((q) => (
          <div className="service-row" key={q.id}>
            <strong>
              /{q.shortcut} · {q.title}
            </strong>
            <button
              className="button secondary small"
              onClick={() => setReply(q)}
            >
              Editar
            </button>
            <button
              className="button secondary small"
              onClick={async () => {
                try {
                  await api("/admin/quick-replies/" + q.id, "DELETE");
                  await load();
                } catch (e) {
                  setMessage(err(e));
                }
              }}
            >
              Excluir
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
function Campaigns() {
  type Campaign = {
    id: string;
    name: string;
    body: string;
    status: string;
    counts: { state: string; count: number }[];
    interval_seconds: number;
  };
  type Out = {
    id: string;
    kind: string;
    state: string;
    name: string;
    phone: string;
    body: string;
    error: string | null;
  };
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [outbox, setOutbox] = useState<Out[]>([]),
    [tags, setTags] = useState<Tag[]>([]),
    [contacts, setContacts] = useState<Contact[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [draft, setDraft] = useState({
      name: "",
      body: "",
      tagId: "",
      intervalSeconds: 30,
      templateName: "",
      templateLanguage: "pt_BR",
      templateUseName: false,
    }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [r, g, c] = await Promise.all([
        api<{ campaigns: Campaign[]; outbox: Out[] }>("/admin/campaigns"),
        api<{ tags: Tag[] }>("/admin/tags"),
        api<{ contacts: Contact[] }>("/admin/contacts"),
      ]);
      setCampaigns(r.campaigns);
      setOutbox(r.outbox);
      setTags(g.tags);
      setContacts(c.contacts.filter((c) => c.consent && !c.unsubscribed));
    } catch (e) {
      setMessage(err(e));
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ recipients: number }>("/admin/campaigns", "POST", {
        ...draft,
        contactIds: selected,
      });
      setMessage(
        `Rascunho criado com ${r.recipients} contatos autorizados. Confira antes de iniciar.`,
      );
      await load();
    } catch (e) {
      setMessage(err(e));
    } finally {
      setBusy(false);
    }
  }
  async function change(id: string, state: string) {
    setBusy(true);
    try {
      await api("/admin/campaigns/" + id, "PATCH", { status: state });
      await load();
    } catch (e) {
      setMessage(err(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="operation-panel" onSubmit={create}>
        <h2>Campanha com consentimento</h2>
        <p>
          Envios em fila com intervalo fixo, pausa e descadastro por SAIR. Não
          há randomização para contornar bloqueios. A autorização é conferida
          novamente antes de cada envio.
        </p>
        <div className="field-grid">
          <label className="field">
            Nome da campanha
            <input
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            Filtrar pela tag das conversas
            <select
              value={draft.tagId}
              onChange={(e) => setDraft({ ...draft, tagId: e.target.value })}
            >
              <option value="">Todas as tags</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Mensagem
          <textarea
            required
            rows={4}
            maxLength={3500}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder="Use {{nome}} para personalizar o nome no envio de texto."
          />
        </label>
        <label className="field">
          Intervalo entre destinatários (segundos)
          <input
            type="number"
            required
            min={30}
            max={3600}
            value={draft.intervalSeconds}
            onChange={(e) =>
              setDraft({ ...draft, intervalSeconds: Number(e.target.value) })
            }
          />
        </label>
        <details>
          <summary>
            Selecionar contatos autorizados (vazio usa todos do filtro)
          </summary>
          <div className="contact-picker">
            {contacts.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, c.id]
                        : selected.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name} · {c.phone}
              </label>
            ))}
          </div>
        </details>
        <details>
          <summary>Template aprovado para a Cloud API</summary>
          <p>
            Na Cloud API, o WhatsApp envia o template aprovado, não o texto
            livre acima. O template deve conter a instrução de descadastro. Use
            o nome e o idioma exatos do painel Meta.
          </p>
          <div className="field-grid">
            <label className="field">
              Nome do template
              <input
                value={draft.templateName}
                onChange={(e) =>
                  setDraft({ ...draft, templateName: e.target.value })
                }
              />
            </label>
            <label className="field">
              Idioma
              <input
                value={draft.templateLanguage}
                onChange={(e) =>
                  setDraft({ ...draft, templateLanguage: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={draft.templateUseName}
              onChange={(e) =>
                setDraft({ ...draft, templateUseName: e.target.checked })
              }
            />{" "}
            O template possui um parâmetro de nome no corpo ({"{{1}}"})
          </label>
        </details>
        <button className="button primary" disabled={busy}>
          Criar rascunho e conferir destinatários
        </button>
      </form>
      <p role="status">{message}</p>
      {campaigns.map((c) => (
        <article className="operation-panel" key={c.id}>
          <h3>
            {c.name} ·{" "}
            {{
              draft: "Rascunho",
              running: "Em execução",
              paused: "Pausada",
              completed: "Concluída",
              cancelled: "Cancelada",
            }[c.status] || c.status}
          </h3>
          <p>{c.body}</p>
          <p>
            {c.interval_seconds}s entre envios ·{" "}
            {c.counts
              .map((x) => `${status[x.state] || x.state}: ${x.count}`)
              .join(" · ")}
          </p>
          <div className="operation-actions">
            {!["completed", "cancelled", "running"].includes(c.status) && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => change(c.id, "running")}
              >
                {c.status === "draft" ? "Iniciar envios" : "Retomar campanha"}
              </button>
            )}
            {c.status === "running" && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => change(c.id, "paused")}
              >
                Pausar campanha
              </button>
            )}
            {!["completed", "cancelled"].includes(c.status) && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => change(c.id, "cancelled")}
              >
                Cancelar campanha
              </button>
            )}
          </div>
        </article>
      ))}
      <h2>Fila de mensagens</h2>
      <p>
        Falhas interrompem a campanha. Um envio incerto exige conferência no
        telefone e não é repetido automaticamente.
      </p>
      <div className="report-table">
        <table>
          <thead>
            <tr>
              <th>Contato</th>
              <th>Mensagem</th>
              <th>Estado</th>
              <th>Conferência</th>
            </tr>
          </thead>
          <tbody>
            {outbox.map((o) => (
              <tr key={o.id}>
                <td>
                  {o.name}
                  <br />
                  {o.phone}
                </td>
                <td>{o.body.slice(0, 140)}</td>
                <td>
                  {status[o.state] || o.state}
                  {o.error && <p>{o.error}</p>}
                </td>
                <td>
                  {["failed", "uncertain"].includes(o.state) && (
                    <>
                      <button
                        className="button secondary small"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              "Você conferiu no WhatsApp e confirma que essa mensagem foi enviada?",
                            )
                          )
                            return;
                          try {
                            await api(
                              "/admin/outbox/" + o.id + "/resolve",
                              "POST",
                              { state: "sent" },
                            );
                            await load();
                          } catch (e) {
                            setMessage(err(e));
                          }
                        }}
                      >
                        Confirmar enviada
                      </button>
                      <button
                        className="button secondary small"
                        onClick={async () => {
                          try {
                            await api(
                              "/admin/outbox/" + o.id + "/resolve",
                              "POST",
                              { state: "cancelled" },
                            );
                            await load();
                          } catch (e) {
                            setMessage(err(e));
                          }
                        }}
                      >
                        Descartar envio
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function WhatsAppConnection() {
  type Config = {
    provider: string;
    enabled: boolean;
    baseUrl: string;
    instance: string;
    phoneNumberId: string;
    graphVersion: string;
  };
  const [config, setConfig] = useState<Config>({
      provider: "none",
      enabled: false,
      baseUrl: "",
      instance: "pronto",
      phoneNumberId: "",
      graphVersion: "v23.0",
    }),
    [apiKey, setKey] = useState(""),
    [appSecret, setAppSecret] = useState(""),
    [hasKey, setHasKey] = useState(false),
    [token, setToken] = useState(""),
    [qr, setQR] = useState<{
      base64?: string;
      code?: string;
      pairingCode?: string;
    } | null>(null),
    [state, setState] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ config: Config; hasKey: boolean }>("/admin/whatsapp")
      .then((r) => {
        setConfig(r.config);
        setHasKey(r.hasKey);
      })
      .catch((e) => setMessage(err(e)));
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/admin/whatsapp", "PUT", { ...config, apiKey, appSecret });
      setHasKey(hasKey || !!apiKey);
      setKey("");
      setAppSecret("");
      setQR(null);
      setMessage(
        "Conexão salva. Configure o webhook e confira o estado do provedor.",
      );
    } catch (e) {
      setMessage(err(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operation-panel">
      <h2>Conexão de WhatsApp</h2>
      <p>
        O código do Atende Chat ainda não está disponível neste projeto. O
        conector Evolution usa uma instância existente da API; a Cloud API usa
        um número cadastrado na Meta. Nenhum desses serviços é instalado
        automaticamente.
      </p>
      <form onSubmit={save}>
        <label className="field">
          Provedor
          <select
            value={config.provider}
            onChange={(e) => setConfig({ ...config, provider: e.target.value })}
          >
            <option value="none">Não configurado</option>
            <option value="evolution">Evolution API · conexão por QR</option>
            <option value="cloud">WhatsApp Cloud API · oficial</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) =>
              setConfig({ ...config, enabled: e.target.checked })
            }
          />{" "}
          Ativar processamento e fila de mensagens
        </label>
        {config.provider === "evolution" && (
          <div className="field-grid">
            <label className="field">
              Endereço base da Evolution API
              <input
                type="url"
                required
                value={config.baseUrl}
                placeholder="https://whatsapp.sualoja.com.br"
                onChange={(e) =>
                  setConfig({ ...config, baseUrl: e.target.value })
                }
              />
            </label>
            <label className="field">
              Nome da instância existente
              <input
                required
                value={config.instance}
                onChange={(e) =>
                  setConfig({ ...config, instance: e.target.value })
                }
              />
            </label>
          </div>
        )}
        {config.provider === "cloud" && (
          <>
            <div className="field-grid">
              <label className="field">
                Phone Number ID
                <input
                  required
                  value={config.phoneNumberId}
                  onChange={(e) =>
                    setConfig({ ...config, phoneNumberId: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Versão da Graph API
                <input
                  required
                  value={config.graphVersion}
                  onChange={(e) =>
                    setConfig({ ...config, graphVersion: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="field">
              App Secret para validar webhooks
              <input
                type="password"
                autoComplete="new-password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="Deixe vazio para manter o cadastrado"
              />
            </label>
          </>
        )}
        {config.provider !== "none" && (
          <label className="field">
            {config.provider === "cloud" ? "Access Token" : "API Key"}
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                hasKey
                  ? "Credencial cadastrada; deixe vazio para manter"
                  : "Cadastre a credencial do provedor"
              }
            />
          </label>
        )}
        <button className="button primary" disabled={busy}>
          Salvar conexão
        </button>
      </form>
      <p role="status">{message}</p>
      <div className="operation-actions">
        <button
          className="button secondary"
          disabled={busy || config.provider === "none"}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api<{ state: string }>(
                "/admin/whatsapp/status",
                "POST",
                {},
              );
              setState(r.state);
            } catch (e) {
              setMessage(err(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Consultar estado
        </button>
        {config.provider === "evolution" && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setQR(await api("/admin/whatsapp/connect", "POST", {}));
                setMessage(
                  "No WhatsApp, use Aparelhos conectados para ler o QR.",
                );
              } catch (e) {
                setMessage(err(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Obter QR da instância
          </button>
        )}
        <strong>{state}</strong>
      </div>
      {qr && (
        <div className="whatsapp-qr">
          {qr.base64 ? (
            <img src={qr.base64} alt="QR para conectar o WhatsApp" />
          ) : qr.code ? (
            <QRCodeSVG value={qr.code} size={240} />
          ) : (
            <p>
              O provedor não retornou QR; confira se a instância já está
              conectada.
            </p>
          )}
          {qr.pairingCode && <p>Código de pareamento: {qr.pairingCode}</p>}
        </div>
      )}
      <details>
        <summary>Recebimento por webhook</summary>
        <p>
          Endpoint do gestor: <code>/api/integrations/whatsapp</code>. O
          provedor precisa alcançar esse endereço. Para um provedor na internet,
          use HTTPS público; o endereço 127.0.0.1 só funciona no próprio
          computador.
        </p>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              const r = await api<{ token: string }>(
                "/admin/whatsapp/webhook-token",
                "POST",
                {},
              );
              setToken(r.token);
            } catch (e) {
              setMessage(err(e));
            }
          }}
        >
          Gerar ou trocar token de webhook
        </button>
        {token && (
          <label className="field">
            Copie este token para configurar o provedor
            <input readOnly value={token} />
          </label>
        )}
        <p>
          Evolution: evento <code>MESSAGES_UPSERT</code>, URL acima e cabeçalho{" "}
          <code>x-pronto-hook</code> com o token. Cloud API: token de
          verificação acima, assinatura com App Secret e assinatura do campo
          messages.
        </p>
        <p>
          O agente processa mensagens de texto. Imagens, áudios e outros anexos
          são encaminhados para atendimento humano.
        </p>
      </details>
    </section>
  );
}
