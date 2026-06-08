"use client";

/**
 * WorklogCategoryRows — the Categories disclosure section, shared between
 * the in-page rail (worklog-folders-rail) and the global sidebar
 * (worklog-nav-sidebar).
 *
 * Owns:
 *   • Disclosure open/closed state (optionally persisted to localStorage)
 *   • "+" affordance + inline create input row
 *   • Per-row kebab dropdown (Rename · Delete) for user-defined categories
 *   • Inline rename input swap, mirroring worklog-folder-tree's pattern
 *   • The delete confirmation dialog (WorklogCategoryDeleteDialog)
 *
 * The synthetic "Other" fallback row never gets a kebab — it has no backing
 * WorkLogCategory record and is conceptually un-editable.
 *
 * Why a shared section component (mirrors WorklogFolderTreeItems):
 *   • Both consumers render an identical <details><summary>Categories</summary>
 *     block whose only structural difference is row sizing (h-3.5 vs h-5).
 *   • Inlining the kebab + dialog wiring twice would duplicate ~80 LOC and
 *     push the rail toward the 600-line god-file ceiling.
 *
 * The rail's *compact* (icon-only) branch keeps its own inline loop — there's
 * no CRUD affordance in compact mode (same as the folders section).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
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
import { resolveCategoryMeta } from "@/components/worklog/constants";
import { WorklogCategoryDeleteDialog } from "@/components/worklog/worklog-category-delete-dialog";
import { useWorklogCategories, type WorkLogCategoryRow } from "@/components/worklog/hooks/use-worklog-categories";
import {
  WORKLOG_CATEGORY_FALLBACK,
  WORKLOG_CATEGORY_NAME_MAX,
  validateWorklogCategoryName,
} from "@/lib/worklog-categories";
import { migrateLegacyKey } from "@/lib/storage-keys";
import type { FolderSelection } from "@/types/worklog";

export type WorklogCategoryRowsSize = "sm" | "md";

export interface WorklogCategoryRowsProps {
  /**
   * "sm" → rail (h-3.5 icons, text-sm, py-1.25).
   * "md" → nav-sidebar (h-5 icons, text-base font-medium, py-2.5).
   */
  size: WorklogCategoryRowsSize;
  selected: FolderSelection;
  onSelect: (sel: FolderSelection) => void;
  /** Pre-aggregated `category → noteCount` map (built by the parent from its
   *  own ["worklogs"] query so we don't re-fetch). */
  categoryCounts: Map<string, number>;
  /** Optional callback fired on keyboard Enter on a row, used by the rail's
   *  orchestrator to forward focus to the notes list. */
  onActivate?: () => void;
  /** Whether the disclosure starts open. Defaults to true. */
  defaultOpen?: boolean;
  /** localStorage key for persisting the disclosure state. Omit to skip
   *  persistence (used by the nav-sidebar, which has no per-user toggle). */
  persistKey?: string;
}

interface InnerRowProps {
  size: WorklogCategoryRowsSize;
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  dim: boolean;
  onClick: () => void;
  onActivate?: () => void;
  /** Optional kebab dropdown rendered after the row label. */
  rowActions?: React.ReactNode;
}

/**
 * Inner row component that mirrors the rail/nav row styling so the section
 * can render either size from a single implementation.
 */
function CategoryRow({
  size,
  icon,
  label,
  count,
  active,
  dim,
  onClick,
  onActivate,
  rowActions,
}: InnerRowProps) {
  const isMd = size === "md";
  return (
    <div
      className={cn(
        "group flex items-center transition-colors",
        isMd ? "rounded-lg pr-1" : "rounded-md pr-0.5",
        active
          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
          : "hover:bg-accent text-foreground/80 hover:text-foreground",
        !active && dim && "opacity-55",
      )}
    >
      <button
        type="button"
        data-rail-row
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onActivate) {
            e.preventDefault();
            onClick();
            onActivate();
          }
        }}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex-1 min-w-0 flex items-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          isMd
            ? "gap-3 rounded-lg text-base font-medium px-3 py-2.5"
            : "gap-2 rounded-md text-sm px-2 py-1.25",
        )}
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
        {count > 0 && (
          <span
            className={cn(
              "ml-auto text-[11px] tabular-nums",
              active ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground",
            )}
          >
            {count}
          </span>
        )}
      </button>
      {rowActions}
    </div>
  );
}

export function WorklogCategoryRows({
  size,
  selected,
  onSelect,
  categoryCounts,
  onActivate,
  defaultOpen = true,
  persistKey,
}: WorklogCategoryRowsProps) {
  const { categories, createCategory, updateCategory, deleteCategory } =
    useWorklogCategories();

  // ---- Disclosure open/closed (optionally persisted) -------------------
  const [open, setOpen] = useState<boolean>(defaultOpen);
  useEffect(() => {
    if (!persistKey) return;
    try {
      migrateLegacyKey(persistKey);
      const raw = window.localStorage.getItem(persistKey);
      // Only override default when an explicit value is present.
      if (raw === "1") setOpen(true);
      if (raw === "0") setOpen(false);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, [persistKey]);
  useEffect(() => {
    if (!persistKey) return;
    try {
      window.localStorage.setItem(persistKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, persistKey]);

  // ---- Display list: user rows + synthetic "Other" fallback ------------
  const rowKeys = useMemo(
    () => [...categories.map((c) => c.name), WORKLOG_CATEGORY_FALLBACK],
    [categories],
  );

  const isCategoryActive = (key: string) =>
    selected.kind === "category" && selected.category === key;

  // ---- Create flow: inline input revealed by "+" -----------------------
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  const startCreate = () => {
    // Opening the disclosure on first create gives the user something to look
    // at when the input mounts at the bottom of the list.
    setOpen(true);
    setCreating(true);
    setCreateDraft("");
    setCreateError(null);
  };
  const cancelCreate = () => {
    setCreating(false);
    setCreateDraft("");
    setCreateError(null);
  };
  const commitCreate = async () => {
    const err = validateWorklogCategoryName(createDraft);
    if (err) {
      setCreateError(err);
      return;
    }
    try {
      await createCategory.mutateAsync({ name: createDraft.trim() });
      cancelCreate();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Rename flow: inline input swap (mirrors worklog-folder-tree) ----
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const startRename = (row: WorkLogCategoryRow) => {
    setRenamingId(row.id);
    setRenameDraft(row.name);
    setRenameError(null);
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameError(null);
  };
  const commitRename = async () => {
    if (!renamingId) return;
    const err = validateWorklogCategoryName(renameDraft);
    if (err) {
      setRenameError(err);
      return;
    }
    try {
      await updateCategory.mutateAsync({
        id: renamingId,
        name: renameDraft.trim(),
      });
      cancelRename();
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Delete flow: confirmation dialog --------------------------------
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const deleteTarget = deleteTargetId
    ? categories.find((c) => c.id === deleteTargetId) ?? null
    : null;
  const deleteTargetCount = deleteTarget
    ? categoryCounts.get(deleteTarget.name) ?? 0
    : 0;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory.mutateAsync({ id: deleteTarget.id });
      setDeleteTargetId(null);
    } catch (e) {
      // Surface server errors via window.alert — the user is already in a
      // confirmation modal; throwing silently would feel broken.
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  // Class tokens reused by both inline inputs.
  const inputSizeClass =
    size === "md" ? "h-9 text-base px-2" : "h-7 text-sm px-1.5";

  return (
    <>
      <details
        open={open}
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="group"
      >
        <summary
          className={cn(
            "cursor-pointer list-none flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
            // Rail uses pt-3 spacing above the section; nav-sidebar uses pt-1
            // because it already follows another bordered section.
            size === "md" ? "pt-1 pb-1" : "pt-3 pb-1",
          )}
        >
          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
          <span className="flex-1">Categories</span>
          <button
            type="button"
            onClick={(e) => {
              // Stop propagation so clicking "+" doesn't toggle the
              // <details> via the surrounding <summary>.
              e.preventDefault();
              e.stopPropagation();
              startCreate();
              requestAnimationFrame(() => createInputRef.current?.focus());
            }}
            title="New category"
            aria-label="New category"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-3 w-3" />
          </button>
        </summary>

        <div role="group" aria-label="Categories" className="space-y-0.5 mt-0.5">
          {rowKeys.map((key) => {
            const meta = resolveCategoryMeta(key);
            const Icon = meta.icon;
            const count = categoryCounts.get(key) ?? 0;
            const isFallback = key === WORKLOG_CATEGORY_FALLBACK;
            const row = categories.find((c) => c.name === key) ?? null;
            const isRenaming = !!row && renamingId === row.id;

            // Inline rename swap takes over the row's body but keeps the
            // surrounding flex container so the kebab can stay aligned.
            if (isRenaming && row) {
              return (
                <div key={key} className="px-2 py-0.5">
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
                        cancelRename();
                      }
                    }}
                    maxLength={WORKLOG_CATEGORY_NAME_MAX}
                    className={inputSizeClass}
                    aria-invalid={!!renameError}
                  />
                  {renameError && (
                    <p className="px-1 pt-0.5 text-[10px] text-destructive">
                      {renameError}
                    </p>
                  )}
                </div>
              );
            }

            const rowActions = !isFallback && row ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "flex-shrink-0 inline-flex items-center justify-center rounded text-muted-foreground",
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100",
                    "hover:bg-background/60 hover:text-foreground transition-opacity",
                    size === "md" ? "h-7 w-7 ml-1" : "h-5 w-5 ml-0.5",
                  )}
                  aria-label={`Actions for ${meta.label}`}
                  // base-ui Trigger opens via its own onClick — adding
                  // onClick here would clobber it (see user memory).
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => startRename(row)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteTargetId(row.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null;

            return (
              <CategoryRow
                key={key}
                size={size}
                icon={
                  <Icon className={size === "md" ? "h-5 w-5" : "h-3.5 w-3.5"} />
                }
                label={meta.label}
                count={count}
                active={isCategoryActive(key)}
                dim={count === 0}
                onClick={() => onSelect({ kind: "category", category: key })}
                onActivate={onActivate}
                rowActions={rowActions}
              />
            );
          })}

          {/* Inline create row, revealed by the "+" button -------------- */}
          {creating && (
            <div className="px-2 pt-1">
              <Input
                ref={createInputRef}
                value={createDraft}
                onChange={(e) => {
                  setCreateDraft(e.target.value);
                  if (createError) setCreateError(null);
                }}
                onBlur={() => {
                  // Empty + blur = cancel (consistent with folders prompt UX
                  // where dismissing without typing aborts).
                  if (!createDraft.trim()) {
                    cancelCreate();
                  } else {
                    void commitCreate();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitCreate();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelCreate();
                  }
                }}
                placeholder="New category…"
                maxLength={WORKLOG_CATEGORY_NAME_MAX}
                className={inputSizeClass}
                aria-invalid={!!createError}
              />
              {createError && (
                <p className="px-1 pt-0.5 text-[10px] text-destructive">
                  {createError}
                </p>
              )}
            </div>
          )}
        </div>
      </details>

      <WorklogCategoryDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTargetId(null);
        }}
        categoryName={deleteTarget?.name ?? ""}
        noteCount={deleteTargetCount}
        onConfirm={confirmDelete}
        pending={deleteCategory.isPending}
      />
    </>
  );
}
