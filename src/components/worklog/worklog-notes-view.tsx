/**
 * WorklogNotesView — Drive-style document-manager surface for `/worklog/notes`
 * (per ADR-0015).
 *
 * Composition:
 *   ┌── Top bar (count · view switcher · Select · "+ New note") OR <BulkBar> ┐
 *   ├── <WorklogNotesFilterChips> (Position · Notable · Equip · Asset)        ┤
 *   ├── <WorklogNotesTable>  (list view) OR <WorklogNotesGrid> (card view)  ┤
 *   └── <WorklogReaderDrawer> (right rail / mobile sheet) ──────────────────┘
 *
 * The folder picker lives in the global sidebar (ADR-0013); this view reads
 * the URL-driven `activeFolder` via {@link useFolderSelection} so the table
 * automatically scopes to whatever the sidebar has selected.
 *
 * Two-speed open flow (ADR-0015 Phase 5):
 *   • Row click → sets `?focus=<id>` on the URL → opens the preview drawer.
 *     The list stays interactive behind it (md+) so the user can skim
 *     several notes in a row without losing their place.
 *   • Drawer's "Open" button → escalates to `/worklog/notes/[id]`
 *     (full-screen, editable). The current list query string (folder, view)
 *     is forwarded for the reader's back-button.
 *   • New notes skip the drawer and route straight to the full-screen
 *     editor — there's nothing to preview yet.
 *
 * Bulk-mode discipline: row checkboxes only render when the user explicitly
 * activates Select mode in the toolbar. Drive-style — keeps the default view
 * uncluttered. The actual <WorklogNotesBulkBar> still slides in when one or
 * more rows are checked (so the bulk toolbar can stay clear when the user
 * has only toggled Select mode but checked nothing yet). Selecting rows and
 * previewing a note are compatible — both live alongside each other.
 *
 * `<WorklogPage compact />` continues to serve the dashboard embed
 * unchanged; this view is only mounted at `/worklog/notes`.
 */

"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckSquare, LayoutGrid, List, Plus, Upload } from "lucide-react";
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
import {
  WorklogNotesTable,
} from "@/components/worklog/worklog-notes-table";
import type { WorklogNotesTableSortState } from "@/components/worklog/worklog-notes-shared";
import { WorklogNotesGrid } from "@/components/worklog/worklog-notes-grid";
import { WorklogNotesFilterChips } from "@/components/worklog/worklog-notes-filter-chips";
import { WorklogNotesBulkBar } from "@/components/worklog/worklog-notes-bulk-bar";
import { WorklogNotesSortMenu } from "@/components/worklog/worklog-notes-sort-menu";
import { WorklogReaderDrawer } from "@/components/worklog/worklog-reader-drawer";
import { WorklogImportDialog } from "@/components/worklog/worklog-import-dialog";
import { exportBulkWorklogs } from "@/lib/worklog/export/client";

const DEFAULT_SORT: WorklogNotesTableSortState = {
  column: "lastEdited",
  dir: "desc",
};

type ViewMode = "list" | "grid";

export function WorklogNotesView() {
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

  // Import dialog (Sprint 4). Opened from the top-bar button or the global
  // command palette. Session-only history per ADR/Sprint plan (Q3=A).
  const [importOpen, setImportOpen] = useState(false);

  // Export-in-flight gate (Phase 5a, Grill Me sprint). Decoupled from
  // bulkAction.isPending so a pending export doesn't grey out Move/Delete.
  const [exportBusy, setExportBusy] = useState(false);
  const toggleBulkMode = useCallback(() => {
    setBulkMode((prev) => {
      if (prev) selection.clear();
      return !prev;
    });
  }, [selection]);

  // Esc exits bulk mode (mirrors the legacy <WorklogPage> behavior).
  useEffect(() => {
    if (!bulkMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBulkMode(false);
        selection.clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkMode, selection]);

  // Drawer-preview state — driven by the `?focus=<id>` URL param so the
  // drawer survives refresh + back/forward (ADR-0015 Phase 5).
  const focusId = searchParams.get("focus");
  const focusedLog = useMemo(
    () => (focusId ? logs.find((l) => l.id === focusId) ?? null : null),
    [focusId, logs],
  );
  const drawerOpen = focusId !== null;

  // Build a URL preserving every existing query param plus an override.
  // Used by both row-open (set `focus`) and drawer-close (drop `focus`).
  const buildNotesUrl = useCallback(
    (overrides: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(overrides)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      return qs ? `/worklog/notes?${qs}` : "/worklog/notes";
    },
    [searchParams],
  );

  // Row click → open preview drawer via `?focus=<id>`. `scroll: false`
  // prevents the list from jumping to the top when the URL updates.
  const handleOpen = (id: string) => {
    router.replace(buildNotesUrl({ focus: id }), { scroll: false });
  };

  const handleCloseDrawer = useCallback(() => {
    router.replace(buildNotesUrl({ focus: null }), { scroll: false });
  }, [router, buildNotesUrl]);

  // Escalation target for the drawer's "Open" button — full-screen reader
  // route with the current list query string forwarded for back-nav. Drop
  // `focus` from the forwarded params so returning doesn't reopen the
  // drawer over the list.
  const drawerOpenHref = useMemo(() => {
    if (!focusId) return null;
    const forward = new URLSearchParams(searchParams.toString());
    forward.delete("focus");
    const qs = forward.toString();
    return `/worklog/notes/${focusId}${qs ? `?${qs}` : ""}`;
  }, [focusId, searchParams]);

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

  // Delete from the drawer — closes the drawer optimistically and lets
  // the mutation propagate (it'll invalidate `worklogs` and the row will
  // vanish from the list).
  const handleDeleteFromDrawer = (id: string) => {
    handleCloseDrawer();
    deleteLog.mutate(id);
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
          onClear={selection.clear}
          trailing={viewControls}
          onMove={async (folderId) => {
            if (selectedIdList.length === 0) return;
            await bulkAction.mutateAsync({
              action: "move",
              ids: selectedIdList,
              payload: { folderId },
            });
            selection.clear();
          }}
          onDelete={async () => {
            if (selectedIdList.length === 0) return;
            await bulkAction.mutateAsync({
              action: "delete",
              ids: selectedIdList,
            });
            selection.clear();
          }}
          onExport={async () => {
            if (selectedIdList.length === 0) return;
            setExportBusy(true);
            try {
              await exportBulkWorklogs(selectedIdList);
            } catch (err) {
              console.error("[grill-me] export failed", err);
            } finally {
              setExportBusy(false);
            }
          }}
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

      {/* List or Grid */}
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
            selectedFocusId={focusId}
            onOpen={handleOpen}
            onNew={handleNewNote}
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
            selectedFocusId={focusId}
            onOpen={handleOpen}
            onNew={handleNewNote}
          />
        )}
      </div>

      {/* Preview drawer (ADR-0015 Phase 5). Renders as a right-anchored
          panel on md+ and a full-screen sheet on mobile. URL-driven via
          `?focus=<id>` so the preview survives refresh + back/forward. */}
      <WorklogReaderDrawer
        open={drawerOpen}
        log={focusedLog}
        loading={loadingLogs}
        positions={positions}
        positionMap={positionMap}
        openHref={drawerOpenHref}
        onClose={handleCloseDrawer}
        onDelete={handleDeleteFromDrawer}
      />

      {/* Sprint 4: file-drop import wizard. Mounted here (not at layout)
          so it shares the same React Query cache used by the notes view —
          successful imports invalidate `["worklogs"]` and `["worklog-folders"]`
          and the list re-renders without a manual refresh. */}
      <WorklogImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
