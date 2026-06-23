"use client";

import { X } from "lucide-react";
import type { ContextSlice } from "@/lib/ai-chat-constants";

/**
 * Context-slice chip row (ADR-0046 Phase A). User can toggle individual
 * career-context slices off for the current thread; the base prompt is
 * non-removable. The row is gated behind the toolbar `[+]` toggle so the
 * default view stays clean (Tweak 3).
 *
 * Returns null when the gate is closed OR there are no slices to render —
 * keeps the call site flat with no extra conditionals.
 */
export interface AIChatContextChipsProps {
  expanded: boolean;
  contextSlices: ContextSlice[];
  suppressedSliceIds: Set<string>;
  toggleSlice: (id: string) => void;
  /** Streaming disables the chip buttons so the user can't suppress mid-stream. */
  streaming: boolean;
}

export function AIChatContextChips({
  expanded,
  contextSlices,
  suppressedSliceIds,
  toggleSlice,
  streaming,
}: AIChatContextChipsProps) {
  if (!expanded || contextSlices.length === 0) return null;
  return (
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
  );
}
