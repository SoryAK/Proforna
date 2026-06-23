"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { AIChatTextareaWithMentions } from "@/components/ai-chat-textarea-with-mentions";
import { AIChatEmptyState } from "@/components/ai-chat-empty-state";
import { AIChatMessageList } from "@/components/ai-chat-message-list";
import { AIChatSettingsPanel } from "@/components/ai-chat-settings-panel";
import { AIChatSlashMenu } from "@/components/ai-chat-slash-menu";
import { AIChatContextChips } from "@/components/ai-chat-context-chips";
import { AIChatToolbar } from "@/components/ai-chat-toolbar";
import { useAIChat } from "@/components/ai-chat-provider";
import type { MentionRef } from "@/lib/ai-chat-mentions";
import type {
  AmbientEntityRef,
  ThreadContext,
} from "@/lib/ai-chat-action-target";
import {
  type ChatTask,
  type Message,
} from "@/lib/ai-chat-constants";
import { useAiChatResize } from "@/hooks/use-ai-chat-resize";
import { useAiChatModels } from "@/hooks/use-ai-chat-models";
import { useAiChatContext } from "@/hooks/use-ai-chat-context";
import { useAiChatStream } from "@/hooks/use-ai-chat-stream";
import { useAiChatSlash } from "@/hooks/use-ai-chat-slash";

export function AIChat() {
  const { open, setOpen } = useAIChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  // Model picker (extracted hook — owns provider/model/localUrl + auto-select + stale guard)
  const { provider, setProvider, model, setModel, localUrl, setLocalUrl, modelsData, refetch } = useAiChatModels(open);
  // Career context (extracted hook — owns contextSlices, suppressedSliceIds, pageContext, toggleSlice)
  const {
    contextSlices,
    setContextSlices,
    suppressedSliceIds,
    setSuppressedSliceIds,
    pageContext,
    toggleSlice,
    visibleSliceCount,
  } = useAiChatContext(open);
  const [collapsedTurns, setCollapsedTurns] = useState<Set<string>>(new Set());
  const [task, setTask] = useState<ChatTask>("chat");
  // Tweak 3: context chips are gated behind the toolbar `[+]` toggle.
  // Default closed — the count badge surfaces how many slices are active.
  const [contextExpanded, setContextExpanded] = useState(false);
  // Active @-mentions for the current input (ADR-0046 Phase C.3). Owned at
  // this layer so the chat-body sidecar can serialize them on send and the
  // textarea component can clear them on submit.
  const [mentions, setMentions] = useState<MentionRef[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Streaming pipeline (extracted hook — owns streaming/sessionTokens state,
  // abortRef, sendMessage SSE pipeline, and stopStreaming).
  const {
    streaming,
    sessionTokens,
    setSessionTokens,
    sendMessage,
    stopStreaming,
  } = useAiChatStream({
    messages,
    setMessages,
    input,
    setInput,
    mentions,
    setMentions,
    contextSlices,
    suppressedSliceIds,
    provider,
    model,
    localUrl,
    task,
  });

  // Resize logic (extracted hook — owns panelWidth, isDragging, drag handlers)
  const { panelWidth, isDragging, startResizing } = useAiChatResize();

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

  // Slash command surface (ADR-0046 Phase B — extracted hook owns slashIndex,
  // isSlashActive derivation, filter, clamp effect, executeSlashCommand,
  // and the composable keyboard branch).
  const clearChat = useCallback(() => {
    setMessages([]);
    setContextSlices([]);
    setSuppressedSliceIds(new Set());
    setCollapsedTurns(new Set());
    setSessionTokens(0);
    setMentions([]);
  }, [setMessages, setContextSlices, setSuppressedSliceIds, setSessionTokens]);

  const {
    slashIndex,
    setSlashIndex,
    slashOpen,
    filteredSlashCommands,
    executeSlashCommand,
    handleSlashKey,
  } = useAiChatSlash({ input, setInput, sendMessage, onClear: clearChat });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (handleSlashKey(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
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

      {/* Settings panel (extracted sibling) */}
      <AIChatSettingsPanel
        open={showSettings}
        provider={provider}
        setProvider={setProvider}
        model={model}
        setModel={setModel}
        providerModels={providerModels}
        modelsData={modelsData}
        setLocalUrl={setLocalUrl}
        refetch={refetch}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && <AIChatEmptyState setInput={setInput} />}

        <AIChatMessageList
          messages={messages}
          streaming={streaming}
          collapsedTurns={collapsedTurns}
          onToggleTurnCollapsed={toggleTurnCollapsed}
          threadContext={threadContext}
          pageContext={pageContext}
        />
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2 relative">
        {/* Slash command menu (ADR-0046 Phase B). Opens when the input
            starts with `/` and contains no whitespace. Keyboard nav lives
            in `handleKeyDown`; click/Enter/Tab all execute the highlighted
            command via `executeSlashCommand`. */}
        <AIChatSlashMenu
          open={slashOpen}
          filteredSlashCommands={filteredSlashCommands}
          slashIndex={slashIndex}
          setSlashIndex={setSlashIndex}
          executeSlashCommand={executeSlashCommand}
        />
        {/* Context chips (ADR-0046 Phase A) — user can suppress individual
            slices for this thread. The base prompt is non-removable.
            Tweak 3: gated behind `contextExpanded` (toolbar [+] toggle);
            tinted container makes the open state legible. */}
        <AIChatContextChips
          expanded={contextExpanded}
          contextSlices={contextSlices}
          suppressedSliceIds={suppressedSliceIds}
          toggleSlice={toggleSlice}
          streaming={streaming}
        />
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
            by 1px vertical dividers. */}
        <AIChatToolbar
          contextExpanded={contextExpanded}
          setContextExpanded={setContextExpanded}
          visibleSliceCount={visibleSliceCount}
          task={task}
          setTask={setTask}
          streaming={streaming}
          model={model}
          setModel={setModel}
          providerModels={providerModels}
          modelsData={modelsData}
          sessionTokens={sessionTokens}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          input={input}
          sendMessage={sendMessage}
          stopStreaming={stopStreaming}
        />
      </div>
      </div>
    </div>
  );
}
