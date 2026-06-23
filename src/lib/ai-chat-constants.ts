/**
 * AI Chat constants + shared types (extracted from `src/components/ai-chat.tsx`
 * in the god-file refactor sprint, 2026-06-23 — Phase 1).
 *
 * Pure data + type module. No React state, no side effects. Holds:
 *  - The mode / task picker registry (`TASK_OPTIONS`)
 *  - The slash command registry (`SLASH_COMMANDS`) — ADR-0046 Phase B
 *  - Cross-cutting types consumed by the panel and its hooks
 *  - A char-to-token estimator used by the session-cost gauge
 *
 * Lucide icon imports keep the registry self-contained — the toolbar / mode
 * picker can render straight from these without an indirection layer.
 */

import {
  Bot,
  MessageSquare,
  Globe,
  Brain,
  FileText,
} from "lucide-react";
import type { AIMeta } from "@/lib/ai/envelope";
import type { MentionRef } from "@/lib/ai-chat-mentions";

export type ChatTask = "chat" | "ground" | "reason" | "summarize";

export const TASK_OPTIONS: Array<{
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

/**
 * Slash command registry (ADR-0046 Phase B). Each command expands to a
 * prompt template that is sent as the user message on selection. Parameter-
 * ised commands (e.g. `/compare-jobs @job @job`) are deferred to Phase B'
 * after the @-mention picker lands in Phase C.
 *
 * Triggered when the input starts with `/` and contains no space — VS Code
 * convention to avoid intercepting URLs typed mid-message.
 */
export interface SlashCommand {
  /** Stable id (no leading slash). Used for key, registry lookups, and id-prefix matching. */
  id: string;
  /** Display label including leading slash. */
  label: string;
  /** One-line hint shown next to the label in the menu. */
  description: string;
  /** Full prompt sent as the user message when the command is executed. */
  prompt: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "grill-me",
    label: "/grill-me",
    description: "Socratic interrogation of your current career context",
    prompt:
      "Grill me Socratically about my current career context. Ask one tough question at a time, then wait for my response before asking the next. Start with the most strategically important gap.",
  },
  {
    id: "summarize-week",
    label: "/summarize-week",
    description: "Summarize your last 7 days of worklog",
    prompt:
      "Summarize my worklog from the past 7 days. Highlight: recurring themes, blockers, accomplishments, and what I should bring up in 1-on-1s or weekly status updates.",
  },
  {
    id: "draft-bullets",
    label: "/draft-bullets",
    description: "Generate STAR-format resume bullets from your context",
    prompt:
      "Draft 3-5 resume bullets from my current context. Each bullet must follow STAR format (Situation / Task / Action / Result) and quantify impact wherever supporting data exists.",
  },
  // Client-side command — short-circuits in `executeSlashCommand` to call
  // `clearChat` instead of sending a prompt. Empty `prompt` is intentional.
  {
    id: "clear",
    label: "/clear",
    description: "Clear the conversation",
    prompt: "",
  },
];

// Rough char-to-token estimate (~4 chars/token for English). Good enough for
// a session cost gauge; exact counts would require server-side usage events.
export const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Per-turn provenance, populated from the SSE `meta` event. */
  ai?: AIMeta;
  /**
   * @-mentions attached to the user turn at send time (ADR-0046 Phase D.3).
   * Used to build the chronological `ThreadContext.recentMentions` consumed
   * by the action-target resolver in the code-block toolbar.
   */
  mentions?: MentionRef[];
}

/**
 * One context slice returned by `/api/ai/context`. Mirrored from the
 * server-side `AIContextSlice` so the chat panel can render removable chips
 * and reassemble the system prompt from the user's selection (ADR-0046 Phase A).
 */
export interface ContextSlice {
  id: string;
  label: string;
  prompt: string;
  removable: boolean;
}

export interface ModelInfo {
  provider: string;
  name: string;
  active: boolean;
}

export interface ModelsData {
  // `available: false` means the daemon is unreachable OR zero models are
  // pulled — both states render Ollama unusable for chat (ADR-0045-fix
  // 2026-06-22; matches `GET /api/ai/models` contract).
  ollama: { available: boolean; url: string; defaultModel: string | null };
  gemini: { available: boolean; defaultModel: string };
  models: ModelInfo[];
}
