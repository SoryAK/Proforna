"use client";

import { LayoutGrid, List, FolderPlus, Upload, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./types";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNewFolder: () => void;
  onUpload: () => void;
}

/**
 * Drive/OneDrive-style action bar: search on the left, view toggle + actions on the right.
 * Stays sticky-ish at the top of the docs surface; not actually sticky here (parent decides).
 */
export function DocumentsToolbar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onNewFolder,
  onUpload,
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search in this folder…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* View toggle */}
        <div className="inline-flex items-center rounded-md border bg-background p-0.5">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
            onClick={() => onViewModeChange("grid")}
            className={cn(
              "rounded-sm p-1.5 text-muted-foreground transition-colors",
              viewMode === "grid"
                ? "bg-muted text-foreground"
                : "hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            onClick={() => onViewModeChange("list")}
            className={cn(
              "rounded-sm p-1.5 text-muted-foreground transition-colors",
              viewMode === "list"
                ? "bg-muted text-foreground"
                : "hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <Button variant="outline" size="sm" onClick={onNewFolder}>
          <FolderPlus className="mr-2 h-4 w-4" />
          New folder
        </Button>
        <Button size="sm" onClick={onUpload}>
          <Upload className="mr-2 h-4 w-4" />
          Upload
        </Button>
      </div>
    </div>
  );
}
