"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  Star,
  Clock,
  Filter,
  CalendarDays,
  Trophy,
  Zap,
  Users,
  BookOpen,
  Wrench,
  Phone,
  FolderKanban,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  parseISO,
  isToday,
  isYesterday,
  startOfMonth,
  endOfMonth,
} from "date-fns";

interface WorkLogEntry {
  id: string;
  positionId: string;
  date: string;
  title: string;
  content: string | null;
  category: string;
  hours: number | null;
  tags: string | null;
  accomplishment: boolean;
  impact: string | null;
  createdAt: string;
}

const CATEGORIES: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  task: {
    label: "Task",
    icon: ClipboardList,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  project: {
    label: "Project",
    icon: FolderKanban,
    color:
      "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  meeting: {
    label: "Meeting",
    icon: Users,
    color:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  },
  training: {
    label: "Training",
    icon: BookOpen,
    color:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  administrative: {
    label: "Admin",
    icon: FolderKanban,
    color: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  "on-call": {
    label: "On-Call",
    icon: Phone,
    color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  other: {
    label: "Other",
    icon: MoreHorizontal,
    color: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
  },
};

const IMPACT_LABELS: Record<string, { label: string; color: string }> = {
  low: {
    label: "Low",
    color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  medium: {
    label: "Medium",
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
  },
  high: {
    label: "High",
    color:
      "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400",
  },
  critical: {
    label: "Critical",
    color: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  },
};

const emptyForm = {
  date: format(new Date(), "yyyy-MM-dd"),
  title: "",
  content: "",
  category: "task",
  hours: "",
  tags: "",
  accomplishment: false,
  impact: "",
};

export function WorkLogTracker({ positionId }: { positionId: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkLogEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<string>("all");
  const [showAccomplishments, setShowAccomplishments] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const { data: logs = [] } = useQuery<WorkLogEntry[]>({
    queryKey: ["work-logs", positionId, showAccomplishments],
    queryFn: () => {
      const params = new URLSearchParams({ positionId });
      if (showAccomplishments) params.set("accomplishments", "true");
      return fetch(`/api/work-logs?${params}`).then((r) => r.json());
    },
  });

  const save = useMutation({
    mutationFn: async (payload: typeof form) => {
      const url = editing ? `/api/work-logs/${editing.id}` : "/api/work-logs";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId, ...payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-logs", positionId] });
      toast.success(editing ? "Entry updated" : "Entry logged");
      closeDialog();
    },
    onError: (e) => toast.error(String(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/work-logs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-logs", positionId] });
      toast.success("Entry removed");
    },
    onError: (e) => toast.error(String(e)),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (entry: WorkLogEntry) => {
    setEditing(entry);
    setForm({
      date: entry.date.split("T")[0],
      title: entry.title,
      content: entry.content ?? "",
      category: entry.category,
      hours: entry.hours?.toString() ?? "",
      tags: entry.tags ?? "",
      accomplishment: entry.accomplishment,
      impact: entry.impact ?? "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const upd = (field: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  // Filter by category
  const filtered = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((l) => l.category === filter);
  }, [logs, filter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, WorkLogEntry[]> = {};
    for (const log of filtered) {
      const day = log.date.split("T")[0];
      if (!groups[day]) groups[day] = [];
      groups[day].push(log);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  // Stats
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const weekLogs = logs.filter((l) =>
    isWithinInterval(parseISO(l.date), { start: weekStart, end: weekEnd })
  );
  const monthLogs = logs.filter((l) =>
    isWithinInterval(parseISO(l.date), { start: monthStart, end: monthEnd })
  );

  const weekHours = weekLogs.reduce((s, l) => s + (l.hours ?? 0), 0);
  const monthHours = monthLogs.reduce((s, l) => s + (l.hours ?? 0), 0);
  const totalAccomplishments = logs.filter((l) => l.accomplishment).length;

  const toggleDay = (day: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const dayLabel = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEEE, MMM d");
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
              Work Log
            </CardTitle>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" /> Log Entry
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stats row */}
          <div className="flex flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-muted-foreground">This week:</span>
              <span className="font-semibold">{weekHours.toFixed(1)}h</span>
              <span className="text-muted-foreground">
                ({weekLogs.length} entries)
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-muted-foreground">This month:</span>
              <span className="font-semibold">{monthHours.toFixed(1)}h</span>
            </div>
            {totalAccomplishments > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                <span className="font-semibold">{totalAccomplishments}</span>
                <span className="text-muted-foreground">accomplishments</span>
              </div>
            )}
          </div>

          {/* Filters */}
          {logs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === "all"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({logs.length})
              </button>
              {Object.entries(CATEGORIES).map(([key, { label }]) => {
                const count = logs.filter((l) => l.category === key).length;
                if (count === 0) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      filter === key
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                <label className="text-xs text-muted-foreground cursor-pointer">
                  Accomplishments only
                </label>
                <Switch
                  checked={showAccomplishments}
                  onCheckedChange={setShowAccomplishments}
                />
              </div>
            </div>
          )}

          {/* Timeline */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No work log entries yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Track tasks, accomplishments, meetings, and hours
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(([day, entries]) => {
                const collapsed = collapsedDays.has(day);
                const dayHours = entries.reduce(
                  (s, e) => s + (e.hours ?? 0),
                  0
                );
                const dayAccomplishments = entries.filter(
                  (e) => e.accomplishment
                ).length;

                return (
                  <div key={day}>
                    {/* Day header */}
                    <button
                      type="button"
                      onClick={() => toggleDay(day)}
                      className="flex items-center gap-2 w-full text-left mb-1.5 group"
                    >
                      {collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-xs font-semibold">
                        {dayLabel(day)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {entries.length} {entries.length === 1 ? "entry" : "entries"}
                        {dayHours > 0 && ` · ${dayHours.toFixed(1)}h`}
                      </span>
                      {dayAccomplishments > 0 && (
                        <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      )}
                    </button>

                    {/* Entries */}
                    {!collapsed && (
                      <div className="ml-5 space-y-1.5 border-l-2 border-muted pl-3">
                        {entries.map((entry) => {
                          const cat =
                            CATEGORIES[entry.category] ?? CATEGORIES.other;
                          const CatIcon = cat.icon;
                          const impactInfo = entry.impact
                            ? IMPACT_LABELS[entry.impact]
                            : null;
                          const tags = entry.tags
                            ? entry.tags
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean)
                            : [];

                          return (
                            <div
                              key={entry.id}
                              className="flex items-start gap-2.5 group rounded-md p-2 hover:bg-muted/40 transition-colors"
                            >
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${cat.color
                                  .split(" ")
                                  .slice(0, 1)
                                  .join(" ")}`}
                              >
                                <CatIcon
                                  className={`h-3.5 w-3.5 ${cat.color.split(" ").slice(1, 2).join(" ")}`}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium truncate">
                                    {entry.title}
                                  </span>
                                  {entry.accomplishment && (
                                    <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                                  )}
                                  {impactInfo && (
                                    <Badge
                                      className={`${impactInfo.color} text-[9px] px-1 py-0`}
                                    >
                                      {impactInfo.label}
                                    </Badge>
                                  )}
                                </div>
                                {entry.content && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">
                                    {entry.content}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1.5 py-0"
                                  >
                                    {cat.label}
                                  </Badge>
                                  {entry.hours && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <Clock className="h-2.5 w-2.5" />
                                      {entry.hours}h
                                    </span>
                                  )}
                                  {tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0 rounded"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => openEdit(entry)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-red-600"
                                  onClick={() => remove.mutate(entry.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Log Entry" : "Log Work Entry"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Row 1: Date + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => upd("date", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => upd("category", v ?? "task")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(
                      ([key, { label, icon: Icon, color }]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <Icon
                              className={`h-3.5 w-3.5 ${color.split(" ").slice(1, 2).join(" ")}`}
                            />
                            {label}
                          </span>
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Title */}
            <div>
              <Label className="text-xs">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => upd("title", e.target.value)}
                placeholder="What did you work on?"
              />
            </div>

            {/* Content */}
            <div>
              <Label className="text-xs">Details</Label>
              <Textarea
                value={form.content}
                onChange={(e) => upd("content", e.target.value)}
                rows={3}
                placeholder="Describe what you did, decisions made, outcomes..."
              />
            </div>

            {/* Row: Hours + Impact */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Hours</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  max="24"
                  value={form.hours}
                  onChange={(e) => upd("hours", e.target.value)}
                  placeholder="2.5"
                />
              </div>
              <div>
                <Label className="text-xs">Impact</Label>
                <Select
                  value={form.impact || "none"}
                  onValueChange={(v) =>
                    upd("impact", v === "none" ? "" : (v ?? ""))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => upd("tags", e.target.value)}
                placeholder="deployment, bug-fix, documentation"
              />
            </div>

            {/* Accomplishment toggle */}
            <div className="flex items-center gap-2 rounded-md border p-2.5">
              <Star className="h-4 w-4 text-amber-500" />
              <div className="flex-1">
                <p className="text-xs font-medium">Mark as accomplishment</p>
                <p className="text-[10px] text-muted-foreground">
                  Highlights this for performance reviews and resume bullets
                </p>
              </div>
              <Switch
                checked={form.accomplishment}
                onCheckedChange={(v) => upd("accomplishment", v)}
              />
            </div>

            <Button
              className="w-full"
              onClick={() => save.mutate(form)}
              disabled={!form.title || !form.date || save.isPending}
            >
              {editing ? "Update Entry" : "Log Entry"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
