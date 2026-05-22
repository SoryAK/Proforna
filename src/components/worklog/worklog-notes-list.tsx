/**
 * WorklogNotesList — middle pane of the notes shell.
 *
 * Bear-style recency-grouped feed:
 *   • Group headers: Today, Yesterday, This week, Earlier (dates absolute)
 *   • Each row: title (line-clamp-1), 2-line preview, meta (category color
 *     dot + position + hours + ⭐), date stamp on right
 *   • Active row highlighted in orange
 *
 * Keyboard:
 *   • ArrowUp / ArrowDown to move selection
 *   • Enter implicit (selection IS the open action; no separate action)
 *
 * Pure presentational; selection + data come from the orchestrator.
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import { format, parseISO, isToday, isYesterday, differenceInDays, startOfDay } from "date-fns";
import { Star, Briefcase, ImageIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/components/worklog/constants";
import type { WorkLog, Position } from "@/types/worklog";

export interface WorklogNotesListProps {
  logs: WorkLog[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  positionMap: Map<string, Position>;
  loading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  onNew?: () => void;
}

type Group = { key: string; label: string; logs: WorkLog[] };

const VIRTUALIZE_THRESHOLD = 250;
const PAGE_SIZE = 120;

function groupLogs(logs: WorkLog[]): Group[] {
  const today: WorkLog[] = [];
  const yesterday: WorkLog[] = [];
  const week: WorkLog[] = [];
  const earlier = new Map<string, WorkLog[]>();
  const now = startOfDay(new Date());
  for (const l of logs) {
    const d = parseISO(l.date);
    if (isToday(d)) {
      today.push(l);
    } else if (isYesterday(d)) {
      yesterday.push(l);
    } else if (differenceInDays(now, startOfDay(d)) < 7) {
      week.push(l);
    } else {
      const key = format(d, "MMMM yyyy");
      if (!earlier.has(key)) earlier.set(key, []);
      earlier.get(key)!.push(l);
    }
  }
  const groups: Group[] = [];
  if (today.length) groups.push({ key: "today", label: "Today", logs: today });
  if (yesterday.length) groups.push({ key: "yesterday", label: "Yesterday", logs: yesterday });
  if (week.length) groups.push({ key: "week", label: "Earlier this week", logs: week });
  for (const [k, v] of earlier) groups.push({ key: k, label: k, logs: v });
  return groups;
}

export function WorklogNotesList({
  logs,
  selectedId,
  onSelect,
  positionMap,
  loading,
  emptyMessage = "No notes",
  emptyHint,
  onNew,
}: WorklogNotesListProps) {
  const [renderCount, setRenderCount] = useState(PAGE_SIZE);
  const shouldVirtualize = logs.length >= VIRTUALIZE_THRESHOLD;

  useEffect(() => {
    setRenderCount(shouldVirtualize ? PAGE_SIZE : logs.length);
  }, [logs.length, shouldVirtualize]);

  const selectedIndex = useMemo(
    () => (selectedId ? logs.findIndex((l) => l.id === selectedId) : -1),
    [logs, selectedId],
  );

  useEffect(() => {
    if (!shouldVirtualize || selectedIndex < 0) return;
    if (selectedIndex >= renderCount) {
      setRenderCount(Math.min(logs.length, selectedIndex + PAGE_SIZE));
    }
  }, [logs.length, renderCount, selectedIndex, shouldVirtualize]);

  const visibleLogs = useMemo(
    () => (shouldVirtualize ? logs.slice(0, renderCount) : logs),
    [logs, renderCount, shouldVirtualize],
  );
  const groups = useMemo(() => groupLogs(visibleLogs), [visibleLogs]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll selected row into view when selection changes externally
  // (e.g. from a deep link).
  useEffect(() => {
    if (!selectedId || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>(`[data-note-id="${selectedId}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  // Arrow-key navigation.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const flat = logs;
    const idx = selectedId ? flat.findIndex((l) => l.id === selectedId) : -1;
    let next = idx;
    if (e.key === "ArrowDown") next = Math.min(flat.length - 1, idx + 1);
    if (e.key === "ArrowUp") next = Math.max(0, idx - 1);
    if (next !== idx && flat[next]) {
      e.preventDefault();
      onSelect(flat[next].id);
    }
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!shouldVirtualize || renderCount >= logs.length) return;
    const target = e.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining < 240) {
      setRenderCount((current) => Math.min(logs.length, current + PAGE_SIZE));
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading notes…</div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="p-8 text-center">
        <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium mb-1">{emptyMessage}</p>
        {emptyHint && <p className="text-xs text-muted-foreground mb-4">{emptyHint}</p>}
        {onNew && (
          <button
            type="button"
            onClick={onNew}
            className="text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
          >
            + Create your first note
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto scrollbar-thin focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
    >
      {groups.map((g) => (
        <div key={g.key}>
          <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-background/95 backdrop-blur border-b">
            {g.label}
          </div>
          <ul>
            {g.logs.map((l) => {
              const isActive = l.id === selectedId;
              const cat = CATEGORIES[l.category];
              const Icon = cat?.icon;
              const pos = l.positionId ? positionMap.get(l.positionId) : null;
              const dateStr = format(parseISO(l.date), "MMM d");
              const preview = (l.content ?? "").trim();
              const photoCount = l.photos?.length ?? 0;
              return (
                <li
                  key={l.id}
                  data-note-id={l.id}
                  onClick={() => onSelect(l.id)}
                  className={cn(
                    "cursor-pointer border-b px-3 py-2.5 transition-colors",
                    isActive
                      ? "bg-orange-50 dark:bg-orange-900/20 border-l-2 border-l-orange-500"
                      : "hover:bg-accent/40 border-l-2 border-l-transparent",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                      <h3 className="text-sm font-medium truncate">
                        {l.title || <span className="text-muted-foreground italic">Untitled</span>}
                      </h3>
                      {l.isNotable && <Star className="h-3 w-3 text-amber-500 fill-current flex-shrink-0" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0 mt-0.5">
                      {dateStr}
                    </span>
                  </div>
                  {preview && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {preview}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {cat && (
                      <span className={cn("inline-block h-1.5 w-1.5 rounded-full",
                        cat.color.split(" ").find((c) => c.startsWith("bg-")) ?? "bg-muted-foreground/40"
                      )} />
                    )}
                    {pos && (
                      <span className="inline-flex items-center gap-0.5 truncate max-w-[140px]">
                        <Briefcase className="h-2.5 w-2.5" />
                        <span className="truncate">{pos.company}</span>
                      </span>
                    )}
                    {l.hours != null && l.hours > 0 && (
                      <span className="tabular-nums">{l.hours}h</span>
                    )}
                    {photoCount > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <ImageIcon className="h-2.5 w-2.5" />
                        {photoCount}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {shouldVirtualize && renderCount < logs.length && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground border-t bg-background/80">
          Showing {renderCount} of {logs.length} notes. Scroll to load more.
        </div>
      )}
    </div>
  );
}
