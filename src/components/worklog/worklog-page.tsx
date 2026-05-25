/**
 * WorklogPage — orchestrator for the notes-app worklog redesign.
 *
 * Composition:
 *   ┌── Toolbar (search · filters · + New) ──────────────────────────┐
 *   │ Folders rail │  Notes list  │  Inline Note Reader              │
 *   │ (categories) │  (recency)   │  (save-on-blur)                  │
 *   └──────────────────────────────────────────────────────────────── ┘
 *
 * No dialogs for log read/edit — everything is inline, saved on blur via
 * `useAutosaveField` inside the reader. Templates retain their own modal
 * editor because they are configuration, not notes.
 *
 * Selection model:
 *   • `activeFolder` (left rail): drives the category / notable / templates view
 *   • `selectedNoteId` (middle list): drives which note the reader shows
 *
 * Deep links: see use-worklog-deep-links.ts for the ?focus / ?new wiring.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Template, WorkLog } from "@/types/worklog";
import { CATEGORIES } from "@/components/worklog/constants";
import { useWorklogData } from "@/components/worklog/hooks/use-worklog-data";
import { useWorklogMutations } from "@/components/worklog/hooks/use-worklog-mutations";
import { useWorklogDeepLinks } from "@/components/worklog/hooks/use-worklog-deep-links";
import { useWorklogPreferences } from "@/components/worklog/hooks/use-worklog-preferences";
import { useWorklogVisibleLogs } from "@/components/worklog/hooks/use-worklog-visible-logs";
import { useWorklogStats } from "@/components/worklog/hooks/use-worklog-stats";
import { useWorklogCreateFlow } from "@/components/worklog/hooks/use-worklog-create-flow";
import { useWorklogKeyboardNav } from "@/components/worklog/hooks/use-worklog-keyboard-nav";
import {
  WorklogFoldersRail,
  type FolderSelection,
} from "@/components/worklog/worklog-folders-rail";
import { WorklogNotesList } from "@/components/worklog/worklog-notes-list";
import {
  WorklogNoteReader,
  type WorklogNoteReaderHandle,
} from "@/components/worklog/worklog-note-reader";
import { WorklogToolbar } from "@/components/worklog/worklog-toolbar";
import { WorklogDefaultsDialog } from "@/components/worklog/worklog-defaults-dialog";
import { WorklogTemplatesTab } from "@/components/worklog/worklog-templates-tab";
import { WorklogTemplateEditor } from "@/components/worklog/worklog-template-editor";
import { WorklogTemplatePickerDialog } from "@/components/worklog/worklog-template-picker-dialog";
import { WorklogSearchPalette } from "@/components/worklog/worklog-search-palette";
import { WorklogBulkActionBar } from "@/components/worklog/worklog-bulk-action-bar";
import { useWorklogSelection } from "@/components/worklog/hooks/use-worklog-selection";
import { WorklogDndProvider } from "@/components/worklog/worklog-dnd-provider";

export interface WorklogPageProps {
  /** Embedded mode: hide page brand, tighten chrome for the job-map embed. */
  compact?: boolean;
}

export function WorklogPage({ compact = false }: WorklogPageProps = {}) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<WorklogNoteReaderHandle | null>(null);

  // Pane container refs for cross-pane keyboard navigation.
  const railPaneRef = useRef<HTMLDivElement | null>(null);
  const listPaneRef = useRef<HTMLDivElement | null>(null);
  const viewPaneRef = useRef<HTMLDivElement | null>(null);

  const [activeFolder, setActiveFolder] = useState<FolderSelection>({ kind: "all" });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showDefaultsDialog, setShowDefaultsDialog] = useState(false);
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null);
  // Mobile drill-down: when a note is selected on narrow screens, show the
  // reader and provide a back button to return to the list.
  const [mobileShowReader, setMobileShowReader] = useState(false);

  // Data
  const {
    logs,
    loadingLogs,
    templates,
    positions,
    equipment,
    assets,
    positionMap,
  } = useWorklogData();

  // Preferences / defaults (defaults summary, default shifts, save mutation).
  const { defaults, defaultShifts, loadingDefaultShifts, defaultsSummary, saveDefaults } =
    useWorklogPreferences(positionMap, {
      onSaveSuccess: () => setShowDefaultsDialog(false),
    });

  // Visible logs (folder × filters × selectedDate × search).
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
    isAnyFilterActive,
    clearAllFilters,
  } = useWorklogVisibleLogs(logs, activeFolder, selectedDate, search);

  // Stats for the rail (streak / total this month / notable count).
  const { streak, totalThisMonth, notableCount } = useWorklogStats(logs);

  // Mutations
  const { saveLog, deleteLog, saveTemplate, deleteTemplate, bulkAction } = useWorklogMutations({
    onSaveTemplateSuccess: () => setEditingTemplate(null),
  });

  // Multi-select (W1.3). Lives at the orchestrator so the rail/filter/search
  // state can clear it on context change.
  const selection = useWorklogSelection();

  // Bulk-select activation gate. When off: no checkboxes, DnD reorder active.
  // When on: DnD disabled, checkboxes shown, row click = toggle + open.
  const [bulkMode, setBulkMode] = useState(false);
  const toggleBulkMode = useCallback(() => {
    setBulkMode((prev) => {
      if (prev) selection.clear();
      return !prev;
    });
  }, [selection]);

  // Escape exits bulk mode.
  useEffect(() => {
    if (!bulkMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBulkMode(false);
        selection.clear();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [bulkMode, selection]);

  // Keep selectedNoteId valid as logs change (e.g. after delete).
  useEffect(() => {
    if (selectedNoteId && !logs.find((l) => l.id === selectedNoteId)) {
      setSelectedNoteId(null);
      setMobileShowReader(false);
    }
  }, [logs, selectedNoteId]);

  // Selected log object (read from live `logs` so reader sees up-to-date data
  // after every mutation invalidation).
  const selectedLog = useMemo(
    () => (selectedNoteId ? logs.find((l) => l.id === selectedNoteId) ?? null : null),
    [logs, selectedNoteId],
  );

  // Unique sorted tag strings across all logs — fed into TagInput for autocomplete.
  const tagSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const log of logs) {
      if (!log.tags) continue;
      for (const t of log.tags.split(",")) {
        const trimmed = t.trim().toLowerCase();
        if (trimmed) seen.add(trimmed);
      }
    }
    return Array.from(seen).sort();
  }, [logs]);

  // Create-blank flow: blank / quick-capture / copy-last / apply-template all
  // route through the same create-and-select choreography.
  const { createBlankNote, startBlank, startQuickCapture, copyLast, applyTemplate } =
    useWorklogCreateFlow({
      logs,
      defaults,
      saveLog,
      setActiveFolder,
      setSelectedNoteId,
      setMobileShowReader,
      closeTemplatePicker: () => setShowTemplatePicker(false),
    });

  // Deep links
  useWorklogDeepLinks(logs, {
    setSelectedDate,
    setFilterPositionId,
    setFilterEquipmentId,
    setFilterAssetId,
    setActiveFolder,
    setSelectedNoteId: (id) => {
      setSelectedNoteId(id);
      if (id) setMobileShowReader(true);
    },
    createBlankNote: ({ positionId }) => void createBlankNote({ positionId }),
    clearAllFilters,
  });

  // ── Render ───────────────────────────────────────────────────
  const inTemplatesView = activeFolder.kind === "templates";

  // Keyboard shortcuts + cross-pane focus (j/k navigate, n new, / search,
  // Cmd+S flush, Cmd+Shift+←/→ cycle panes). focusPane is used below to
  // hand off focus on "activate" actions.
  const { focusPane } = useWorklogKeyboardNav({
    railPaneRef,
    listPaneRef,
    viewPaneRef,
    openSearchPalette: () => setSearchPaletteOpen(true),
    readerRef,
    visibleLogs,
    selectedNoteId,
    hasSelectedLog: selectedLog != null,
    setSelectedNoteId,
    setMobileShowReader,
    inTemplatesView,
    startBlank,
  });

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        compact ? "h-[calc(100vh-8rem)] rounded-md border overflow-hidden" : "h-[calc(100vh-4rem)]",
      )}
    >
      <WorklogToolbar
        compact={compact}
        search={search}
        setSearch={setSearch}
        searchInputRef={searchInputRef}
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
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
        isAnyFilterActive={isAnyFilterActive || activeFolder.kind !== "all"}
        onClearAll={() => {
          clearAllFilters();
          setActiveFolder({ kind: "all" });
          setSelectedDate(null);
          setSearch("");
        }}
        hasLogs={logs.length > 0}
        onNew={startBlank}
        onQuickCapture={startQuickCapture}
        onCopyLast={copyLast}
        onFromTemplate={() => setShowTemplatePicker(true)}
        onDefaults={() => setShowDefaultsDialog(true)}
        defaultsSummary={defaultsSummary}
        bulkMode={bulkMode}
        onToggleBulkMode={toggleBulkMode}
      />

      {/* 3-pane grid */}
      <WorklogDndProvider>
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[200px_1fr] xl:grid-cols-[220px_320px_1fr]">
        {/* Folders rail */}
        <div ref={railPaneRef} data-pane="rail" className="hidden md:block min-h-0 overflow-hidden">
          <WorklogFoldersRail
            logs={logs}
            templatesCount={templates.length}
            selected={activeFolder}
            onSelect={(f) => {
              setActiveFolder(f);
              setSelectedNoteId(null);
              setSelectedDate(null);
              selection.clear();
              setBulkMode(false);
            }}
            onActivate={() => focusPane("list")}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            streak={streak}
            totalThisMonth={totalThisMonth}
            notableCount={notableCount}
          />
        </div>

        {/* Middle pane: notes list OR templates list */}
        <div
          ref={listPaneRef}
          data-pane="list"
          className={cn(
            "min-h-0 border-r flex flex-col",
            mobileShowReader && selectedLog ? "hidden md:flex" : "flex",
          )}
        >
          {/* Mobile back button when only middle pane shows but we're navigating between groups */}
          {inTemplatesView ? (
            <ScrollArea className="h-full">
              <div className="p-3">
                <WorklogTemplatesTab
                  templates={templates}
                  positionMap={positionMap}
                  onApply={applyTemplate}
                  onEdit={(t) => setEditingTemplate(t)}
                  onDelete={(id) => deleteTemplate.mutate(id)}
                  onNew={() =>
                    setEditingTemplate({
                      name: "",
                      defaultCategory: "task",
                      defaultEquipmentIds: [],
                      defaultAssetIds: [],
                    })
                  }
                />
              </div>
            </ScrollArea>
          ) : (
            <WorklogNotesList
              logs={visibleLogs}
              selectedId={selectedNoteId}
              onSelect={(id) => {
                setSelectedNoteId(id);
                setMobileShowReader(true);
              }}
              onActivate={(id) => {
                setSelectedNoteId(id);
                setMobileShowReader(true);
                // Defer one frame so the reader can mount/update before
                // we hand focus to its title input.
                requestAnimationFrame(() => focusPane("view"));
              }}
              positionMap={positionMap}
              loading={loadingLogs}
              emptyMessage={
                search
                  ? "No notes match your search"
                  : activeFolder.kind === "category"
                    ? `No ${CATEGORIES[activeFolder.category]?.label.toLowerCase() ?? ""} notes yet`
                    : activeFolder.kind === "notable"
                      ? "No notable notes yet"
                      : "No notes yet"
              }
              emptyHint={
                search ? "Try a different keyword." : "Start a note to capture today’s work."
              }
              onNew={!search ? startBlank : undefined}
              selection={bulkMode ? selection : undefined}
              sortable={activeFolder.kind === "folder" && !bulkMode}
            />
          )}
        </div>

        {/* Right pane: note reader (hidden in templates view) */}
        {!inTemplatesView && (
          <div
            ref={viewPaneRef}
            data-pane="view"
            className={cn(
              "min-h-0 flex flex-col",
              mobileShowReader && selectedLog ? "flex" : "hidden xl:flex",
            )}
          >
            {/* Mobile back button */}
            {mobileShowReader && selectedLog && (
              <div className="xl:hidden flex items-center gap-2 px-3 py-1.5 border-b">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMobileShowReader(false)}
                  className="h-7 gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </Button>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <WorklogNoteReader
                ref={readerRef}
                log={selectedLog}
                positions={positions}
                equipment={equipment}
                assets={assets}
                positionMap={positionMap}
                tagSuggestions={tagSuggestions}
                onUpdate={(patch) => saveLog.mutateAsync(patch)}
                onDelete={(id) => {
                  deleteLog.mutate(id);
                  setSelectedNoteId(null);
                  setMobileShowReader(false);
                }}
                onNew={startBlank}
                hasLogs={logs.length > 0}
              />
            </div>
          </div>
        )}
      </div>
      </WorklogDndProvider>

      <WorklogTemplatePickerDialog
        open={showTemplatePicker}
        onOpenChange={setShowTemplatePicker}
        templates={templates}
        positionMap={positionMap}
        onApply={applyTemplate}
        onCreateFirst={() => {
          setShowTemplatePicker(false);
          setActiveFolder({ kind: "templates" });
          setEditingTemplate({
            name: "",
            defaultCategory: "task",
            defaultEquipmentIds: [],
            defaultAssetIds: [],
          });
        }}
      />

      <WorklogBulkActionBar
        count={selection.selectedCount}
        busy={bulkAction.isPending}
        onMove={async (folderId) => {
          const ids = Array.from(selection.selectedIds);
          if (ids.length === 0) return;
          await bulkAction.mutateAsync({ action: "move", ids, payload: { folderId } });
          selection.clear();
        }}
        onDelete={async () => {
          const ids = Array.from(selection.selectedIds);
          if (ids.length === 0) return;
          await bulkAction.mutateAsync({ action: "delete", ids });
          // If the currently-open note was part of the batch, drop the reader.
          if (selectedNoteId && ids.includes(selectedNoteId)) {
            setSelectedNoteId(null);
            setMobileShowReader(false);
          }
          selection.clear();
        }}
        onClear={selection.clear}
      />

      <WorklogSearchPalette
        open={searchPaletteOpen}
        onOpenChange={setSearchPaletteOpen}
        scopedFolderId={activeFolder.kind === "folder" ? activeFolder.folderId : null}
        scopeLabel={activeFolder.kind === "folder" ? "this folder" : undefined}
        onSelect={(id) => {
          setSelectedNoteId(id);
          setMobileShowReader(true);
        }}
      />

      {/* Template editor modal */}
      <WorklogTemplateEditor
        open={editingTemplate !== null}
        onOpenChange={(o) => {
          if (!o) setEditingTemplate(null);
        }}
        value={editingTemplate}
        positions={positions}
        equipment={equipment}
        assets={assets}
        onSave={(data) => saveTemplate.mutate(data)}
        saving={saveTemplate.isPending}
      />

      <WorklogDefaultsDialog
        open={showDefaultsDialog}
        onOpenChange={setShowDefaultsDialog}
        value={defaults}
        positions={positions}
        shifts={defaultShifts}
        loadingShifts={loadingDefaultShifts}
        onSave={(next) => saveDefaults.mutate(next)}
        saving={saveDefaults.isPending}
      />
    </div>
  );
}
