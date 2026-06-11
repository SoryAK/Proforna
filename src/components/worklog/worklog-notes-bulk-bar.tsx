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
import { WorklogSendMenu } from "@/components/worklog/worklog-send-menu";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import { cn } from "@/lib/utils";

export interface WorklogNotesBulkBarProps {
  count: number;
  onMove: (folderId: string | null) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  /**
   * ADR-0026 — archive / unarchive the current selection. Direction is
   * determined by `archivedView`: when the user is on the Archived row
   * the action UNARCHIVES; everywhere else it ARCHIVES. Reversible, so no
   * confirm dialog.
   */
  onArchive: () => Promise<void> | void;
  /**
   * Fired when the user picks **Download** from the Send menu. Always
   * available regardless of browser support — saves the .md (N=1) or .zip
   * (N>1) directly to disk via the existing bulk-export endpoint.
   */
  onExport: () => Promise<void> | void;
  /**
   * Fired when the user picks **Share to…** from the Send menu. The handler
   * is responsible for capability detection + falling back to a download
   * with a toast when Web Share isn't supported (see `shareWorklogs` in
   * src/lib/worklog/share/share-client.ts).
   */
  onShare: () => Promise<void> | void;
  onClear: () => void;
  /** Disables every action button while a mutation is in flight. */
  busy?: boolean;
  /**
   * True while an export download is in flight. Disables the Export button
   * + shows a busy state. Separate from `busy` so that an in-progress
   * export doesn't grey out Move / Delete (and vice versa).
   */
  exporting?: boolean;
  /**
   * When `false`, the Send menu collapses to a Download-only button (no
   * dropdown). Driven by `useCanShare()` at the call site so desktop
   * browsers see Download only and touch devices see Download / Share.
   * Defaults to `true`.
   */
  showShare?: boolean;
  /**
   * Intent of the bar:
   *   • `"organize"` (default) — user is filing/cleaning up. Renders Move
   *     + Send + Delete. This is the path entered via the toolbar
   *     "Select" button or by clicking a row checkbox directly.
   *   • `"send"` — user came in via the toolbar "Export" button. Renders
   *     Send only. Move / Delete are deliberately hidden so an export
   *     flow can't accidentally file or destroy notes.
   * Modes are intentionally isolated — there is no in-bar switcher.
   * Esc / Clear exits, and the user re-enters via the right toolbar
   * affordance for the intent they want.
   */
  mode?: "organize" | "send";
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
  /**
   * True when the user is viewing the Archived bucket — flips the Archive
   * button into an Unarchive button (label + icon).
   */
  archivedView?: boolean;
}

export function WorklogNotesBulkBar({
  count,
  onMove,
  onDelete,
  onArchive,
  onExport,
  onShare,
  onClear,
  busy = false,
  exporting = false,
  showShare = true,
  mode = "organize",
  trailing,
  archivedView = false,
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

  const isSendMode = mode === "send";
  const ariaLabel = isSendMode
    ? `Send actions for ${count} selected notes`
    : `Bulk actions for ${count} selected notes`;
  const counterLabel = isSendMode
    ? `${count} ready to send`
    : `${count} selected`;

  return (
    <>
      <div
        role="toolbar"
        aria-label={ariaLabel}
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
            {counterLabel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Move to folder — only in organize mode. Export flow should
              never file notes, only send them. */}
          {!isSendMode && (
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
          )}

          {/* ADR-0026 — Archive / Unarchive. Organize mode only (export
              flow shouldn't bucket-shift notes). Reversible → no confirm. */}
          {!isSendMode && (
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
          )}

          {/* Send menu — always present in both modes. One verb ("send out
              of the system"), two destinations: Download (always available)
              and Share to… (Web Share API; falls back to download + toast
              on browsers without canShare({files})). The label still
              reflects N=1 vs N>1 so the user knows what they're sending
              before they pick a destination. */}
          <WorklogSendMenu
            count={count}
            onDownload={onExport}
            onShare={onShare}
            exporting={exporting}
            busy={busy}
            triggerLabel="Send"
            showShare={showShare}
          />

          {/* Delete — only in organize mode. Export flow should never
              destroy notes. */}
          {!isSendMode && (
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
          )}

          {/* Trailing render slot — view switcher + sort menu stay visible
              alongside bulk actions so the user keeps view controls. */}
          {trailing && (
            <div className="ml-2 flex items-center gap-1 border-l pl-2">
              {trailing}
            </div>
          )}
        </div>
      </div>

      {/* Move-to-folder dialog (re-uses the single-note dialog). Only
          mounted in organize mode — send mode has no Move button so the
          dialog can never be opened. */}
      {!isSendMode && (
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
      )}

      {/* Destructive confirm — same guard. */}
      {!isSendMode && (
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
      )}
    </>
  );
}
