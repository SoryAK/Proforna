import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ModelHosting } from "@core/model-connection";

type SessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type SessionMessage = {
  id: string;
  speaker: "occupant" | "proforna";
  body: string;
};

type PublicConnection = {
  hosting: ModelHosting;
  baseUrl: string;
  model: string;
};

type Menu = "ask" | "model" | null;

const ASK_DESTINATIONS = [
  {
    id: "ask",
    label: "Ask Proforna",
    detail: "Answers from the vault. Does not change Career Memory or send mail.",
    availableHere: true,
  },
  {
    id: "extract-facts",
    label: "Extract facts",
    detail: "Proposes Worklog facts. Lives on a Worklog entry, not Home.",
    availableHere: false,
  },
  {
    id: "suggest-reply",
    label: "Suggest a reply",
    detail: "Drafts a send as a Change Set. Lives on the Contact thread.",
    availableHere: false,
  },
] as const;

export function HomeProforna({
  open,
  onToggle,
  width,
}: {
  open: boolean;
  onToggle: () => void;
  width?: number;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"sessions" | "chat">("sessions");
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [allowRemote, setAllowRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const [connection, setConnection] = useState<PublicConnection | null>(null);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const askMenuId = useId();
  const modelMenuId = useId();
  const cloudBlocked = connection?.hosting === "cloud" && !allowRemote;

  useEffect(() => {
    void loadSessions();
    void loadConnection();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      if (
        composerRef.current &&
        !composerRef.current.contains(event.target as Node)
      ) {
        setMenu(null);
      }
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  async function loadConnection() {
    const response = await fetch("/api/models");
    if (!response.ok) return;
    const body = (await response.json()) as { connections?: PublicConnection[] };
    const latest = body.connections?.at(-1) ?? null;
    setConnection(latest);
    if (latest?.hosting !== "local") {
      setLocalModels([]);
      return;
    }
    const discovered = await fetch("/api/models/discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl: latest.baseUrl }),
    });
    if (!discovered.ok) return;
    const data = (await discovered.json()) as { models?: string[] };
    setLocalModels((data.models ?? []).filter(isChatModel));
  }

  async function loadSessions() {
    const response = await fetch("/api/command/sessions");
    if (!response.ok) return;
    const body = (await response.json()) as { sessions: SessionSummary[] };
    setSessions(body.sessions);
  }

  async function openSession(sessionId: string) {
    setSelectedId(sessionId);
    setPane("chat");
    setStatus("");
    const response = await fetch(`/api/command/sessions/${sessionId}`);
    if (!response.ok) {
      setMessages([]);
      return;
    }
    const body = (await response.json()) as {
      session: SessionSummary;
      messages: SessionMessage[];
    };
    setMessages(body.messages);
  }

  function startNew() {
    abortRef.current?.abort();
    setSelectedId(null);
    setMessages([]);
    setPane("chat");
    setStatus("");
    setDraft("");
    setMenu(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function showSessions() {
    setPane("sessions");
    setMenu(null);
    void loadSessions();
  }

  async function pickLocalModel(model: string) {
    if (!connection || connection.hosting !== "local") return;
    if (model === connection.model) {
      setMenu(null);
      return;
    }
    const response = await fetch("/api/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hosting: "local",
        baseUrl: connection.baseUrl,
        model,
        apiKey: "",
      }),
    });
    if (!response.ok) {
      setStatus("Could not switch the local model.");
      return;
    }
    const body = (await response.json()) as { connection?: PublicConnection };
    if (body.connection) setConnection(body.connection);
    setMenu(null);
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (busy || !body || cloudBlocked) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setBusy(true);
    setStatus("");
    setMenu(null);
    try {
      let sessionId = selectedId;
      if (!sessionId) {
        const opened = await fetch("/api/command/sessions", {
          method: "POST",
          signal: abort.signal,
        });
        if (!opened.ok) {
          setStatus("Could not start a conversation.");
          return;
        }
        const created = (await opened.json()) as { session: SessionSummary };
        sessionId = created.session.id;
        setSelectedId(sessionId);
      }
      const response = await fetch(`/api/command/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          grant: { remoteModel: allowRemote },
        }),
        signal: abort.signal,
      });
      if (response.status === 403) {
        setAllowRemote(true);
        setMenu("model");
        setStatus(
          "This uses a cloud model. Confirm in the model list before sending.",
        );
        return;
      }
      if (response.status === 409) {
        setStatus("Proforna is already using the model.");
        return;
      }
      if (!response.ok) {
        setStatus("Connect a model in Settings before talking to Proforna.");
        return;
      }
      const thread = (await response.json()) as {
        session: SessionSummary;
        messages: SessionMessage[];
      };
      setDraft("");
      setMessages(thread.messages);
      setSessions((current) => {
        const rest = current.filter((session) => session.id !== thread.session.id);
        return [thread.session, ...rest];
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Could not reach Proforna.");
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }

  function onComposerKey(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void send();
  }

  const modelLabel = presentModel(connection);
  const openTitle =
    sessions.find((session) => session.id === selectedId)?.title ?? "New";

  return (
    <aside
      className={open ? "home-proforna is-open" : "home-proforna is-collapsed"}
      aria-label="Proforna"
      inert={!open}
      style={width ? { width } : undefined}
    >
      <header className="home-proforna-bar">
        {pane === "chat" ? (
          <button type="button" className="home-proforna-back" onClick={showSessions}>
            Sessions
          </button>
        ) : null}
        <h2>{pane === "sessions" ? "Sessions" : openTitle}</h2>
        <div className="home-proforna-actions">
          <button type="button" onClick={startNew}>
            New
          </button>
          <button
            type="button"
            className="home-proforna-hide"
            aria-label="Hide Proforna"
            onClick={onToggle}
          >
            Hide
          </button>
        </div>
      </header>
      <div className="home-proforna-body">
        {pane === "sessions" ? (
          <div className="home-proforna-sessions">
            {sessions.length ? (
              sessions.map((session) => (
                <button
                  type="button"
                  key={session.id}
                  className="home-proforna-session"
                  onClick={() => void openSession(session.id)}
                >
                  <strong>{session.title}</strong>
                  <span>{sessionWhen(session.updatedAt)}</span>
                </button>
              ))
            ) : (
              <p className="home-proforna-empty">No conversations yet.</p>
            )}
          </div>
        ) : (
          <div className="home-proforna-thread" ref={listRef}>
            {messages.length ? (
              <ol>
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className={
                      message.speaker === "occupant"
                        ? "is-occupant"
                        : "is-proforna"
                    }
                  >
                    <span>
                      {message.speaker === "occupant" ? "You" : "Proforna"}
                    </span>
                    <p>{message.body}</p>
                  </li>
                ))}
                {busy ? (
                  <li className="is-proforna is-working">
                    <span>Proforna</span>
                    <p>Working…</p>
                  </li>
                ) : null}
              </ol>
            ) : (
              <p className="home-proforna-empty">
                Ask about this Career file. Proforna answers from the vault.
              </p>
            )}
          </div>
        )}
      </div>
      {pane === "chat" ? (
      <form
        className="home-proforna-composer"
        onSubmit={(event) => void send(event)}
        ref={composerRef}
      >
        <label>
          <span className="sr-only">Message Proforna</span>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onComposerKey}
            placeholder="Message Proforna"
            rows={3}
            disabled={busy}
          />
        </label>
        <div className="home-proforna-toolbar">
          <div className="home-proforna-pickers">
            <button
              type="button"
              className={menu === "ask" ? "is-open" : undefined}
              aria-expanded={menu === "ask"}
              aria-controls={askMenuId}
              onClick={() =>
                setMenu((current) => (current === "ask" ? null : "ask"))
              }
            >
              Ask
              <Caret />
            </button>
            <button
              type="button"
              className={menu === "model" ? "is-open" : undefined}
              aria-expanded={menu === "model"}
              aria-controls={modelMenuId}
              onClick={() =>
                setMenu((current) => (current === "model" ? null : "model"))
              }
            >
              <span>{modelLabel}</span>
              <Caret />
            </button>
          </div>
          {busy ? (
            <button type="button" className="home-proforna-send" onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              className="home-proforna-send"
              disabled={!draft.trim() || cloudBlocked}
            >
              Send
            </button>
          )}
        </div>
        {cloudBlocked ? (
          <p className="home-proforna-status" role="status">
            This model sends vault gist off-machine. Confirm in the model list
            before sending.
          </p>
        ) : null}
        {status ? <p className="home-proforna-status">{status}</p> : null}
        {menu === "ask" ? (
          <div className="home-proforna-menu" id={askMenuId} role="listbox">
            <p className="home-proforna-menu-heading">This conversation</p>
            {ASK_DESTINATIONS.map((item) => (
              <button
                type="button"
                role="option"
                aria-selected={item.id === "ask"}
                aria-disabled={!item.availableHere}
                disabled={!item.availableHere}
                key={item.id}
                className={item.id === "ask" ? "is-current" : undefined}
                onClick={() => setMenu(null)}
              >
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>
        ) : null}
        {menu === "model" ? (
          <div className="home-proforna-menu" id={modelMenuId} role="listbox">
            {connection ? (
              <>
                <p className="home-proforna-menu-heading">
                  {connection.hosting === "local" ? "Local" : "Cloud"}
                </p>
                {connection.hosting === "local" ? (
                  (localModels.length ? localModels : [connection.model]).map(
                    (model) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={model === connection.model}
                        key={model}
                        className={
                          model === connection.model ? "is-current" : undefined
                        }
                        onClick={() => void pickLocalModel(model)}
                      >
                        <strong>{model}</strong>
                        <span>Stays on this machine</span>
                      </button>
                    ),
                  )
                ) : (
                  <button
                    type="button"
                    role="option"
                    aria-selected
                    className="is-current"
                    onClick={() => setMenu(null)}
                  >
                    <strong>{connection.model}</strong>
                    <span>Vault gist leaves this machine</span>
                  </button>
                )}
                {connection.hosting === "cloud" ? (
                  <label className="home-proforna-grant">
                    <input
                      type="checkbox"
                      checked={allowRemote}
                      onChange={(event) => setAllowRemote(event.target.checked)}
                    />
                    Vault gist may leave this machine
                  </label>
                ) : null}
              </>
            ) : (
              <p className="home-proforna-menu-empty">
                Connect a model in Settings before talking to Proforna.
              </p>
            )}
          </div>
        ) : null}
      </form>
      ) : null}
    </aside>
  );
}

function sessionWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function presentModel(connection: PublicConnection | null): string {
  if (!connection) return "No model";
  return connection.hosting === "local"
    ? `${connection.model} · Local`
    : `${connection.model} · Cloud`;
}

function isChatModel(name: string): boolean {
  return !/embed(?:ding)?/i.test(name);
}

function Caret() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M3 4.5 L6 7.5 L9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
