/**
 * WorklogNotesTable — Drive-style document-manager table for /worklog/notes
 * (per ADR-0015). Replaces the recency-grouped <WorklogNotesList> on the full
 * /worklog/notes route. The compact embed continues to use <WorklogNotesList>.
 *
 * Layout: 6-column CSS grid
 *   [24px _ 1fr _ 140px _ 140px _ 120px _ 60px]
 *   checkbox · title (cat dot + title + notable + preview) · position · folder · last edited · row actions
 *
 * Columns at narrower widths drop the inline preview snippet (the title cell
 * is `min-w-0 truncate` so the row stays single-line). The drawer column is
 * applied by the parent grid (1fr → 1fr 600px) — this component is agnostic.
 *
 * Row click → calls onOpen(id). The parent decides what that means
 * (today: set ?focus=<id>; later: route to /worklog/notes/[id]).
 *
 * Column header click → calls onSortChange(column). Parent owns sort state.
 *
 * ADR-0015 default: sort by lastEdited DESC. Today is a flat list (no
 * date-grouping) per the user's "Drive-style flat sortable list" call.
 */

"use client";

import { useMemo } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/components/worklog/constants";
import type { UseWorklogSelectionApi } from "@/components/worklog/hooks/use-worklog-selection";
import type { Position, WorkLog, WorkLogFolderWithCount } from "@/types/worklog";
import {
  CATEGORY_DOT,
  applySort,
  folderLabel,
  formatLastEdited,
  positionLabel,
  previewLine,
  type SortColumn,
  type SortDir,
  type WorklogNotesTableSortState,
} from "@/components/worklog/worklog-notes-shared";

// Re-export for any legacy imports that still reach into the table file.
// (Prefer importing from worklog-notes-shared directly in new code.)
export type { SortColumn, SortDir, WorklogNotesTableSortState };
export { CATEGORY_DOT, applySort, folderLabel, formatLastEdited, positionLabel, previewLine };

export interface WorklogNotesTableProps {
  logs: WorkLog[];
  selectedFocusId: string | null;
  onOpen: (id: string) => void;
  positionMap: Map<string, Position>;
  folders: WorkLogFolderWithCount[];
  sort: WorklogNotesTableSortState;
  onSortChange: (next: WorklogNotesTableSortState) => void;
  selection: UseWorklogSelectionApi;
  /** When true, row checkboxes + select-all are visible. Off by default. */
  bulkMode?: boolean;
  loading?: boolean;
  /** Empty-state message (parent decides based on filters). */
  emptyMessage?: string;
  emptyHint?: string;
  /** "+ Add first note" button shown in empty state. */
  onNew?: () => void;
}

const COLUMN_GRID_BULK =
  "grid grid-cols-[24px_minmax(0,1fr)_140px_140px_120px_60px] gap-3 items-center";
const COLUMN_GRID_PLAIN =
  "grid grid-cols-[minmax(0,1fr)_140px_140px_120px_60px] gap-3 items-center";

interface SortHeaderProps {
  label: string;
  column: SortColumn;
  active: SortColumn;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}

function SortHeader({ label, column, active, dir, onClick, align = "left" }: SortHeaderProps) {
  const isActive = active === column;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 hover:text-foreground transition-colors",
        align === "right" ? "justify-end" : "justify-start",
        isActive && "text-orange-600 dark:text-orange-300",
      )}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {isActive ? (
        dir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

export function WorklogNotesTable({
  logs,
  selectedFocusId,
  onOpen,
  positionMap,
  folders,
  sort,
  onSortChange,
  selection,
  bulkMode = false,
  loading,
  emptyMessage = "No notes",
  emptyHint,
  onNew,
}: WorklogNotesTableProps) {
  const sortedLogs = useMemo(
    () => applySort(logs, sort, positionMap, folders),
    [logs, sort, positionMap, folders],
  );

  const COLUMN_GRID = bulkMode ? COLUMN_GRID_BULK : COLUMN_GRID_PLAIN;

  const allSelected =
    sortedLogs.length > 0 && sortedLogs.every((l) => selection.isSelected(l.id));
  const someSelected =
    !allSelected && sortedLogs.some((l) => selection.isSelected(l.id));

  const toggleSort = (column: SortColumn) => {
    if (sort.column === column) {
      onSortChange({ column, dir: sort.dir === "asc" ? "desc" : "asc" });
      return;
    }
    // Default direction per column: text columns ascending, lastEdited descending.
    const defaultDir: SortDir = column === "lastEdited" ? "desc" : "asc";
    onSortChange({ column, dir: defaultDir });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Column headers ------------------------------------------------- */}
      <div
        className={cn(
          COLUMN_GRID,
          "px-4 py-2 border-b text-[10px] uppercase tracking-wider font-semibold text-muted-foreground",
        )}
      >
        {bulkMode && (
          <input
            type="checkbox"
            aria-label={allSelected ? "Deselect all" : "Select all"}
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={() => {
              if (allSelected) selection.clear();
              else selection.setSelection(sortedLogs.map((l) => l.id));
            }}
            className="cursor-pointer"
          />
        )}
        <SortHeader
          label="Title"
          column="title"
          active={sort.column}
          dir={sort.dir}
          onClick={() => toggleSort("title")}
        />
        <SortHeader
          label="Position"
          column="position"
          active={sort.column}
          dir={sort.dir}
          onClick={() => toggleSort("position")}
        />
        <SortHeader
          label="Folder"
          column="folder"
          active={sort.column}
          dir={sort.dir}
          onClick={() => toggleSort("folder")}
        />
        <SortHeader
          label="Last edited"
          column="lastEdited"
          active={sort.column}
          dir={sort.dir}
          onClick={() => toggleSort("lastEdited")}
        />
        <span className="text-right">Actions</span>
      </div>

      {/* Body ---------------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading notes…</div>
        ) : sortedLogs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium">{emptyMessage}</p>
            {emptyHint && (
              <p className="text-xs text-muted-foreground mt-1">{emptyHint}</p>
            )}
            {onNew && (
              <button
                type="button"
                onClick={onNew}
                className="mt-4 px-3 py-1.5 rounded text-xs bg-orange-600 text-white font-medium hover:bg-orange-700"
              >
                + New note
              </button>
            )}
          </div>
        ) : (
          sortedLogs.map((log) => {
            const isFocused = log.id === selectedFocusId;
            const isChecked = selection.isSelected(log.id);
            const dotClass = CATEGORY_DOT[log.category] ?? "bg-gray-400";
            const meta = CATEGORIES[log.category];
            const preview = previewLine(log.content);
            const pos = positionLabel(log.positionId, positionMap);
            const folder = folderLabel(log.folderId, folders);
            const lastEdited = formatLastEdited(log.updatedAt, log.date);

            return (
              <div
                key={log.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(log.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(log.id);
                  }
                }}
                aria-current={isFocused ? "true" : undefined}
                className={cn(
                  COLUMN_GRID,
                  "group px-4 py-2.5 border-b cursor-pointer transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  isFocused
                    ? "bg-orange-50 dark:bg-orange-900/20"
                    : isChecked
                      ? "bg-orange-100/60 dark:bg-orange-900/30"
                      : "hover:bg-accent/40",
                )}
              >
                {bulkMode && (
                  <input
                    type="checkbox"
                    aria-label={`Select "${log.title || "Untitled"}"`}
                    checked={isChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => selection.toggle(log.id)}
                    className="cursor-pointer"
                  />
                )}

                {/* Title cell: dot · title · notable · inline preview */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass)}
                    title={meta?.label}
                  />
                  <span className="text-sm font-medium truncate shrink-0 max-w-[28ch]">
                    {log.title || "Untitled"}
                  </span>
                  {log.isNotable && (
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                  )}
                  {preview && (
                    <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                      — {preview}
                    </span>
                  )}
                </div>

                <span
                  className={cn(
                    "text-xs truncate",
                    pos.italic
                      ? "text-muted-foreground italic"
                      : "text-foreground/80",
                  )}
                >
                  {pos.text}
                </span>

                <span
                  className={cn(
                    "text-xs truncate",
                    folder.italic
                      ? "text-muted-foreground italic"
                      : "text-foreground/80",
                  )}
                >
                  {folder.text}
                </span>

                <span className="text-xs text-muted-foreground tabular-nums truncate">
                  {lastEdited}
                </span>

                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(log.id);
                    }}
                    title="Open"
                    aria-label="Open"
                    className="w-6 h-6 grid place-items-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  {/* More-actions menu deferred to row-context-menu sprint. */}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
