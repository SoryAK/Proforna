/**
 * WorklogFoldersRail — left pane of the notes shell.
 *
 * Acts like a Bear/Apple Notes sidebar:
 *   • Smart folders: All notes · Notable
 *   • Category folders (Task, Bug, Maintenance, …) with live counts
 *   • Templates folder entry (switches the middle pane to the templates list)
 *   • Stats strip + collapsible 12-week heatmap at the bottom
 *
 * Selection state is owned by the orchestrator and passed as `selected`.
 * The rail is purely presentational beyond local disclosure state.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Inbox,
  Star,
  Sparkles,
  ChevronRight,
  Flame,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/components/worklog/constants";
import { WorklogHeatmap } from "@/components/worklog/worklog-heatmap";
import type { WorkLog } from "@/types/worklog";

/** localStorage key for the Activity disclosure open state. */
const ACTIVITY_OPEN_KEY = "worklog-rail-activity-open";

/**
 * Inline stats strip — was previously its own file but only the rail used it.
 * Each metric is a button so users can click-through:
 *   • streak    → opens the Activity heatmap (no folder change)
 *   • this-month → sets selectedDate to today (no folder change)
 *   • notable   → selects the Notable folder
 */
function StatsStrip({
  streak,
  totalThisMonth,
  notableCount,
  onJumpToToday,
  onOpenActivity,
  onSelectNotable,
}: {
  streak: number;
  totalThisMonth: number;
  notableCount: number;
  onJumpToToday: () => void;
  onOpenActivity: () => void;
  onSelectNotable: () => void;
}) {
  const btn =
    "inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors";
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      <button
        type="button"
        onClick={onOpenActivity}
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
        onClick={onJumpToToday}
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
  );
}

export type FolderSelection =
  | { kind: "all" }
  | { kind: "notable" }
  | { kind: "category"; category: string }
  | { kind: "templates" };

export interface WorklogFoldersRailProps {
  logs: WorkLog[];
  templatesCount: number;
  selected: FolderSelection;
  onSelect: (sel: FolderSelection) => void;
  selectedDate: Date | null;
  onSelectDate: (d: Date | null) => void;
  streak: number;
  totalThisMonth: number;
  notableCount: number;
  /** Render compact icon-only rail (lg-down). */
  compact?: boolean;
  /**
   * Fired when the user presses Enter on a folder row — used by the
   * orchestrator to move focus forward to the notes list pane.
   */
  onActivate?: () => void;
}

function isSelected(sel: FolderSelection, target: FolderSelection): boolean {
  if (sel.kind !== target.kind) return false;
  if (sel.kind === "category" && target.kind === "category") {
    return sel.category === target.category;
  }
  return true;
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  iconColorClass?: string;
  /** Dim the row visually (e.g. category with 0 entries) without disabling it. */
  dim?: boolean;
  /** Fired on keyboard Enter only (not mouse click), for forward pane focus. */
  onActivate?: () => void;
}

function FolderRow({ icon, label, count, active, onClick, compact, iconColorClass, dim, onActivate }: RowProps) {
  return (
    <button
      type="button"
      data-rail-row
      onClick={onClick}
      onKeyDown={(e) => {
        // Enter normally triggers the synthetic click — selecting the
        // folder. We additionally fire onActivate to hand focus forward to
        // the next pane. Suppressing the default click lets us run both
        // in a guaranteed order.
        if (e.key === "Enter" && onActivate) {
          e.preventDefault();
          onClick();
          onActivate();
        }
      }}
      title={compact ? label : undefined}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full flex items-center gap-2 rounded-md text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        compact ? "h-8 w-8 justify-center px-0" : "px-2 py-1.25",
        active
          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
          : "hover:bg-accent text-foreground/80 hover:text-foreground",
        !active && dim && "opacity-55",
      )}
    >
      <span className={cn("flex-shrink-0", iconColorClass)}>{icon}</span>
      {!compact && (
        <>
          <span className="truncate">{label}</span>
          {count !== undefined && count > 0 && (
            <span className={cn(
              "ml-auto text-[11px] tabular-nums",
              active ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground",
            )}>
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );
}

export function WorklogFoldersRail({
  logs,
  templatesCount,
  selected,
  onSelect,
  selectedDate,
  onSelectDate,
  streak,
  totalThisMonth,
  notableCount,
  compact,
  onActivate,
}: WorklogFoldersRailProps) {
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      m.set(l.category, (m.get(l.category) ?? 0) + 1);
    }
    return m;
  }, [logs]);

  // --- Activity disclosure: persist open/closed across reloads -------------
  const activityRef = useRef<HTMLDetailsElement | null>(null);
  const [activityOpen, setActivityOpen] = useState<boolean>(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ACTIVITY_OPEN_KEY);
      if (raw === "1") setActivityOpen(true);
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVITY_OPEN_KEY, activityOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [activityOpen]);

  // --- Keyboard nav between rows (↑/↓/Home/End) ---------------------------
  // Hooked at the scroll container; finds all `[data-rail-row]` buttons.
  const navRef = useRef<HTMLDivElement | null>(null);
  const handleNavKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const key = e.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") {
      return;
    }
    const container = navRef.current;
    if (!container) return;
    const rows = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-rail-row]"),
    );
    if (rows.length === 0) return;
    const activeEl = document.activeElement as HTMLElement | null;
    const currentIdx = activeEl ? rows.indexOf(activeEl as HTMLButtonElement) : -1;
    let nextIdx = currentIdx;
    if (key === "ArrowDown") nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % rows.length;
    else if (key === "ArrowUp") nextIdx = currentIdx <= 0 ? rows.length - 1 : currentIdx - 1;
    else if (key === "Home") nextIdx = 0;
    else if (key === "End") nextIdx = rows.length - 1;
    e.preventDefault();
    rows[nextIdx]?.focus();
  };

  // --- Stats click-through callbacks --------------------------------------
  const openActivity = () => {
    setActivityOpen(true);
    // Scroll into view after the disclosure paints.
    requestAnimationFrame(() => {
      activityRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };
  const jumpToToday = () => {
    // Preserve the current folder per user preference; just set the date filter.
    onSelectDate(new Date());
  };
  const selectNotable = () => onSelect({ kind: "notable" });

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r bg-muted/20 dark:bg-muted/5",
        compact ? "w-12 items-center py-2" : "w-full",
      )}
      aria-label="Worklog folders"
    >
      <div
        ref={navRef}
        onKeyDown={handleNavKey}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto scrollbar-thin",
          compact ? "px-1 space-y-1" : "p-2 space-y-0.5",
        )}
      >
        <div role="group" aria-label="Smart folders" className={cn(!compact && "space-y-0.5")}>
          <FolderRow
            icon={<Inbox className="h-3.5 w-3.5" />}
            label="All notes"
            count={logs.length}
            active={isSelected(selected, { kind: "all" })}
            onClick={() => onSelect({ kind: "all" })}
            onActivate={onActivate}
            compact={compact}
          />
          <FolderRow
            icon={<Star className={cn("h-3.5 w-3.5", notableCount > 0 && "text-amber-500")} />}
            label="Notable"
            count={notableCount}
            active={isSelected(selected, { kind: "notable" })}
            onClick={() => onSelect({ kind: "notable" })}
            onActivate={onActivate}
            compact={compact}
          />
        </div>

        {!compact && (
          <div className="pt-3 pb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Categories
          </div>
        )}
        {compact && <div className="my-1 h-px w-6 bg-border" />}

        <div role="group" aria-label="Categories" className={cn(!compact && "space-y-0.5")}>
          {Object.entries(CATEGORIES).map(([key, cat]) => {
            const Icon = cat.icon;
            const count = categoryCounts.get(key) ?? 0;
            return (
              <FolderRow
                key={key}
                icon={<Icon className="h-3.5 w-3.5" />}
                label={cat.label}
                count={count}
                active={isSelected(selected, { kind: "category", category: key })}
                onClick={() => onSelect({ kind: "category", category: key })}
                onActivate={onActivate}
                compact={compact}
                dim={count === 0}
              />
            );
          })}
        </div>

        {!compact && (
          <div className="pt-3 pb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Library
          </div>
        )}
        {compact && <div className="my-1 h-px w-6 bg-border" />}

        <div role="group" aria-label="Library" className={cn(!compact && "space-y-0.5")}>
          <FolderRow
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Templates"
            count={templatesCount}
            active={isSelected(selected, { kind: "templates" })}
            onClick={() => onSelect({ kind: "templates" })}
            onActivate={onActivate}
            compact={compact}
          />
        </div>
      </div>

      {!compact && (
        <div className="border-t p-3 space-y-2.5 bg-background/40">
          <StatsStrip
            streak={streak}
            totalThisMonth={totalThisMonth}
            notableCount={notableCount}
            onJumpToToday={jumpToToday}
            onOpenActivity={openActivity}
            onSelectNotable={selectNotable}
          />
          <details
            ref={activityRef}
            open={activityOpen}
            onToggle={(e) => setActivityOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="group"
          >
            <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
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
      )}
    </aside>
  );
}
