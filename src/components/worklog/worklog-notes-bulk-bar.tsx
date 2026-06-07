/**
 * WorklogNotesBulkBar — Drive-style top bulk-action bar for /worklog/notes
 * (per ADR-0015). Renders in place of the toolbar when one or more rows are
 * selected. Same mutation contracts as the existing <WorklogBulkActionBar>;
 * different chrome (top-of-page, not floating bottom).
 *
 * The compact dashboard embed and the home view continue to use
 * <WorklogBulkActionBar> (the floating version) because they don't have a
 * dedicated toolbar to swap with.
 */

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FolderInput, Trash2, X } from "lucide-react";
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

export interface WorklogNotesBulkBarProps {
  count: number;
  onMove: (folderId: string | null) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClear: () => void;
  /** Disables every action button while a mutation is in flight. */
  busy?: boolean;
  /**
   * Optional render slot placed after the bulk action buttons (Move /
   * Delete) on the right side of the bar. Used by the parent to keep the
   * view switcher + sort menu visible while a selection is active so the
   * user doesn't lose those controls mid-bulk-edit.
   *
   * TODO(design-review): on small viewports the bulk actions + trailing
   * controls share one row and can wrap awkwardly. Revisit during the
   * next design audit — options include stacking, dropdown overflow, or
   * hiding the trailing slot below a breakpoint.
   */
  trailing?: ReactNode;
}

export function WorklogNotesBulkBar({
  count,
  onMove,
  onDelete,
  onClear,
  busy = false,
  trailing,
}: WorklogNotesBulkBarProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { folders, createFolder } = useWorklogFolders();

  // Esc clears the selection — bound here so the bar is fully self-contained
  // and the binding is alive only while the bar is mounted (i.e. while there
  // IS a selection).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !moveOpen && !deleteOpen) {
        onClear();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveOpen, deleteOpen, onClear]);

  // Render even when count === 0 only if the parent decides to (parent
  // typically gates `count > 0` itself); we still guard internally for safety.
  if (count === 0) return null;

  return (
    <>
      <div
        role="toolbar"
        aria-label={`Bulk actions for ${count} selected notes`}
        className={cn(
          "h-12 px-4 flex items-center justify-between border-b",
          "bg-orange-500/10 dark:bg-orange-500/[0.08]",
          "animate-in fade-in slide-in-from-top-1 duration-150",
        )}
      >
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onClear}
            aria-label="Clear selection (Esc)"
            title="Clear selection (Esc)"
            disabled={busy}
          >
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-orange-700 dark:text-orange-300 tabular-nums">
            {count} selected
          </span>
        </div>

        <div className="flex items-center gap-1">
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

          {/* Trailing render slot — view switcher + sort menu stay visible
              alongside bulk actions so the user keeps view controls. */}
          {trailing && (
            <div className="ml-2 flex items-center gap-1 border-l pl-2">
              {trailing}
            </div>
          )}
        </div>
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
