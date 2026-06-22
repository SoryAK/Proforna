"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Send,
  X,
  MessageSquare,
  Loader2,
  Trash2,
  Settings2,
  Wifi,
  WifiOff,
  Sparkles,
  User,
  ChevronDown,
  Globe,
  Brain,
  FileText,
} from "lucide-react";

type ChatTask = "chat" | "ground" | "reason" | "summarize";

const TASK_OPTIONS: Array<{
  id: ChatTask;
  label: string;
  icon: typeof Bot;
  premium?: boolean;
}> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "ground", label: "Search", icon: Globe },
  { id: "reason", label: "Think harder", icon: Brain, premium: true },
  { id: "summarize", label: "Summarize", icon: FileText },
];

// Rough char-to-token estimate (~4 chars/token for English). Good enough for
// a session cost gauge; exact counts would require server-side usage events.
const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
}

interface ModelsData {
  ollama: { available: boolean; url: string; defaultModel: string };
  gemini: { available: boolean; defaultModel: string };
  models: { provider: string; name: string; active: boolean }[];
}

export function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<string>("ollama");
  const [model, setModel] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [localUrl, setLocalUrl] = useState<string | null>(typeof window !== "undefined" ? localStorage.getItem("resumsify-ai-url") : null);
  const [task, setTask] = useState<ChatTask>("chat");
  const [sessionTokens, setSessionTokens] = useState(0);
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

  // Fetch career context for system prompt
  useEffect(() => {
    if (!open || systemPrompt) return;
    fetch("/api/ai/context")
      .then((r) => r.json())
      .then((d) => setSystemPrompt(d.systemPrompt))
      .catch(() => {});
  }, [open, systemPrompt]);

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
      setModel(active?.name ?? modelsData.ollama.defaultModel);
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
        setModel(active?.name ?? modelsData.ollama.defaultModel);
      } else if (provider === "gemini" && modelsData.gemini.available) {
        setModel(modelsData.gemini.defaultModel);
      }
    }
  }, [provider, initialized, modelsData, model]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Build messages array with system prompt
    const chatHistory: { role: "system" | "user" | "assistant"; content: string }[] = [...messages, userMsg].map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    if (systemPrompt) {
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
                    ? { ...m, content: snapshot, provider: usedProvider }
                    : m
                )
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
  }, [input, streaming, messages, systemPrompt, provider, model, localUrl, task]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const clearChat = () => {
    setMessages([]);
    setSystemPrompt("");
    setSessionTokens(0);
  };

  const ollamaModels = modelsData?.models.filter((m) => m.provider === "ollama") ?? [];
  const geminiModels = modelsData?.models.filter((m) => m.provider === "gemini") ?? [];
  const providerModels = provider === "ollama" ? ollamaModels : geminiModels;

  // Fab button
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-600 to-purple-600 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 ${open ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
        aria-label="Open AI Chat"
      >
        <Sparkles className="h-6 w-6" />
      </button>

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
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-orange-600/10 to-purple-600/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-600 to-purple-600">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">Resumsify AI</p>
            <div className="flex items-center gap-1.5">
              {modelsData?.ollama.available || modelsData?.gemini.available ? (
                <>
                  <Wifi className="h-2.5 w-2.5 text-emerald-500" />
                  <span className="text-[10px] text-muted-foreground">
                    {provider === "ollama" ? "Local" : "Cloud"} · {model || "auto"}
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="h-2.5 w-2.5 text-red-500" />
                  <span className="text-[10px] text-red-500">No AI available</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowSettings(!showSettings)}>
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={clearChat}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Mode picker + session token meter */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 bg-muted/20 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TASK_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = task === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTask(opt.id)}
                disabled={streaming}
                className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
                  active
                    ? "border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                aria-pressed={active}
                title={opt.premium ? `${opt.label} (premium - reasoning model)` : opt.label}
              >
                <Icon className="h-3 w-3" />
                <span>{opt.label}</span>
                {opt.premium && (
                  <span className="ml-0.5 rounded-sm bg-gradient-to-r from-purple-600 to-orange-600 px-1 text-[8px] font-semibold uppercase tracking-wide text-white">
                    Pro
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {sessionTokens > 0 && (
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${
              sessionTokens >= 25_000
                ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                : sessionTokens >= 10_000
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-muted-foreground/20 bg-background text-muted-foreground"
            }`}
            title="Estimated session token usage (chars / 4)"
          >
            ~{sessionTokens >= 1000 ? `${(sessionTokens / 1000).toFixed(1)}k` : sessionTokens}t
          </span>
        )}
      </div>

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

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-600 to-purple-600 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-orange-600 text-white rounded-br-md"
                  : "bg-muted rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" && !msg.content && streaming ? (
                <div className="flex items-center gap-1.5 py-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words">
                  {msg.content}
                  {msg.provider && msg.role === "assistant" && msg.content && (
                    <span className="block mt-1.5 text-[9px] opacity-40">
                      via {msg.provider}
                    </span>
                  )}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground/10 mt-0.5">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your career..."
            rows={1}
            className="min-h-[36px] max-h-[120px] resize-none text-sm"
            disabled={streaming}
          />
          {streaming ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={stopStreaming}
              className="h-9 w-9 shrink-0 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={sendMessage}
              disabled={!input.trim()}
              className="h-9 w-9 shrink-0 p-0 bg-orange-600 hover:bg-orange-700 text-white"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
    </>
  );
}
