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
import { cn } from "@/lib/utils";
import type { Template, WorkLog } from "@/types/worklog";
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
import { useFolderSelection } from "@/components/worklog/hooks/use-folder-selection";
import { WorklogNotesAndReader } from "@/components/worklog/worklog-notes-and-reader";
import { type WorklogNoteReaderHandle } from "@/components/worklog/worklog-note-reader";
import { WorklogToolbar } from "@/components/worklog/worklog-toolbar";
import { WorklogDefaultsDialog } from "@/components/worklog/worklog-defaults-dialog";
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

  const [activeFolder, setActiveFolder] = useFolderSelection({ enabled: !compact });
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
        compact ? "h-[calc(100vh-8rem)] rounded-md border overflow-hidden" : "h-full",
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

      {/* Pane grid.
          - compact (dashboard embed): 3-pane with rail + own WorklogDndProvider.
          - full /worklog/notes: 2-pane (notes list + reader); rail moved to
            global sidebar (ADR-0013); DnD provider lives in LayoutShell so it
            spans the sidebar AND the page.
          The middle + right pane bodies are extracted into <WorklogNotesAndReader>
          so the two layouts share one source of truth. */}
      {compact ? (
        <WorklogDndProvider>
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[200px_1fr] xl:grid-cols-[220px_320px_1fr]">
            {/* Folders rail (compact embed only) */}
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

            <WorklogNotesAndReader
              listPaneRef={listPaneRef}
              viewPaneRef={viewPaneRef}
              readerRef={readerRef}
              readerVisibleBreakpoint="xl"
              inTemplatesView={inTemplatesView}
              mobileShowReader={mobileShowReader}
              setMobileShowReader={setMobileShowReader}
              visibleLogs={visibleLogs}
              selectedNoteId={selectedNoteId}
              setSelectedNoteId={setSelectedNoteId}
              loadingLogs={loadingLogs}
              search={search}
              activeFolder={activeFolder}
              positionMap={positionMap}
              startBlank={startBlank}
              bulkMode={bulkMode}
              selection={selection}
              focusPane={focusPane}
              templates={templates}
              applyTemplate={applyTemplate}
              setEditingTemplate={setEditingTemplate}
              deleteTemplate={deleteTemplate}
              selectedLog={selectedLog}
              positions={positions}
              equipment={equipment}
              assets={assets}
              tagSuggestions={tagSuggestions}
              saveLog={saveLog}
              deleteLog={deleteLog}
              logs={logs}
            />
          </div>
        </WorklogDndProvider>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr]">
          <WorklogNotesAndReader
            listPaneRef={listPaneRef}
            viewPaneRef={viewPaneRef}
            readerRef={readerRef}
            readerVisibleBreakpoint="md"
            inTemplatesView={inTemplatesView}
            mobileShowReader={mobileShowReader}
            setMobileShowReader={setMobileShowReader}
            visibleLogs={visibleLogs}
            selectedNoteId={selectedNoteId}
            setSelectedNoteId={setSelectedNoteId}
            loadingLogs={loadingLogs}
            search={search}
            activeFolder={activeFolder}
            positionMap={positionMap}
            startBlank={startBlank}
            bulkMode={bulkMode}
            selection={selection}
            focusPane={focusPane}
            templates={templates}
            applyTemplate={applyTemplate}
            setEditingTemplate={setEditingTemplate}
            deleteTemplate={deleteTemplate}
            selectedLog={selectedLog}
            positions={positions}
            equipment={equipment}
            assets={assets}
            tagSuggestions={tagSuggestions}
            saveLog={saveLog}
            deleteLog={deleteLog}
            logs={logs}
          />
        </div>
      )}

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
        archivedView={activeFolder.kind === "archived"}
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
        onArchive={async () => {
          const ids = Array.from(selection.selectedIds);
          if (ids.length === 0) return;
          // ADR-0026 — direction follows the active sidebar bucket.
          const action = activeFolder.kind === "archived" ? "unarchive" : "archive";
          await bulkAction.mutateAsync({ action, ids });
          // If the currently-open note was archived OFF this view, drop
          // the reader so we don't show a row that's no longer in scope.
          if (
            selectedNoteId &&
            ids.includes(selectedNoteId) &&
            activeFolder.kind !== "archived"
          ) {
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
