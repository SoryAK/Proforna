"use client";

/**
 * WorklogMoveToFolderDialog — folder picker used by the reader meta strip and
 * the notes-list right-click menu. Shows a searchable, depth-indented tree
 * with an "Unfiled" option at the top and an inline "+ New folder…" affordance.
 *
 * Controlled. The caller owns `currentFolderId` (the note's existing folder)
 * and receives the chosen target via `onChoose`. The dialog itself does NOT
 * perform the PUT — letting the caller wire it to whichever mutation is local
 * (saveLog for single notes, a batched call for multi-select in the future).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Inbox, Folder, FolderPlus } from "lucide-react";
import {
  buildFolderTree,
  flattenFolderTree,
  validateFolderName,
} from "@/lib/worklog-folders";
import type { WorkLogFolderWithCount } from "@/types/worklog";

export interface WorklogMoveToFolderDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  folders: WorkLogFolderWithCount[];
  /** The folder the note currently lives in (null = Unfiled). */
  currentFolderId: string | null;
  /** Called with the chosen folder id (null = Unfiled). Dialog closes after. */
  onChoose: (folderId: string | null) => void;
  /** Optional inline create — when provided, surfaces a "+ New folder" row. */
  onCreateFolder?: (name: string) => Promise<{ id: string }>;
  title?: string;
}

export function WorklogMoveToFolderDialog(props: WorklogMoveToFolderDialogProps) {
  const {
    open,
    onOpenChange,
    folders,
    currentFolderId,
    onChoose,
    onCreateFolder,
    title = "Move to folder",
  } = props;

  const [query, setQuery] = useState("");
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCreatingName(null);
      setCreateError(null);
      // Focus search — Dialog has no onOpenAutoFocus (base-ui)
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const flat = useMemo(() => flattenFolderTree(buildFolderTree(folders)), [folders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((f) => f.name.toLowerCase().includes(q));
  }, [flat, query]);

  const handleCreate = async () => {
    if (!onCreateFolder || !creatingName) return;
    const err = validateFolderName(creatingName);
    if (err) {
      setCreateError(err);
      return;
    }
    try {
      const created = await onCreateFolder(creatingName.trim());
      onChoose(created.id);
      onOpenChange(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search folders…"
            aria-label="Search folders"
          />

          <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/20">
            {/* Unfiled row */}
            <button
              type="button"
              onClick={() => {
                onChoose(null);
                onOpenChange(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                currentFolderId === null ? "bg-accent/60 font-medium" : ""
              }`}
            >
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <span>Unfiled</span>
            </button>

            <div className="h-px bg-border" />

            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {query ? "No folders match." : "No folders yet."}
              </div>
            )}

            {filtered.map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => {
                  onChoose(f.id);
                  onOpenChange(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                  currentFolderId === f.id ? "bg-accent/60 font-medium" : ""
                }`}
                style={{ paddingLeft: `${12 + f.depth * 16}px` }}
              >
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                {f.noteCount > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">{f.noteCount}</span>
                )}
              </button>
            ))}
          </div>

          {onCreateFolder && (
            <div className="space-y-2">
              {creatingName === null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setCreatingName("")}
                >
                  <FolderPlus className="h-4 w-4" />
                  New folder
                </Button>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={creatingName}
                      onChange={(e) => {
                        setCreatingName(e.target.value);
                        if (createError) setCreateError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreate();
                        } else if (e.key === "Escape") {
                          setCreatingName(null);
                        }
                      }}
                      placeholder="Folder name"
                      maxLength={80}
                    />
                    <Button type="button" size="sm" onClick={() => void handleCreate()}>
                      Create
                    </Button>
                  </div>
                  {createError && (
                    <p className="text-xs text-destructive">{createError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
