/**
 * WorklogNotesView — Drive-style document-manager surface for `/worklog/notes`
 * (per ADR-0015) + inline 3-pane reader on `/worklog/notes/[id]` (per ADR-0024).
 *
 * Composition (post 2026-06-10 mockup-parity restructure):
 *   ┌── List column (flex-1, or w-72 when reader open) ──────────────┐
 *   │   Toolbar (count · view · Select · Import · Export · + New)    │
 *   │   OR <BulkBar> when a selection is active                       │
 *   │   <WorklogNotesFilterChips>                                     │
 *   │   List/Grid (inner scroller)                                    │
 *   ├── Reader column (only when a note is selected) ────────────────┤
 *   └── <WorklogReaderRightRail> (xl+ only) ─────────────────────────┘
 *
 * Toolbar + filter chips + bulk-bar all live INSIDE the list column so they
 * scope to the list panel — matching the Tolaria right-rail mockup at
 * /mockups/worklog-reader-right-rail.html. When the column shrinks to w-72
 * on note selection, the toolbar shrinks with it; when the reader closes,
 * the column reclaims `flex-1` and the toolbar widens. Mobile (< md) with
 * a selection: the entire list column is hidden, taking the toolbar with
 * it — the in-reader back link returns to the list where the toolbar
 * reappears.
 *
 * The folder picker lives in the global sidebar (ADR-0013); this view reads
 * the URL-driven `activeFolder` via {@link useFolderSelection} so the table
 * automatically scopes to whatever the sidebar has selected.
 *
 * Inline 3-pane (ADR-0024):
 *   • `/worklog/notes` mounts this view with no selection → list-only.
 *   • `/worklog/notes/[id]` mounts it with `selectedNoteId={id}` → the
 *     list shrinks to w-72 (compact mode), the reader fills the middle,
 *     and the right rail (ADR-0023) takes the right edge.
 *   • Row click → router.push(`/worklog/notes/<id>`) so the path segment
 *     is always the source of truth for selection.
 *   • New notes route straight to `/worklog/notes/<id>` — there's no
 *     preview drawer anymore (retired in ADR-0024).
 *
 * Bulk-mode discipline: row checkboxes only render when the user explicitly
 * activates Select mode in the toolbar. Drive-style — keeps the default view
 * uncluttered. The actual <WorklogNotesBulkBar> still slides in when one or
 * more rows are checked (so the bulk toolbar can stay clear when the user
 * has only toggled Select mode but checked nothing yet). Selecting rows and
 * previewing a note are compatible — both live alongside each other.
 *
 * `<WorklogPage compact />` continues to serve the dashboard embed
 * unchanged; this view is only mounted at `/worklog/notes[/<id>]`.
 */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckSquare, LayoutGrid, List, MoreHorizontal, Plus, Send, Upload } from "lucide-react";
import type { WorkLog } from "@/types/worklog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWorklogData } from "@/components/worklog/hooks/use-worklog-data";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import { useWorklogMutations } from "@/components/worklog/hooks/use-worklog-mutations";
import { useWorklogPreferences } from "@/components/worklog/hooks/use-worklog-preferences";
import { useWorklogSelection } from "@/components/worklog/hooks/use-worklog-selection";
import { useWorklogVisibleLogs } from "@/components/worklog/hooks/use-worklog-visible-logs";
import { useFolderSelection } from "@/components/worklog/hooks/use-folder-selection";
import { useCanShare } from "@/components/worklog/hooks/use-can-share";
import {
  WorklogNotesTable,
} from "@/components/worklog/worklog-notes-table";
import type { WorklogNotesTableSortState } from "@/components/worklog/worklog-notes-shared";
import { WorklogNotesGrid } from "@/components/worklog/worklog-notes-grid";
import { WorklogNotesFilterChips } from "@/components/worklog/worklog-notes-filter-chips";
import { WorklogNotesFilterButton } from "@/components/worklog/worklog-notes-filter-button";
import { WorklogNotesBulkBar } from "@/components/worklog/worklog-notes-bulk-bar";
import { WorklogNotesSortMenu } from "@/components/worklog/worklog-notes-sort-menu";
import { WorklogNoteReader } from "@/components/worklog/worklog-note-reader";
import { WorklogReaderRightRail } from "@/components/worklog/right-rail/worklog-reader-right-rail";
import { WorklogImportDialog } from "@/components/worklog/worklog-import-dialog";
import { WorklogMoveToFolderDialog } from "@/components/worklog/worklog-move-to-folder-dialog";
import { exportBulkWorklogs } from "@/lib/worklog/export/client";
import { shareWorklogs } from "@/lib/worklog/share/share-client";
import { computeNextAfterOrganize } from "@/lib/worklog/auto-advance";
import { toast } from "sonner";

const DEFAULT_SORT: WorklogNotesTableSortState = {
  column: "lastEdited",
  dir: "desc",
};

/**
 * useIsMobile — inline matchMedia hook for `(max-width: 767px)`.
 * Used to force compact list rendering on mobile regardless of selection,
 * since the multi-column desktop layout overflows the viewport (ADR-0024
 * Unit 4). SSR-safe: returns false until the client mounts.
 */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

type ViewMode = "list" | "grid";

export interface WorklogNotesViewProps {
  /**
   * When set, the view renders the inline 3-pane layout (list → reader → rail)
   * per ADR-0024. When null/undefined, the view stays in list-only mode.
   *
   * Mounted by `/worklog/notes/[id]/page.tsx` (Unit 2).
   */
  selectedNoteId?: string | null;
}

export function WorklogNotesView({ selectedNoteId = null }: WorklogNotesViewProps = {}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  // Snapshot of the current `/worklog/notes` query string. Forwarded onto
  // `/worklog/notes/[id]` so the reader's back-button can rebuild the same
  // list URL (folder + view filters from ADR-0013) instead of dumping the
  // user back at a clean `/worklog/notes`. ADR-0015 Phase 5/6.
  const searchParams = useSearchParams();
  const listReturnQuery = searchParams.toString();

  // Data
  const { logs, loadingLogs, positions, equipment, assets, positionMap } =
    useWorklogData();
  const { folders, createFolder } = useWorklogFolders();

  // URL-driven folder selection (sidebar is the picker).
  const [activeFolder] = useFolderSelection({ enabled: true });

  // Filters (folder × position × notable × equipment × asset × search).
  // selectedDate / search are inert here — the doc-manager surface doesn't
  // expose calendar drill-down or text search yet (deferred).
  const {
    visibleLogs,
    filterPositionId,
    setFilterPositionId,
    filterNotable,
    setFilterNotable,
    filterEquipmentId,
    setFilterEquipmentId,
    filterAssetId,
    setFilterAssetId,
    clearAllFilters,
  } = useWorklogVisibleLogs(logs, activeFolder, null, "");

  // Selection (multi-select for bulk actions).
  const selection = useWorklogSelection();

  // Mutations
  const { saveLog, bulkAction, deleteLog } = useWorklogMutations();

  // Defaults (used to seed new-note creation).
  const { defaults } = useWorklogPreferences(positionMap);

  // Sort state (ADR-0015 default: Last edited DESC).
  const [sort, setSort] = useState<WorklogNotesTableSortState>(DEFAULT_SORT);

  // View mode (List/Grid). Default: list.
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Bulk select mode. When off, no row checkboxes are rendered.
  const [bulkMode, setBulkMode] = useState(false);

  // Tracks whether the current bulk session was entered via the toolbar
  // "Export" button. Drives the bar's `mode` prop so Move + Delete stay
  // hidden in the export flow — organize vs send are isolated intents
  // and accidental cross-pollination is the foot-gun this gates against.
  // Reset to false on every bulk-mode exit path (Esc, Clear, toggle-off,
  // successful send) so re-entering via Select doesn't inherit the
  // wrong intent.
  const [exportIntent, setExportIntent] = useState(false);

  // Import dialog (Sprint 4). Opened from the top-bar button or the global
  // command palette. Session-only history per ADR/Sprint plan (Q3=A).
  const [importOpen, setImportOpen] = useState(false);

  // Export-in-flight gate (Phase 5a, Grill Me sprint). Decoupled from
  // bulkAction.isPending so a pending export doesn't grey out Move/Delete.
  const [exportBusy, setExportBusy] = useState(false);

  // Form-factor-aware capability flag for the Web Share API. Drives the
  // Send menu shape — desktop (no coarse pointer) sees Download only;
  // touch devices see Download / Share to…. SSR-safe (false on first
  // paint, upgrades after mount).
  const canShare = useCanShare();

  // Server-side cap mirrored at the client so the toolbar Export affordance
  // can warn honestly *before* a network round-trip when the current view
  // has more notes than the bulk endpoint accepts. Keep in sync with
  // BULK_MAX in src/app/api/work-logs/export-bulk/route.ts.
  const EXPORT_MAX_VIEW = 100;

  // Shared Send/Export handlers — accept ids so both the bulk-bar (acts on
  // the current selection) and the top-level Export button (which preselects
  // the current view + opens the bulk bar) flow through the same
  // export-in-flight gate + toast pattern.
  //
  // Gmail-style auto-exit: on the SUCCESS path we drop bulk mode + clear
  // the selection so the user lands back on the clean toolbar. On failure
  // we keep both so the user can retry without re-picking.
  const runDownload = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setExportBusy(true);
    try {
      await exportBulkWorklogs(ids);
      setBulkMode(false);
      setExportIntent(false);
      selection.clear();
    } catch (err) {
      console.error("[grill-me] export failed", err);
      toast.error("Couldn’t download those notes. Try again?");
    } finally {
      setExportBusy(false);
    }
  }, [selection]);

  const runShare = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setExportBusy(true);
    try {
      const outcome = await shareWorklogs(ids);
      if (outcome === "downloaded") {
        // Web Share unsupported (or share threw a non-cancellation
        // error) — the file was downloaded as a fallback. Be honest
        // about what happened so the user isn't left wondering why
        // no share sheet appeared.
        toast.message("Sharing isn’t supported on this browser.", {
          description: "The file was downloaded instead.",
        });
      }
      // "shared" / "cancelled" — stay silent. Either the OS share
      // sheet handled the rest, or the user dismissed it. Either way
      // the user made an explicit decision — drop bulk mode so they
      // aren't stranded in select state.
      setBulkMode(false);
      setExportIntent(false);
      selection.clear();
    } catch (err) {
      console.error("[grill-me] share failed", err);
      toast.error("Couldn’t share those notes. Try again?");
    } finally {
      setExportBusy(false);
    }
  }, [selection]);
  const toggleBulkMode = useCallback(() => {
    setBulkMode((prev) => {
      if (prev) {
        selection.clear();
        setExportIntent(false);
      }
      return !prev;
    });
  }, [selection]);

  // Esc exits bulk mode (mirrors the legacy <WorklogPage> behavior).
  useEffect(() => {
    if (!bulkMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBulkMode(false);
        setExportIntent(false);
        selection.clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkMode, selection]);

  // Inline reader resolution (ADR-0024) — keyed off the path segment so the
  // dedicated reader route owns the read surface. `selectedLog` is null
  // while logs are still loading; the reader's loading state handles that.
  const selectedLog = useMemo(
    () => (selectedNoteId ? logs.find((l) => l.id === selectedNoteId) ?? null : null),
    [selectedNoteId, logs],
  );

  // Tag autocomplete corpus for the inline reader — same derivation as the
  // standalone /worklog/notes/[id] route (Unit 2 replaces that derivation
  // entirely by routing through this view).
  const tagSuggestions = useMemo(() => {
    if (!selectedNoteId) return [] as string[];
    const seen = new Set<string>();
    for (const l of logs) {
      if (!l.tags) continue;
      for (const t of l.tags.split(",")) {
        const trimmed = t.trim().toLowerCase();
        if (trimmed) seen.add(trimmed);
      }
    }
    return Array.from(seen).sort();
  }, [logs, selectedNoteId]);

  // Row click — always navigates to the dedicated reader route per ADR-0024.
  // Carries the current list query string so the reader's back nav can
  // rebuild the same filtered list view.
  const handleOpen = (id: string) => {
    const qs = searchParams.toString();
    router.push(`/worklog/notes/${id}${qs ? `?${qs}` : ""}`);
  };

  // Create a blank note and route directly to its full-screen reader.
  // New notes skip the preview drawer — there's nothing to preview yet.
  const handleNewNote = async () => {
    try {
      const saved: WorkLog = await saveLog.mutateAsync({
        date: new Date().toISOString(),
        title: "Untitled",
        category: defaults.defaultCategory ?? "task",
        positionId: defaults.defaultPositionId ?? null,
        shiftId: defaults.defaultShiftId ?? null,
        content: "",
        hours: defaults.defaultHours ?? null,
        tags: null,
        mood: defaults.defaultMood ?? null,
        equipmentIds: [],
        assetIds: [],
        templateId: null,
        isNotable: false,
      });
      const target = `/worklog/notes/${saved.id}${listReturnQuery ? `?${listReturnQuery}` : ""}`;
      router.push(target);
    } catch {
      // mutation surfaces errors via React Query toasts
    }
  };

  // Delete from the inline reader (ADR-0024). Auto-advances in the Unfiled
  // inbox (ADR-0026 Unit 5) to the next surviving note; falls back to the
  // bare list URL elsewhere. The forwarded filter querystring is preserved
  // either way so the back nav rebuilds the same scope.
  const handleDeleteFromInlineReader = (id: string) => {
    const qs = searchParams.toString();
    const next = computeNextAfterOrganize({
      currentId: id,
      removedIds: [id],
      visibleLogs,
      activeFolder,
    });
    const backHref = next
      ? `/worklog/notes/${next}${qs ? `?${qs}` : ""}`
      : qs
        ? `/worklog/notes?${qs}`
        : "/worklog/notes";
    deleteLog.mutate(id, {
      onSuccess: () => router.push(backHref),
    });
  };

  /**
   * Intercepts reader patches to add auto-advance for archive toggles
   * (ADR-0026 Unit 5). The reader's Archive button flips `archived` via the
   * same `onUpdate` channel as every other field edit, so we detect it by
   * the presence of the `archived` key.
   *
   * Toggle direction is bucket-aware (archive on non-archived view,
   * unarchive on archived view) which means an `archived` patch ALWAYS
   * removes the note from the current scope. We pre-compute the next id
   * BEFORE awaiting the save so visibleLogs is still the pre-mutation
   * snapshot, then router.push the auto-advance target. Regular field
   * edits pass straight through.
   */
  const handleReaderUpdate = useCallback(
    async (patch: Parameters<typeof saveLog.mutateAsync>[0]) => {
      const isArchiveToggle =
        patch.archived !== undefined && patch.id === selectedNoteId;
      const next = isArchiveToggle
        ? computeNextAfterOrganize({
            currentId: selectedNoteId,
            removedIds: [selectedNoteId as string],
            visibleLogs,
            activeFolder,
          })
        : null;
      const result = await saveLog.mutateAsync(patch);
      if (isArchiveToggle) {
        const qs = searchParams.toString();
        const target = next
          ? `/worklog/notes/${next}${qs ? `?${qs}` : ""}`
          : qs
            ? `/worklog/notes?${qs}`
            : "/worklog/notes";
        router.push(target);
      }
      return result;
    },
    [saveLog, selectedNoteId, visibleLogs, activeFolder, searchParams, router],
  );

  /**
   * Row organize handlers + Move-to-folder dialog (ADR-0026 carry-forward).
   *
   * The Drive-style surfaces (<WorklogNotesTable> / <WorklogNotesGrid>) emit
   * `onMoveRequest(ids)` and trigger this dialog rather than mounting their
   * own — keeps folder data + creation flow in one place. Archive/Delete
   * fire-and-forget through the handlers below, with URL-driven auto-advance
   * applied via `pushAutoAdvance` whenever the active reader note leaves the
   * current scope.
   */
  const [moveTargetIds, setMoveTargetIds] = useState<string[] | null>(null);
  const moveTargetLog = useMemo(
    () =>
      moveTargetIds && moveTargetIds.length === 1
        ? logs.find((l) => l.id === moveTargetIds[0]) ?? null
        : null,
    [moveTargetIds, logs],
  );
  const moveTargetCount = moveTargetIds?.length ?? 0;

  // Auto-advance the inline reader if the currently-open note is part of
  // the organize batch. Pre-computes the next id from PRE-mutation
  // visibleLogs so positional advance is deterministic, then router.push
  // to the auto-advance target (or the bare list URL when no survivor).
  const pushAutoAdvance = useCallback(
    (ids: string[]) => {
      if (!selectedNoteId || !ids.includes(selectedNoteId)) return;
      const next = computeNextAfterOrganize({
        currentId: selectedNoteId,
        removedIds: ids,
        visibleLogs,
        activeFolder,
      });
      const qs = searchParams.toString();
      const target = next
        ? `/worklog/notes/${next}${qs ? `?${qs}` : ""}`
        : qs
          ? `/worklog/notes?${qs}`
          : "/worklog/notes";
      router.push(target);
    },
    [selectedNoteId, visibleLogs, activeFolder, searchParams, router],
  );

  const handleMoveRow = useCallback(
    async (ids: string[], folderId: string | null) => {
      if (ids.length === 0) return;
      pushAutoAdvance(ids);
      if (ids.length === 1) {
        await saveLog.mutateAsync({ id: ids[0], folderId });
      } else {
        await bulkAction.mutateAsync({ action: "move", ids, payload: { folderId } });
      }
      if (selection.selectedCount > 0) selection.clear();
    },
    [pushAutoAdvance, saveLog, bulkAction, selection],
  );

  const handleArchiveRow = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      // Direction follows the active sidebar bucket (ADR-0026 Unit 5).
      const action = activeFolder.kind === "archived" ? "unarchive" : "archive";
      pushAutoAdvance(ids);
      if (ids.length === 1) {
        await saveLog.mutateAsync({ id: ids[0], archived: action === "archive" });
      } else {
        await bulkAction.mutateAsync({ action, ids });
      }
      if (selection.selectedCount > 0) selection.clear();
    },
    [pushAutoAdvance, activeFolder, saveLog, bulkAction, selection],
  );

  const handleDeleteRow = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      pushAutoAdvance(ids);
      if (ids.length === 1) {
        // deleteLog is fire-and-forget today; mirror that, but compute next first.
        deleteLog.mutate(ids[0]);
      } else {
        await bulkAction.mutateAsync({ action: "delete", ids });
      }
      if (selection.selectedCount > 0) selection.clear();
    },
    [pushAutoAdvance, deleteLog, bulkAction, selection],
  );

  const selectedCount = selection.selectedCount;
  const visibleCount = visibleLogs.length;

  // Selected-id list, memoized so bulk handlers see a stable snapshot.
  const selectedIdList = useMemo(
    () => Array.from(selection.selectedIds),
    [selection.selectedIds],
  );

  // Shared view controls (sort menu in grid mode + view switcher). Hoisted
  // so they can ride alongside the bulk bar OR sit in the regular toolbar —
  // see ADR-0015 + improvement #4. Keeping these visible during bulk-mode
  // means the user can still flip list↔grid or change sort while a
  // selection is active.
  // TODO(design-review): on small viewports the bulk row gets dense.
  // Revisit during the next design audit (mirrors the same TODO in
  // <WorklogNotesBulkBar>'s `trailing` prop).
  //
  // Keyboard model on the View-mode radiogroup (improvement #3): roving
  // tabindex — only the checked radio is in the tab order; ←/↑ move to
  // previous, →/↓ to next, Home/End jump to ends, all with wrap. Selection
  // follows focus (auto-select pattern, mirrors native <input type=radio>).
  const handleViewModeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const order: ViewMode[] = ["list", "grid"];
    const idx = order.indexOf(viewMode);
    let next: ViewMode | null = null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        next = order[(idx - 1 + order.length) % order.length];
        break;
      case "ArrowRight":
      case "ArrowDown":
        next = order[(idx + 1) % order.length];
        break;
      case "Home":
        next = order[0];
        break;
      case "End":
        next = order[order.length - 1];
        break;
      default:
        return;
    }
    if (next == null || next === viewMode) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setViewMode(next);
    // Move DOM focus to the newly checked radio so the roving tabindex
    // model stays consistent with what the user sees.
    const root = e.currentTarget;
    const target = root.querySelector<HTMLButtonElement>(
      `[data-view-mode="${next}"]`,
    );
    target?.focus();
  };

  // When a note is open the list collapses to w-72 (per the 3-pane
  // layout). 6 labelled buttons (List · Grid · Select · Import · Export ·
  // + New note) plus the "N notes" count don't fit — they overflow into
  // the reader column. Drop inline button labels in compact mode so the
  // toolbar stays inside its column (icons + tooltips remain).
  const compactToolbar = selectedNoteId !== null;
  const toolbarLabelCls = compactToolbar ? "hidden" : "hidden sm:inline";

  const viewControls = (
    <>
      {viewMode === "grid" && (
        <WorklogNotesSortMenu sort={sort} onSortChange={setSort} />
      )}
      <div
        role="radiogroup"
        aria-label="View mode"
        onKeyDown={handleViewModeKeyDown}
        className="flex items-center rounded-md border bg-muted/40"
      >
        <button
          type="button"
          role="radio"
          aria-checked={viewMode === "list"}
          tabIndex={viewMode === "list" ? 0 : -1}
          data-view-mode="list"
          onClick={() => setViewMode("list")}
          title="List view"
          className={cn(
            "h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            viewMode === "list"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <List className="h-3.5 w-3.5" />
          <span className={toolbarLabelCls}>List</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={viewMode === "grid"}
          tabIndex={viewMode === "grid" ? 0 : -1}
          data-view-mode="grid"
          onClick={() => setViewMode("grid")}
          title="Grid view"
          className={cn(
            "h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            viewMode === "grid"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className={toolbarLabelCls}>Grid</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      {/* Body: list (column-scoped toolbar inside) + reader + rail
          (ADR-0024 / mockup parity 2026-06-10).
          - selectedNoteId == null  → list claims full width (mockup Frame 2)
          - selectedNoteId != null  → list shrinks to w-72, reader middle, rail right
          Mobile (< md) with selection: list hides, reader fills viewport —
          the toolbar disappears with the column it now lives in. */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        <div
          className={cn(
            "min-h-0 flex flex-col",
            selectedNoteId
              ? "hidden md:flex w-72 shrink-0 border-r"
              : "flex-1",
          )}
        >
          {/* Column-scoped toolbar (mockup parity): bulk-action bar when a
              selection is active, otherwise the regular count · view switcher ·
              Select · Import · Export · "+ New note" row. Lives INSIDE the
              list column so its right edge aligns with the column border,
              matching the Tolaria right-rail mockup. */}
          {selectedCount > 0 ? (
            <WorklogNotesBulkBar
              count={selectedCount}
              busy={bulkAction.isPending}
              exporting={exportBusy}
              showShare={canShare}
              mode={exportIntent ? "send" : "organize"}
              archivedView={activeFolder.kind === "archived"}
              onClear={() => {
                selection.clear();
                setBulkMode(false);
                setExportIntent(false);
              }}
              trailing={viewControls}
              onMove={async (folderId) => {
                if (selectedIdList.length === 0) return;
                await bulkAction.mutateAsync({
                  action: "move",
                  ids: selectedIdList,
                  payload: { folderId },
                });
                // Gmail-style auto-exit on success — bulk action finished,
                // drop the user back on the clean toolbar.
                selection.clear();
                setBulkMode(false);
                setExportIntent(false);
              }}
              onDelete={async () => {
                if (selectedIdList.length === 0) return;
                // Pre-compute auto-advance target for the inline reader
                // BEFORE the mutation lands (ADR-0026 Unit 5).
                const next =
                  selectedNoteId && selectedIdList.includes(selectedNoteId)
                    ? computeNextAfterOrganize({
                        currentId: selectedNoteId,
                        removedIds: selectedIdList,
                        visibleLogs,
                        activeFolder,
                      })
                    : null;
                await bulkAction.mutateAsync({
                  action: "delete",
                  ids: selectedIdList,
                });
                // If the open note was in the batch, advance OR drop the
                // reader by navigating the URL.
                if (selectedNoteId && selectedIdList.includes(selectedNoteId)) {
                  const qs = searchParams.toString();
                  const target = next
                    ? `/worklog/notes/${next}${qs ? `?${qs}` : ""}`
                    : qs
                      ? `/worklog/notes?${qs}`
                      : "/worklog/notes";
                  router.push(target);
                }
                // Gmail-style auto-exit on success.
                selection.clear();
                setBulkMode(false);
                setExportIntent(false);
              }}
              onArchive={async () => {
                if (selectedIdList.length === 0) return;
                // ADR-0026 — direction depends on the sidebar bucket the
                // user is in: Archived view unarchives, everywhere else
                // archives.
                const action = activeFolder.kind === "archived" ? "unarchive" : "archive";
                // The note leaves the current scope either direction (the
                // button label is bucket-aware), so auto-advance the inline
                // reader if it was part of the batch.
                const next =
                  selectedNoteId && selectedIdList.includes(selectedNoteId)
                    ? computeNextAfterOrganize({
                        currentId: selectedNoteId,
                        removedIds: selectedIdList,
                        visibleLogs,
                        activeFolder,
                      })
                    : null;
                await bulkAction.mutateAsync({ action, ids: selectedIdList });
                if (selectedNoteId && selectedIdList.includes(selectedNoteId)) {
                  const qs = searchParams.toString();
                  const target = next
                    ? `/worklog/notes/${next}${qs ? `?${qs}` : ""}`
                    : qs
                      ? `/worklog/notes?${qs}`
                      : "/worklog/notes";
                  router.push(target);
                }
                selection.clear();
                setBulkMode(false);
                setExportIntent(false);
              }}
              onExport={() => runDownload(selectedIdList)}
              onShare={() => runShare(selectedIdList)}
            />
          ) : (
            // Compact mode (a note is open, column is w-72): drop the count
            // text, drop the view switcher (a 288px column is list-only by
            // definition — Grid in 288px is pointless), and collapse Import
            // + Export into a single ⋯ kebab. Final compact toolbar:
            //   [☑ Select] [⋯] [+]
            // Full mode (no note open, column is flex-1): all controls
            // remain inline with labels, matching the existing wide UX.
            <div
              className={cn(
                "h-12 px-4 flex items-center border-b",
                compactToolbar ? "justify-end" : "justify-between",
              )}
            >
              {!compactToolbar && (
                <div className="text-sm text-muted-foreground tabular-nums">
                  {loadingLogs
                    ? "Loading…"
                    : `${visibleCount} ${visibleCount === 1 ? "note" : "notes"}`}
                </div>
              )}
              <div className="flex items-center gap-1">
                {!compactToolbar && viewControls}

                {/* Select-mode toggle: gates row checkboxes */}
                <Button
                  size="sm"
                  variant={bulkMode ? "secondary" : "ghost"}
                  onClick={toggleBulkMode}
                  aria-label={bulkMode ? "Exit select mode" : "Select multiple notes"}
                  aria-pressed={bulkMode}
                  title={bulkMode ? "Exit select mode (Esc)" : "Select multiple notes"}
                  className="h-7 gap-1.5 text-xs"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span className={toolbarLabelCls}>{bulkMode ? "Done" : "Select"}</span>
                </Button>

                {/* Compact-only: replace the below-toolbar filter row with a
                    Filter icon + count-badge popover that shows the chips on
                    demand. The popover hosts the same <WorklogNotesFilterChips>
                    used in full mode, so behavior + active-value pills are
                    identical — only the surface changes. */}
                {compactToolbar && (
                  <WorklogNotesFilterButton
                    positions={positions}
                    equipment={equipment}
                    assets={assets}
                    filterPositionId={filterPositionId}
                    setFilterPositionId={setFilterPositionId}
                    filterNotable={filterNotable}
                    setFilterNotable={setFilterNotable}
                    filterEquipmentId={filterEquipmentId}
                    setFilterEquipmentId={setFilterEquipmentId}
                    filterAssetId={filterAssetId}
                    setFilterAssetId={setFilterAssetId}
                    onClearAll={clearAllFilters}
                  />
                )}

                {compactToolbar ? (
                  // Compact: Import + Export live behind a single ⋯ kebab so
                  // the toolbar fits the w-72 column. Both actions remain
                  // toolbar-resident (one click deeper), honoring ADR-0022's
                  // "Export reachable from the toolbar" intent.
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground",
                        "hover:bg-accent hover:text-foreground transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      aria-label="More actions"
                      title="More actions"
                      // base-ui Trigger owns its own onClick — never add one.
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setImportOpen(true)}>
                        <Upload className="mr-2 h-3.5 w-3.5" />
                        Import notes…
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={visibleCount === 0 || loadingLogs}
                        onClick={() => {
                          if (visibleCount === 0) return;
                          if (visibleCount > EXPORT_MAX_VIEW) {
                            toast.error(
                              `Too many notes in this view (${visibleCount}).`,
                              {
                                description: `Narrow your filter or use Select mode to pick up to ${EXPORT_MAX_VIEW}.`,
                              },
                            );
                            return;
                          }
                          setBulkMode(true);
                          setExportIntent(true);
                        }}
                      >
                        <Send className="mr-2 h-3.5 w-3.5" />
                        Export notes…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setImportOpen(true)}
                      aria-label="Import notes from files"
                      title="Import notes from Markdown or HTML files"
                      className="h-7 gap-1.5 text-xs"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span className={toolbarLabelCls}>Import</span>
                    </Button>

                    {/* Top-level Export button (ADR-0022 addendum 3 — 2026-06-10,
                        revised same-day after smoke test).
                        Click → enters bulk mode in "send" intent with ZERO
                        preselection. The bar that appears renders Send only — no
                        Move, no Delete — so the export flow can't accidentally
                        file or destroy notes. User checks the rows they want
                        (Shift / Ctrl supported via row checkboxes), then commits
                        via the bulk-bar Send menu (Download, plus Share to… on
                        touch devices). Auto-exit on send success returns them
                        here on the clean toolbar. Server-side BULK_MAX is
                        mirrored client-side via EXPORT_MAX_VIEW so we toast
                        before any state change when the view is too large. */}
                    <Button
                      size="sm"
                      variant={exportIntent ? "secondary" : "ghost"}
                      aria-pressed={exportIntent}
                      onClick={() => {
                        if (visibleCount === 0) return;
                        if (visibleCount > EXPORT_MAX_VIEW) {
                          toast.error(
                            `Too many notes in this view (${visibleCount}).`,
                            {
                              description: `Narrow your filter or use Select mode to pick up to ${EXPORT_MAX_VIEW}.`,
                            },
                          );
                          return;
                        }
                        setBulkMode(true);
                        setExportIntent(true);
                      }}
                      disabled={visibleCount === 0 || loadingLogs}
                      aria-label={
                        visibleCount === 0
                          ? "No notes in this view"
                          : `Export — pick from ${visibleCount} ${visibleCount === 1 ? "note" : "notes"}, then send`
                      }
                      title={
                        visibleCount === 0
                          ? "No notes in this view"
                          : `Export — pick from ${visibleCount} ${visibleCount === 1 ? "note" : "notes"}, then send`
                      }
                      className="h-7 gap-1.5 text-xs"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span className={toolbarLabelCls}>Export</span>
                    </Button>
                  </>
                )}

                <Button
                  size="sm"
                  onClick={handleNewNote}
                  disabled={saveLog.isPending}
                  aria-label="New note"
                  title="New note"
                >
                  <Plus className="h-4 w-4" />
                  <span className={toolbarLabelCls}>New note</span>
                </Button>
              </div>
            </div>
          )}

          {/* Filter chips row — inline only in full mode. In compact mode the
              chips move into the toolbar's <WorklogNotesFilterButton> popover
              so the 288px column doesn't lose two vertical rows to filters
              that may not even be active. */}
          {!compactToolbar && (
            <WorklogNotesFilterChips
              positions={positions}
              equipment={equipment}
              assets={assets}
              filterPositionId={filterPositionId}
              setFilterPositionId={setFilterPositionId}
              filterNotable={filterNotable}
              setFilterNotable={setFilterNotable}
              filterEquipmentId={filterEquipmentId}
              setFilterEquipmentId={setFilterEquipmentId}
              filterAssetId={filterAssetId}
              setFilterAssetId={setFilterAssetId}
              onClearAll={clearAllFilters}
            />
          )}

          {/* Inner scroller — toolbar + chips pin to the top of the column
              while the table/grid scrolls beneath them. */}
          <div className="flex-1 min-h-0 overflow-auto">
            {viewMode === "list" ? (
              <WorklogNotesTable
                logs={visibleLogs}
                positionMap={positionMap}
                folders={folders}
                loading={loadingLogs}
                sort={sort}
                onSortChange={setSort}
                selection={selection}
                bulkMode={bulkMode}
                selectedFocusId={selectedNoteId}
                onOpen={handleOpen}
                onNew={handleNewNote}
                compact={selectedNoteId !== null || isMobile}
                archivedView={activeFolder.kind === "archived"}
                onMoveRequest={setMoveTargetIds}
                onArchiveRow={handleArchiveRow}
                onDeleteRow={handleDeleteRow}
              />
            ) : (
              <WorklogNotesGrid
                logs={visibleLogs}
                positionMap={positionMap}
                folders={folders}
                loading={loadingLogs}
                sort={sort}
                selection={selection}
                bulkMode={bulkMode}
                selectedFocusId={selectedNoteId}
                onOpen={handleOpen}
                onNew={handleNewNote}
                archivedView={activeFolder.kind === "archived"}
                onMoveRequest={setMoveTargetIds}
                onArchiveRow={handleArchiveRow}
                onDeleteRow={handleDeleteRow}
              />
            )}
          </div>
        </div>

        {selectedNoteId !== null && (
          <>
            <div className="flex-1 min-w-0 overflow-auto flex flex-col">
              {/* Mobile back-to-list header (Apple Notes pattern).
                  Hidden on md+ because the list is already visible to the left. */}
              <Link
                href={listReturnQuery ? `/worklog/notes?${listReturnQuery}` : "/worklog/notes"}
                className="md:hidden flex items-center gap-1.5 h-10 px-3 border-b text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to notes</span>
              </Link>
              {!loadingLogs && !selectedLog ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-sm font-medium mb-1">Note not found</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    The note may have been deleted.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto">
                  <WorklogNoteReader
                    log={selectedLog}
                    positions={positions}
                    equipment={equipment}
                    assets={assets}
                    positionMap={positionMap}
                    tagSuggestions={tagSuggestions}
                    onUpdate={handleReaderUpdate}
                    onDelete={handleDeleteFromInlineReader}
                    hasLogs={logs.length > 0}
                  />
                </div>
              )}
            </div>
            {/* ADR-0023 — worklog reader right-rail (desktop-only). */}
            <WorklogReaderRightRail
              activeNoteId={selectedLog?.id ?? null}
              currentPlainText={selectedLog?.content ?? ""}
              activeLog={selectedLog ?? null}
              onUpdateActiveLog={(patch) => saveLog.mutateAsync(patch)}
              tagSuggestions={tagSuggestions}
              assets={assets}
              positions={positions}
              equipment={equipment}
            />
          </>
        )}
      </div>

      {/* Sprint 4: file-drop import wizard. Mounted here (not at layout)
          so it shares the same React Query cache used by the notes view —
          successful imports invalidate `["worklogs"]` and `["worklog-folders"]`
          and the list re-renders without a manual refresh. */}
      <WorklogImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Move-to-folder dialog — driven by the right-click context menu on
          rows (ADR-0026 carry-forward). Owns folder creation + auto-advance
          via handleMoveRow. */}
      <WorklogMoveToFolderDialog
        open={!!moveTargetIds}
        onOpenChange={(o) => !o && setMoveTargetIds(null)}
        folders={folders}
        currentFolderId={moveTargetLog?.folderId ?? null}
        onChoose={async (folderId) => {
          if (!moveTargetIds || moveTargetIds.length === 0) return;
          await handleMoveRow(moveTargetIds, folderId);
          setMoveTargetIds(null);
        }}
        onCreateFolder={async (name) => {
          const created = await createFolder.mutateAsync({ name, parentId: null });
          return { id: created.id };
        }}
        title={
          moveTargetCount > 1
            ? `Move ${moveTargetCount} notes to…`
            : moveTargetLog?.title
              ? `Move “${moveTargetLog.title}” to…`
              : "Move note to folder"
        }
      />
    </div>
  );
}
