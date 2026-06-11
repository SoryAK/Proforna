/**
 * WorklogBulkActionBar — floating action bar shown when one or more notes
 * are selected in the notes list (W1.3).
 *
 * Pure presentational + owns its own confirm dialog for destructive
 * actions. Mutation orchestration lives in the parent (worklog-page) so
 * cache invalidation stays centralized in use-worklog-mutations.
 */

"use client";

import { useEffect, useState } from "react";
import { FolderInput, Trash2, X, Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorklogMoveToFolderDialog } from "@/components/worklog/worklog-move-to-folder-dialog";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import { cn } from "@/lib/utils";

export interface WorklogBulkActionBarProps {
  count: number;
  onMove: (folderId: string | null) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  /**
   * ADR-0026 — archive / unarchive the selection. Direction determined
   * by `archivedView` (true on the Archived sidebar row).
   */
  onArchive: () => Promise<void> | void;
  onClear: () => void;
  /** Disables every action button while a mutation is in flight. */
  busy?: boolean;
  /** True when on the Archived sidebar row — flips Archive into Unarchive. */
  archivedView?: boolean;
}

export function WorklogBulkActionBar({
  count,
  onMove,
  onDelete,
  onArchive,
  onClear,
  busy = false,
  archivedView = false,
}: WorklogBulkActionBarProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { folders, createFolder } = useWorklogFolders();

  // Esc clears the selection — bound here so the bar is fully self-contained
  // and the binding is alive only while the bar is mounted (i.e. while there
  // IS a selection). No conflict with the rail/list arrow-key handlers.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !moveOpen && !deleteOpen) {
        onClear();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveOpen, deleteOpen, onClear]);

  if (count === 0) return null;

  return (
    <>
      <div
        role="toolbar"
        aria-label={`Bulk actions for ${count} selected notes`}
        className={cn(
          "pointer-events-auto fixed left-1/2 bottom-6 z-[2050] -translate-x-1/2",
          "flex items-center gap-1 rounded-full border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur",
          "animate-in fade-in slide-in-from-bottom-2 duration-150",
        )}
      >
        <span className="px-2 text-xs font-medium tabular-nums">
          {count} selected
        </span>
        <span className="h-5 w-px bg-border" aria-hidden />

        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setMoveOpen(true)}
          disabled={busy}
        >
          <FolderInput className="h-3.5 w-3.5" />
          Move to folder…
        </Button>

        {/* ADR-0026 — Archive / Unarchive. Reversible, no confirm. */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          onClick={async () => {
            await onArchive();
          }}
          disabled={busy}
        >
          {archivedView ? (
            <>
              <ArchiveRestore className="h-3.5 w-3.5" />
              Unarchive
            </>
          ) : (
            <>
              <Archive className="h-3.5 w-3.5" />
              Archive
            </>
          )}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          disabled={busy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>

        <span className="h-5 w-px bg-border" aria-hidden />

        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onClear}
          aria-label="Clear selection (Esc)"
          title="Clear selection (Esc)"
          disabled={busy}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Move-to-folder dialog (re-uses the single-note dialog) */}
      <WorklogMoveToFolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        folders={folders}
        currentFolderId={null}
        title={`Move ${count} note${count === 1 ? "" : "s"} to folder`}
        onChoose={async (folderId) => {
          setMoveOpen(false);
          await onMove(folderId);
        }}
        onCreateFolder={async (name) => {
          const created = await createFolder.mutateAsync({ name });
          return { id: created.id };
        }}
      />

      {/* Destructive confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {count} note{count === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the selected note{count === 1 ? "" : "s"} and
              their photos. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await onDelete();
                setDeleteOpen(false);
              }}
              disabled={busy}
            >
              Delete {count} note{count === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
