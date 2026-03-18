"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Target,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { GOAL_STATUSES, PRIORITIES, type GoalStatus, type Priority } from "@/lib/constants";
import { cn } from "@/lib/utils";
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

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string | null;
}

interface Goal {
  id: string;
  title: string;
  description?: string | null;
  targetDate?: string | null;
  status: string;
  priority: string;
  createdAt: string;
  milestones: Milestone[];
}

const statusStyle: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  abandoned: "bg-red-100 text-red-700",
};

const statusLabel: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  abandoned: "Abandoned",
};

const priorityStyle: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};

const emptyForm = {
  title: "",
  description: "",
  targetDate: "",
  status: "not_started",
  priority: "medium",
  milestones: [] as { title: string }[],
};

export default function GoalsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [newMilestone, setNewMilestone] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: goals = [], isLoading } = useQuery<Goal[]>({
    queryKey: ["goals"],
    queryFn: () => fetch("/api/goals").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingId ? `/api/goals/${editingId}` : "/api/goals";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success(editingId ? "Goal updated" : "Goal created");
      closeDialog();
    },
    onError: () => toast.error("Failed to save goal"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Goal deleted");
    },
  });

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await fetch(`/api/milestones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed,
          completedAt: completed ? new Date().toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  const addMilestoneMutation = useMutation({
    mutationFn: async ({ goalId, title }: { goalId: string; title: string }) => {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careerGoalId: goalId, title }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Milestone added");
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/milestones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setNewMilestone("");
  }

  function openEdit(g: Goal) {
    setEditingId(g.id);
    setForm({
      title: g.title,
      description: g.description || "",
      targetDate: g.targetDate ? g.targetDate.slice(0, 10) : "",
      status: g.status,
      priority: g.priority,
      milestones: [],
    });
    setDialogOpen(true);
  }

  function addMilestoneToForm() {
    if (!newMilestone.trim()) return;
    setForm({ ...form, milestones: [...form.milestones, { title: newMilestone.trim() }] });
    setNewMilestone("");
  }

  function removeMilestoneFromForm(idx: number) {
    setForm({ ...form, milestones: form.milestones.filter((_, i) => i !== idx) });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      targetDate: form.targetDate ? new Date(form.targetDate).toISOString() : null,
      status: form.status,
      priority: form.priority,
    };
    if (!editingId && form.milestones.length > 0) {
      data.milestones = { create: form.milestones };
    }
    saveMutation.mutate(data);
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  function milestoneProgress(g: Goal) {
    if (g.milestones.length === 0) return 0;
    return Math.round((g.milestones.filter((m) => m.completed).length / g.milestones.length) * 100);
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Career Goals</h1>
          <p className="text-sm text-muted-foreground">
            {goals.length} goals &middot;{" "}
            {goals.filter((g) => g.status === "completed").length} completed
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Goal
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {goals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No goals set yet</div>
        ) : (
          goals.map((g) => {
            const isExpanded = expanded.has(g.id);
            const progress = milestoneProgress(g);

            return (
              <Card key={g.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div
                      className="flex items-center gap-2 cursor-pointer flex-1"
                      onClick={() => toggleExpand(g.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Target className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-sm">{g.title}</CardTitle>
                        {g.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs", statusStyle[g.status])}>
                        {statusLabel[g.status] || g.status}
                      </Badge>
                      <Badge className={cn("text-xs capitalize", priorityStyle[g.priority])}>
                        {g.priority}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(g)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(g.id)} className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4">
                    <Progress value={progress} className="flex-1 h-2" />
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {g.milestones.filter((m) => m.completed).length}/{g.milestones.length}
                    </span>
                  </div>

                  {g.targetDate && (
                    <p className="text-xs text-muted-foreground">
                      Target: {format(new Date(g.targetDate), "MMM d, yyyy")}
                    </p>
                  )}

                  {isExpanded && (
                    <div className="space-y-2 pt-2 border-t">
                      {g.milestones.map((m) => (
                        <div key={m.id} className="flex items-center justify-between group">
                          <button
                            className="flex items-center gap-2 text-sm"
                            onClick={() =>
                              toggleMilestone.mutate({ id: m.id, completed: !m.completed })
                            }
                          >
                            {m.completed ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className={m.completed ? "line-through text-muted-foreground" : ""}>
                              {m.title}
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={() => deleteMilestoneMutation.mutate(m.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2">
                        <Input
                          placeholder="Add milestone..."
                          className="text-sm h-8"
                          value={newMilestone}
                          onChange={(e) => setNewMilestone(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (newMilestone.trim()) {
                                addMilestoneMutation.mutate({
                                  goalId: g.id,
                                  title: newMilestone.trim(),
                                });
                                setNewMilestone("");
                              }
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            if (newMilestone.trim()) {
                              addMilestoneMutation.mutate({
                                goalId: g.id,
                                title: newMilestone.trim(),
                              });
                              setNewMilestone("");
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Goal" : "New Goal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v ?? form.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GOAL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabel[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v ?? form.priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Date</Label>
                <Input
                  type="date"
                  value={form.targetDate}
                  onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                />
              </div>
            </div>
            {!editingId && (
              <div>
                <Label>Milestones</Label>
                <div className="space-y-2">
                  {form.milestones.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-sm flex-1">{m.title}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeMilestoneFromForm(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add milestone..."
                      value={newMilestone}
                      onChange={(e) => setNewMilestone(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addMilestoneToForm();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addMilestoneToForm}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
