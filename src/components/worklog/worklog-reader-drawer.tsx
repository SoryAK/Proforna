/**
 * WorklogReaderDrawer — right-anchored preview drawer for the notes
 * doc-manager (ADR-0015 Phase 5).
 *
 * Two-speed UX: the doc-manager row click opens this drawer as a
 * read-only peek so the user can skim many notes without losing their
 * place in the list. Clicking "Open" escalates to the full-screen
 * editor at `/worklog/notes/[id]` for actual editing.
 *
 * Responsive:
 *   • md+ : right-anchored panel sized `min(600px, 50vw)`. The list
 *           behind it stays interactive (no scrim). Click-outside does
 *           NOT close — Drive-style sticky preview while you skim
 *           other rows. Esc and ✕ close explicitly.
 *   • <md : full-screen sheet with scrim. Click on scrim closes.
 *
 * Open-state is owned by the parent via the `?focus=<id>` URL contract;
 * this component is a pure UI shell.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkLog, Position } from "@/types/worklog";
import { WorklogNoteReadView } from "@/components/worklog/worklog-note-read-view";
import { cn } from "@/lib/utils";

export interface WorklogReaderDrawerProps {
  /** Whether the drawer should render at all (also drives visibility / transitions). */
  open: boolean;
  /** Note being previewed. May be null briefly while data loads or if the id is unknown. */
  log: WorkLog | null;
  /** True while the notes query is in flight AND we have no cached log yet — shows skeleton. */
  loading?: boolean;
  positions: Position[];
  positionMap: Map<string, Position>;
  /** Close handler — parent drops `?focus=` from the URL. */
  onClose: () => void;
  /** Optional delete handler. Parent owns the actual mutation; drawer only triggers it. */
  onDelete?: (id: string) => void;
  /**
   * Full-screen route the "Open" button should navigate to. Parent constructs
   * this so it can append the current list query string for back-nav round-trip
   * (matches the handleOpen contract).
   */
  openHref: string | null;
}

export function WorklogReaderDrawer({
  open,
  log,
  loading,
  positions,
  positionMap,
  onClose,
  onDelete,
  openHref,
}: WorklogReaderDrawerProps) {
  const router = useRouter();

  // Esc closes (matches the global keyboard model for drawers/modals).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleOpenFullScreen = () => {
    if (!openHref) return;
    router.push(openHref);
  };

  const handleDelete = () => {
    if (!log || !onDelete) return;
    const ok = window.confirm("Delete this note? This cannot be undone.");
    if (!ok) return;
    onDelete(log.id);
  };

  return (
    <>
      {/* Mobile scrim — only renders below md when open. Desktop preview
          stays scrim-less so the list behind remains clickable. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Panel.
          Desktop: right-anchored, min(600px, 50vw), translateX animation.
          Mobile : full-screen sheet (inset-0). */}
      <aside
        role="dialog"
        aria-modal="false"
        aria-label="Note preview"
        className={cn(
          "fixed z-50 bg-background border-l shadow-xl flex flex-col",
          // Mobile: full-screen sheet
          "inset-0",
          // Desktop: right rail
          "md:inset-y-0 md:left-auto md:right-0 md:w-[min(600px,50vw)]",
          // Animation
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="h-12 px-3 flex items-center gap-2 border-b shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onClose}
            aria-label="Close preview"
            title="Close preview (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
            {log?.title || (loading ? "Loading…" : "Preview")}
          </div>

          <Button
            size="sm"
            onClick={handleOpenFullScreen}
            disabled={!openHref || !log}
            className="h-8"
          >
            Open
          </Button>

          {onDelete && log && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {loading && !log ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !log ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-6">
              <p className="text-sm font-medium">Note not found</p>
              <p className="text-xs text-muted-foreground">
                The note may have been deleted.
              </p>
              <Button size="sm" variant="outline" onClick={onClose}>
                Close preview
              </Button>
            </div>
          ) : (
            <WorklogNoteReadView
              log={log}
              positions={positions}
              positionMap={positionMap}
            />
          )}
        </div>
      </aside>
    </>
  );
}
