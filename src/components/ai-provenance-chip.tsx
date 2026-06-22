"use client";

import { cn } from "@/lib/utils";

import type { AIMeta } from "@/lib/ai/envelope";

/**
 * Inline provenance chip introduced by ADR-0045. Renders a compact line of
 * provenance metadata next to or below AI-generated content.
 *
 * Visual examples (from ADR-0045 §Architecture):
 *   inline:  "ollama:gemma4:26b · 247t · 1.4s"
 *   footer:  "▸ ollama:gemma4:26b · 247t · 1.4s ◂"
 *
 * Returns null when `ai` is null/undefined so render sites can stay simple
 * (and so the Day 2 migration can land incrementally — non-migrated routes
 * return bare data → `ai` undefined → chip silently no-ops).
 */
export interface AIProvenanceChipProps {
  /** Provenance metadata. Renders nothing when null/undefined. */
  ai: AIMeta | null | undefined;
  /** Layout variant. `inline` = compact span, `footer` = bracketed block. */
  variant?: "inline" | "footer";
  /** Optional className passthrough. */
  className?: string;
}

function totalTokens(ai: AIMeta): number | undefined {
  const p = ai.usage?.promptTokens ?? 0;
  const c = ai.usage?.completionTokens ?? 0;
  const t = p + c;
  return t > 0 ? t : undefined;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AIProvenanceChip({ ai, variant = "inline", className }: AIProvenanceChipProps) {
  if (!ai) return null;

  const tokens = totalTokens(ai);
  const pieces: string[] = [`${ai.provider}:${ai.model}`];
  if (tokens !== undefined) pieces.push(`${tokens}t`);
  pieces.push(formatDuration(ai.durationMs));
  const body = pieces.join(" · ");

  if (variant === "footer") {
    return (
      <span
        className={cn(
          "mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 font-mono",
          className,
        )}
        title={`provider ${ai.provider} · model ${ai.model} · ${formatDuration(ai.durationMs)}`}
      >
        <span aria-hidden>▸</span>
        <span>{body}</span>
        <span aria-hidden>◂</span>
      </span>
    );
  }

  return (
    <span
      className={cn("text-[10px] text-muted-foreground/70 font-mono", className)}
      title={`provider ${ai.provider} · model ${ai.model} · ${formatDuration(ai.durationMs)}`}
    >
      {body}
    </span>
  );
}
