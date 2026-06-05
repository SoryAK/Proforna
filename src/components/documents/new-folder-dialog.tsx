"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
  isPending?: boolean;
}

/**
 * "New folder" dialog. Owns its local name state and resets when closed so the
 * parent doesn't need to manage it. Enter submits when the trimmed name is non-empty.
 */
export function NewFolderDialog({ open, onOpenChange, onCreate, isPending }: Props) {
  const [name, setName] = useState("");

  // Reset the field whenever the dialog closes so the next open starts blank.
  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  function submit() {
    if (!canSubmit) return;
    onCreate(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-folder-name">Folder name</Label>
          <Input
            id="new-folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 2026 Tax Documents"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <DialogClose>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
