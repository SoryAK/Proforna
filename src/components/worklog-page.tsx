"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  startOfDay,
  isSameDay,
  parseISO,
  differenceInCalendarDays,
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
  Flame,
  CalendarDays,
  Meh,
  Wrench,
  Cog,
  ClipboardList,
  ChevronDown,
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
import { buildHeatmap, intensityClass, calcStreak } from "@/components/worklog/heatmap-utils";

// EquipmentItem / JobAsset types and their constants live in the picker files
// (imported above).


// ── Component ───────────────────────────────────────────────────
export interface WorklogPageProps {
  /** Embedded mode: hide page title/subtitle, tighten spacing for use inside
      another frame (e.g. the job-map view-preset overlay). */
  compact?: boolean;
}

export function WorklogPage({ compact = false }: WorklogPageProps = {}) {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusId = searchParams.get("focus");
  const [tab, setTab] = useState<"timeline" | "templates">("timeline");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editing, setEditing] = useState<Partial<WorkLog> | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null);
  const [filterPositionId, setFilterPositionId] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterNotable, setFilterNotable] = useState(false);
  const [filterEquipmentId, setFilterEquipmentId] = useState<string>("all");
  const [filterAssetId, setFilterAssetId] = useState<string>("all");

  // Data
  const { data: logs = [], isLoading: loadingLogs } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    queryFn: () => fetch("/api/work-logs").then((r) => r.json()),
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["worklog-templates"],
    queryFn: () => fetch("/api/work-logs/templates").then((r) => r.json()),
  });
  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["work-history"],
    queryFn: () => fetch("/api/work-history").then((r) => r.json()),
    staleTime: 60_000,
  });
  const { data: equipment = [] } = useQuery<EquipmentItem[]>({
    queryKey: ["personal-equipment"],
    queryFn: async () => {
      const r = await fetch("/api/personal-equipment");
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });
  const { data: assets = [] } = useQuery<JobAsset[]>({
    queryKey: ["job-assets"],
    queryFn: async () => {
      const r = await fetch("/api/job-assets");
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const positionMap = useMemo(() => {
    const m = new Map<string, Position>();
    positions.forEach((p) => m.set(p.id, p));
    return m;
  }, [positions]);

  const equipmentMap = useMemo(() => {
    const m = new Map<string, EquipmentItem>();
    equipment.forEach((e) => m.set(e.id, e));
    return m;
  }, [equipment]);

  const assetMap = useMemo(() => {
    const m = new Map<string, JobAsset>();
    assets.forEach((a) => m.set(a.id, a));
    return m;
  }, [assets]);

  // Filter logs (client-side for snappy UX)
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterPositionId !== "all") {
        if (filterPositionId === "none" && l.positionId) return false;
        if (filterPositionId !== "none" && l.positionId !== filterPositionId) return false;
      }
      if (filterCategory !== "all" && l.category !== filterCategory) return false;
      if (filterNotable && !l.isNotable && !l.accomplishment) return false;
      if (filterEquipmentId !== "all" && !(l.equipmentIds ?? []).includes(filterEquipmentId)) return false;
      if (filterAssetId !== "all" && !(l.assetIds ?? []).includes(filterAssetId)) return false;
      return true;
    });
  }, [logs, filterPositionId, filterCategory, filterNotable, filterEquipmentId, filterAssetId]);

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, WorkLog[]>();
    for (const l of filteredLogs) {
      const key = format(startOfDay(parseISO(l.date)), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([k, v]) => ({ date: parseISO(k), logs: v }));
  }, [filteredLogs]);

  // Roll up consecutive "routine" days (same position, no notable, no photos, ≤2 entries) into a single collapsed card.
  // Days are scanned in the existing descending order; runs of 3+ qualifying days become one rollup.
  type TimelineSegment =
    | { kind: "day"; date: Date; logs: WorkLog[] }
    | { kind: "rollup"; positionId: string; start: Date; end: Date; days: { date: Date; logs: WorkLog[] }[]; totalHours: number };

  const isRoutineDay = (logs: WorkLog[]): string | null => {
    if (!logs.length || logs.length > 2) return null;
    const pos = logs[0].positionId;
    if (!pos) return null;
    for (const l of logs) {
      if (l.positionId !== pos) return null;
      if (l.isNotable || l.accomplishment) return null;
      if (l.photos && l.photos.length > 0) return null;
      if (l.isAutoGenerated) return null; // surface auto entries so the user can confirm/edit
    }
    return pos;
  };

  const timeline = useMemo<TimelineSegment[]>(() => {
    const out: TimelineSegment[] = [];
    let i = 0;
    while (i < grouped.length) {
      const cur = grouped[i];
      const pos = isRoutineDay(cur.logs);
      if (!pos) { out.push({ kind: "day", ...cur }); i++; continue; }
      // Walk forward (descending date) collecting consecutive same-position routine days.
      const run: { date: Date; logs: WorkLog[] }[] = [cur];
      let j = i + 1;
      while (j < grouped.length) {
        const nxt = grouped[j];
        const nPos = isRoutineDay(nxt.logs);
        if (nPos !== pos) break;
        if (differenceInCalendarDays(run[run.length - 1].date, nxt.date) !== 1) break;
        run.push(nxt);
        j++;
      }
      if (run.length >= 3) {
        const totalHours = run.reduce((s, d) => s + d.logs.reduce((ss, l) => ss + (l.hours ?? 0), 0), 0);
        out.push({
          kind: "rollup",
          positionId: pos,
          start: run[run.length - 1].date,
          end: run[0].date,
          days: run,
          totalHours,
        });
        i = j;
      } else {
        out.push({ kind: "day", ...cur });
        i++;
      }
    }
    return out;
  }, [grouped]);

  // Selected day view (when user clicks a heatmap cell)
  const selectedDayLogs = useMemo(() => {
    if (!selectedDate) return null;
    return filteredLogs.filter((l) => isSameDay(parseISO(l.date), selectedDate));
  }, [selectedDate, filteredLogs]);

  // Deep-link focus (?focus=<id>) — clear filters, scroll to row, briefly highlight, drop the param.
  useEffect(() => {
    if (!focusId) return;
    const target = logs.find((l) => l.id === focusId);
    if (!target) return; // wait for data to load (effect re-runs on logs change)
    // Reset filters/selection so the row is visible.
    setSelectedDate(null);
    setFilterPositionId("all");
    setFilterCategory("all");
    setFilterNotable(false);
    setFilterEquipmentId("all");
    setFilterAssetId("all");
    setTab("timeline");
    // Scroll on the next frame after re-render.
    const t = setTimeout(() => {
      const el = document.getElementById(`worklog-row-${focusId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    // Strip ?focus from URL after a moment so refresh doesn't re-trigger.
    const t2 = setTimeout(() => {
      router.replace("/worklog", { scroll: false });
    }, 1500);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [focusId, logs, router]);

  // Deep-link "?focusPosition=<id>" — pre-filter the timeline to a single position.
  const focusPositionId = searchParams.get("focusPosition");
  useEffect(() => {
    if (!focusPositionId) return;
    setFilterPositionId(focusPositionId);
    setTab("timeline");
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
  }, [focusPositionId, router]);

  // Deep-link "?focusEquipment=<id>" — pre-filter the timeline to a single piece of equipment.
  const focusEquipmentId = searchParams.get("focusEquipment");
  useEffect(() => {
    if (!focusEquipmentId) return;
    setFilterEquipmentId(focusEquipmentId);
    setTab("timeline");
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
  }, [focusEquipmentId, router]);

  // Deep-link "?focusAsset=<id>" — pre-filter the timeline to a single job asset.
  const focusAssetId = searchParams.get("focusAsset");
  useEffect(() => {
    if (!focusAssetId) return;
    setFilterAssetId(focusAssetId);
    setTab("timeline");
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
  }, [focusAssetId, router]);

  // Deep-link "?new=1[&positionId=<id>]" — open the quick-add editor pre-filled with the position.
  const newParam = searchParams.get("new");
  const newPositionId = searchParams.get("positionId");
  useEffect(() => {
    if (newParam !== "1") return;
    setEditing({
      date: new Date().toISOString(),
      title: "",
      category: "task",
      positionId: newPositionId ?? null,
      isNotable: false,
      content: "",
      hours: null,
      tags: null,
      mood: null,
      equipmentIds: [],
      assetIds: [],
      templateId: null,
    });
    setShowQuickAdd(true);
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 100);
    return () => clearTimeout(t);
  }, [newParam, newPositionId, router]);

  // Heatmap + streak
  const weeks = useMemo(() => buildHeatmap(logs), [logs]);
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
  const saveLog = useMutation({
    mutationFn: async (data: Partial<WorkLog>) => {
      const isEdit = !!data.id;
      const url = isEdit ? `/api/work-logs/${data.id}` : "/api/work-logs";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worklogs"] });
      qc.invalidateQueries({ queryKey: ["worklog-templates"] });
      setEditing(null);
      setShowQuickAdd(false);
    },
  });

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/work-logs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worklogs"] }),
  });

  const saveTemplate = useMutation({
    mutationFn: async (data: Partial<Template>) => {
      const isEdit = !!data.id;
      const url = isEdit ? `/api/work-logs/templates/${data.id}` : "/api/work-logs/templates";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worklog-templates"] });
      setEditingTemplate(null);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/work-logs/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worklog-templates"] }),
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5" /> Current streak
          </div>
          <div className="text-2xl font-bold mt-1">{streak} <span className="text-sm font-normal text-muted-foreground">days</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> This month
          </div>
          <div className="text-2xl font-bold mt-1">{totalThisMonth} <span className="text-sm font-normal text-muted-foreground">entries</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" /> Notable
          </div>
          <div className="text-2xl font-bold mt-1">{notableCount} <span className="text-sm font-normal text-muted-foreground">all-time</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Templates
          </div>
          <div className="text-2xl font-bold mt-1">{templates.length}</div>
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Activity (last 12 weeks)</h2>
          {selectedDate && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedDate(null)} className="h-7 text-xs">
              <X className="h-3 w-3 mr-1" /> Clear day filter
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-1">
                {w.map((c) => {
                  const isSel = selectedDate && isSameDay(c.date, selectedDate);
                  return (
                    <button
                      key={c.key}
                      onClick={() => setSelectedDate(isSel ? null : c.date)}
                      title={`${format(c.date, "MMM d, yyyy")} — ${c.count} entr${c.count === 1 ? "y" : "ies"}`}
                      className={cn(
                        "h-3 w-3 rounded-sm transition-all hover:scale-125",
                        intensityClass(c.count),
                        isSel && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
          <span>Less</span>
          <div className="h-3 w-3 rounded-sm bg-muted/40" />
          <div className="h-3 w-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/60" />
          <div className="h-3 w-3 rounded-sm bg-emerald-300 dark:bg-emerald-700/70" />
          <div className="h-3 w-3 rounded-sm bg-emerald-400 dark:bg-emerald-600/80" />
          <div className="h-3 w-3 rounded-sm bg-emerald-500" />
          <span>More</span>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={filterPositionId} onValueChange={(v) => setFilterPositionId(v ?? "all")}>
          <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
            <SelectValue placeholder="All jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            <SelectItem value="none">No job linked</SelectItem>
            {positions.filter((p) => p.type === "job").map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.company}{p.title ? ` — ${p.title}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <SelectItem key={k} value={k}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={filterNotable ? "default" : "outline"}
          onClick={() => setFilterNotable((v) => !v)}
          className="h-8"
        >
          <Star className={cn("h-3.5 w-3.5 mr-1.5", filterNotable && "fill-current")} />
          Notable only
        </Button>
        {filterEquipmentId !== "all" && (
          <Button size="sm" variant="secondary" onClick={() => setFilterEquipmentId("all")} className="h-8 text-xs">
            Tool: {equipmentMap.get(filterEquipmentId)?.name ?? "filtered"} ✕
          </Button>
        )}
        {filterAssetId !== "all" && (() => {
          const a = assetMap.get(filterAssetId);
          const cover = a?.photos?.find((p) => p.isCover) ?? a?.photos?.[0] ?? null;
          return (
            <Button size="sm" variant="secondary" onClick={() => setFilterAssetId("all")} className="h-8 text-xs gap-1.5 pl-1.5">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover.filePath} alt="" className="h-5 w-5 rounded-sm object-cover" />
              ) : (
                <Cog className="h-3 w-3" />
              )}
              Asset: {a?.name ?? "filtered"} ✕
            </Button>
          );
        })()}
        {(filterPositionId !== "all" || filterCategory !== "all" || filterNotable || filterEquipmentId !== "all" || filterAssetId !== "all") && (
          <Button size="sm" variant="ghost" onClick={() => { setFilterPositionId("all"); setFilterCategory("all"); setFilterNotable(false); setFilterEquipmentId("all"); setFilterAssetId("all"); }} className="h-8">
            Clear
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {filteredLogs.length} of {logs.length} entries
        </div>
      </Card>

      {/* Tabs: Timeline | Templates */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          {selectedDate ? (
            <DayView
              date={selectedDate}
              logs={selectedDayLogs ?? []}
              positionMap={positionMap}
              equipmentMap={equipmentMap}
              assetMap={assetMap}
              focusId={focusId}
              onEdit={(l) => { setEditing(l); setShowQuickAdd(true); }}
              onDelete={(id) => { if (confirm("Delete this entry?")) deleteLog.mutate(id); }}
              onToggleNotable={(l) => saveLog.mutate({ id: l.id, isNotable: !l.isNotable })}
            />
          ) : loadingLogs ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : timeline.length === 0 ? (
            <Card className="p-8 text-center">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                No entries yet. Most days take 5 seconds with a template.
              </p>
              <Button size="sm" onClick={startBlank}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Log your first entry
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {timeline.map((seg) => (
                seg.kind === "rollup" ? (
                  <RoutineRollup
                    key={`r-${seg.start.toISOString()}-${seg.end.toISOString()}`}
                    segment={seg}
                    positionMap={positionMap}
                    equipmentMap={equipmentMap}
                    assetMap={assetMap}
                    focusId={focusId}
                    onEdit={(l) => { setEditing(l); setShowQuickAdd(true); }}
                    onDelete={(id) => { if (confirm("Delete this entry?")) deleteLog.mutate(id); }}
                    onToggleNotable={(l) => saveLog.mutate({ id: l.id, isNotable: !l.isNotable })}
                  />
                ) : (
                  <DayView
                    key={seg.date.toISOString()}
                    date={seg.date}
                    logs={seg.logs}
                    positionMap={positionMap}
                    equipmentMap={equipmentMap}
                    assetMap={assetMap}
                    focusId={focusId}
                    onEdit={(l) => { setEditing(l); setShowQuickAdd(true); }}
                    onDelete={(id) => { if (confirm("Delete this entry?")) deleteLog.mutate(id); }}
                    onToggleNotable={(l) => saveLog.mutate({ id: l.id, isNotable: !l.isNotable })}
                  />
                )
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setEditingTemplate({ name: "", defaultCategory: "task", defaultEquipmentIds: [], defaultAssetIds: [] })}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New template
            </Button>
          </div>
          {templates.length === 0 ? (
            <Card className="p-8 text-center">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-1">No templates yet.</p>
              <p className="text-xs text-muted-foreground">
                Templates pre-fill the form so a routine day takes one tap (e.g. &quot;Standard onsite — Acme&quot;).
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((t) => (
                <Card key={t.id} className="p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="outline" className={cn("text-[10px]", CATEGORIES[t.defaultCategory]?.color)}>
                        {CATEGORIES[t.defaultCategory]?.label ?? t.defaultCategory}
                      </Badge>
                      {t.defaultPositionId && positionMap.get(t.defaultPositionId) && (
                        <Badge variant="outline" className="text-[10px]">
                          <Briefcase className="h-2.5 w-2.5 mr-1" />
                          {positionMap.get(t.defaultPositionId)!.company}
                        </Badge>
                      )}
                      {t.useCount > 0 && (
                        <span className="text-[10px] text-muted-foreground">used {t.useCount}×</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate(t)}>
                      Use
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingTemplate(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteTemplate.mutate(t.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
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

// ── Day view ────────────────────────────────────────────────────
function DayView({
  date,
  logs,
  positionMap,
  equipmentMap,
  assetMap,
  focusId,
  onEdit,
  onDelete,
  onToggleNotable,
}: {
  date: Date;
  logs: WorkLog[];
  positionMap: Map<string, Position>;
  equipmentMap: Map<string, EquipmentItem>;
  assetMap: Map<string, JobAsset>;
  focusId?: string | null;
  onEdit: (l: WorkLog) => void;
  onDelete: (id: string) => void;
  onToggleNotable: (l: WorkLog) => void;
}) {
  const totalHours = logs.reduce((s, l) => s + (l.hours ?? 0), 0);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold">{dateLabel(date)}</h3>
          <span className="text-xs text-muted-foreground">{logs.length} entr{logs.length === 1 ? "y" : "ies"}</span>
          {totalHours > 0 && <span className="text-xs text-muted-foreground">· {Math.round(totalHours * 10) / 10}h</span>}
        </div>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No entries.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => {
            const cat = CATEGORIES[l.category] ?? CATEGORIES.other;
            const CatIcon = cat.icon;
            const pos = l.positionId ? positionMap.get(l.positionId) : null;
            const isNotable = l.isNotable || l.accomplishment;
            const isFocused = focusId === l.id;
            return (
              <div
                key={l.id}
                id={`worklog-row-${l.id}`}
                className={cn(
                  "group relative flex items-start gap-3 rounded-md border border-input bg-background p-3 transition-colors duration-150",
                  "hover:border-foreground/30 hover:bg-muted/40",
                  "focus-within:ring-2 focus-within:ring-pink-500/40 focus-within:border-pink-500/60",
                  isFocused && "border-yellow-400 ring-2 ring-yellow-300/60 bg-yellow-50/40 dark:bg-yellow-500/5"
                )}
              >
                <div className={cn("h-8 w-8 rounded-md flex items-center justify-center shrink-0", cat.color)}>
                  <CatIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm leading-tight flex items-center gap-1.5 min-w-0">
                      {l.isAutoGenerated && (
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1 gap-0.5 border-sky-400/60 text-sky-700 dark:text-sky-400 shrink-0"
                          title="Auto-logged from a photo or activity. Edit to confirm or expand."
                        >
                          <Sparkles className="h-2.5 w-2.5" /> Auto
                        </Badge>
                      )}
                      <span className="truncate">{l.title}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => onToggleNotable(l)}
                        title={isNotable ? "Unmark notable" : "Mark notable"}
                      >
                        <Star className={cn("h-3.5 w-3.5", isNotable && "fill-yellow-400 text-yellow-400")} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDelete(l.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {l.content && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{l.content}</p>
                  )}
                  {l.photos && l.photos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {l.photos.slice(0, 6).map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={p.id}
                          src={p.filePath}
                          alt={p.caption ?? ""}
                          title={p.caption ?? undefined}
                          className="h-14 w-14 rounded-md object-cover border"
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {isNotable && (
                      <Badge variant="outline" className="text-[10px] border-yellow-400/60 text-yellow-700 dark:text-yellow-400">
                        <Star className="h-2.5 w-2.5 mr-1 fill-current" /> Notable
                      </Badge>
                    )}
                    {pos && (
                      <Badge variant="outline" className="text-[10px]">
                        <Briefcase className="h-2.5 w-2.5 mr-1" /> {pos.company}
                      </Badge>
                    )}
                    {l.hours != null && l.hours > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {Math.round(l.hours * 10) / 10}h
                      </Badge>
                    )}
                    {l.mood && (() => {
                      const m = MOODS.find((x) => x.value === l.mood);
                      const Icon = m?.icon ?? Meh;
                      return (
                        <span title={m?.label} className={cn("inline-flex", m?.color)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      );
                    })()}
                    {l.equipmentIds.slice(0, 3).map((id) => {
                      const e = equipmentMap.get(id);
                      if (!e) return null;
                      return (
                        <Badge key={id} variant="outline" className="text-[10px]">
                          <Wrench className="h-2.5 w-2.5 mr-1" /> {e.name}
                        </Badge>
                      );
                    })}
                    {l.equipmentIds.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{l.equipmentIds.length - 3} more</span>
                    )}
                    {(l.assetIds ?? []).slice(0, 3).map((id) => {
                      const a = assetMap.get(id);
                      if (!a) return null;
                      const cover = a.photos?.find((p) => p.isCover) ?? a.photos?.[0] ?? null;
                      return (
                        <Badge key={id} variant="outline" className="text-[10px] gap-1 pl-1 pr-2">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover.filePath} alt="" className="h-3.5 w-3.5 rounded-sm object-cover" />
                          ) : (
                            <Cog className="h-2.5 w-2.5" />
                          )}
                          {a.name}
                        </Badge>
                      );
                    })}
                    {(l.assetIds?.length ?? 0) > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{(l.assetIds!.length) - 3} assets</span>
                    )}
                    {l.tags && l.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5).map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Routine-day rollup card (collapses runs of standard days at one position) ──
function RoutineRollup({
  segment,
  positionMap,
  equipmentMap,
  assetMap,
  focusId,
  onEdit,
  onDelete,
  onToggleNotable,
}: {
  segment: { positionId: string; start: Date; end: Date; days: { date: Date; logs: WorkLog[] }[]; totalHours: number };
  positionMap: Map<string, Position>;
  equipmentMap: Map<string, EquipmentItem>;
  assetMap: Map<string, JobAsset>;
  focusId?: string | null;
  onEdit: (l: WorkLog) => void;
  onDelete: (id: string) => void;
  onToggleNotable: (l: WorkLog) => void;
}) {
  const [open, setOpen] = useState(false);
  const pos = positionMap.get(segment.positionId);
  const company = pos?.company ?? "position";
  const dayCount = segment.days.length;
  const sameMonth = segment.start.getMonth() === segment.end.getMonth() && segment.start.getFullYear() === segment.end.getFullYear();
  const range = sameMonth
    ? `${format(segment.start, "MMM d")}–${format(segment.end, "d, yyyy")}`
    : `${format(segment.start, "MMM d")} – ${format(segment.end, "MMM d, yyyy")}`;
  return (
    <Card className="p-0 overflow-hidden border-dashed">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {range}: {dayCount} standard day{dayCount === 1 ? "" : "s"} at {company}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {segment.totalHours > 0 ? `${Math.round(segment.totalHours * 10) / 10}h logged · ` : ""}
              tap to {open ? "collapse" : "expand"}
            </div>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t bg-muted/10 p-3 space-y-3">
          {segment.days.map((d) => (
            <DayView
              key={d.date.toISOString()}
              date={d.date}
              logs={d.logs}
              positionMap={positionMap}
              equipmentMap={equipmentMap}
              assetMap={assetMap}
              focusId={focusId}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleNotable={onToggleNotable}
            />
          ))}
        </div>
      )}
    </Card>
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

