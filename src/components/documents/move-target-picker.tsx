"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FolderTreeNode } from "./types";

export interface MoveTargetState {
  /** What kind of subject is being moved (label only). */
  kind: "document" | "folder";
  /** Display name shown in the dialog header. */
  name: string;
  /**
   * Folder IDs that are NOT valid drop targets. For document moves: the
   * document's current parent. For folder moves: the moving folder + its
   * descendants (UI guard; server enforces too).
   */
  forbiddenIds: Set<string>;
  /** Currently selected target id (null = root). Resolved by parent. */
  initialTargetId?: string | null;
}

interface Props {
  state: MoveTargetState | null;
  tree: FolderTreeNode[];
  onConfirm: (targetFolderId: string | null) => void;
  onCancel: () => void;
  isPending?: boolean;
}

/**
 * Tree-style picker. Click a node to select; Enter/Space toggles expand. Root
 * (the "Documents" home row) is always selectable. Forbidden ids render as
 * disabled rows so the user can see the structure but can't pick them.
 */
export function MoveTargetPicker({
  state,
  tree,
  onConfirm,
  onCancel,
  isPending,
}: Props) {
  const open = !!state;
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Reset selection when a new move starts.
  useEffect(() => {
    if (!state) return;
    setSelected(state.initialTargetId ?? null);
    // Pre-expand the path to the initial target — best-effort, falls back to roots.
    setExpanded(new Set());
  }, [state]);

  const forbidden = state?.forbiddenIds ?? new Set<string>();

  const flat = useMemo(() => flattenTree(tree, expanded, forbidden), [tree, expanded, forbidden]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {state?.kind === "folder" ? "folder" : "document"}: {state?.name}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-72 rounded-md border">
          <ul role="tree" className="py-1">
            {/* Root row */}
            <li>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/60",
                  selected === null && "bg-orange-100 dark:bg-orange-900/40"
                )}
              >
                <Home className="h-4 w-4 text-muted-foreground" />
                <span>Documents (root)</span>
              </button>
            </li>

            {flat.map((row) => {
              const isSelected = selected === row.id;
              const isForbidden = row.forbidden;
              return (
                <li key={row.id}>
                  <div
                    style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 text-sm transition-colors",
                      isForbidden
                        ? "cursor-not-allowed text-muted-foreground/60"
                        : "hover:bg-muted/60",
                      isSelected && "bg-orange-100 dark:bg-orange-900/40"
                    )}
                  >
                    {row.hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(row.id)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                        aria-label={expanded.has(row.id) ? "Collapse" : "Expand"}
                      >
                        <ChevronRight
                          className={cn(
                            "h-3 w-3 transition-transform",
                            expanded.has(row.id) && "rotate-90"
                          )}
                        />
                      </button>
                    ) : (
                      <span className="inline-block h-5 w-5" />
                    )}
                    <button
                      type="button"
                      disabled={isForbidden}
                      onClick={() => !isForbidden && setSelected(row.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <Folder
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isForbidden ? "text-muted-foreground/50" : "text-orange-500"
                        )}
                      />
                      <span className="truncate">{row.name}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <DialogFooter>
          <DialogClose>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={() => onConfirm(selected)} disabled={isPending}>
            {isPending ? "Moving…" : "Move here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FlatRow {
  id: string;
  name: string;
  depth: number;
  hasChildren: boolean;
  forbidden: boolean;
}

function flattenTree(
  tree: FolderTreeNode[],
  expanded: Set<string>,
  forbidden: Set<string>
): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (nodes: FolderTreeNode[], depth: number) => {
    for (const node of nodes) {
      out.push({
        id: node.folder.id,
        name: node.folder.name,
        depth,
        hasChildren: node.children.length > 0,
        forbidden: forbidden.has(node.folder.id),
      });
      if (expanded.has(node.folder.id) && node.children.length > 0) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(tree, 0);
  return out;
}
