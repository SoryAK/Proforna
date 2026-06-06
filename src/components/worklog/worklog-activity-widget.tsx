/**
 * WorklogActivityWidget — stats strip + collapsible 12-week heatmap.
 *
 * Extracted from WorklogFoldersRail (where it lived as bottom-of-rail chrome)
 * because per ADR-0013 the rail itself moves into the global sidebar — but the
 * activity widget is *content* (about the notes you're looking at), not nav.
 * Its natural home is the top of the notes-list pane.
 *
 * Persists open/closed state of the heatmap section in localStorage (same key
 * the rail used so users keep their preference across the migration).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Flame, Star } from "lucide-react";
import { WorklogHeatmap } from "@/components/worklog/worklog-heatmap";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";

const ACTIVITY_OPEN_KEY = "worklog-rail-activity-open";

export interface WorklogActivityWidgetProps {
  logs: WorkLog[];
  streak: number;
  totalThisMonth: number;
  notableCount: number;
  selectedDate: Date | null;
  onSelectDate: (d: Date | null) => void;
  onSelectNotable: () => void;
  className?: string;
}

export function WorklogActivityWidget({
  logs,
  streak,
  totalThisMonth,
  notableCount,
  selectedDate,
  onSelectDate,
  onSelectNotable,
  className,
}: WorklogActivityWidgetProps) {
  const heatmapRef = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState<boolean>(false);

  // Hydrate disclosure state from localStorage on mount.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(ACTIVITY_OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVITY_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

  const btn =
    "inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors";

  return (
    <div className={cn("border-b p-3 space-y-2.5 bg-muted/10", className)}>
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => {
              heatmapRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
          }}
          className={btn}
          title="Show activity heatmap"
        >
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          <span className="font-semibold text-foreground tabular-nums">{streak}</span>
          <span>day streak</span>
        </button>
        <span className="h-3 w-px bg-border" />
        <button
          type="button"
          onClick={() => onSelectDate(new Date())}
          className={btn}
          title="Filter to today"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="font-semibold text-foreground tabular-nums">{totalThisMonth}</span>
          <span>this month</span>
        </button>
        <span className="h-3 w-px bg-border" />
        <button
          type="button"
          onClick={onSelectNotable}
          className={btn}
          title="Show notable entries"
        >
          <Star className="h-3.5 w-3.5" />
          <span className="font-semibold text-foreground tabular-nums">{notableCount}</span>
          <span>notable</span>
        </button>
      </div>

      <details
        ref={heatmapRef}
        open={open}
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="group"
      >
        <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
          Activity · 12 weeks
        </summary>
        <div className="mt-2 pl-1 overflow-hidden rounded-md border bg-background/60 p-2">
          <WorklogHeatmap
            logs={logs}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
        </div>
      </details>
    </div>
  );
}
