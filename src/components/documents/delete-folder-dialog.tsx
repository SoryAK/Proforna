"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocFolder } from "./types";

interface Props {
  folder: DocFolder | null;
  /** Counts surfaced by the API's 409 response when delete-without-cascade is attempted. */
  counts: { children: number; documents: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

/**
 * Cascade-delete confirmation. The folder is non-empty, so we surface the
 * counts the server reported (children folders + documents) and require an
 * explicit "Delete folder and all contents" click before sending cascade=1.
 *
 * Documents inside cascaded folders are NOT deleted — they're orphaned to root
 * by the FK ON DELETE SET NULL. The copy reflects that.
 */
export function DeleteFolderDialog({
  folder,
  counts,
  onConfirm,
  onCancel,
  isPending,
}: Props) {
  const open = !!(folder && counts);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete folder?
          </DialogTitle>
        </DialogHeader>
        {folder && counts && (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{folder.name}</span> contains{" "}
              <span className="font-medium">{counts.children}</span> sub-folder
              {counts.children === 1 ? "" : "s"} and{" "}
              <span className="font-medium">{counts.documents}</span> file
              {counts.documents === 1 ? "" : "s"}.
            </p>
            <p className="text-muted-foreground">
              Sub-folders will be deleted. Files inside will be moved back to the root
              of <span className="italic">Documents</span> — they won&apos;t be lost.
            </p>
          </div>
        )}
        <DialogFooter>
          <DialogClose>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Deleting…" : "Delete folder and all contents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
