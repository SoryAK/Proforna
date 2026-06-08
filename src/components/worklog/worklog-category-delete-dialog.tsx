"use client";

/**
 * WorklogCategoryDeleteDialog — confirms deletion of a user-defined
 * worklog category.
 *
 * Categories aren't true folders: the server's DELETE handler bulk-rewrites
 * affected notes' `WorkLog.category` to the synthetic fallback "other" in a
 * single transaction. There's no "hard cascade" option — notes are always
 * preserved — so the dialog only needs a single confirm path.
 *
 * Caller passes the pre-computed `noteCount` so the copy is honest about
 * blast radius. When zero, we drop the "will move to Other" wording.
 */

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export interface WorklogCategoryDeleteDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Display name of the category being deleted. */
  categoryName: string;
  /** Live count of the user's notes currently tagged with this category. */
  noteCount: number;
  onConfirm: () => Promise<void> | void;
  pending?: boolean;
}

export function WorklogCategoryDeleteDialog({
  open,
  onOpenChange,
  categoryName,
  noteCount,
  onConfirm,
  pending,
}: WorklogCategoryDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete category “{categoryName}”?</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {noteCount === 0 ? (
            <p className="text-muted-foreground">
              This category has no notes. It will be removed immediately.
            </p>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>
                <span className="font-medium">
                  {noteCount} note{noteCount === 1 ? "" : "s"}
                </span>{" "}
                tagged with “{categoryName}” will be moved to{" "}
                <span className="font-medium">Other</span>. The notes themselves
                are preserved.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
