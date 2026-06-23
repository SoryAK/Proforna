"use client";

import {
  ChevronDown,
  Minus,
  Plus,
  Mic,
  Send,
  Settings2,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TASK_OPTIONS,
  type ChatTask,
  type ModelInfo,
  type ModelsData,
} from "@/lib/ai-chat-constants";
import type { Dispatch, SetStateAction } from "react";

/**
 * VS Code-style bottom toolbar (Tweak 4) — ghost buttons separated by 1px
 * vertical dividers. Houses, left to right:
 *
 *   [+ N] context toggle
 *   [Mode▾] task picker
 *   [Model▾] inline model picker (Provider + URL still in Settings panel)
 *   [Wifi] connection status
 *   [tokens] session token meter
 *   [⚙] settings toggle
 *   │ [🎙] dictation stub (disabled — ADR-0020 follow-up)
 *   [Send/Stop]
 *
 * All state lives in the parent — this component is a thin presentational
 * layer that wires the buttons to the supplied setters / callbacks.
 */
export interface AIChatToolbarProps {
  // Context toggle
  contextExpanded: boolean;
  setContextExpanded: Dispatch<SetStateAction<boolean>>;
  visibleSliceCount: number;

  // Mode dropdown
  task: ChatTask;
  setTask: (id: ChatTask) => void;
  streaming: boolean;

  // Inline model picker
  model: string;
  setModel: Dispatch<SetStateAction<string>>;
  providerModels: ModelInfo[];

  // Connection status
  modelsData: ModelsData | undefined;

  // Token meter
  sessionTokens: number;

  // Settings toggle
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;

  // Send / Stop
  input: string;
  sendMessage: (overrideText?: string) => Promise<void>;
  stopStreaming: () => void;
}

export function AIChatToolbar({
  contextExpanded,
  setContextExpanded,
  visibleSliceCount,
  task,
  setTask,
  streaming,
  model,
  setModel,
  providerModels,
  modelsData,
  sessionTokens,
  showSettings,
  setShowSettings,
  input,
  sendMessage,
  stopStreaming,
}: AIChatToolbarProps) {
  return (
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
  );
}
