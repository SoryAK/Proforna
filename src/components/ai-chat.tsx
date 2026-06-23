"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send,
  X,
  Loader2,
  Settings2,
  Wifi,
  WifiOff,
  Sparkles,
  ChevronDown,
  Square,
  Mic,
  Plus,
  Minus,
} from "lucide-react";
import { AIProvenanceChip } from "@/components/ai-provenance-chip";
import { AIChatTextareaWithMentions } from "@/components/ai-chat-textarea-with-mentions";
import { AIChatMessageMarkdown } from "@/components/ai-chat-message-markdown";
import { useAIChat } from "@/components/ai-chat-provider";
import type { AIMeta } from "@/lib/ai/envelope";
import type { ProviderId } from "@/lib/ai/types";
import type { MentionRef } from "@/lib/ai-chat-mentions";
import type {
  AmbientEntityRef,
  PageContext,
  ThreadContext,
} from "@/lib/ai-chat-action-target";
import {
  TASK_OPTIONS,
  SLASH_COMMANDS,
  estimateTokens,
  type ChatTask,
  type SlashCommand,
  type Message,
  type ContextSlice,
  type ModelsData,
} from "@/lib/ai-chat-constants";

export function AIChat() {
  const { open, setOpen } = useAIChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<string>("ollama");
  const [model, setModel] = useState<string>("");
  const [contextSlices, setContextSlices] = useState<ContextSlice[]>([]);
  const [suppressedSliceIds, setSuppressedSliceIds] = useState<Set<string>>(new Set());
  const [collapsedTurns, setCollapsedTurns] = useState<Set<string>>(new Set());
  const [localUrl, setLocalUrl] = useState<string | null>(typeof window !== "undefined" ? localStorage.getItem("resumsify-ai-url") : null);
  const [task, setTask] = useState<ChatTask>("chat");
  // Tweak 3: context chips are gated behind the toolbar `[+]` toggle.
  // Default closed — the count badge surfaces how many slices are active.
  const [contextExpanded, setContextExpanded] = useState(false);
  const [sessionTokens, setSessionTokens] = useState(0);
  // Keyboard-selected slash command (ADR-0046 Phase B). Reset to 0 whenever
  // the filtered list shrinks below the current index.
  const [slashIndex, setSlashIndex] = useState(0);
  // Active @-mentions for the current input (ADR-0046 Phase C.3). Owned at
  // this layer so the chat-body sidecar can serialize them on send and the
  // textarea component can clear them on submit.
  const [mentions, setMentions] = useState<MentionRef[]>([]);
  // Ambient page context (ADR-0046 Phase D.3). Populated from the
  // `/api/ai/context` ambient field; consumed by the code-block toolbar's
  // resolver as step (1) of target precedence.
  const [pageContext, setPageContext] = useState<PageContext>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch available models
  const { data: modelsData, refetch } = useQuery<ModelsData>({
    queryKey: ["ai-models", open, localUrl], // re-run if local URL changes before open
    queryFn: () => {
      const url = localUrl ? `/api/ai/models?url=${encodeURIComponent(localUrl)}` : "/api/ai/models";
      return fetch(url).then((r) => r.json());
    },
    staleTime: 30_000,
    enabled: open,
  });

  // Fetch career context slices (ADR-0046 Phase A). The legacy `systemPrompt`
  // field is read as a fallback so the panel still works against a server
  // that hasn't been redeployed with the slice shape yet. Phase D.3 also
  // captures the `ambient` field for the code-block action resolver.
  useEffect(() => {
    if (!open || contextSlices.length > 0) return;
    fetch("/api/ai/context")
      .then((r) => r.json())
      .then(
        (d: {
          slices?: ContextSlice[];
          systemPrompt?: string;
          ambient?: {
            activeJob?: AmbientEntityRef | null;
            activeWorklog?: AmbientEntityRef | null;
            activeSkill?: AmbientEntityRef | null;
          };
        }) => {
          if (Array.isArray(d.slices) && d.slices.length > 0) {
            setContextSlices(d.slices);
          } else if (d.systemPrompt) {
            // Legacy shape: collapse the whole prompt into a single non-removable slice.
            setContextSlices([{ id: "base", label: "Career context", prompt: d.systemPrompt, removable: false }]);
          }
          if (d.ambient) {
            setPageContext({
              activeJob: d.ambient.activeJob ?? null,
              activeWorklog: d.ambient.activeWorklog ?? null,
              activeSkill: d.ambient.activeSkill ?? null,
            });
          }
        },
      )
      .catch(() => {});
  }, [open, contextSlices.length]);

  // Auto-select best model when models data loads (only once)
  const [initialized, setInitialized] = useState(false);

  // Resize logic
  const [panelWidth, setPanelWidth] = useState(400);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedWidth = localStorage.getItem("resumsify-ai-width");
      if (savedWidth) setPanelWidth(Number(savedWidth));
    }
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      let newWidth = document.documentElement.clientWidth - e.clientX;
      if (newWidth < 280) newWidth = 280;
      if (newWidth > 1200) newWidth = 1200; // Max width
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem("resumsify-ai-width", panelWidth.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, panelWidth]);

  useEffect(() => {
    if (!modelsData || initialized) return;
    if (modelsData.ollama.available) {
      setProvider("ollama");
      const active = modelsData.models.find((m) => m.provider === "ollama" && m.active);
      // `defaultModel` may be null when zero models are pulled; fall
      // through to "" so the picker shows the empty-state hint rather
      // than auto-selecting a phantom name.
      setModel(active?.name ?? modelsData.ollama.defaultModel ?? "");
    } else if (modelsData.gemini.available) {
      setProvider("gemini");
      setModel(modelsData.gemini.defaultModel);
    }
    setInitialized(true);
  }, [modelsData, initialized]);

  // When provider changes, ensure a valid model is selected
  useEffect(() => {
    if (!modelsData || !initialized) return;
    if (!model) {
      if (provider === "ollama" && modelsData.ollama.available) {
        const active = modelsData.models.find((m) => m.provider === "ollama" && m.active);
        setModel(active?.name ?? modelsData.ollama.defaultModel ?? "");
      } else if (provider === "gemini" && modelsData.gemini.available) {
        setModel(modelsData.gemini.defaultModel);
      }
    }
  }, [provider, initialized, modelsData, model]);

  // Stale-selection guard (2026-06-22). If the currently-selected model is
  // no longer in the live pulled list (e.g. user ran `ollama rm <name>`
  // while the panel was open, or the previously-cached default leaked from
  // an older route version), reset to the effective default. Prevents the
  // picker from POSTing a phantom name to the chat route.
  useEffect(() => {
    if (!modelsData || !initialized || !model) return;
    if (provider !== "ollama") return;
    const stillPulled = modelsData.models.some(
      (m) => m.provider === "ollama" && m.name === model
    );
    if (!stillPulled) {
      setModel(modelsData.ollama.defaultModel ?? "");
    }
  }, [provider, model, modelsData, initialized]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Build `ThreadContext.recentMentions` by flattening every user message's
  // mention list chronologically (ADR-0046 Phase D.3). The resolver scans
  // back-to-front, so chronological order = "most recent last", which is
  // what `resolveActionTarget` expects.
  const threadContext = useMemo<ThreadContext>(() => {
    const refs: AmbientEntityRef[] = [];
    for (const m of messages) {
      if (m.role !== "user" || !m.mentions) continue;
      for (const ref of m.mentions) {
        refs.push({ type: ref.type, id: ref.id, label: ref.label });
      }
    }
    return { recentMentions: refs };
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    // Snapshot current mentions so we can both attach them to the user
    // message AND ship them in the chat-route sidecar. Cleared once the
    // user message is queued.
    const turnMentions = mentions;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      mentions: turnMentions.length > 0 ? turnMentions : undefined,
    };

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Snapshot + clear mentions so the textarea is ready for the next turn.
    // The structured payload is sent alongside the chat body — the chat
    // route increments `EntityAIMentionCount` and injects a hidden system
    // message containing the JSON block (ADR-0046 Phase C.2). The same
    // snapshot is also stored on the user message itself so D.3's
    // code-block resolver can read the thread's mention history.
    const mentionsPayload = turnMentions.map(({ type, id, label }) => ({ type, id, label }));
    setMentions([]);

    // Build messages array, prefixing the unsuppressed context slices as one
    // system message. The user can drop individual slices via the chip row
    // above the input — see `suppressedSliceIds` (ADR-0046 Phase A).
    const chatHistory: { role: "system" | "user" | "assistant"; content: string }[] = [...messages, userMsg].map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const activeSlices = contextSlices.filter((s) => !suppressedSliceIds.has(s.id));
    if (activeSlices.length > 0) {
      const systemPrompt = activeSlices.map((s) => s.prompt).join("\n\n");
      chatHistory.unshift({ role: "system" as const, content: systemPrompt });
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          provider,
          model: model || undefined,
          localUrl: provider === "ollama" ? localUrl : undefined,
          task,
          mentions: mentionsPayload,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `**Error:** ${err.error}` }
              : m
          )
        );
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";
      let usedProvider = "";
      let usedModel = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "provider") {
              usedProvider = event.provider;
            } else if (event.type === "text") {
              accumulated += event.text;
              const snapshot = accumulated;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: snapshot }
                    : m
                )
              );
            } else if (event.type === "meta") {
              // Final provenance metadata from the server. Hydrate the
              // assistant turn so the AIProvenanceChip renders in the header.
              usedModel = event.model;
              const meta: AIMeta = {
                provider: (usedProvider || "unknown") as ProviderId,
                model: usedModel,
                durationMs: event.durationMs,
              };
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, ai: meta } : m))
              );
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: "**Error:** Connection failed. Is your AI provider running?" }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Update session token estimate from the final accumulated text.
      setMessages((prev) => {
        const total = prev.reduce((acc, m) => acc + estimateTokens(m.content), 0);
        setSessionTokens(total);
        return prev;
      });
    }
  }, [input, streaming, messages, contextSlices, suppressedSliceIds, provider, model, localUrl, task, mentions]);

  // Slash command surface (ADR-0046 Phase B). The menu is open when the
  // input starts with `/` and contains no whitespace — VS Code convention,
  // keeps mid-message URLs from accidentally opening the menu.
  const isSlashActive = input.startsWith("/") && !/\s/.test(input);
  const slashQuery = isSlashActive ? input.slice(1).toLowerCase() : "";
  const filteredSlashCommands = isSlashActive
    ? SLASH_COMMANDS.filter((c) => c.id.toLowerCase().startsWith(slashQuery))
    : [];
  const slashOpen = filteredSlashCommands.length > 0;

  // Keep the highlighted index in range as the filter narrows.
  useEffect(() => {
    if (slashIndex >= filteredSlashCommands.length) setSlashIndex(0);
  }, [filteredSlashCommands.length, slashIndex]);

  // NB: `clearChat` is declared before `executeSlashCommand` because the
  // latter's `useCallback` deps array references it — placing it later
  // would put it in the temporal dead zone at render time.
  const clearChat = useCallback(() => {
    setMessages([]);
    setContextSlices([]);
    setSuppressedSliceIds(new Set());
    setCollapsedTurns(new Set());
    setSessionTokens(0);
    setMentions([]);
  }, []);

  const executeSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      // Client-side slash commands short-circuit the send — they don't
      // produce a user turn (e.g. `/clear` resets the thread in-place).
      if (cmd.id === "clear") {
        setInput("");
        setSlashIndex(0);
        clearChat();
        return;
      }
      // Pass the prompt directly into sendMessage so we don't race React's
      // batched state — `input` won't have flushed yet when we send.
      setInput(cmd.prompt);
      setSlashIndex(0);
      void sendMessage(cmd.prompt);
    },
    [sendMessage, clearChat],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashIndex];
        if (cmd) executeSlashCommand(cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        setSlashIndex(0);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const toggleSlice = (id: string) => {
    setSuppressedSliceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTurnCollapsed = (id: string) => {
    setCollapsedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ollamaModels = modelsData?.models.filter((m) => m.provider === "ollama") ?? [];
  const geminiModels = modelsData?.models.filter((m) => m.provider === "gemini") ?? [];
  const providerModels = provider === "ollama" ? ollamaModels : geminiModels;
  // Visible (non-suppressed) slice count drives the toolbar `[+ N]` badge.
  // Sum, not difference of `length - size`, because `suppressedSliceIds` may
  // hold ids that are no longer in `contextSlices` (stale across nav).
  const visibleSliceCount = contextSlices.reduce(
    (n, s) => (suppressedSliceIds.has(s.id) ? n : n + 1),
    0,
  );

  // Panel — trigger now lives in AppHeader / MobileHeader (see AIChatProvider).
  return (
      <div 
        className={`fixed top-0 right-0 z-50 flex h-[100dvh] flex-col border-l bg-background shadow-2xl overflow-hidden
          md:relative md:h-full md:shadow-none md:translate-x-0 md:z-0
          ${isDragging ? 'transition-none duration-0' : 'transition-all duration-300 ease-in-out'}
          ${open ? 'translate-x-0 w-full md:w-[var(--chat-width)]' : 'translate-x-[100%] w-full md:w-0 md:border-none'}
        `}
        style={{ '--chat-width': `${panelWidth}px` } as React.CSSProperties}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={startResizing}
          className={`hidden md:block absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-50 transition-colors
            hover:bg-orange-500/50 
            ${isDragging ? 'bg-orange-500/50' : 'bg-transparent'}
          `}
        />

        <div className="flex flex-col h-full w-full md:w-[var(--chat-width)] md:min-w-[var(--chat-width)] relative">
          {/* Header — slim: title + close only.
              Tweaks 1+2: dropped bot icon, provider/model status, Settings,
              and Trash buttons. All those moved into the bottom toolbar or
              became slash commands (`/clear`). */}
          <div className="flex items-center justify-between border-b px-3 py-1.5 bg-gradient-to-r from-orange-600/10 to-purple-600/10 shrink-0">
            <p className="text-[11px] font-semibold tracking-wide">Resumsify AI</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

      {/* Old mode/tasks row deleted (tweak 4) — mode picker now lives in the bottom toolbar. */}

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b px-4 py-3 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Provider</label>
              <Select value={provider} onValueChange={(v) => { setProvider(v ?? "ollama"); setModel(""); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">
                    <span className="flex items-center gap-1.5">
                      {modelsData?.ollama.available ? (
                        <Wifi className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-red-400" />
                      )}
                      Local AI (Ollama)
                    </span>
                  </SelectItem>
                  <SelectItem value="gemini">
                    <span className="flex items-center gap-1.5">
                      {modelsData?.gemini.available ? (
                        <Wifi className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-red-400" />
                      )}
                      Resumsify Cloud (Gemini)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Model</label>
              <Select value={model} onValueChange={(v) => setModel(v ?? "")}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Auto" />
                </SelectTrigger>
                <SelectContent>
                  {providerModels.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                  {providerModels.length === 0 && (
                    <SelectItem value="" disabled>
                      No models available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          {provider === "ollama" && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Localhost URL</label>
              <input 
                type="text" 
                className="w-full text-xs h-8 px-2 rounded-md border bg-background" 
                placeholder="http://127.0.0.1:11434"
                defaultValue={typeof window !== "undefined" ? localStorage.getItem("resumsify-ai-url") || "http://127.0.0.1:11434" : "http://127.0.0.1:11434"}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val) {
                    localStorage.setItem("resumsify-ai-url", val);
                    setLocalUrl(val);
                  } else {
                    localStorage.removeItem("resumsify-ai-url");
                    setLocalUrl(null);
                  }
                  refetch();
                }}
              />
            </div>
          )}
          {provider === "ollama" && !modelsData?.ollama.available && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Ollama not detected. Start Ollama and ensure the URL is correct.
            </p>
          )}
          {provider === "gemini" && !modelsData?.gemini.available && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Add <code className="bg-muted px-1 rounded">GEMINI_API_KEY</code> to your .env file.
            </p>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-600/10 to-purple-600/10">
              <Sparkles className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Hey! I&apos;m your career AI.</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                I know your profile, skills, applications, and goals. Ask me anything about your career.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 mt-2">
              {[
                "How should I prepare for my next interview?",
                "What skills should I learn next?",
                "Review my job search strategy",
                "Help me negotiate a raise",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => { setInput(suggestion); }}
                  className="rounded-full border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isActiveAssistant =
            streaming && msg.role === "assistant" && idx === messages.length - 1;
          const isCollapsed = collapsedTurns.has(msg.id);
          // Tweak 5: avatars removed — alignment carries role (industry-standard
          // chat pattern). Bubble width bumped from 80% → 88% to reclaim the gutter.
          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex flex-col gap-1 max-w-[88%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {/* Per-turn header: provenance chip + collapse chevron (ADR-0046 Phase A) */}
                {msg.role === "assistant" && (msg.ai || isCollapsed) && (
                  <div className="flex items-center gap-2 px-1">
                    <AIProvenanceChip ai={msg.ai} variant="inline" />
                    <button
                      type="button"
                      onClick={() => toggleTurnCollapsed(msg.id)}
                      className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                      title={isCollapsed ? "Expand turn" : "Collapse turn"}
                      aria-label={isCollapsed ? "Expand turn" : "Collapse turn"}
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                )}
                {!isCollapsed && (
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-orange-600 text-white rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    } ${isActiveAssistant ? "animate-pulse" : ""}`}
                  >
                    {msg.role === "assistant" && !msg.content && streaming ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span className="text-xs text-muted-foreground">Thinking...</span>
                      </div>
                    ) : msg.role === "assistant" ? (
                      <AIChatMessageMarkdown
                        content={msg.content}
                        threadContext={threadContext}
                        pageContext={pageContext}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2 relative">
        {/* Slash command menu (ADR-0046 Phase B). Opens when the input
            starts with `/` and contains no whitespace. Keyboard nav lives
            in `handleKeyDown`; click/Enter/Tab all execute the highlighted
            command via `executeSlashCommand`. */}
        {slashOpen && (
          <div
            className="absolute bottom-full left-3 right-3 mb-2 z-10 rounded-md border bg-popover shadow-lg overflow-hidden"
            role="listbox"
            aria-label="Slash commands"
          >
            <div className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Slash commands
            </div>
            {filteredSlashCommands.map((cmd, i) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => executeSlashCommand(cmd)}
                onMouseEnter={() => setSlashIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  i === slashIndex ? "bg-orange-500/15" : "hover:bg-muted"
                }`}
                role="option"
                aria-selected={i === slashIndex}
              >
                <code className="text-xs font-mono text-orange-600 dark:text-orange-400 shrink-0">
                  {cmd.label}
                </code>
                <span className="text-xs text-muted-foreground truncate">
                  {cmd.description}
                </span>
              </button>
            ))}
          </div>
        )}
        {/* Context chips (ADR-0046 Phase A) — user can suppress individual
            slices for this thread. The base prompt is non-removable.
            Tweak 3: gated behind `contextExpanded` (toolbar [+] toggle);
            tinted container makes the open state legible. */}
        {contextExpanded && contextSlices.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1 rounded-md border border-orange-500/20 bg-orange-500/[0.04] px-1.5 py-1.5">
            {contextSlices.map((slice) => {
              const suppressed = suppressedSliceIds.has(slice.id);
              const removable = slice.removable;
              return (
                <button
                  key={slice.id}
                  type="button"
                  onClick={removable ? () => toggleSlice(slice.id) : undefined}
                  disabled={!removable || streaming}
                  className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-60 disabled:cursor-default ${
                    suppressed
                      ? "border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground/60 line-through"
                      : removable
                        ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20"
                        : "border-muted-foreground/30 bg-muted text-muted-foreground"
                  }`}
                  title={
                    !removable
                      ? `${slice.label} (always on)`
                      : suppressed
                        ? `Re-enable ${slice.label}`
                        : `Remove ${slice.label} from context`
                  }
                  aria-pressed={removable ? !suppressed : undefined}
                >
                  <span>{slice.label}</span>
                  {removable && (
                    <X className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                  )}
                </button>
              );
            })}
          </div>
        )}
        {/* Textarea — no longer shares a flex row with Send (tweak 4: VS Code-style island). */}
        <AIChatTextareaWithMentions
          ref={inputRef}
          value={input}
          onChange={setInput}
          mentions={mentions}
          onMentionsChange={setMentions}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your career… type @ to mention, / for commands"
          disabled={streaming}
        />

        {/* VS Code-style bottom toolbar (tweak 4) — ghost buttons separated
            by 1px vertical dividers. Houses: [+ N] context toggle,
            [Mode▾], [Model▾], token meter, [⚙ Settings],
            │ [🎙 dictation (stub)], [Send/Stop]. */}
        <div className="mt-1.5 flex items-center text-muted-foreground">
          {/* Context toggle (+ / −) with count badge */}
          <button
            type="button"
            onClick={() => setContextExpanded((v) => !v)}
            aria-pressed={contextExpanded}
            title={contextExpanded ? "Hide context" : `Show context (${visibleSliceCount} active)`}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] hover:bg-accent hover:text-foreground transition-colors"
          >
            {contextExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {visibleSliceCount > 0 && (
              <span className="inline-grid place-items-center min-w-[14px] h-[14px] px-1 rounded-full bg-orange-500/25 text-orange-700 dark:text-orange-300 text-[9px] font-semibold leading-none tabular-nums">
                {visibleSliceCount}
              </span>
            )}
          </button>
          <span aria-hidden className="mx-0.5 inline-block w-px h-3.5 bg-border" />

          {/* Mode dropdown (was top tasks row) */}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={streaming}
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              title="Mode"
            >
              {(() => {
                const active = TASK_OPTIONS.find((o) => o.id === task) ?? TASK_OPTIONS[0];
                const Icon = active.icon;
                return (
                  <>
                    <Icon className="h-3 w-3" />
                    <span>{active.label}</span>
                    <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                  </>
                );
              })()}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
              {TASK_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => setTask(opt.id)}
                    className="text-xs gap-2"
                  >
                    <Icon className="h-3 w-3" />
                    <span>{opt.label}</span>
                    {opt.premium && (
                      <span className="ml-auto rounded-sm bg-gradient-to-r from-purple-600 to-orange-600 px-1 text-[8px] font-semibold uppercase tracking-wide text-white">
                        Pro
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <span aria-hidden className="mx-0.5 inline-block w-px h-3.5 bg-border" />

          {/* Inline Model picker (Provider + URL still live in the Settings panel). */}
          <Select value={model} onValueChange={(v) => setModel(v ?? "")}>
            <SelectTrigger
              className="h-7 border-0 bg-transparent px-1.5 text-[11px] font-mono shadow-none hover:bg-accent hover:text-foreground gap-1 focus:ring-0 focus:ring-offset-0 [&>svg]:opacity-60 [&>svg]:size-2.5"
              aria-label="Model"
            >
              <SelectValue placeholder="auto" />
            </SelectTrigger>
            <SelectContent>
              {providerModels.map((m) => (
                <SelectItem key={m.name} value={m.name} className="text-xs font-mono">
                  {m.name}
                </SelectItem>
              ))}
              {providerModels.length === 0 && (
                <SelectItem value="__none__" disabled>
                  No models available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <span aria-hidden className="mx-0.5 inline-block w-px h-3.5 bg-border" />

          {/* Connection status (replaces the dropped header line) — icon only. */}
          {modelsData?.ollama.available || modelsData?.gemini.available ? (
            <Wifi className="h-3 w-3 text-emerald-500 mx-0.5" aria-label="AI online" />
          ) : (
            <WifiOff className="h-3 w-3 text-red-500 mx-0.5" aria-label="AI offline" />
          )}

          {/* Token meter (text only, no border per tweak 4). */}
          {sessionTokens > 0 && (
            <span
              className={`px-1 font-mono text-[10px] tabular-nums ${
                sessionTokens >= 25_000
                  ? "text-red-600 dark:text-red-400"
                  : sessionTokens >= 10_000
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              }`}
              title="Estimated session token usage (chars / 4)"
            >
              ~{sessionTokens >= 1000 ? `${(sessionTokens / 1000).toFixed(1)}k` : sessionTokens}t
            </span>
          )}
          <span aria-hidden className="mx-0.5 inline-block w-px h-3.5 bg-border" />

          {/* Settings toggle (moved out of the top header). */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            aria-pressed={showSettings}
            title="Settings"
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] hover:bg-accent hover:text-foreground transition-colors"
          >
            <Settings2 className="h-3 w-3" />
          </button>

          <div className="flex-1" />

          {/* Dictation — stub for ADR-0020 follow-up. */}
          <button
            type="button"
            disabled
            title="Dictation (coming soon)"
            aria-label="Dictation (coming soon)"
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] opacity-50 cursor-not-allowed"
          >
            <Mic className="h-3 w-3" />
          </button>

          {/* Send / Stop — flat ghost-orange to match VS Code rhythm. */}
          {streaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              aria-label="Stop streaming"
              title="Stop"
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!input.trim()}
              aria-label="Send"
              title="Send"
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
