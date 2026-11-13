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
import { Markdown } from "@astryxdesign/core/Markdown";
import { formatHistoryPeriod } from "@core/career-history";
import { ArrowLeft, AtSign, Check, ChevronDown, Copy, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
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
  createdAt?: string;
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
  focusRoleId = null,
  onReleaseRole,
  onAttachRole,
}: {
  open: boolean;
  onToggle: () => void;
  width?: number;
  roles?: ChatRole[];
  focusRoleId?: string | null;
  onReleaseRole?: (id: string) => void;
  onAttachRole?: (role: ChatRole) => void;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [allowRemote, setAllowRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [catalog, setCatalog] = useState<ChatRole[]>([]);
  const [composerMode, setComposerMode] = useState<"ask" | "edit">("ask");
  const [notes, setNotes] = useState<Record<string, ChatRole[]>>({});
  const [edits, setEdits] = useState<Record<string, LocalEdit[]>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const picked = useRef(false);
  const sessionLoad = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<ChatComposerInputHandle | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [stickyRequest, setStickyRequest] = useState<{ text: string; partial: boolean } | null>(null);

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
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSessionsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sessionsOpen]);

  useEffect(() => {
    const scroller = threadRef.current?.parentElement;
    if (!scroller || sessionsOpen) return;
    const read = () => syncThreadScroll(scroller, true);
    syncThreadScroll(scroller, false);
    scroller.addEventListener("scroll", read, { passive: true });
    return () => scroller.removeEventListener("scroll", read);
  }, [sessionsOpen, messages]);

  useEffect(() => {
    if (sessionsOpen || !pinned.current) return;
    const scroller = threadRef.current?.parentElement;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, busy, sessionsOpen]);

  function syncThreadScroll(scroller: HTMLElement, fromUser: boolean) {
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const up = distance > 48;
    if (fromUser) pinned.current = !up;
    setScrolledUp((current) => (current === up ? current : up));
    const top = scroller.getBoundingClientRect().top + 1;
    const requests = [...scroller.querySelectorAll<HTMLElement>(".home-chat-request")];
    let current: HTMLElement | null = null;
    for (const request of requests) {
      if (request.getBoundingClientRect().top < top) current = request;
    }
    if (!current) {
      setStickyRequest((value) => (value === null ? value : null));
      return;
    }
    const bubble = current.querySelector(".astryx-chat-message-bubble");
    const text = bubble?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text) {
      setStickyRequest((value) => (value === null ? value : null));
      return;
    }
    const rect = (bubble ?? current).getBoundingClientRect();
    const next = { text, partial: rect.bottom > top - 8 };
    setStickyRequest((value) =>
      value && value.text === next.text && value.partial === next.partial ? value : next,
    );
  }

  function scrollToLatest() {
    const scroller = threadRef.current?.parentElement;
    if (!scroller) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pinned.current = true;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }

  async function loadSessions() {
    const response = await fetch("/api/command/sessions");
    if (!response.ok) return;
    const body = (await response.json()) as { sessions: SessionSummary[] };
    setSessions(body.sessions);
  }

  async function openSession(sessionId: string) {
    const load = ++sessionLoad.current;
    abortRef.current?.abort();
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
    setSessionsOpen(false);
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
    const generation = sessionLoad.current;
    const left = () => sessionLoad.current !== generation || abort.signal.aborted;
    setBusy(true);
    setStatus("");
    try {
      let sessionId = selectedId;
      if (!sessionId) {
        const opened = await fetch("/api/command/sessions", {
          method: "POST",
          signal: abort.signal,
        });
        if (left()) return;
        if (!opened.ok) {
          setDraft(body);
          setStatus("Could not start a conversation.");
          return;
        }
        const created = (await opened.json()) as { session: SessionSummary };
        if (left()) return;
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
          roles: attached.map((role) => ({
            organization: role.organization,
            title: role.title,
            startDate: role.startDate,
            endDate: role.endDate,
            isCurrent: role.isCurrent,
          })),
          grant: { remoteModel: allowRemote },
        }),
        signal: abort.signal,
      });
      if (left()) return;
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
      setSessions((current) => {
        const rest = current.filter((session) => session.id !== thread.session.id);
        return [thread.session, ...rest];
      });
      if (left()) return;
      setDraft("");
      setMessages(thread.messages);
      if (attached.length > 0) {
        const match = [...thread.messages].reverse().find((message) => message.speaker === "occupant" && message.body === body);
        if (match) setNotes((current) => ({ ...current, [match.id]: attached }));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (left()) return;
      setDraft(body);
      setStatus("Could not reach Proforna.");
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setBusy(false);
    }
  }

  async function loadCatalog(): Promise<ChatRole[]> {
    if (catalog.length > 0) return catalog;
    const response = await fetch("/api/work-map");
    if (!response.ok) return [];
    const body = (await response.json()) as { roles?: ChatRole[] };
    const next = (body.roles ?? []).map((role) => ({
      id: role.id,
      organization: role.organization,
      title: role.title,
      startDate: role.startDate,
      endDate: role.endDate,
      isCurrent: role.isCurrent,
    }));
    setCatalog(next);
    return next;
  }

  async function openMention() {
    await loadCatalog();
    setMentionOpen((current) => !current);
  }

  async function attachFocused() {
    const list = await loadCatalog();
    const focused = focusRoleId ? list.find((role) => role.id === focusRoleId) : undefined;
    if (focused && !roles.some((role) => role.id === focused.id)) {
      onAttachRole?.(focused);
      setMentionOpen(false);
      return;
    }
    setMentionOpen(true);
  }

  function attachListed(role: ChatRole) {
    if (!roles.some((item) => item.id === role.id)) onAttachRole?.(role);
    setMentionOpen(false);
  }

  async function commitRename(id: string) {
    const current = sessions.find((session) => session.id === id);
    const next = renameDraft.trim();
    setRenamingId(null);
    if (!current || next === current.title) return;
    const response = await fetch(`/api/command/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!response.ok) {
      setStatus("Could not rename that conversation.");
      return;
    }
    const body = (await response.json()) as { session: SessionSummary };
    setSessions((list) => list.map((session) => (session.id === id ? body.session : session)));
  }

  async function removeSession(id: string) {
    const response = await fetch(`/api/command/sessions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus("Could not remove that conversation.");
      return;
    }
    setSessions((list) => list.filter((session) => session.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setMessages([]);
      setStatus("");
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }

  const title = sessions.find((session) => session.id === selectedId)?.title ?? "New";
  const localEdits = edits[selectedId ?? "new"] ?? [];
  const latestAssistantId = [...messages].reverse().find((message) => message.speaker === "proforna")?.id ?? null;

  async function copyReply(message: SessionMessage) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(message.body);
      copied = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = message.body;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      copied = document.execCommand("copy");
      area.remove();
    }
    if (!copied) {
      setStatus("Could not copy that reply.");
      return;
    }
    setStatus("");
    setCopiedId(message.id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === message.id ? null : current));
    }, 1500);
  }

  return (
    <aside
      className={open ? "home-proforna is-open" : "home-proforna is-collapsed"}
      aria-label="Conversations"
      inert={!open}
      style={width ? { width } : undefined}
    >
      {open ? (
        <>
          <div className="home-chat-sessions">
            {sessionsOpen ? null : (
              <button
                type="button"
                className="home-chat-sessions-action"
                aria-label="Back to sessions"
                title="Back to sessions"
                onClick={() => setSessionsOpen(true)}
              >
                <Icon icon={ArrowLeft} size="sm" />
              </button>
            )}
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
            <div className="home-chat-sessions-actions">
              <button
                type="button"
                className="home-chat-sessions-action"
                aria-label="New Chat"
                title="New Chat"
                onClick={startNew}
              >
                <Icon icon={Plus} size="sm" />
              </button>
            </div>
          </div>
          <ChatLayout
            className="home-chat"
            density="compact"
            scrollButton={null}
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
                  <>
                    {mentionOpen ? (
                      <div className="home-chat-mention" role="listbox" aria-label="Roles">
                        {catalog.filter((role) => !roles.some((item) => item.id === role.id)).length === 0 ? (
                          <p>No roles to mention.</p>
                        ) : (
                          catalog
                            .filter((role) => !roles.some((item) => item.id === role.id))
                            .map((role) => (
                              <button
                                key={role.id}
                                type="button"
                                role="option"
                                onClick={() => attachListed(role)}
                              >
                                {roleContextLabel(role)}
                              </button>
                            ))
                        )}
                      </div>
                    ) : null}
                    {status.includes("cloud") ? (
                      <label className="home-chat-grant">
                        <input
                          type="checkbox"
                          checked={allowRemote}
                          onChange={(event) => setAllowRemote(event.target.checked)}
                        />
                        Vault gist may leave this machine
                      </label>
                    ) : null}
                  </>
                }
                headerActions={
                  <>
                    <Button
                      label="Mention"
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={AtSign} />}
                      isIconOnly
                      onClick={() => void openMention()}
                    />
                    <Button
                      label="Attach"
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={Paperclip} />}
                      isIconOnly
                      onClick={() => void attachFocused()}
                    />
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
            {sessionsOpen ? (
              <div className="home-chat-session-list" role="listbox" aria-label="Sessions">
                <div className="home-chat-session-list-title">Sessions</div>
                <button
                  type="button"
                  className="home-chat-session-row"
                  role="option"
                  aria-selected={selectedId === null}
                  onClick={startNew}
                >
                  <span>New Chat</span>
                </button>
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="home-chat-session-row"
                    role="option"
                    aria-selected={session.id === selectedId}
                  >
                    {renamingId === session.id ? (
                      <input
                        aria-label={`Title for ${session.title}`}
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void commitRename(session.id);
                          if (event.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => void commitRename(session.id)}
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className="home-chat-session-open"
                        onClick={() => {
                          setSessionsOpen(false);
                          void openSession(session.id);
                        }}
                      >
                        <span>{session.title}</span>
                        <time dateTime={session.updatedAt}>{sessionWhen(session.updatedAt)}</time>
                      </button>
                    )}
                    <button
                      type="button"
                      className="home-chat-session-action"
                      aria-label={`Rename ${session.title}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setRenamingId(session.id);
                        setRenameDraft(session.title);
                      }}
                    >
                      <Icon icon={Pencil} size="xsm" />
                    </button>
                    <button
                      type="button"
                      className="home-chat-session-action"
                      aria-label={`Remove ${session.title}`}
                      onClick={() => void removeSession(session.id)}
                    >
                      <Icon icon={Trash2} size="xsm" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <>
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
              <div className="home-chat-thread" ref={threadRef}>
              {stickyRequest ? (
                <div
                  className={stickyRequest.partial ? "home-chat-sticky is-partial" : "home-chat-sticky"}
                  aria-hidden="true"
                >
                  <p>{stickyRequest.text}</p>
                </div>
              ) : null}
              <ChatMessageList>
                {messages.map((message) => {
                  const assistant = message.speaker === "proforna";
                  const when = message.createdAt ? messageWhen(message.createdAt) : null;
                  return (
                    <ChatMessage
                      key={message.id}
                      className={
                        assistant
                          ? `home-chat-response${message.id === latestAssistantId ? " is-latest" : ""}`
                          : "home-chat-request"
                      }
                      sender={assistant ? "assistant" : "user"}
                    >
                      {assistant ? (
                        <Markdown density="compact">{chatReply(message.body)}</Markdown>
                      ) : (
                        <ChatMessageBubble>{message.body}</ChatMessageBubble>
                      )}
                      {!assistant && notes[message.id]?.length ? (
                        <p className="home-chat-context">{contextLine(notes[message.id])}</p>
                      ) : null}
                      {assistant || when ? (
                        <div className="home-chat-footer">
                          {assistant ? (
                            <button
                              type="button"
                              className="home-chat-action"
                              aria-label={copiedId === message.id ? "Copied" : "Copy"}
                              onClick={() => void copyReply(message)}
                            >
                              <Icon icon={copiedId === message.id ? Check : Copy} size="xsm" />
                            </button>
                          ) : null}
                          {when ? (
                            <time className="home-chat-detail" dateTime={message.createdAt} title={when.full}>
                              <span className="home-chat-detail-short">{when.short}</span>
                              <span className="home-chat-detail-full">{when.full}</span>
                            </time>
                          ) : null}
                        </div>
                      ) : null}
                    </ChatMessage>
                  );
                })}
                {busy ? (
                  <p className="home-chat-progress">
                    Working
                    <span className="home-chat-ellipsis" aria-hidden="true" />
                  </p>
                ) : null}
              </ChatMessageList>
              {scrolledUp ? (
                <button
                  type="button"
                  className="home-chat-scroll-down"
                  aria-label="Scroll to latest"
                  onClick={scrollToLatest}
                >
                  <Icon icon={ChevronDown} size="sm" />
                </button>
              ) : null}
              </div>
            ) : null}
              </>
            )}
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

function sessionWhen(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const now = new Date();
  if (then.toDateString() === now.toDateString()) {
    return then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function messageWhen(iso: string): { short: string; full: string } | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const full = then.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const elapsed = Date.now() - then.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let short = full;
  if (elapsed < minute) short = "now";
  else if (elapsed < hour) short = `${Math.floor(elapsed / minute)}m`;
  else if (elapsed < day) short = `${Math.floor(elapsed / hour)}h`;
  else short = then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { short, full };
}

function chatReply(body: string): string {
  return body.replace(/(\d)-(\d)/g, "$1\u2011$2");
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
