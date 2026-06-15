/**
 * EventRow — single CareerEvent row for the `/worklog/events` list
 * (ADR-0027 Day 3 Cycle B).
 *
 * Anatomy (left → right):
 *   • Status dot (orange = free-floating, muted = anchored to a job)
 *   • Title + small category chip stacked vertically
 *   • Date (when present) — fixed-width column on md+
 *   • Location (when present) — truncates on narrow viewports
 *   • Anchored badge (Anchor icon) when workHistoryId is set
 *
 * Keyboard parity with worklog notes rows: Enter / Space activate the
 * row click. The full row is one focusable `<button>` (no nested
 * interactive elements in Cycle B — kebab menu lands in Cycle C).
 *
 * Cycle B intentionally does NOT render rich body content, mentions,
 * photos, or skills — those surfaces live in the edit dialog. The row
 * is a glanceable index entry.
 */

"use client";

import { Anchor, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventRowItem {
  id: string;
  workHistoryId: string | null;
  title: string;
  category: string;
  startDate: string | null;
  location: string | null;
}

interface EventRowProps {
  event: EventRowItem;
  onClick: () => void;
}

export function EventRow({ event, onClick }: EventRowProps) {
  const isFloating = event.workHistoryId === null;
  const dateLabel = formatRowDate(event.startDate);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "border border-transparent hover:border-border",
      )}
      aria-label={`Open ${event.title}`}
    >
      {/* Status dot — load-bearing visual for floating vs anchored */}
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full flex-shrink-0",
          isFloating
            ? "bg-orange-500"
            : "bg-muted-foreground/40 group-hover:bg-muted-foreground/60",
        )}
      />

      {/* Title + category */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">
          {event.title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 font-medium">
            {formatCategory(event.category)}
          </span>
          {isFloating ? (
            <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-300">
              <MapPin className="h-3 w-3" />
              Free-floating
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Anchor className="h-3 w-3" />
              Anchored
            </span>
          )}
        </div>
      </div>

      {/* Date column — fixed-width on md+ so titles line up */}
      <div className="hidden md:block w-24 text-[11px] text-muted-foreground tabular-nums text-right flex-shrink-0">
        {dateLabel ?? "—"}
      </div>

      {/* Location — clipped */}
      <div className="hidden lg:block w-40 text-[11px] text-muted-foreground truncate text-right flex-shrink-0">
        {event.location ?? ""}
      </div>
    </button>
  );
}

function formatRowDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCategory(raw: string): string {
  if (!raw) return "Other";
  return raw
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
