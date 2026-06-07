"use client";

/**
 * WorklogFolderTree — recursive renderer for user-defined folders in the rail.
 *
 * Owns:
 *   • Expand/collapse state (Set<id>) persisted to localStorage.
 *   • Inline rename (Enter saves, Escape cancels).
 *   • Per-row kebab menu (New subfolder · Rename · Move… · Delete).
 *   • Triggers the shared move/delete dialogs.
 *
 * Receives folder data and mutation callbacks from the rail (which owns the
 * hook to avoid duplicate queries when the rail itself needs counts).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Move,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  buildFolderTree,
  collectDescendantIds,
  validateFolderName,
  type FolderTreeNode,
} from "@/lib/worklog-folders";
import type { WorkLogFolderWithCount } from "@/types/worklog";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DND_ACTIVE_ROW_CLASS } from "@/components/worklog/constants";
import { STORAGE_KEYS, migrateLegacyKey } from "@/lib/storage-keys";

const EXPANDED_KEY = STORAGE_KEYS.worklog.folderTreeExpanded;

export interface WorklogFolderTreeProps {
  folders: WorkLogFolderWithCount[];
  unfiledCount: number;
  selectedFolderId: string | null; // null when no folder selected (or Unfiled handled separately)
  isUnfiledSelected: boolean;
  compact?: boolean;
  onSelectFolder: (folderId: string) => void;
  onSelectUnfiled: () => void;
  onActivate?: () => void;
  /** Optimistic rename. */
  onRename: (id: string, name: string) => void | Promise<unknown>;
  /** Create new (sub)folder. Pass null parent for root. */
  onCreate: (parentId: string | null) => void;
  /** Open move dialog for `id`. Parent provides target via dialog. */
  onRequestMove: (id: string) => void;
  /** Open delete dialog for `id`. */
  onRequestDelete: (id: string) => void;
}

/** Minimal DnD wrapper around each folder row. Applies transform/transition/opacity. */
function SortableFolderWrapper({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? DND_ACTIVE_ROW_CLASS : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export function WorklogFolderTree(props: WorklogFolderTreeProps) {
  const {
    folders,
    unfiledCount,
    selectedFolderId,
    isUnfiledSelected,
    compact,
    onSelectFolder,
    onSelectUnfiled,
    onActivate,
    onRename,
    onCreate,
    onRequestMove,
    onRequestDelete,
  } = props;

  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  // --- Expand/collapse state, persisted ----------------------------------
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      migrateLegacyKey(EXPANDED_KEY);
      const raw = window.localStorage.getItem(EXPANDED_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) setExpanded(new Set(arr));
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expanded)));
    } catch {
      /* ignore */
    }
  }, [expanded]);

  // Ensure ancestors of the selected folder are auto-expanded so the row is visible.
  useEffect(() => {
    if (!selectedFolderId) return;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const toOpen: string[] = [];
    let cursor = byId.get(selectedFolderId);
    const seen = new Set<string>();
    while (cursor?.parentId && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      toOpen.push(cursor.parentId);
      cursor = byId.get(cursor.parentId);
    }
    if (toOpen.length) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of toOpen) next.add(id);
        return next;
      });
    }
  }, [selectedFolderId, folders]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Expand the parent BEFORE delegating to the caller's create handler so the
  // freshly-created child is visible the moment the server returns it.
  const handleCreate = (parentId: string | null) => {
    if (parentId) {
      setExpanded((prev) => {
        if (prev.has(parentId)) return prev;
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
    }
    onCreate(parentId);
  };

  // --- Inline rename ------------------------------------------------------
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const startRename = (node: FolderTreeNode) => {
    setRenamingId(node.id);
    setRenameDraft(node.name);
    setRenameError(null);
  };
  const commitRename = async () => {
    if (!renamingId) return;
    const err = validateFolderName(renameDraft);
    if (err) {
      setRenameError(err);
      return;
    }
    await onRename(renamingId, renameDraft.trim());
    setRenamingId(null);
  };

  // --- Recursive render --------------------------------------------------
  const renderNode = (node: FolderTreeNode): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    const isActive = selectedFolderId === node.id;
    const isRenaming = renamingId === node.id;
    // Visual depth — clamp for very deep trees to keep them in the rail.
    const indent = Math.min(node.depth, 6) * 12;

    return (
      <SortableFolderWrapper key={node.id} id={"folder:" + node.id}>
        <div>
        <div
          className={cn(
            "group flex items-center rounded-md text-sm transition-colors",
            isActive
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
              : "hover:bg-accent text-foreground/80 hover:text-foreground",
          )}
          style={{ paddingLeft: indent }}
        >
          {/* Chevron / spacer */}
          <button
            type="button"
            onClick={hasChildren ? () => toggle(node.id) : undefined}
            aria-label={hasChildren ? (isOpen ? "Collapse" : "Expand") : undefined}
            tabIndex={hasChildren ? 0 : -1}
            className={cn(
              "h-6 w-5 flex items-center justify-center text-muted-foreground",
              hasChildren && "hover:text-foreground",
              !hasChildren && "opacity-0 pointer-events-none",
            )}
          >
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
            />
          </button>

          {/* Row body */}
          {isRenaming ? (
            <div className="flex-1 py-0.5 pr-1">
              <Input
                autoFocus
                value={renameDraft}
                onChange={(e) => {
                  setRenameDraft(e.target.value);
                  if (renameError) setRenameError(null);
                }}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitRename();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setRenamingId(null);
                  }
                }}
                maxLength={80}
                className="h-6 text-sm px-1.5"
                aria-invalid={!!renameError}
              />
              {renameError && (
                <p className="px-1 text-[10px] text-destructive">{renameError}</p>
              )}
            </div>
          ) : (
            <>
              <button
                type="button"
                data-rail-row
                onClick={() => onSelectFolder(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && onActivate) {
                    e.preventDefault();
                    onSelectFolder(node.id);
                    onActivate();
                  }
                }}
                className="flex flex-1 items-center gap-1.5 truncate py-1 pr-1 text-left focus:outline-none"
                title={node.name}
              >
                {isOpen && hasChildren ? (
                  <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                ) : (
                  <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{node.name}</span>
                {node.noteCount > 0 && (
                  <span
                    className={cn(
                      "ml-auto text-[11px] tabular-nums",
                      isActive
                        ? "text-orange-700 dark:text-orange-300"
                        : "text-muted-foreground",
                    )}
                  >
                    {node.noteCount}
                  </span>
                )}
              </button>

              {/* Kebab menu — appears on row hover or when menu open */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "h-6 w-6 mr-1 inline-flex items-center justify-center rounded text-muted-foreground",
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100",
                    "hover:bg-background/60 hover:text-foreground transition-opacity",
                  )}
                  aria-label={`Actions for ${node.name}`}
                  // NOTE: do NOT add onClick here — base-ui Trigger opens via
                  // its own onClick, and React last-write-wins would clobber it.
                  // The label is a sibling <button>, so clicks don't bubble
                  // into it; no propagation guard is needed.
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => handleCreate(node.id)}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    New subfolder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => startRename(node)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRequestMove(node.id)}>
                    <Move className="mr-2 h-3.5 w-3.5" />
                    Move…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onRequestDelete(node.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {hasChildren && isOpen && (
          <div>{node.children.map((c) => renderNode(c))}</div>
        )}
        </div>
      </SortableFolderWrapper>
    );
  };

  // Compute total descendants counts shown by "Unfiled" — provided by parent.
  const unfiledLabel = `Unfiled`;

  if (compact) {
    // In compact mode the rail is only ~48px wide — too narrow for a tree.
    // We surface two icon buttons:
    //   1. Unfiled (direct filter, single click)
    //   2. Folders (opens a flyout popover containing the full tree, new-root
    //      button, and per-folder kebab actions).
    // The popover renders to document.body via portal with z-[1400] so it sits
    // above the job-map embed surface (z-[1300]).
    const hasAnyFolders = tree.length > 0;
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          data-rail-row
          onClick={onSelectUnfiled}
          title="Unfiled"
          aria-current={isUnfiledSelected ? "true" : undefined}
          className={cn(
            "h-8 w-8 inline-flex items-center justify-center rounded-md",
            isUnfiledSelected
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
              : "text-foreground/70 hover:bg-accent",
          )}
        >
          <Inbox className="h-3.5 w-3.5" />
        </button>
        <Popover>
          <PopoverTrigger
            className={cn(
              "h-8 w-8 inline-flex items-center justify-center rounded-md",
              "text-foreground/70 hover:bg-accent data-[popup-open]:bg-accent",
            )}
            title="Folders"
            aria-label="Folders"
          >
            {hasAnyFolders ? (
              <FolderOpen className="h-3.5 w-3.5" />
            ) : (
              <Folder className="h-3.5 w-3.5" />
            )}
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="w-64 z-[1400] p-2 gap-1.5"
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Folders
              </span>
              <button
                type="button"
                onClick={() => handleCreate(null)}
                title="New folder"
                aria-label="New folder"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div
              className="max-h-80 overflow-y-auto scrollbar-thin space-y-0.5"
              role="group"
              aria-label="Folders"
            >
              {tree.map((node) => renderNode(node))}
              {!hasAnyFolders && (
                <p className="px-2 py-1 text-[11px] text-muted-foreground italic">
                  No folders yet — click + to create one.
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="space-y-0.5" role="group" aria-label="Folders">
      {/* Unfiled smart row — always present. */}
      <div
        className={cn(
          "group flex items-center rounded-md text-sm",
          isUnfiledSelected
            ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
            : "hover:bg-accent text-foreground/80 hover:text-foreground",
        )}
      >
        <span className="h-6 w-5" />
        <button
          type="button"
          data-rail-row
          onClick={onSelectUnfiled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onActivate) {
              e.preventDefault();
              onSelectUnfiled();
              onActivate();
            }
          }}
          className="flex flex-1 items-center gap-1.5 truncate py-1 pr-1 text-left focus:outline-none"
        >
          <Inbox className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">{unfiledLabel}</span>
          {unfiledCount > 0 && (
            <span
              className={cn(
                "ml-auto text-[11px] tabular-nums",
                isUnfiledSelected
                  ? "text-orange-700 dark:text-orange-300"
                  : "text-muted-foreground",
              )}
            >
              {unfiledCount}
            </span>
          )}
        </button>
      </div>

      {tree.map((node) => renderNode(node))}

      {tree.length === 0 && (
        <p className="px-2 py-1 text-[11px] text-muted-foreground italic">
          No folders yet — create one to start organizing.
        </p>
      )}
    </div>
  );
}

/**
 * Helper exposed for delete-dialog blast-radius copy: total notes + total
 * descendant folder count for a given folder id.
 */
export function computeDeleteBlastRadius(
  folders: WorkLogFolderWithCount[],
  folderId: string,
): { noteCount: number; descendantFolderCount: number } {
  const ids = collectDescendantIds(folders, folderId);
  let noteCount = 0;
  let descendantFolderCount = 0;
  for (const f of folders) {
    if (ids.has(f.id)) {
      noteCount += f.noteCount;
      if (f.id !== folderId) descendantFolderCount += 1;
    }
  }
  return { noteCount, descendantFolderCount };
}
