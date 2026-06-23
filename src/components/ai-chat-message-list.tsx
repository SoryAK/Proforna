"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { AIProvenanceChip } from "@/components/ai-provenance-chip";
import { AIChatMessageMarkdown } from "@/components/ai-chat-message-markdown";
import type { Message } from "@/lib/ai-chat-constants";
import type { PageContext, ThreadContext } from "@/lib/ai-chat-action-target";

/**
 * Message list (post-empty-state). Renders the chronological assistant /
 * user turns, the in-flight "Thinking…" indicator, the per-turn provenance
 * chip + collapse chevron, and the rich markdown body for assistant turns.
 *
 * The parent owns the scroll container ref and the auto-scroll effect —
 * this component only renders the inner sequence.
 */
export interface AIChatMessageListProps {
  messages: Message[];
  streaming: boolean;
  collapsedTurns: Set<string>;
  onToggleTurnCollapsed: (id: string) => void;
  threadContext: ThreadContext;
  pageContext: PageContext;
}

export function AIChatMessageList({
  messages,
  streaming,
  collapsedTurns,
  onToggleTurnCollapsed,
  threadContext,
  pageContext,
}: AIChatMessageListProps) {
  return (
    <>
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
                    onClick={() => onToggleTurnCollapsed(msg.id)}
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
    </>
  );
}
