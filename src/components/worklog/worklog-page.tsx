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

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseISO, isSameDay } from "date-fns";
import { Plus, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { WorkLog, Template, WorkShift, WorklogPreferences } from "@/types/worklog";
import { CATEGORIES } from "@/components/worklog/constants";
import { calcStreak } from "@/components/worklog/heatmap-utils";
import { useWorklogData } from "@/components/worklog/hooks/use-worklog-data";
import { useWorklogMutations } from "@/components/worklog/hooks/use-worklog-mutations";
import { useWorklogFilters } from "@/components/worklog/hooks/use-worklog-filters";
import { useWorklogDeepLinks } from "@/components/worklog/hooks/use-worklog-deep-links";
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

export interface WorklogPageProps {
  /** Embedded mode: hide page brand, tighten chrome for the job-map embed. */
  compact?: boolean;
}

export function WorklogPage({ compact = false }: WorklogPageProps = {}) {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<WorklogNoteReaderHandle | null>(null);

  // Pane container refs for cross-pane keyboard navigation
  // (Cmd/Ctrl+] forward, Cmd/Ctrl+[ back). The note view doesn't need a
  // DOM ref because the reader exposes focusTitle() on its handle.
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

  const emptyPreferences: WorklogPreferences = {
    defaultPositionId: null,
    defaultShiftId: null,
    defaultCategory: "task",
    defaultMood: null,
    defaultHours: null,
  };

  const { data: defaults = emptyPreferences } = useQuery<WorklogPreferences>({
    queryKey: ["worklog-preferences"],
    queryFn: async () => {
      const r = await fetch("/api/work-logs/preferences");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: defaultShifts = [], isLoading: loadingDefaultShifts } = useQuery<WorkShift[]>({
    queryKey: ["work-history-shifts", defaults.defaultPositionId],
    queryFn: async () => {
      const r = await fetch(`/api/work-history/${defaults.defaultPositionId}/shifts`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: !!defaults.defaultPositionId,
    staleTime: 60_000,
  });

  const defaultsSummary = useMemo(() => {
    const company = defaults.defaultPositionId
      ? positionMap.get(defaults.defaultPositionId)?.company ?? "Default company"
      : null;
    const shift = defaults.defaultShiftId
      ? defaultShifts.find((s) => s.id === defaults.defaultShiftId)?.name ?? null
      : null;

    if (company && shift) return `${company} · ${shift}`;
    if (company) return company;

    const hasOtherDefaults =
      defaults.defaultCategory !== "task" || defaults.defaultMood != null || defaults.defaultHours != null;
    return hasOtherDefaults ? "Custom defaults" : null;
  }, [defaults, positionMap, defaultShifts]);

  const saveDefaults = useMutation({
    mutationFn: async (next: WorklogPreferences) => {
      const r = await fetch("/api/work-logs/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<WorklogPreferences>;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["worklog-preferences"], saved);
      queryClient.invalidateQueries({ queryKey: ["work-history-shifts", saved.defaultPositionId] });
      setShowDefaultsDialog(false);
      toast.success("Worklog defaults saved");
    },
    onError: () => toast.error("Could not save defaults"),
  });

  // Filters (shared with old hook; category + notable are driven by the rail).
  const {
    filterPositionId,
    setFilterPositionId,
    setFilterCategory,
    filterNotable,
    setFilterNotable,
    filterEquipmentId,
    setFilterEquipmentId,
    filterAssetId,
    setFilterAssetId,
    isAnyFilterActive,
    clearAll: clearAllFilters,
  } = useWorklogFilters(logs);

  // Sync the folder selection into the underlying category/notable filters.
  // This keeps useWorklogFilters' invariants intact even though the visible
  // list is computed below directly.
  useEffect(() => {
    if (activeFolder.kind === "category") {
      setFilterCategory(activeFolder.category);
      setFilterNotable(false);
    } else if (activeFolder.kind === "notable") {
      setFilterCategory("all");
      setFilterNotable(true);
    } else {
      setFilterCategory("all");
      setFilterNotable(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder]);

  // Compose the visible notes list from folder + filters + search + selectedDate.
  const visibleLogs = useMemo(() => {
    let out = logs;
    if (activeFolder.kind === "category") {
      out = out.filter((l) => l.category === activeFolder.category);
    } else if (activeFolder.kind === "notable") {
      out = out.filter((l) => l.isNotable || l.accomplishment);
    }
    if (filterPositionId !== "all") {
      if (filterPositionId === "none") out = out.filter((l) => !l.positionId);
      else out = out.filter((l) => l.positionId === filterPositionId);
    }
    if (filterEquipmentId !== "all") {
      out = out.filter((l) => (l.equipmentIds ?? []).includes(filterEquipmentId));
    }
    if (filterAssetId !== "all") {
      out = out.filter((l) => (l.assetIds ?? []).includes(filterAssetId));
    }
    if (filterNotable && activeFolder.kind !== "notable") {
      out = out.filter((l) => l.isNotable || l.accomplishment);
    }
    if (selectedDate) {
      out = out.filter((l) => isSameDay(parseISO(l.date), selectedDate));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((l) => {
        const hay = `${l.title ?? ""} ${l.content ?? ""} ${l.tags ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return out;
  }, [
    logs,
    activeFolder,
    filterPositionId,
    filterEquipmentId,
    filterAssetId,
    filterNotable,
    selectedDate,
    search,
  ]);

  // Stats for the rail
  const streak = useMemo(() => calcStreak(logs), [logs]);
  const totalThisMonth = useMemo(() => {
    const now = new Date();
    return logs.filter((l) => {
      const d = parseISO(l.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [logs]);
  const notableCount = useMemo(
    () => logs.filter((l) => l.isNotable || l.accomplishment).length,
    [logs],
  );

  // Mutations
  const { saveLog, deleteLog, saveTemplate, deleteTemplate } = useWorklogMutations({
    onSaveTemplateSuccess: () => setEditingTemplate(null),
  });

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

  // Create-blank flow: POST a minimal note, then auto-select it.
  async function createBlankNote(
    opts: { positionId?: string | null; from?: Partial<WorkLog> } = {},
  ) {
    const resolvedPositionId = opts.from?.positionId ?? opts.positionId ?? defaults.defaultPositionId ?? null;
    const resolvedShiftId =
      opts.from?.shiftId ??
      (defaults.defaultShiftId && resolvedPositionId && defaults.defaultPositionId === resolvedPositionId
        ? defaults.defaultShiftId
        : null);

    const payload: Partial<WorkLog> = {
      date: new Date().toISOString(),
      title: opts.from?.title || "Untitled",
      category: opts.from?.category ?? defaults.defaultCategory ?? "task",
      positionId: resolvedPositionId,
      shiftId: resolvedShiftId,
      content: opts.from?.content ?? "",
      hours: opts.from?.hours ?? defaults.defaultHours ?? null,
      tags: opts.from?.tags ?? null,
      mood: opts.from?.mood ?? defaults.defaultMood ?? null,
      equipmentIds: opts.from?.equipmentIds ?? [],
      assetIds: opts.from?.assetIds ?? [],
      templateId: opts.from?.templateId ?? null,
      isNotable: false,
    };
    try {
      const saved: WorkLog = await saveLog.mutateAsync(payload);
      setActiveFolder({ kind: "all" });
      setSelectedNoteId(saved.id);
      setMobileShowReader(true);
    } catch {
      // mutation surfaces errors via React Query; nothing to do here
    }
  }

  function startBlank() {
    void createBlankNote();
  }

  function startQuickCapture(data: { title: string; category: string; hours: number | null }) {
    void createBlankNote({
      from: {
        title: data.title,
        category: data.category,
        hours: data.hours,
        content: "",
      },
    });
  }

  function copyLast() {
    const last = logs[0];
    if (!last) return;
    void createBlankNote({
      from: {
        title: last.title,
        category: last.category,
        positionId: last.positionId,
        tags: last.tags,
        mood: last.mood,
        equipmentIds: last.equipmentIds,
        assetIds: last.assetIds ?? [],
        hours: last.hours,
        content: "",
      },
    });
  }

  function applyTemplate(t: Template) {
    setShowTemplatePicker(false);
    void createBlankNote({
      from: {
        title: t.defaultTitle || t.name,
        category: t.defaultCategory,
        positionId: t.defaultPositionId,
        tags: t.defaultTags,
        mood: t.defaultMood,
        equipmentIds: t.defaultEquipmentIds,
        assetIds: t.defaultAssetIds ?? [],
        hours: t.defaultDurationMinutes ? t.defaultDurationMinutes / 60 : null,
        templateId: t.id,
        content: "",
      },
    });
  }

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

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      );
    }

    function handleShortcuts(e: KeyboardEvent) {
      if (inTemplatesView) return;

      const metaOrCtrl = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);

      if (metaOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        readerRef.current?.flushAutosave();
        return;
      }

      // Pane cycling: Cmd/Ctrl+Shift+→ forward, Cmd/Ctrl+Shift+← back.
      // Works even when typing — Shift+arrow alone means "extend selection",
      // but adding Cmd/Ctrl makes it unambiguous and free on all platforms
      // (avoids the Cmd+← back-navigation / Ctrl+← word-jump conflicts).
      if (metaOrCtrl && e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        cyclePane(e.key === "ArrowRight" ? "next" : "prev");
        return;
      }

      if (typing) return;

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (!e.altKey && !metaOrCtrl) {
        if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          startBlank();
          return;
        }

        const currentIdx = selectedNoteId
          ? visibleLogs.findIndex((l) => l.id === selectedNoteId)
          : -1;

        if (e.key.toLowerCase() === "j") {
          e.preventDefault();
          const nextIdx = Math.min(visibleLogs.length - 1, currentIdx + 1);
          if (visibleLogs[nextIdx]) {
            setSelectedNoteId(visibleLogs[nextIdx].id);
            setMobileShowReader(true);
          }
        }

        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          const prevIdx = Math.max(0, currentIdx <= 0 ? 0 : currentIdx - 1);
          if (visibleLogs[prevIdx]) {
            setSelectedNoteId(visibleLogs[prevIdx].id);
            setMobileShowReader(true);
          }
        }
      }
    }

    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [inTemplatesView, selectedNoteId, visibleLogs]);

  // ── Cross-pane focus helpers ─────────────────────────────────
  // The 3-pane shell (rail → list → view) supports keyboard hand-off:
  //   • Enter on rail row → focusPane("list")
  //   • Enter on list row → focusPane("view") (note title input)
  //   • Cmd/Ctrl+] / Cmd/Ctrl+[ → cyclePane next/prev (wraps)
  type PaneId = "rail" | "list" | "view";
  const PANE_ORDER: PaneId[] = ["rail", "list", "view"];

  function focusPane(target: PaneId): boolean {
    if (target === "rail") {
      const btn = railPaneRef.current?.querySelector<HTMLButtonElement>("[data-rail-row]");
      if (btn) {
        btn.focus();
        return true;
      }
      return false;
    }
    if (target === "list") {
      const lb = listPaneRef.current?.querySelector<HTMLElement>('[role="listbox"]');
      if (lb) {
        lb.focus();
        return true;
      }
      return false;
    }
    // view
    if (!selectedLog) return false;
    readerRef.current?.focusTitle();
    return true;
  }

  function detectActivePane(): PaneId | null {
    const active = document.activeElement;
    if (!active || active === document.body) return null;
    if (railPaneRef.current?.contains(active)) return "rail";
    if (listPaneRef.current?.contains(active)) return "list";
    if (viewPaneRef.current?.contains(active)) return "view";
    return null;
  }

  function cyclePane(direction: "next" | "prev") {
    const current = detectActivePane();
    const startIdx = current ? PANE_ORDER.indexOf(current) : (direction === "next" ? -1 : 0);
    const step = direction === "next" ? 1 : -1;
    // Try up to 3 panes — skip ones that can't accept focus (e.g. view
    // with no selected note).
    for (let i = 1; i <= PANE_ORDER.length; i++) {
      const idx = (startIdx + step * i + PANE_ORDER.length) % PANE_ORDER.length;
      if (focusPane(PANE_ORDER[idx])) return;
    }
  }

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
      />

      {/* 3-pane grid */}
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

      {/* Template picker modal */}
      <Dialog open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pick a template</DialogTitle>
          </DialogHeader>
          {templates.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No templates yet — create one to log routine days in seconds.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setShowTemplatePicker(false);
                  setActiveFolder({ kind: "templates" });
                  setEditingTemplate({
                    name: "",
                    defaultCategory: "task",
                    defaultEquipmentIds: [],
                    defaultAssetIds: [],
                  });
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first template
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-2 pr-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left p-3 rounded-md border hover:border-foreground/30 hover:bg-accent/40 transition-colors"
                  >
                    <div className="font-medium text-sm">{t.name}</div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="outline" className={cn("text-[10px]", CATEGORIES[t.defaultCategory]?.color)}>
                        {CATEGORIES[t.defaultCategory]?.label ?? t.defaultCategory}
                      </Badge>
                      {t.defaultPositionId && positionMap.get(t.defaultPositionId) && (
                        <Badge variant="outline" className="text-[10px]">
                          {positionMap.get(t.defaultPositionId)!.company}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

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
