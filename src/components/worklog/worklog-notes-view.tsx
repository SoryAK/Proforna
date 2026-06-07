/**
 * WorklogNotesView — Drive-style document-manager surface for `/worklog/notes`
 * (per ADR-0015).
 *
 * Composition:
 *   ┌── Top bar (count · view switcher · Select · "+ New note") OR <BulkBar> ┐
 *   ├── <WorklogNotesFilterChips> (Position · Notable · Equip · Asset)        ┤
 *   └── <WorklogNotesTable>  (list view) OR <WorklogNotesGrid> (card view)  ┘
 *
 * The folder picker lives in the global sidebar (ADR-0013); this view reads
 * the URL-driven `activeFolder` via {@link useFolderSelection} so the table
 * automatically scopes to whatever the sidebar has selected.
 *
 * Row click → push to `/worklog/notes/[id]` (full-screen reader). The
 * half-page reader drawer (Phase 5 of ADR-0015) is deferred — for now we
 * route to the dedicated single-note route so the new chrome is shippable
 * end-to-end.
 *
 * Bulk-mode discipline: row checkboxes only render when the user explicitly
 * activates Select mode in the toolbar. Drive-style — keeps the default view
 * uncluttered. The actual <WorklogNotesBulkBar> still slides in when one or
 * more rows are checked (so the bulk toolbar can stay clear when the user
 * has only toggled Select mode but checked nothing yet).
 *
 * `<WorklogPage compact />` continues to serve the dashboard embed
 * unchanged; this view is only mounted at `/worklog/notes`.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, LayoutGrid, List, Plus } from "lucide-react";
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

const DEFAULT_SORT: WorklogNotesTableSortState = {
  column: "lastEdited",
  dir: "desc",
};

type ViewMode = "list" | "grid";

export function WorklogNotesView() {
  const router = useRouter();

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
  const { saveLog, bulkAction } = useWorklogMutations();

  // Defaults (used to seed new-note creation).
  const { defaults } = useWorklogPreferences(positionMap);

  // Sort state (ADR-0015 default: Last edited DESC).
  const [sort, setSort] = useState<WorklogNotesTableSortState>(DEFAULT_SORT);

  // View mode (List/Grid). Default: list.
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Bulk select mode. When off, no row checkboxes are rendered.
  const [bulkMode, setBulkMode] = useState(false);
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

  // Open a note in the dedicated full-screen route.
  const handleOpen = (id: string) => {
    router.push(`/worklog/notes/${id}`);
  };

  // Create a blank note and route to its full-screen reader.
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
      router.push(`/worklog/notes/${saved.id}`);
    } catch {
      // mutation surfaces errors via React Query toasts
    }
  };

  const selectedCount = selection.selectedCount;
  const visibleCount = visibleLogs.length;

  // Selected-id list, memoized so bulk handlers see a stable snapshot.
  const selectedIdList = useMemo(
    () => Array.from(selection.selectedIds),
    [selection.selectedIds],
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      {/* Top bar: bulk-action bar when selection is active, otherwise the
          regular toolbar (count · view switcher · Select toggle · "+ New note"). */}
      {selectedCount > 0 ? (
        <WorklogNotesBulkBar
          count={selectedCount}
          busy={bulkAction.isPending}
          onClear={selection.clear}
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
        />
      ) : (
        <div className="h-12 px-4 flex items-center justify-between border-b">
          <div className="text-sm text-muted-foreground tabular-nums">
            {loadingLogs
              ? "Loading…"
              : `${visibleCount} ${visibleCount === 1 ? "note" : "notes"}`}
          </div>
          <div className="flex items-center gap-1">
            {/* Sort menu — only mounted in grid mode (list view gets sort
                via column headers). */}
            {viewMode === "grid" && (
              <WorklogNotesSortMenu sort={sort} onSortChange={setSort} />
            )}

            {/* View switcher: List | Grid */}
            <div
              role="radiogroup"
              aria-label="View mode"
              className="flex items-center rounded-md border bg-muted/40"
            >
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "list"}
                onClick={() => setViewMode("list")}
                title="List view"
                className={cn(
                  "h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors",
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
                onClick={() => setViewMode("grid")}
                title="Grid view"
                className={cn(
                  "h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors",
                  viewMode === "grid"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
            </div>

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
            selectedFocusId={null}
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
            selectedFocusId={null}
            onOpen={handleOpen}
            onNew={handleNewNote}
          />
        )}
      </div>
    </div>
  );
}
