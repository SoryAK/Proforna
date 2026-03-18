"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  BookOpen,
  Clock,
  DollarSign,
  ExternalLink,
  GraduationCap,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Types ── */

interface LearningItem {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  status: string;
  progress: number;
  url: string | null;
  hoursSpent: number;
  cost: number;
  completedAt: string | null;
  skills: string | null;
  notes: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LearningForm {
  title: string;
  provider: string;
  type: string;
  status: string;
  progress: number;
  url: string;
  hoursSpent: number;
  cost: number;
  skills: string[];
  notes: string;
  tags: string[];
}

const EMPTY_FORM: LearningForm = {
  title: "",
  provider: "",
  type: "course",
  status: "not_started",
  progress: 0,
  url: "",
  hoursSpent: 0,
  cost: 0,
  skills: [],
  notes: "",
  tags: [],
};

const TYPES = [
  { value: "course", label: "Course" },
  { value: "certification_prep", label: "Certification Prep" },
  { value: "book", label: "Book" },
  { value: "tutorial", label: "Tutorial" },
  { value: "workshop", label: "Workshop" },
  { value: "bootcamp", label: "Bootcamp" },
];

const STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
];

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Play }> = {
  not_started: { color: "bg-gray-100 text-gray-700", icon: Pause },
  in_progress: { color: "bg-orange-100 text-orange-700", icon: Play },
  completed: { color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  abandoned: { color: "bg-red-100 text-red-700", icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TYPES.map((t) => [t.value, t.label])
);

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUSES.map((s) => [s.value, s.label])
);

function parseJson<T>(val: string | null, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

/* ── Component ── */

export default function LearningTracker() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LearningForm>(EMPTY_FORM);
  const [skillInput, setSkillInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery<LearningItem[]>({
    queryKey: ["learning"],
    queryFn: () => fetch("/api/learning").then((r) => r.json()),
  });

  const save = useMutation({
    mutationFn: (data: LearningForm) => {
      const url = editingId ? `/api/learning/${editingId}` : "/api/learning";
      return fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to save");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning"] });
      toast.success(editingId ? "Updated" : "Created");
      closeDialog();
    },
    onError: () => toast.error("Failed to save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/learning/${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Failed to delete");
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning"] });
      toast.success("Deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSkillInput("");
    setTagInput("");
    setDialogOpen(true);
  }

  function openEdit(item: LearningItem) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      provider: item.provider || "",
      type: item.type,
      status: item.status,
      progress: item.progress,
      url: item.url || "",
      hoursSpent: item.hoursSpent,
      cost: item.cost,
      skills: parseJson<string[]>(item.skills, []),
      notes: item.notes || "",
      tags: parseJson<string[]>(item.tags, []),
    });
    setSkillInput("");
    setTagInput("");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function addSkill() {
    const s = skillInput.trim();
    if (s && !form.skills.includes(s)) {
      setForm((f) => ({ ...f, skills: [...f.skills, s] }));
    }
    setSkillInput("");
  }

  function removeSkill(s: string) {
    setForm((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }));
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput("");
  }

  function removeTag(t: string) {
    setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }));
  }

  const filtered =
    filter === "all" ? items : items.filter((i) => i.status === filter);

  // Stats
  const total = items.length;
  const inProgress = items.filter((i) => i.status === "in_progress").length;
  const completed = items.filter((i) => i.status === "completed").length;
  const totalHours = items.reduce((s, i) => s + i.hoursSpent, 0);
  const totalCost = items.reduce((s, i) => s + i.cost, 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Stats Banner ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground">Total Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{inProgress}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{completed}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Hours Invested</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">${totalCost.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Total Cost</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Header / Filter ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v ?? "all")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Learning
        </Button>
      </div>

      {/* ── Cards Grid ── */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">No learning items yet.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add your first
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const skills = parseJson<string[]>(item.skills, []);
            const tags = parseJson<string[]>(item.tags, []);
            const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.not_started;
            const Icon = cfg.icon;
            return (
              <Card key={item.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base leading-tight truncate">
                        {item.title}
                      </CardTitle>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[item.type] || item.type}
                        </Badge>
                        <Badge className={`text-xs ${cfg.color}`}>
                          <Icon className="mr-1 h-3 w-3" />
                          {STATUS_LABELS[item.status] || item.status}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="shrink-0 rounded p-1 hover:bg-muted">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(item)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => remove.mutate(item.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                  {/* Progress bar */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{item.progress}%</span>
                    </div>
                    <Progress value={item.progress} className="h-2" />
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {item.provider && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" /> {item.provider}
                      </span>
                    )}
                    {item.hoursSpent > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {item.hoursSpent}h
                      </span>
                    )}
                    {item.cost > 0 && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> ${item.cost}
                      </span>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-orange-500 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Link
                      </a>
                    )}
                  </div>

                  {/* Skills */}
                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {skills.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Notes preview */}
                  {item.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.notes}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="mt-auto pt-2 text-xs text-muted-foreground">
                    {item.completedAt
                      ? `Completed ${format(new Date(item.completedAt), "MMM d, yyyy")}`
                      : `Updated ${format(new Date(item.updatedAt), "MMM d, yyyy")}`}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Learning Item</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            {/* Title */}
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. AWS Solutions Architect Course"
              />
            </div>

            {/* Provider + Type row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Provider</Label>
                <Input
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                  placeholder="Coursera, Udemy..."
                />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? "course" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status + Progress row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "not_started" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Progress ({form.progress}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.progress}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, progress: Number(e.target.value) }))
                  }
                  className="w-full accent-primary"
                />
              </div>
            </div>

            {/* URL */}
            <div className="space-y-1">
              <Label>URL</Label>
              <Input
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>

            {/* Hours + Cost row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Hours Spent</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.hoursSpent || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hoursSpent: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Cost ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.cost || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cost: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            {/* Skills */}
            <div className="space-y-1">
              <Label>Skills Developed</Label>
              <div className="flex gap-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  placeholder="Add a skill..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addSkill}>
                  Add
                </Button>
              </div>
              {form.skills.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {form.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="cursor-pointer" onClick={() => removeSkill(s)}>
                      {s} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="space-y-1">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>
                  Add
                </Button>
              </div>
              {form.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {form.tags.map((t) => (
                    <Badge key={t} variant="outline" className="cursor-pointer" onClick={() => removeTag(t)}>
                      {t} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="What you're learning, takeaways..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
