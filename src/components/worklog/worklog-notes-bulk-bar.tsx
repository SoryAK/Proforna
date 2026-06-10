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
import { ChevronDown, Download, FolderInput, Send, Share2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  onExport,
  onShare,
  onClear,
  busy = false,
  exporting = false,
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

          {/* Send menu (Phase 2 — ADR-0022 addendum). One verb ("send out
              of the system"), two destinations: Download (always available)
              and Share to… (Web Share API; falls back to download + toast
              on browsers without canShare({files})). The label still
              reflects N=1 vs N>1 so the user knows what they're sending
              before they pick a destination. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy || exporting}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs",
                "hover:bg-accent/60 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
              title={
                count === 1
                  ? "Send this note (download or share)"
                  : `Send ${count} notes (download as .zip or share)`
              }
              aria-label="Send selected notes"
            >
              <Send className="h-3.5 w-3.5" />
              {exporting ? "Sending…" : `Send${count > 1 ? " as .zip" : " as .md"}`}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => void onExport()}
                disabled={exporting}
              >
                <Download className="mr-2 h-3.5 w-3.5" />
                <div className="flex flex-col">
                  <span>Download</span>
                  <span className="text-[11px] text-muted-foreground">
                    Save {count === 1 ? ".md to your device" : ".zip to your device"}
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void onShare()}
                disabled={exporting}
              >
                <Share2 className="mr-2 h-3.5 w-3.5" />
                <div className="flex flex-col">
                  <span>Share to…</span>
                  <span className="text-[11px] text-muted-foreground">
                    Open the system share sheet
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
