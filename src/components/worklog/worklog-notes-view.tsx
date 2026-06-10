/**
 * WorklogNotesView — Drive-style document-manager surface for `/worklog/notes`
 * (per ADR-0015) + inline 3-pane reader on `/worklog/notes/[id]` (per ADR-0024).
 *
 * Composition:
 *   ┌── Top bar (count · view switcher · Select · "+ New note") OR <BulkBar> ┐
 *   ├── <WorklogNotesFilterChips> (Position · Notable · Equip · Asset)        ┤
 *   └── List pane (full-width) OR list + reader + rail (3-pane) ─────────────┘
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

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckSquare, LayoutGrid, List, Plus, Send, Upload } from "lucide-react";
import type { WorkLog } from "@/types/worklog";
import { Button } from "@/components/ui/button";
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
import { WorklogNotesBulkBar } from "@/components/worklog/worklog-notes-bulk-bar";
import { WorklogNotesSortMenu } from "@/components/worklog/worklog-notes-sort-menu";
import { WorklogNoteReader } from "@/components/worklog/worklog-note-reader";
import { WorklogReaderRightRail } from "@/components/worklog/right-rail/worklog-reader-right-rail";
import { WorklogImportDialog } from "@/components/worklog/worklog-import-dialog";
import { exportBulkWorklogs } from "@/lib/worklog/export/client";
import { shareWorklogs } from "@/lib/worklog/share/share-client";
import { toast } from "sonner";

const DEFAULT_SORT: WorklogNotesTableSortState = {
  column: "lastEdited",
  dir: "desc",
};

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
  // Snapshot of the current `/worklog/notes` query string. Forwarded onto
  // `/worklog/notes/[id]` so the reader's back-button can rebuild the same
  // list URL (folder + view filters from ADR-0013) instead of dumping the
  // user back at a clean `/worklog/notes`. ADR-0015 Phase 5/6.
  const searchParams = useSearchParams();
  const listReturnQuery = searchParams.toString();

  // Data
  const { logs, loadingLogs, positions, equipment, assets, positionMap } =
    useWorklogData();
  const { folders } = useWorklogFolders();

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

  // Delete from the inline reader (ADR-0024). Navigates back to the bare
  // list URL (preserving any forwarded filter qs) so the now-deleted id
  // disappears from the path segment.
  const handleDeleteFromInlineReader = (id: string) => {
    const qs = searchParams.toString();
    const backHref = qs ? `/worklog/notes?${qs}` : "/worklog/notes";
    deleteLog.mutate(id, {
      onSuccess: () => router.push(backHref),
    });
  };

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
          <span className="hidden sm:inline">List</span>
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
          <span className="hidden sm:inline">Grid</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      {/* Top bar: bulk-action bar when selection is active, otherwise the
          regular toolbar (count · view switcher · Select toggle · "+ New note"). */}
      {selectedCount > 0 ? (
        <WorklogNotesBulkBar
          count={selectedCount}
          busy={bulkAction.isPending}
          exporting={exportBusy}
          showShare={canShare}
          mode={exportIntent ? "send" : "organize"}
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
            await bulkAction.mutateAsync({
              action: "delete",
              ids: selectedIdList,
            });
            // Gmail-style auto-exit on success.
            selection.clear();
            setBulkMode(false);
            setExportIntent(false);
          }}
          onExport={() => runDownload(selectedIdList)}
          onShare={() => runShare(selectedIdList)}
        />
      ) : (
        <div className="h-12 px-4 flex items-center justify-between border-b">
          <div className="text-sm text-muted-foreground tabular-nums">
            {loadingLogs
              ? "Loading…"
              : `${visibleCount} ${visibleCount === 1 ? "note" : "notes"}`}
          </div>
          <div className="flex items-center gap-1">
            {viewControls}

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
              <span className="hidden sm:inline">{bulkMode ? "Done" : "Select"}</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setImportOpen(true)}
              aria-label="Import notes from files"
              title="Import notes from Markdown or HTML files"
              className="h-7 gap-1.5 text-xs"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Import</span>
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
              <span className="hidden sm:inline">Export</span>
            </Button>

            <Button
              size="sm"
              onClick={handleNewNote}
              disabled={saveLog.isPending}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New note</span>
            </Button>
          </div>
        </div>
      )}

      {/* Filter chips row */}
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

      {/* Body: list-only OR list + reader + rail (ADR-0024).
          - selectedNoteId == null  → list claims full width (mockup Frame 2)
          - selectedNoteId != null  → list shrinks to w-72, reader middle, rail right */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        <div
          className={cn(
            "min-h-0 overflow-auto",
            selectedNoteId
              ? "w-72 shrink-0 border-r"
              : "flex-1",
          )}
        >
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
              compact={selectedNoteId !== null}
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
            />
          )}
        </div>

        {selectedNoteId !== null && (
          <>
            <div className="flex-1 min-w-0 overflow-auto">
              {!loadingLogs && !selectedLog ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-sm font-medium mb-1">Note not found</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    The note may have been deleted.
                  </p>
                </div>
              ) : (
                <WorklogNoteReader
                  log={selectedLog}
                  positions={positions}
                  equipment={equipment}
                  assets={assets}
                  positionMap={positionMap}
                  tagSuggestions={tagSuggestions}
                  onUpdate={(patch) => saveLog.mutateAsync(patch)}
                  onDelete={handleDeleteFromInlineReader}
                  hasLogs={logs.length > 0}
                />
              )}
            </div>
            {/* ADR-0023 — worklog reader right-rail (desktop-only). */}
            <WorklogReaderRightRail
              activeNoteId={selectedLog?.id ?? null}
              currentPlainText={selectedLog?.content ?? ""}
            />
          </>
        )}
      </div>

      {/* Sprint 4: file-drop import wizard. Mounted here (not at layout)
          so it shares the same React Query cache used by the notes view —
          successful imports invalidate `["worklogs"]` and `["worklog-folders"]`
          and the list re-renders without a manual refresh. */}
      <WorklogImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
