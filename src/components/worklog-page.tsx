"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  isSameDay,
  parseISO,
} from "date-fns";
import {
  Plus,
  Sparkles,
  Star,
  Trash2,
  Pencil,
  Settings2,
  Briefcase,
  X,
  Copy,
  Image as ImageIcon,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AssetServiceHistory } from "@/components/asset-service-history";
import { EquipmentPicker, EQUIPMENT_CATEGORIES, EQUIPMENT_CONDITIONS, type EquipmentItem } from "@/components/equipment-picker";
import { AssetPicker, ASSET_TYPES, ASSET_STATUS, type JobAsset } from "@/components/asset-picker";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { WorkLog, WorkLogPhoto, Template, Position } from "@/types/worklog";
import { CATEGORIES, MOODS, dateLabel } from "@/components/worklog/constants";
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
      <LogEditor
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
      <TemplateEditor
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

// ── Log editor modal ────────────────────────────────────────────
function WorkLogPhotoSection({ workLogId }: { workLogId: string }) {
  const qc = useQueryClient();
  const { data: photos = [] } = useQuery<WorkLogPhoto[]>({
    queryKey: ["worklog-photos", workLogId],
    queryFn: async () => {
      const r = await fetch(`/api/work-logs/photos?workLogId=${workLogId}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("workLogId", workLogId);
        fd.append("file", file);
        const r = await fetch("/api/work-logs/photos", { method: "POST", body: fd });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setError(j.error || "Upload failed");
          break;
        }
      }
      qc.invalidateQueries({ queryKey: ["worklog-photos", workLogId] });
      qc.invalidateQueries({ queryKey: ["worklogs"] });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/work-logs/photos?id=${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["worklog-photos", workLogId] });
    qc.invalidateQueries({ queryKey: ["worklogs"] });
  }

  return (
    <div>
      <Label className="text-xs flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" />
        Photos ({photos.length}/6)
      </Label>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative group aspect-square rounded-md overflow-hidden border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.filePath} alt={p.caption ?? ""} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(p.id)}
              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Delete photo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {photos.length < 6 && (
          <label className="aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-accent/40 transition-colors">
            <Upload className="h-4 w-4 mb-1" />
            <span>{uploading ? "Uploading…" : "Add photo"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

function LogEditor({
  open,
  onOpenChange,
  value,
  positions,
  equipment,
  assets,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: Partial<WorkLog> | null;
  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];
  onSave: (data: Partial<WorkLog>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Partial<WorkLog>>({});
  useEffect(() => {
    if (open) setDraft(value ?? {});
  }, [open, value]);

  if (!open) return null;
  const isEdit = !!draft.id;

  function update<K extends keyof WorkLog>(key: K, v: WorkLog[K] | null) {
    setDraft((d) => ({ ...d, [key]: v as WorkLog[K] }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit entry" : "New entry"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={draft.date ? format(parseISO(draft.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => update("date", new Date(e.target.value).toISOString())}
              />
            </div>
            <div>
              <Label className="text-xs">Hours (optional)</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                value={draft.hours ?? ""}
                onChange={(e) => update("hours", e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Title <span className="text-rose-500">*</span></Label>
            <Input
              value={draft.title ?? ""}
              onChange={(e) => update("title", e.target.value)}
              placeholder='Short summary, e.g. "Fixed CI pipeline"'
            />
          </div>

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={draft.content ?? ""}
              onChange={(e) => update("content", e.target.value || null)}
              placeholder="What did you do? Any blockers or wins worth remembering?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={draft.category ?? "task"}
                onChange={(e) => update("category", e.target.value as WorkLog["category"])}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <option key={k} value={k}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Linked job (optional)</Label>
              <select
                value={draft.positionId ?? ""}
                onChange={(e) => update("positionId", e.target.value || null)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">No job</option>
                {positions.filter((p) => p.type === "job").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company}{p.title ? ` — ${p.title}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={draft.tags ?? ""}
              onChange={(e) => update("tags", e.target.value || null)}
              placeholder="kubernetes, deploy, on-call"
            />
          </div>

          {equipment.length > 0 && (
            <EquipmentPicker
              label="Tools used (optional)"
              equipment={equipment}
              selectedIds={draft.equipmentIds ?? []}
              onChange={(ids) => update("equipmentIds", ids)}
            />
          )}

          <AssetPicker
            label="Worked on (machines / units / vehicles)"
            assets={assets}
            positions={positions}
            selectedIds={draft.assetIds ?? []}
            defaultPositionId={draft.positionId ?? null}
            onChange={(ids) => update("assetIds", ids)}
          />

          {draft.id ? (
            <WorkLogPhotoSection workLogId={draft.id} />
          ) : (
            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              Save the entry first to attach photos.
            </div>
          )}

          <div className="flex items-center gap-3">
            <div>
              <Label className="text-xs block mb-1">Mood</Label>
              <div className="flex gap-1">
                {MOODS.map((m) => {
                  const Icon = m.icon;
                  const sel = draft.mood === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => update("mood", sel ? null : m.value)}
                      title={m.label}
                      className={cn(
                        "h-8 w-8 rounded-md flex items-center justify-center border transition-colors",
                        sel ? "bg-accent border-foreground/40" : "border-border hover:border-foreground/30",
                        m.color
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer ml-auto pt-5">
              <Checkbox
                checked={!!draft.isNotable}
                onCheckedChange={(c) => update("isNotable", c === true)}
              />
              <Star className={cn("h-4 w-4", draft.isNotable && "fill-yellow-400 text-yellow-400")} />
              Notable
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(draft)}
            disabled={saving || !draft.title?.trim()}
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Template editor modal ───────────────────────────────────────
function TemplateEditor({
  open,
  onOpenChange,
  value,
  positions,
  equipment,
  assets,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: Partial<Template> | null;
  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];
  onSave: (data: Partial<Template>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Partial<Template>>({});
  useEffect(() => {
    if (open) setDraft(value ?? {});
  }, [open, value]);

  if (!open) return null;
  const isEdit = !!draft.id;

  function update<K extends keyof Template>(key: K, v: Template[K] | null) {
    setDraft((d) => ({ ...d, [key]: v as Template[K] }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            {isEdit ? "Edit template" : "New template"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name <span className="text-rose-500">*</span></Label>
            <Input
              value={draft.name ?? ""}
              onChange={(e) => update("name", e.target.value)}
              placeholder='e.g. "Standard onsite — Acme"'
            />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={draft.description ?? ""}
              onChange={(e) => update("description", e.target.value || null)}
              placeholder="Short note describing this day type"
            />
          </div>
          <div>
            <Label className="text-xs">Default title (used when applying)</Label>
            <Input
              value={draft.defaultTitle ?? ""}
              onChange={(e) => update("defaultTitle", e.target.value || null)}
              placeholder='Defaults to template name if blank'
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Default category</Label>
              <select
                value={draft.defaultCategory ?? "task"}
                onChange={(e) => update("defaultCategory", e.target.value as Template["defaultCategory"])}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <option key={k} value={k}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Default duration (minutes)</Label>
              <Input
                type="number"
                min="0"
                step="15"
                value={draft.defaultDurationMinutes ?? ""}
                onChange={(e) => update("defaultDurationMinutes", e.target.value ? parseInt(e.target.value, 10) : null)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Linked job (optional)</Label>
            <select
              value={draft.defaultPositionId ?? ""}
              onChange={(e) => update("defaultPositionId", e.target.value || null)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">No job</option>
              {positions.filter((p) => p.type === "job").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company}{p.title ? ` — ${p.title}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Default tags (comma-separated)</Label>
            <Input
              value={draft.defaultTags ?? ""}
              onChange={(e) => update("defaultTags", e.target.value || null)}
              placeholder="kubernetes, deploy"
            />
          </div>
          {equipment.length > 0 && (
            <EquipmentPicker
              label="Default tools (optional)"
              equipment={equipment}
              selectedIds={draft.defaultEquipmentIds ?? []}
              onChange={(ids) => update("defaultEquipmentIds", ids)}
            />
          )}

          <AssetPicker
            label="Default assets worked on (optional)"
            assets={assets}
            positions={positions}
            selectedIds={draft.defaultAssetIds ?? []}
            defaultPositionId={draft.defaultPositionId ?? null}
            onChange={(ids) => update("defaultAssetIds", ids)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(draft)}
            disabled={saving || !draft.name?.trim()}
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

