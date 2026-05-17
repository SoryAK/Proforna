"use client";

import { useMemo, useState } from "react";
import {
  parseISO,
  isSameDay,
} from "date-fns";
import {
  Plus,
  Sparkles,
  Trash2,
  Pencil,
  Briefcase,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type EquipmentItem } from "@/components/equipment-picker";
import { type JobAsset } from "@/components/asset-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { WorkLog, Template, Position } from "@/types/worklog";
import { CATEGORIES, dateLabel } from "@/components/worklog/constants";
import { calcStreak } from "@/components/worklog/heatmap-utils";
import { useWorklogData } from "@/components/worklog/hooks/use-worklog-data";
import { useWorklogMutations } from "@/components/worklog/hooks/use-worklog-mutations";
import { useWorklogFilters } from "@/components/worklog/hooks/use-worklog-filters";
import { useWorklogDeepLinks } from "@/components/worklog/hooks/use-worklog-deep-links";
import { WorklogStatsStrip } from "@/components/worklog/worklog-stats-strip";
import { WorklogHeatmap } from "@/components/worklog/worklog-heatmap";
import { WorklogFiltersBar } from "@/components/worklog/worklog-filters-bar";
import { WorklogTimeline } from "@/components/worklog/worklog-timeline";
import { WorklogTemplatesTab } from "@/components/worklog/worklog-templates-tab";
import { WorklogLogEditor } from "@/components/worklog/worklog-log-editor";
import { WorklogTemplateEditor } from "@/components/worklog/worklog-template-editor";

// EquipmentItem / JobAsset types and their constants live in the picker files
// (imported above).


// ── Component ───────────────────────────────────────────────────
export interface WorklogPageProps {
  /** Embedded mode: hide page title/subtitle, tighten spacing for use inside
      another frame (e.g. the job-map view-preset overlay). */
  compact?: boolean;
}

export function WorklogPage({ compact = false }: WorklogPageProps = {}) {
  const [tab, setTab] = useState<"timeline" | "templates">("timeline");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editing, setEditing] = useState<Partial<WorkLog> | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null);

  // Data
  const {
    logs,
    loadingLogs,
    templates,
    positions,
    equipment,
    assets,
    positionMap,
    equipmentMap,
    assetMap,
  } = useWorklogData();

  // Filters + derived timeline
  const {
    filterPositionId,
    setFilterPositionId,
    filterCategory,
    setFilterCategory,
    filterNotable,
    setFilterNotable,
    filterEquipmentId,
    setFilterEquipmentId,
    filterAssetId,
    setFilterAssetId,
    filteredLogs,
    timeline,
    isAnyFilterActive,
    clearAll: clearAllFilters,
  } = useWorklogFilters(logs);

  // Selected day view (when user clicks a heatmap cell)
  const selectedDayLogs = useMemo(() => {
    if (!selectedDate) return null;
    return filteredLogs.filter((l) => isSameDay(parseISO(l.date), selectedDate));
  }, [selectedDate, filteredLogs]);

  // Deep links (5 ?focus/?focusPosition/?focusEquipment/?focusAsset/?new params).
  const { focusId } = useWorklogDeepLinks(logs, {
    setSelectedDate,
    setFilterPositionId,
    setFilterEquipmentId,
    setFilterAssetId,
    setTab,
    setEditing,
    setShowQuickAdd,
    clearAllFilters,
  });

  // Heatmap + streak
  const streak = useMemo(() => calcStreak(logs), [logs]);
  const totalThisMonth = useMemo(() => {
    const now = new Date();
    return logs.filter((l) => {
      const d = parseISO(l.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [logs]);
  const notableCount = useMemo(() => logs.filter((l) => l.isNotable || l.accomplishment).length, [logs]);

  // Mutations
  const { saveLog, deleteLog, saveTemplate, deleteTemplate } = useWorklogMutations({
    onSaveLogSuccess: () => {
      setEditing(null);
      setShowQuickAdd(false);
    },
    onSaveTemplateSuccess: () => {
      setEditingTemplate(null);
    },
  });

  // Apply a template to start a new log
  function applyTemplate(t: Template) {
    setShowTemplatePicker(false);
    setEditing({
      date: new Date().toISOString(),
      title: t.defaultTitle || t.name,
      category: t.defaultCategory,
      positionId: t.defaultPositionId,
      tags: t.defaultTags,
      mood: t.defaultMood,
      equipmentIds: t.defaultEquipmentIds,
      assetIds: t.defaultAssetIds ?? [],
      hours: t.defaultDurationMinutes ? t.defaultDurationMinutes / 60 : null,
      templateId: t.id,
      isNotable: false,
      content: "",
    });
    setShowQuickAdd(true);
  }

  // "Same as last entry" — copy the most recent log
  function copyLast() {
    const last = logs[0];
    if (!last) return;
    setEditing({
      date: new Date().toISOString(),
      title: last.title,
      category: last.category,
      positionId: last.positionId,
      tags: last.tags,
      mood: last.mood,
      equipmentIds: last.equipmentIds,
      assetIds: last.assetIds ?? [],
      hours: last.hours,
      content: "",
      isNotable: false,
    });
    setShowQuickAdd(true);
  }

  function startBlank() {
    setEditing({
      date: new Date().toISOString(),
      title: "",
      category: "task",
      positionId: null,
      isNotable: false,
      content: "",
      equipmentIds: [],
      assetIds: [],
    });
    setShowQuickAdd(true);
  }

  return (
    <div className={compact ? "space-y-3 p-3" : "space-y-6"}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!compact && (
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Worklog
              <Badge variant="secondary" className="text-[10px]">Private</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Capture today in seconds. Cherry-pick highlights for your IR later.
            </p>
          </div>
        )}
        <div className={compact ? "flex items-center gap-2 ml-auto" : "flex items-center gap-2"}>
          {logs.length > 0 && (
            <Button size="sm" variant="outline" onClick={copyLast}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Same as last
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowTemplatePicker(true)}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> From template
          </Button>
          <Button size="sm" onClick={startBlank}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New entry
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <WorklogStatsStrip
        streak={streak}
        totalThisMonth={totalThisMonth}
        notableCount={notableCount}
        templateCount={templates.length}
      />

      {/* Heatmap */}
      <WorklogHeatmap logs={logs} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* Filters */}
      <WorklogFiltersBar
        positions={positions}
        equipmentMap={equipmentMap}
        assetMap={assetMap}
        filterPositionId={filterPositionId}
        setFilterPositionId={setFilterPositionId}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        filterNotable={filterNotable}
        setFilterNotable={setFilterNotable}
        filterEquipmentId={filterEquipmentId}
        setFilterEquipmentId={setFilterEquipmentId}
        filterAssetId={filterAssetId}
        setFilterAssetId={setFilterAssetId}
        isAnyFilterActive={isAnyFilterActive}
        onClearAll={clearAllFilters}
        filteredCount={filteredLogs.length}
        totalCount={logs.length}
      />

      {/* Tabs: Timeline | Templates */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <WorklogTimeline
            selectedDate={selectedDate}
            selectedDayLogs={selectedDayLogs}
            loadingLogs={loadingLogs}
            timeline={timeline}
            positionMap={positionMap}
            equipmentMap={equipmentMap}
            assetMap={assetMap}
            focusId={focusId}
            onEdit={(l) => {
              setEditing(l);
              setShowQuickAdd(true);
            }}
            onDelete={(id) => {
              if (confirm("Delete this entry?")) deleteLog.mutate(id);
            }}
            onToggleNotable={(l) => saveLog.mutate({ id: l.id, isNotable: !l.isNotable })}
            onStartBlank={startBlank}
          />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <WorklogTemplatesTab
            templates={templates}
            positionMap={positionMap}
            onApply={applyTemplate}
            onEdit={(t) => setEditingTemplate(t)}
            onDelete={(id) => deleteTemplate.mutate(id)}
            onNew={() =>
              setEditingTemplate({ name: "", defaultCategory: "task", defaultEquipmentIds: [], defaultAssetIds: [] })
            }
          />
        </TabsContent>
      </Tabs>

      {/* Template picker modal */}
      <Dialog open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pick a template</DialogTitle>
          </DialogHeader>
          {templates.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">No templates yet — create one to log routine days in seconds.</p>
              <Button
                size="sm"
                onClick={() => { setShowTemplatePicker(false); setTab("templates"); setEditingTemplate({ name: "", defaultCategory: "task", defaultEquipmentIds: [], defaultAssetIds: [] }); }}
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
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
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

      {/* Quick-add / edit log modal */}
      <WorklogLogEditor
        open={showQuickAdd}
        onOpenChange={(o) => { setShowQuickAdd(o); if (!o) setEditing(null); }}
        value={editing}
        positions={positions}
        equipment={equipment}
        assets={assets}
        onSave={(data) => saveLog.mutate(data)}
        saving={saveLog.isPending}
      />

      {/* Template editor modal */}
      <WorklogTemplateEditor
        open={editingTemplate !== null}
        onOpenChange={(o) => { if (!o) setEditingTemplate(null); }}
        value={editingTemplate}
        positions={positions}
        equipment={equipment}
        assets={assets}
        onSave={(data) => saveTemplate.mutate(data)}
        saving={saveTemplate.isPending}
      />
    </div>
  );
}
