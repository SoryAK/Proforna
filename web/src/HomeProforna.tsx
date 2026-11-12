import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { formatHistoryPeriod } from "@core/career-history";
import { AtSign, ChevronDown, Paperclip } from "lucide-react";
import "./home-chat.css";

export type ChatRole = {
  id: string;
  organization: string;
  title: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

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

type LocalEdit = {
  id: string;
  body: string;
  roles: ChatRole[];
};

export function HomeProforna({
  open,
  onToggle,
  width,
  roles = [],
  onReleaseRole,
}: {
  open: boolean;
  onToggle: () => void;
  width?: number;
  roles?: ChatRole[];
  onReleaseRole?: (id: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [allowRemote, setAllowRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"ask" | "edit">("ask");
  const [notes, setNotes] = useState<Record<string, ChatRole[]>>({});
  const [edits, setEdits] = useState<Record<string, LocalEdit[]>>({});
  const picked = useRef(false);
  const sessionLoad = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const sessionsRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<ChatComposerInputHandle | null>(null);

  useEffect(() => {
    void loadSessions();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (picked.current || selectedId || sessions.length === 0) return;
    picked.current = true;
    void openSession(sessions[0].id);
  }, [sessions, selectedId]);

  useEffect(() => {
    if (!sessionsOpen) return;
    function onPointer(event: MouseEvent) {
      if (sessionsRef.current && !sessionsRef.current.contains(event.target as Node)) {
        setSessionsOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSessionsOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [sessionsOpen]);

  async function loadSessions() {
    const response = await fetch("/api/command/sessions");
    if (!response.ok) return;
    const body = (await response.json()) as { sessions: SessionSummary[] };
    setSessions(body.sessions);
  }

  async function openSession(sessionId: string) {
    const load = ++sessionLoad.current;
    picked.current = true;
    setSelectedId(sessionId);
    setStatus("");
    const response = await fetch(`/api/command/sessions/${sessionId}`);
    if (sessionLoad.current !== load) return;
    if (!response.ok) {
      setMessages([]);
      return;
    }
    const body = (await response.json()) as {
      session: SessionSummary;
      messages: SessionMessage[];
    };
    if (sessionLoad.current !== load) return;
    setMessages(body.messages);
  }

  function startNew() {
    sessionLoad.current += 1;
    picked.current = true;
    abortRef.current?.abort();
    setSelectedId(null);
    setMessages([]);
    setStatus("");
    setDraft("");
    setSessionsOpen(false);
    composerRef.current?.focus();
  }

  async function send(value: string) {
    const body = value.trim();
    if (busy || !body) return;
    const attached = roles;
    if (composerMode === "edit") {
      const id = `edit-${Date.now()}`;
      const key = selectedId ?? "new";
      setEdits((current) => ({
        ...current,
        [key]: [...(current[key] ?? []), { id, body, roles: attached }],
      }));
      setDraft("");
      setStatus("");
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    setBusy(true);
    setStatus("");
    try {
      let sessionId = selectedId;
      if (!sessionId) {
        const opened = await fetch("/api/command/sessions", {
          method: "POST",
          signal: abort.signal,
        });
        if (!opened.ok) {
          setDraft(body);
          setStatus("Could not start a conversation.");
          return;
        }
        const created = (await opened.json()) as { session: SessionSummary };
        const createdId = created.session.id;
        sessionId = createdId;
        setSelectedId(createdId);
        setEdits((current) => {
          const pending = current.new;
          if (!pending?.length) return current;
          const next = { ...current };
          delete next.new;
          next[createdId] = [...(next[createdId] ?? []), ...pending];
          return next;
        });
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
        setAllowRemote(false);
        setDraft(body);
        setStatus("This uses a cloud model. Confirm before sending.");
        return;
      }
      if (response.status === 409) {
        setDraft(body);
        setStatus("Proforna is already using the model.");
        return;
      }
      if (!response.ok) {
        setDraft(body);
        setStatus("Connect a model in Settings before talking to Proforna.");
        return;
      }
      const thread = (await response.json()) as {
        session: SessionSummary;
        messages: SessionMessage[];
      };
      setDraft("");
      setMessages(thread.messages);
      if (attached.length > 0) {
        const match = [...thread.messages].reverse().find((message) => message.speaker === "occupant" && message.body === body);
        if (match) setNotes((current) => ({ ...current, [match.id]: attached }));
      }
      setSessions((current) => {
        const rest = current.filter((session) => session.id !== thread.session.id);
        return [thread.session, ...rest];
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setDraft(body);
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

  const title = sessions.find((session) => session.id === selectedId)?.title ?? "New";
  const localEdits = edits[selectedId ?? "new"] ?? [];

  return (
    <aside
      className={open ? "home-proforna is-open" : "home-proforna is-collapsed"}
      aria-label="Conversations"
      inert={!open}
      style={width ? { width } : undefined}
    >
      {open ? (
        <>
          <div className="home-chat-sessions" ref={sessionsRef}>
            <button
              type="button"
              className="home-chat-sessions-btn"
              aria-haspopup="listbox"
              aria-expanded={sessionsOpen}
              aria-label="Conversations"
              onClick={() => setSessionsOpen((current) => !current)}
            >
              <span>{title}</span>
              <Icon className="home-chat-caret" icon={ChevronDown} size="xsm" />
            </button>
            {sessionsOpen ? (
              <div className="home-chat-sessions-menu" role="listbox" aria-label="Conversations">
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedId === null}
                  onClick={startNew}
                >
                  New
                </button>
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    role="option"
                    aria-selected={session.id === selectedId}
                    onClick={() => {
                      setSessionsOpen(false);
                      void openSession(session.id);
                    }}
                  >
                    {session.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <ChatLayout
            className="home-chat"
            density="spacious"
            emptyState={<p className="home-chat-empty">No conversations yet.</p>}
            composer={
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={(value) => void send(value)}
                onStop={stop}
                isStopShown={busy}
                placeholder={composerMode === "ask" ? "Ask anything..." : "Describe your edit..."}
                drawer={
                  roles.length > 0 ? (
                    <ChatComposerDrawer count={roles.length} label="roles">
                      <div className="home-chat-chips">
                        {roles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            className="home-chat-chip"
                            aria-label={`Remove ${roleContextLabel(role)} from this conversation`}
                            onClick={() => onReleaseRole?.(role.id)}
                          >
                            <span>{role.organization || role.title || "Untitled"}</span>
                            <span aria-hidden="true">×</span>
                          </button>
                        ))}
                      </div>
                    </ChatComposerDrawer>
                  ) : null
                }
                status={status ? { type: "warning", message: status } : undefined}
                headerContext={
                  status.includes("cloud") ? (
                    <label className="home-chat-grant">
                      <input
                        type="checkbox"
                        checked={allowRemote}
                        onChange={(event) => setAllowRemote(event.target.checked)}
                      />
                      Vault gist may leave this machine
                    </label>
                  ) : null
                }
                headerActions={
                  <>
                    <Button label="Mention" variant="ghost" size="sm" icon={<Icon icon={AtSign} />} isIconOnly />
                    <Button label="Attach" variant="ghost" size="sm" icon={<Icon icon={Paperclip} />} isIconOnly />
                  </>
                }
                input={<ChatComposerInput handleRef={composerRef} />}
                footerActions={
                  <DropdownMenu
                    button={{
                      label: composerMode === "ask" ? "Ask" : "Edit",
                      variant: "ghost",
                      size: "sm",
                    }}
                    items={[
                      { label: "Ask", onClick: () => setComposerMode("ask") },
                      { label: "Edit", onClick: () => setComposerMode("edit") },
                    ]}
                  />
                }
              />
            }
          >
            {localEdits.length > 0 ? (
              <div className="home-chat-edits">
                <p className="home-chat-edits-label">Edits on this screen</p>
                <ul>
                  {localEdits.map((edit) => (
                    <li key={edit.id}>
                      <p>{edit.body}</p>
                      {edit.roles.length ? (
                        <p className="home-chat-context">{contextLine(edit.roles)}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {messages.length > 0 || busy ? (
              <ChatMessageList>
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    sender={message.speaker === "proforna" ? "assistant" : "user"}
                    name={message.speaker === "proforna" ? "Proforna" : undefined}
                  >
                    <ChatMessageBubble>{message.body}</ChatMessageBubble>
                    {message.speaker !== "proforna" && notes[message.id]?.length ? (
                      <p className="home-chat-context">{contextLine(notes[message.id])}</p>
                    ) : null}
                  </ChatMessage>
                ))}
                {busy ? (
                  <ChatMessage sender="assistant" name="Proforna">
                    <ChatMessageBubble>Working…</ChatMessageBubble>
                  </ChatMessage>
                ) : null}
              </ChatMessageList>
            ) : null}
          </ChatLayout>
        </>
      ) : (
        <h2>
          <button type="button" onClick={onToggle}>
            Proforna
          </button>
        </h2>
      )}
    </aside>
  );
}

function roleContextLabel(role: ChatRole): string {
  const name = role.organization || role.title || "Untitled";
  const title = role.organization && role.title ? role.title : "";
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  return [name, title, period].filter(Boolean).join(", ");
}

function contextLine(attached: ChatRole[]): string {
  const names = attached.map((role) => role.organization || role.title || "Untitled");
  const lead = names.slice(0, 3).join(", ");
  const rest = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return attached.length === 1 ? `About 1 role: ${lead}` : `About ${attached.length} roles: ${lead}${rest}`;
}
