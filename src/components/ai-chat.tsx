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
} from "lucide-react";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch available models
  const { data: modelsData } = useQuery<ModelsData>({
    queryKey: ["ai-models"],
    queryFn: () => fetch("/api/ai/models").then((r) => r.json()),
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

  // Auto-select best model when models data loads
  useEffect(() => {
    if (!modelsData || model) return;
    if (modelsData.ollama.available) {
      setProvider("ollama");
      const active = modelsData.models.find((m) => m.provider === "ollama" && m.active);
      setModel(active?.name ?? modelsData.ollama.defaultModel);
    } else if (modelsData.gemini.available) {
      setProvider("gemini");
      setModel(modelsData.gemini.defaultModel);
    }
  }, [modelsData, model]);

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
    }
  }, [input, streaming, messages, systemPrompt, provider, model]);

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
  };

  const ollamaModels = modelsData?.models.filter((m) => m.provider === "ollama") ?? [];
  const geminiModels = modelsData?.models.filter((m) => m.provider === "gemini") ?? [];
  const providerModels = provider === "ollama" ? ollamaModels : geminiModels;

  // Fab button
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
        aria-label="Open AI Chat"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden"
      style={{ height: "min(600px, calc(100vh - 6rem))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
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

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b px-4 py-3 space-y-2 bg-muted/30">
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
                      Ollama (Local)
                    </span>
                  </SelectItem>
                  <SelectItem value="gemini">
                    <span className="flex items-center gap-1.5">
                      {modelsData?.gemini.available ? (
                        <Wifi className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-red-400" />
                      )}
                      Gemini (Cloud)
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
          {provider === "ollama" && !modelsData?.ollama.available && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Ollama not detected. Run <code className="bg-muted px-1 rounded">ollama serve</code> to start it.
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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/10 to-purple-600/10">
              <Sparkles className="h-8 w-8 text-blue-600 dark:text-blue-400" />
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
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-md"
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
      <div className="border-t px-3 py-2.5">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your career..."
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            disabled={streaming}
          />
          {streaming ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={stopStreaming}
              className="h-10 w-10 shrink-0 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={sendMessage}
              disabled={!input.trim()}
              className="h-10 w-10 shrink-0 p-0 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
