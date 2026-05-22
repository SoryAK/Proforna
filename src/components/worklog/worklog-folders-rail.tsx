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

import { useMemo } from "react";
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

/**
 * Inline stats strip — was previously its own file but only the rail used it.
 * Renders streak · entries-this-month · notable-count as one wrapped line.
 */
function StatsStrip({
  streak,
  totalThisMonth,
  notableCount,
}: {
  streak: number;
  totalThisMonth: number;
  notableCount: number;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <Flame className="h-3.5 w-3.5 text-orange-500" />
        <span className="font-semibold text-foreground tabular-nums">{streak}</span>
        <span>day streak</span>
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground tabular-nums">{totalThisMonth}</span>
        <span>this month</span>
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="inline-flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground tabular-nums">{notableCount}</span>
        <span>notable</span>
      </span>
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
}

function FolderRow({ icon, label, count, active, onClick, compact, iconColorClass }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={compact ? label : undefined}
      className={cn(
        "w-full flex items-center gap-2 rounded-md text-sm transition-colors",
        compact ? "h-8 w-8 justify-center px-0" : "px-2 py-1.25",
        active
          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
          : "hover:bg-accent text-foreground/80 hover:text-foreground",
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
}: WorklogFoldersRailProps) {
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      m.set(l.category, (m.get(l.category) ?? 0) + 1);
    }
    return m;
  }, [logs]);

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r bg-muted/20 dark:bg-muted/5",
        compact ? "w-12 items-center py-2" : "w-full",
      )}
    >
      <div className={cn("flex-1 min-h-0 overflow-y-auto scrollbar-thin", compact ? "px-1 space-y-1" : "p-2 space-y-0.5")}>
        <FolderRow
          icon={<Inbox className="h-3.5 w-3.5" />}
          label="All notes"
          count={logs.length}
          active={isSelected(selected, { kind: "all" })}
          onClick={() => onSelect({ kind: "all" })}
          compact={compact}
        />
        <FolderRow
          icon={<Star className={cn("h-3.5 w-3.5", notableCount > 0 && "text-amber-500")} />}
          label="Notable"
          count={notableCount}
          active={isSelected(selected, { kind: "notable" })}
          onClick={() => onSelect({ kind: "notable" })}
          compact={compact}
        />

        {!compact && (
          <div className="pt-3 pb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Categories
          </div>
        )}
        {compact && <div className="my-1 h-px w-6 bg-border" />}

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
              compact={compact}
            />
          );
        })}

        {!compact && (
          <div className="pt-3 pb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Library
          </div>
        )}
        {compact && <div className="my-1 h-px w-6 bg-border" />}

        <FolderRow
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Templates"
          count={templatesCount}
          active={isSelected(selected, { kind: "templates" })}
          onClick={() => onSelect({ kind: "templates" })}
          compact={compact}
        />
      </div>

      {!compact && (
        <div className="border-t p-3 space-y-2.5 bg-background/40">
          <StatsStrip
            streak={streak}
            totalThisMonth={totalThisMonth}
            notableCount={notableCount}
          />
          <details className="group">
            <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none">
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
