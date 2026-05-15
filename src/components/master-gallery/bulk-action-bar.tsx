"use client";

/**
 * Stub for BulkActionBar.
 *
 * Original was lost (not committed to git, not in OneDrive recycle bin).
 * Renders a fixed bottom action bar when one or more photos are selected
 * in the master gallery. Rebuild styling/animations to match originals.
 */

import { ImageIcon, Move, Trash2, X } from "lucide-react";

export interface BulkActionBarProps {
  count: number;
  anyBanner: boolean;
  onClear: () => void;
  onMove: () => void;
  onToggleBanner: () => void;
  onDelete: () => void;
}

export function BulkActionBar({
  count,
  anyBanner,
  onClear,
  onMove,
  onToggleBanner,
  onDelete,
}: BulkActionBarProps) {
  if (count <= 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1200] flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background/95 backdrop-blur-md shadow-2xl">
      <button
        type="button"
        onClick={onClear}
        className="p-1 rounded hover:bg-muted text-muted-foreground"
        title="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs font-medium tabular-nums px-1">
        {count} selected
      </span>
      <div className="h-4 w-px bg-border" />
      <button
        type="button"
        onClick={onMove}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-muted transition-colors"
        title="Move to another job/album"
      >
        <Move className="h-3.5 w-3.5" />
        Move
      </button>
      <button
        type="button"
        onClick={onToggleBanner}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-muted transition-colors"
        title={anyBanner ? "Remove banner flag" : "Mark as banner"}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {anyBanner ? "Unbanner" : "Banner"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete selected"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </div>
  );
}
