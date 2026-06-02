"use client";

import { useEffect, useMemo, useState } from "react";

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
  const active = count > 0;
  const [mounted, setMounted] = useState(active);
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (active) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return;
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [active]);

  const countLabel = useMemo(
    () => `${count} item${count === 1 ? "" : "s"} selected`,
    [count],
  );

  if (!mounted) return null;

  return (
    <div
      role="toolbar"
      aria-label="Bulk photo actions"
      className={[
        "fixed bottom-3 left-1/2 z-[1200] w-[calc(100vw-1.25rem)] max-w-[42rem] -translate-x-1/2",
        "rounded-xl border border-border bg-background/95 px-2.5 py-2 shadow-2xl backdrop-blur-md",
        "transition-all duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={onClear}
        className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
        title="Clear selection"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs font-medium tabular-nums px-1 whitespace-nowrap">
        {countLabel}
      </span>
      <div className="h-4 w-px bg-border mx-0.5" />
      <button
        type="button"
        onClick={onMove}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md hover:bg-muted transition-colors"
        title="Move to another job/album"
      >
        <Move className="h-3.5 w-3.5" />
        Move
      </button>
      <button
        type="button"
        onClick={onToggleBanner}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md hover:bg-muted transition-colors"
        title={anyBanner ? "Remove banner flag" : "Mark as banner"}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {anyBanner ? "Unbanner" : "Banner"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete selected"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
      </div>
    </div>
  );
}
