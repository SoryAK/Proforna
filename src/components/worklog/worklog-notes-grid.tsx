/**
 * WorklogNotesGrid — Drive-style card grid for /worklog/notes (per ADR-0015).
 *
 * Sister of <WorklogNotesTable>. Same data shape, same selection/sort/onOpen
 * contracts — different chrome. Each card shows: category dot · title · star ·
 * preview snippet · position/folder/last-edited footer. Checkboxes appear
 * top-right when bulk mode is on.
 *
 * Sort still applies (parent owns sort state); column-headers don't exist in
 * grid mode, so the toolbar is the only sort surface in that view.
 */

"use client";

import { useMemo } from "react";
import { Star } from "lucide-react";
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
  type WorklogNotesTableSortState,
} from "@/components/worklog/worklog-notes-shared";

export interface WorklogNotesGridProps {
  logs: WorkLog[];
  selectedFocusId: string | null;
  onOpen: (id: string) => void;
  positionMap: Map<string, Position>;
  folders: WorkLogFolderWithCount[];
  sort: WorklogNotesTableSortState;
  selection: UseWorklogSelectionApi;
  /** When true, card checkboxes are visible. Off by default. */
  bulkMode?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  onNew?: () => void;
}

export function WorklogNotesGrid({
  logs,
  selectedFocusId,
  onOpen,
  positionMap,
  folders,
  sort,
  selection,
  bulkMode = false,
  loading,
  emptyMessage = "No notes",
  emptyHint,
  onNew,
}: WorklogNotesGridProps) {
  const sortedLogs = useMemo(
    () => applySort(logs, sort, positionMap, folders),
    [logs, sort, positionMap, folders],
  );

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Loading notes…
      </div>
    );
  }

  if (sortedLogs.length === 0) {
    return (
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
    );
  }

  return (
    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {sortedLogs.map((log) => {
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
              "group relative rounded-lg border p-3 cursor-pointer transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isFocused
                ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700"
                : isChecked
                  ? "bg-orange-100/60 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700"
                  : "bg-card hover:bg-accent/40",
            )}
          >
            {/* Checkbox (top-right, only in bulk mode) */}
            {bulkMode && (
              <input
                type="checkbox"
                aria-label={`Select "${log.title || "Untitled"}"`}
                checked={isChecked}
                onClick={(e) => e.stopPropagation()}
                onChange={() => selection.toggle(log.id)}
                className="absolute top-2 right-2 cursor-pointer"
              />
            )}

            {/* Title row: dot · title · star */}
            <div className="flex items-start gap-2 mb-1.5 pr-6">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0 mt-1.5",
                  dotClass,
                )}
                title={meta?.label}
              />
              <span className="text-sm font-medium leading-snug line-clamp-2 flex-1">
                {log.title || "Untitled"}
              </span>
              {log.isNotable && (
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0 mt-0.5" />
              )}
            </div>

            {/* Preview snippet — 3 lines max */}
            {preview ? (
              <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
                {preview}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic mb-3">
                No preview
              </p>
            )}

            {/* Footer: position · folder · last-edited */}
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span
                  className={cn(
                    "truncate",
                    pos.italic && "italic text-muted-foreground/70",
                  )}
                >
                  {pos.text}
                </span>
                <span aria-hidden className="opacity-50">·</span>
                <span
                  className={cn(
                    "truncate",
                    folder.italic && "italic text-muted-foreground/70",
                  )}
                >
                  {folder.text}
                </span>
              </div>
              <span className="shrink-0 tabular-nums">{lastEdited}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
