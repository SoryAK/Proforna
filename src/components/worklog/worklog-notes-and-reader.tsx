/**
 * WorklogNotesAndReader — middle pane (notes list / templates list) + right
 * pane (note reader) for the worklog 2-pane and 3-pane layouts.
 *
 * Extracted from worklog-page.tsx to keep that file under the 600-line ceiling
 * after ADR-0013 + ADR-0014. The shape is a pragmatic prop bag rather than a
 * context provider — state ownership stays in <WorklogPage>; this component
 * is pure presentation + click handlers.
 *
 * The compact-mode 3-pane layout uses `readerVisibleBreakpoint = "xl"` (right
 * pane appears at xl, list/reader stack on md). The full /worklog/notes 2-pane
 * uses `readerVisibleBreakpoint = "md"` (right pane appears at md). This is
 * the only structural difference between the two callers.
 */

"use client";

import type { RefObject } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { resolveCategoryMeta } from "@/components/worklog/constants";
import { WorklogNotesList } from "@/components/worklog/worklog-notes-list";
import {
  WorklogNoteReader,
  type WorklogNoteReaderHandle,
} from "@/components/worklog/worklog-note-reader";
import { WorklogTemplatesTab } from "@/components/worklog/worklog-templates-tab";
import type {
  EquipmentItem,
  FolderSelection,
  JobAsset,
  Position,
  Template,
  WorkLog,
} from "@/types/worklog";

interface SaveLogMutation {
  mutateAsync: (patch: Partial<WorkLog>) => Promise<WorkLog>;
}
interface DeleteMutation {
  mutate: (id: string) => void;
}
interface SelectionApi {
  selectedIds: Set<string>;
  selectedCount: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
  set: (ids: Iterable<string>) => void;
}

export interface WorklogNotesAndReaderProps {
  // ── pane refs (kept in parent so keyboard nav still works) ──────────────
  listPaneRef: RefObject<HTMLDivElement | null>;
  viewPaneRef: RefObject<HTMLDivElement | null>;
  readerRef: RefObject<WorklogNoteReaderHandle | null>;

  // ── mode / breakpoints ─────────────────────────────────────────────────
  /**
   * Where the right pane (reader) becomes visible.
   *  • "xl" — compact 3-pane (dashboard embed). Reader joins at xl.
   *  • "md" — full /worklog/notes 2-pane. Reader joins at md.
   */
  readerVisibleBreakpoint: "md" | "xl";
  inTemplatesView: boolean;
  mobileShowReader: boolean;
  setMobileShowReader: (v: boolean) => void;

  // ── notes-list inputs ──────────────────────────────────────────────────
  visibleLogs: WorkLog[];
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  loadingLogs: boolean;
  search: string;
  activeFolder: FolderSelection;
  positionMap: Map<string, Position>;
  startBlank: () => void;
  bulkMode: boolean;
  selection: SelectionApi;
  focusPane: (target: "rail" | "list" | "view") => boolean;

  // ── templates branch ───────────────────────────────────────────────────
  templates: Template[];
  applyTemplate: (t: Template) => void;
  setEditingTemplate: (t: Partial<Template> | null) => void;
  deleteTemplate: DeleteMutation;

  // ── reader inputs ──────────────────────────────────────────────────────
  selectedLog: WorkLog | null;
  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];
  tagSuggestions: string[];
  saveLog: SaveLogMutation;
  deleteLog: DeleteMutation;
  /** All logs (for the reader's hasLogs prop / empty-state branching). */
  logs: WorkLog[];
}

export function WorklogNotesAndReader({
  listPaneRef,
  viewPaneRef,
  readerRef,
  readerVisibleBreakpoint,
  inTemplatesView,
  mobileShowReader,
  setMobileShowReader,
  visibleLogs,
  selectedNoteId,
  setSelectedNoteId,
  loadingLogs,
  search,
  activeFolder,
  positionMap,
  startBlank,
  bulkMode,
  selection,
  focusPane,
  templates,
  applyTemplate,
  setEditingTemplate,
  deleteTemplate,
  selectedLog,
  positions,
  equipment,
  assets,
  tagSuggestions,
  saveLog,
  deleteLog,
  logs,
}: WorklogNotesAndReaderProps) {
  const showReaderClass =
    readerVisibleBreakpoint === "xl"
      ? "hidden xl:flex"
      : "hidden md:flex";
  const mobileBackHidden =
    readerVisibleBreakpoint === "xl" ? "xl:hidden" : "md:hidden";

  return (
    <>
      {/* Middle pane: notes list OR templates list */}
      <div
        ref={listPaneRef}
        data-pane="list"
        className={cn(
          "min-h-0 border-r flex flex-col",
          mobileShowReader && selectedLog ? "hidden md:flex" : "flex",
        )}
      >
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
              // Defer one frame so the reader can mount/update before we
              // hand focus to its title input.
              requestAnimationFrame(() => focusPane("view"));
            }}
            positionMap={positionMap}
            loading={loadingLogs}
            emptyMessage={
              search
                ? "No notes match your search"
                : activeFolder.kind === "category"
                  ? `No ${resolveCategoryMeta(activeFolder.category).label.toLowerCase()} notes yet`
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
            mobileShowReader && selectedLog ? "flex" : showReaderClass,
          )}
        >
          {/* Mobile back button */}
          {mobileShowReader && selectedLog && (
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 border-b",
                mobileBackHidden,
              )}
            >
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
    </>
  );
}
