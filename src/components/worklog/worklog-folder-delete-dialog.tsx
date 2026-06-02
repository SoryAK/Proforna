"use client";

/**
 * WorklogFolderDeleteDialog — confirms folder deletion with two strategies:
 *   • Move N notes to Unfiled (children folders re-rooted; notes preserved)
 *   • Delete folder AND N notes (hard cascade; requires typing the folder name)
 *
 * Caller passes the live `noteCount` (direct + descendant counts pre-aggregated)
 * so the copy is honest about blast radius.
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

export interface WorklogFolderDeleteDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  folderName: string;
  /** Total notes that will be affected (direct + descendants). */
  noteCount: number;
  /** Total descendant folders (excluding the folder itself). */
  descendantFolderCount: number;
  onConfirm: (mode: "orphan" | "delete", nameConfirm?: string) => Promise<void> | void;
  pending?: boolean;
}

export function WorklogFolderDeleteDialog(props: WorklogFolderDeleteDialogProps) {
  const {
    open,
    onOpenChange,
    folderName,
    noteCount,
    descendantFolderCount,
    onConfirm,
    pending,
  } = props;

  const [mode, setMode] = useState<"orphan" | "delete">("orphan");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) {
      setMode("orphan");
      setTyped("");
    }
  }, [open]);

  const canHardDelete = typed.trim() === folderName;
  const isEmpty = noteCount === 0 && descendantFolderCount === 0;

  const handleConfirm = async () => {
    if (mode === "delete" && !canHardDelete) return;
    await onConfirm(mode, mode === "delete" ? typed.trim() : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete folder “{folderName}”?</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {isEmpty ? (
            <p className="text-muted-foreground">
              This folder is empty. It will be removed immediately.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                This folder contains{" "}
                <span className="font-medium text-foreground">
                  {noteCount} note{noteCount === 1 ? "" : "s"}
                </span>
                {descendantFolderCount > 0 && (
                  <>
                    {" "}across{" "}
                    <span className="font-medium text-foreground">
                      {descendantFolderCount} subfolder{descendantFolderCount === 1 ? "" : "s"}
                    </span>
                  </>
                )}
                . Choose what to do with them:
              </p>

              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 hover:bg-accent/50">
                <input
                  type="radio"
                  name="folder-delete-mode"
                  className="mt-1"
                  checked={mode === "orphan"}
                  onChange={() => setMode("orphan")}
                />
                <div>
                  <div className="font-medium">Move notes to Unfiled</div>
                  <div className="text-xs text-muted-foreground">
                    Notes stay in your worklog (Unfiled). Subfolders become roots.
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-destructive/30 p-3 hover:bg-destructive/5">
                <input
                  type="radio"
                  name="folder-delete-mode"
                  className="mt-1"
                  checked={mode === "delete"}
                  onChange={() => setMode("delete")}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Delete folder and all {noteCount} note{noteCount === 1 ? "" : "s"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Permanent. Cannot be undone.
                  </div>
                  {mode === "delete" && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs">
                        Type <span className="font-mono font-semibold">{folderName}</span> to confirm:
                      </p>
                      <Input
                        autoFocus
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder={folderName}
                      />
                    </div>
                  )}
                </div>
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={mode === "delete" || isEmpty ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={pending || (mode === "delete" && !canHardDelete)}
          >
            {pending
              ? "Working…"
              : isEmpty
                ? "Delete folder"
                : mode === "orphan"
                  ? `Move ${noteCount} & delete folder`
                  : `Delete ${noteCount} notes`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
