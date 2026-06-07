/**
 * WorklogNotesSortMenu — toolbar dropdown that swaps the active sort column
 * + direction in grid view. List view exposes the same state through column
 * headers, so this menu is intentionally only mounted in grid mode.
 *
 * Behavior:
 *  - Click the trigger → menu of 4 columns (Last edited, Title, Position,
 *    Folder). Active column shows a chevron indicating direction.
 *  - Click the active column → flip dir (asc ⇄ desc).
 *  - Click any other column → switch to that column with a sensible default
 *    direction (lastEdited → desc, alphas → asc).
 *
 * The menu trigger always shows the active column's label so users see what
 * they're sorting by without opening the menu.
 */

"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
  SortColumn,
  WorklogNotesTableSortState,
} from "@/components/worklog/worklog-notes-shared";

const COLUMN_LABEL: Record<SortColumn, string> = {
  lastEdited: "Last edited",
  title: "Title",
  position: "Position",
  folder: "Folder",
};

/** Default direction when *switching* to a column. lastEdited reads natural
 *  as newest-first; alpha sorts read natural as A→Z. */
const DEFAULT_DIR: Record<SortColumn, "asc" | "desc"> = {
  lastEdited: "desc",
  title: "asc",
  position: "asc",
  folder: "asc",
};

const COLUMN_ORDER: SortColumn[] = ["lastEdited", "title", "position", "folder"];

export interface WorklogNotesSortMenuProps {
  sort: WorklogNotesTableSortState;
  onSortChange: (next: WorklogNotesTableSortState) => void;
}

export function WorklogNotesSortMenu({ sort, onSortChange }: WorklogNotesSortMenuProps) {
  const handleSelect = (column: SortColumn) => {
    if (column === sort.column) {
      onSortChange({ column, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ column, dir: DEFAULT_DIR[column] });
    }
  };

  const ActiveDirIcon = sort.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "h-7 px-2 flex items-center gap-1.5 text-xs rounded-md border bg-muted/40 hover:bg-muted/60 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        title={`Sort by ${COLUMN_LABEL[sort.column]} (${sort.dir})`}
        aria-label={`Sort: ${COLUMN_LABEL[sort.column]}, ${sort.dir === "asc" ? "ascending" : "descending"}`}
      >
        <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
        <span className="hidden sm:inline">{COLUMN_LABEL[sort.column]}</span>
        <ActiveDirIcon className="h-3 w-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {COLUMN_ORDER.map((column) => {
          const isActive = column === sort.column;
          const Icon = isActive
            ? sort.dir === "asc" ? ArrowUp : ArrowDown
            : null;
          return (
            <DropdownMenuItem
              key={column}
              onClick={() => handleSelect(column)}
              className={cn(
                "flex items-center justify-between gap-3 cursor-pointer",
                isActive && "font-medium",
              )}
            >
              <span>{COLUMN_LABEL[column]}</span>
              {Icon ? (
                <Icon className="h-3.5 w-3.5 text-orange-500" />
              ) : (
                <span className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
