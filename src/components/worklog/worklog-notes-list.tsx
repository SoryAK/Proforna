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
import { Star, Briefcase, ImageIcon, FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DND_ACTIVE_ROW_CLASS, resolveCategoryMeta } from "@/components/worklog/constants";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WorkLog, Position } from "@/types/worklog";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import { WorklogMoveToFolderDialog } from "@/components/worklog/worklog-move-to-folder-dialog";
import { WorklogRowContextMenu } from "@/components/worklog/worklog-row-context-menu";
import { WorklogKindBadge } from "@/components/worklog/worklog-kind-badge";

/**
 * Multi-select API surfaced by the orchestrator. Optional — when omitted
 * the row checkbox column is hidden and the list behaves as single-select.
 */
export interface WorklogNotesListSelection {
  /** Set-backed; consumed by the right-click context menu to resolve
   *  Notion-style β selection rules without re-deriving it from isSelected. */
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleRange: (id: string, orderedIds: string[]) => void;
  setSelection: (ids: string[]) => void;
  clear: () => void;
}

export interface WorklogNotesListProps {
  logs: WorkLog[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  positionMap: Map<string, Position>;
  loading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  onNew?: () => void;
  /**
   * Fired when the user presses Enter on the selected row — used by the
   * orchestrator to move focus forward to the next pane (note view).
   */
  onActivate?: (id: string) => void;
  /** Optional multi-select wiring (W1.3). */
  selection?: WorklogNotesListSelection;
  /**
   * When true (folder view), note rows participate in @dnd-kit DnD reorder.
   * Should only be true when displaying a specific folder's notes.
   */
  sortable?: boolean;
  /**
   * When true, the right-click context menu shows "Unarchive" instead of
   * "Archive". Drives the icon swap too.
   */
  archivedView?: boolean;
  /**
   * Commit a folder move for one or many notes. Called by the right-click
   * context menu's "Move to folder…" item after the dialog resolves. When
   * omitted, the list still falls back to a single-row save via its own
   * legacy path is NOT preserved — orchestrators MUST wire this for the
   * context menu to work. Bulk path: ids.length > 1.
   */
  onMoveRow?: (ids: string[], folderId: string | null) => void | Promise<unknown>;
  /** Archive (or unarchive when archivedView=true) one or many notes. */
  onArchiveRow?: (ids: string[]) => void | Promise<unknown>;
  /** Delete one or many notes. */
  onDeleteRow?: (ids: string[]) => void | Promise<unknown>;
}

type Group = { key: string; label: string; logs: WorkLog[] };

function SortableNoteWrapper({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? DND_ACTIVE_ROW_CLASS : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

const VIRTUALIZE_THRESHOLD = 250;
const PAGE_SIZE = 120;
const KEYBOARD_PAGE_JUMP = 10;

/** Format date for a note row: `Mar 5` for current year, `Mar 5, 2025` for older. */
function formatRowDate(d: Date, nowYear: number): string {
  return d.getFullYear() === nowYear ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

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
  onActivate,
  selection,
  sortable,
  archivedView,
  onMoveRow,
  onArchiveRow,
  onDeleteRow,
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

  // Right-click → Move/Archive/Delete context menu (ADR-0026 follow-up).
  // The Move item routes through this local MoveDialog so the folder tree
  // UI stays where it is, but the actual commit fires via `onMoveRow` so the
  // orchestrator can run Inbox auto-advance afterwards.
  const [moveTargetIds, setMoveTargetIds] = useState<string[] | null>(null);
  const { folders, createFolder } = useWorklogFolders();
  const moveTargetLog =
    moveTargetIds && moveTargetIds.length === 1
      ? logs.find((l) => l.id === moveTargetIds[0]) ?? null
      : null;
  const moveTargetCount = moveTargetIds?.length ?? 0;

  /**
   * Notion-style β resolver for right-click selection scope:
   *   • Right-clicked row IS in the current bulk selection AND selection
   *     has 2+ members → operate on the whole selection.
   *   • Otherwise → operate on just the right-clicked row.
   * This is computed at click time, not menu-render time, so menu labels
   * reflect the exact set the action will affect.
   */
  function resolveTargetIds(rightClickedId: string): string[] {
    if (
      selection &&
      selection.selectedCount >= 2 &&
      selection.isSelected(rightClickedId)
    ) {
      return Array.from(selection.selectedIds);
    }
    return [rightClickedId];
  }

  const listboxId = "worklog-notes-list";
  const nowYear = new Date().getFullYear();

  // Track whether the most recent selection change came from a keyboard
  // arrow press. Arrow nav uses instant scroll to avoid jitter; external
  // changes (deep link, new note) use smooth scroll for visual continuity.
  const lastSelectionViaKeyboardRef = useRef(false);

  // Scroll selected row into view when selection changes externally
  // (e.g. from a deep link).
  useEffect(() => {
    if (!selectedId || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>(`[data-note-id="${selectedId}"]`);
    if (!el) return;
    el.scrollIntoView({
      block: "nearest",
      behavior: lastSelectionViaKeyboardRef.current ? "auto" : "smooth",
    });
    lastSelectionViaKeyboardRef.current = false;
  }, [selectedId]);

  // Arrow / Home / End / PageUp / PageDown navigation + Enter (activate).
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const key = e.key;

    // ⌘/Ctrl+A → select every loaded note (W1.3 multi-select).
    if (selection && (e.metaKey || e.ctrlKey) && (key === "a" || key === "A")) {
      e.preventDefault();
      selection.setSelection(logs.map((l) => l.id));
      return;
    }

    // Enter on the selected row hands focus forward to the orchestrator
    // (which moves it into the note view's title field).
    if (key === "Enter" && selectedId && onActivate) {
      e.preventDefault();
      onActivate(selectedId);
      return;
    }

    if (
      key !== "ArrowDown" &&
      key !== "ArrowUp" &&
      key !== "Home" &&
      key !== "End" &&
      key !== "PageDown" &&
      key !== "PageUp"
    ) {
      return;
    }
    const flat = logs;
    if (flat.length === 0) return;
    const idx = selectedId ? flat.findIndex((l) => l.id === selectedId) : -1;
    let next = idx;
    if (key === "ArrowDown") next = idx < 0 ? 0 : Math.min(flat.length - 1, idx + 1);
    else if (key === "ArrowUp") next = idx < 0 ? 0 : Math.max(0, idx - 1);
    else if (key === "Home") next = 0;
    else if (key === "End") next = flat.length - 1;
    else if (key === "PageDown") next = Math.min(flat.length - 1, (idx < 0 ? 0 : idx) + KEYBOARD_PAGE_JUMP);
    else if (key === "PageUp") next = Math.max(0, (idx < 0 ? 0 : idx) - KEYBOARD_PAGE_JUMP);
    if (next !== idx && flat[next]) {
      e.preventDefault();
      lastSelectionViaKeyboardRef.current = true;
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
      <div className="p-2 space-y-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading notes…</span>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-3 py-2.5 border-b animate-pulse">
            <div className="flex items-start justify-between gap-2">
              <div className="h-3.5 bg-muted/60 rounded w-2/3" />
              <div className="h-3 bg-muted/40 rounded w-10" />
            </div>
            <div className="mt-2 h-3 bg-muted/40 rounded w-11/12" />
            <div className="mt-1.5 h-3 bg-muted/30 rounded w-3/4" />
            <div className="mt-2 flex gap-2">
              <div className="h-2 w-2 rounded-full bg-muted/50" />
              <div className="h-2.5 bg-muted/30 rounded w-20" />
              <div className="h-2.5 bg-muted/30 rounded w-8" />
            </div>
          </div>
        ))}
      </div>
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
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              "bg-orange-600 text-white hover:bg-orange-700",
              "dark:bg-orange-500 dark:hover:bg-orange-400",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "transition-colors",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Create your first note
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "group h-full overflow-y-auto scrollbar-thin",
        // No ring on the container itself — focus is communicated by the
        // ring on the active row (group-focus-visible below).
        "focus:outline-none",
      )}
      tabIndex={0}
      role="listbox"
      id={listboxId}
      aria-label="Worklog notes"
      aria-activedescendant={selectedId ? `${listboxId}-${selectedId}` : undefined}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
    >
      {groups.map((g) => (
        <div key={g.key}>
          <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-background/95 backdrop-blur border-b">
            {g.label}
          </div>
          <SortableContext
            items={sortable ? g.logs.map((l) => "note:" + l.id) : []}
            strategy={verticalListSortingStrategy}
          >
          <ul>
            {g.logs.map((l) => {
              const isActive = l.id === selectedId;
              const isChecked = selection ? selection.isSelected(l.id) : false;
              const cat = resolveCategoryMeta(l.category);
              const Icon = cat?.icon;
              const pos = l.positionId ? positionMap.get(l.positionId) : null;
              const dateStr = formatRowDate(parseISO(l.date), nowYear);
              const preview = (l.content ?? "").trim();
              const photoCount = l.photos?.length ?? 0;
              // Snapshot the ids the menu will act on (β-rule). Computed on
              // every render so menu label pluralization is always current.
              const menuTargets = resolveTargetIds(l.id);
              const liContent = (
                <li
                  key={l.id}
                  id={`${listboxId}-${l.id}`}
                  data-note-id={l.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={(e) => {
                    // Bulk mode (selection present): every click toggles selection
                    // AND opens the note so the user can review before acting.
                    if (selection) {
                      e.preventDefault();
                      selection.toggle(l.id);
                      onSelect(l.id);
                      return;
                    }
                    onSelect(l.id);
                  }}
                  className={cn(
                    "cursor-pointer border-b px-3 py-2.5 transition-colors flex items-start gap-2",
                    isActive
                      ? "bg-orange-50 dark:bg-orange-900/20 border-l-2 border-l-orange-500"
                      : "hover:bg-accent/40 border-l-2 border-l-transparent",
                    isChecked && "bg-orange-100/60 dark:bg-orange-900/30",
                    // Visible focus indicator on the SELECTED row when the
                    // list container has keyboard focus. Inset so it doesn't
                    // get clipped by the scroll container.
                    isActive &&
                      "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-inset",
                  )}
                >
                  {selection && (
                    <label
                      // Click handling lives on the label so the whole
                      // 24×24 region is a comfortable hit target.
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (e.shiftKey) {
                          selection.toggleRange(l.id, logs.map((x) => x.id));
                        } else {
                          selection.toggle(l.id);
                        }
                      }}
                      className={cn(
                        "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded",
                        "cursor-pointer transition-opacity",
                        // Hover-reveal until something IS selected; then
                        // checkboxes are always visible for affordance.
                        selection.selectedCount > 0
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-60 focus-within:opacity-100",
                      )}
                      aria-label={isChecked ? "Deselect note" : "Select note"}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        // Visual click is intercepted by label; this keeps
                        // a11y semantics + keyboard reachable via tab.
                        onChange={() => {}}
                        tabIndex={-1}
                        className="h-3.5 w-3.5 rounded border-muted-foreground/50 accent-orange-600"
                      />
                    </label>
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {l.kind === "procedure" ? (
                        <WorklogKindBadge kind={l.kind} />
                      ) : (
                        Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
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
                  </div>
                </li>
              );
              // Wrap with the right-click / long-press context menu.
              // The β-resolver fires inside each onX so we ALWAYS read the
              // freshest selection state — not the snapshot taken at render.
              const withCtxMenu = (
                <WorklogRowContextMenu
                  key={`ctx:${l.id}`}
                  count={menuTargets.length}
                  archivedView={archivedView}
                  onMove={() => {
                    const ids = resolveTargetIds(l.id);
                    // Bring the row into selected-state for clarity when
                    // the dialog is acting on a single row in non-bulk mode.
                    if (!selection) onSelect(l.id);
                    setMoveTargetIds(ids);
                  }}
                  onArchive={async () => {
                    const ids = resolveTargetIds(l.id);
                    await onArchiveRow?.(ids);
                  }}
                  onDelete={async () => {
                    const ids = resolveTargetIds(l.id);
                    await onDeleteRow?.(ids);
                  }}
                >
                  {liContent}
                </WorklogRowContextMenu>
              );
              return sortable ? (
                <SortableNoteWrapper key={l.id} id={"note:" + l.id}>{withCtxMenu}</SortableNoteWrapper>
              ) : withCtxMenu;
            })}
          </ul>
          </SortableContext>
        </div>
      ))}

      {shouldVirtualize && renderCount < logs.length && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground border-t bg-background/80 flex items-center justify-between gap-2">
          <span>
            Showing {renderCount.toLocaleString()} of {logs.length.toLocaleString()} notes.
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRenderCount(logs.length);
            }}
            className={cn(
              "rounded px-2 py-0.5 font-medium text-orange-600 hover:bg-orange-100",
              "dark:text-orange-400 dark:hover:bg-orange-900/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            Load all
          </button>
        </div>
      )}

      <WorklogMoveToFolderDialog
        open={!!moveTargetIds}
        onOpenChange={(o) => !o && setMoveTargetIds(null)}
        folders={folders}
        currentFolderId={moveTargetLog?.folderId ?? null}
        onChoose={async (folderId) => {
          if (!moveTargetIds || moveTargetIds.length === 0) return;
          await onMoveRow?.(moveTargetIds, folderId);
          setMoveTargetIds(null);
        }}
        onCreateFolder={async (name) => {
          const created = await createFolder.mutateAsync({ name, parentId: null });
          return { id: created.id };
        }}
        title={
          moveTargetCount > 1
            ? `Move ${moveTargetCount} notes to…`
            : moveTargetLog?.title
              ? `Move “${moveTargetLog.title}” to…`
              : "Move note to folder"
        }
      />
    </div>
  );
}
