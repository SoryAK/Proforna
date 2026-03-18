"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, MoreHorizontal, Pencil, Trash2, FileText, Check, Star, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import InteractiveResumesManager from "@/components/interactive-resumes-manager";
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
import { Skeleton } from "@/components/ui/skeleton";

interface Resume {
  id: string;
  name: string;
  filePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  targetRole?: string | null;
  notes?: string | null;
  versionNumber: number;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = {
  name: "",
  targetRole: "",
  notes: "",
  versionNumber: "1",
  isActive: false,
};

export default function ResumesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [interactiveOpen, setInteractiveOpen] = useState(true);

  const { data: resumes = [], isLoading } = useQuery<Resume[]>({
    queryKey: ["resumes"],
    queryFn: () => fetch("/api/resumes").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingId ? `/api/resumes/${editingId}` : "/api/resumes";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      toast.success(editingId ? "Resume updated" : "Resume created");
      closeDialog();
    },
    onError: () => toast.error("Failed to save resume"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Resume deleted");
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => {
      // deactivate all then activate one
      for (const r of resumes) {
        if (r.isActive && r.id !== id) {
          await fetch(`/api/resumes/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: false }),
          });
        }
      }
      const res = await fetch(`/api/resumes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Active resume updated");
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openEdit(r: Resume) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      targetRole: r.targetRole || "",
      notes: r.notes || "",
      versionNumber: r.versionNumber.toString(),
      isActive: r.isActive,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      name: form.name,
      targetRole: form.targetRole || null,
      notes: form.notes || null,
      versionNumber: parseInt(form.versionNumber) || 1,
      isActive: form.isActive,
    };
    saveMutation.mutate(data);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  const active = resumes.find((r) => r.isActive);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Resumes</h1>
          <p className="text-sm text-muted-foreground">
            {resumes.length} versions{active && ` · Active: ${active.name}`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Version
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {resumes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No resume versions yet</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {resumes.map((r) => (
              <Card key={r.id} className={r.isActive ? "ring-2 ring-orange-500" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-sm">{r.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">v{r.versionNumber}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {r.isActive && (
                        <Badge className="bg-orange-100 text-orange-700 text-xs">
                          <Check className="mr-1 h-3 w-3" /> Active
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!r.isActive && (
                            <DropdownMenuItem onClick={() => setActiveMutation.mutate(r.id)}>
                              <Star className="mr-2 h-4 w-4" /> Set Active
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openEdit(r)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(r.id)} className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {r.targetRole && (
                    <p className="text-xs text-muted-foreground">
                      Target: {r.targetRole}
                    </p>
                  )}
                  {r.fileName && (
                    <p className="text-xs text-muted-foreground">
                      {r.fileName}{r.fileSize ? ` (${formatSize(r.fileSize)})` : ""}
                    </p>
                  )}
                  {r.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.notes}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {format(new Date(r.createdAt), "MMM d, yyyy")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Resumes Section */}
      <div className="border-t px-4 py-3">
        <button
          onClick={() => setInteractiveOpen(!interactiveOpen)}
          className="flex items-center gap-2 w-full text-left mb-4"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${interactiveOpen ? "rotate-180" : ""}`} />
          <h2 className="text-lg font-semibold">Interactive Resumes</h2>
          <span className="text-xs text-muted-foreground">Shareable living resumes</span>
        </button>
        {interactiveOpen && <InteractiveResumesManager />}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Resume" : "New Resume Version"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Software Engineer Resume"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Role</Label>
                <Input
                  value={form.targetRole}
                  onChange={(e) => setForm({ ...form, targetRole: e.target.value })}
                />
              </div>
              <div>
                <Label>Version Number</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.versionNumber}
                  onChange={(e) => setForm({ ...form, versionNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isActive">Set as active resume</Label>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
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
