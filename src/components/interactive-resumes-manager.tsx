"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Globe,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  BarChart3,
  GripVertical,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface SectionConfig {
  type: string;
  visible: boolean;
  order: number;
  settings?: Record<string, unknown>;
}

interface InteractiveResume {
  id: string;
  slug: string;
  title: string;
  targetRole: string | null;
  summary: string | null;
  theme: string;
  isPublished: boolean;
  sections: string | null;
  customContent: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { views: number };
}

interface ViewAnalytics {
  totalViews: number;
  viewsByDay: { date: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  recentViews: { id: string; createdAt: string; referrer: string | null; userAgent: string | null }[];
}

const DEFAULT_SECTIONS: SectionConfig[] = [
  { type: "summary", visible: true, order: 0 },
  { type: "experience", visible: true, order: 1 },
  { type: "skills", visible: true, order: 2 },
  { type: "certifications", visible: true, order: 3 },
  { type: "contact", visible: true, order: 4 },
];

const SECTION_LABELS: Record<string, string> = {
  summary: "Summary",
  experience: "Experience",
  skills: "Skills",
  certifications: "Certifications",
  contact: "Contact Info",
};

const THEMES = [
  { value: "modern", label: "Modern" },
  { value: "minimal", label: "Minimal" },
  { value: "classic", label: "Classic" },
];

const emptyForm = {
  title: "",
  targetRole: "",
  summary: "",
  theme: "modern",
  isPublished: false,
  sections: DEFAULT_SECTIONS,
};

export default function InteractiveResumesManager() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const { data: resumes = [], isLoading } = useQuery<InteractiveResume[]>({
    queryKey: ["interactive-resumes"],
    queryFn: () => fetch("/api/interactive-resumes").then((r) => r.json()),
  });

  const { data: analytics } = useQuery<ViewAnalytics>({
    queryKey: ["interactive-resume-views", analyticsId],
    queryFn: () =>
      fetch(`/api/interactive-resumes/${analyticsId}/views`).then((r) =>
        r.json()
      ),
    enabled: !!analyticsId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingId
        ? `/api/interactive-resumes/${editingId}`
        : "/api/interactive-resumes";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interactive-resumes"] });
      toast.success(editingId ? "Resume updated" : "Resume created");
      closeDialog();
    },
    onError: () => toast.error("Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/interactive-resumes/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interactive-resumes"] });
      toast.success("Deleted");
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({
      id,
      publish,
    }: {
      id: string;
      publish: boolean;
    }) => {
      const res = await fetch(`/api/interactive-resumes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: publish }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["interactive-resumes"] });
      toast.success(vars.publish ? "Published!" : "Unpublished");
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openEdit(r: InteractiveResume) {
    setEditingId(r.id);
    const sections: SectionConfig[] = r.sections
      ? JSON.parse(r.sections)
      : DEFAULT_SECTIONS;
    setForm({
      title: r.title,
      targetRole: r.targetRole || "",
      summary: r.summary || "",
      theme: r.theme,
      isPublished: r.isPublished,
      sections,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate({
      title: form.title,
      targetRole: form.targetRole || null,
      summary: form.summary || null,
      theme: form.theme,
      isPublished: form.isPublished,
      sections: JSON.stringify(form.sections),
    });
  }

  function toggleSectionVisibility(idx: number) {
    const next = [...form.sections];
    next[idx] = { ...next[idx], visible: !next[idx].visible };
    setForm({ ...form, sections: next });
  }

  function updateSectionSetting(idx: number, key: string, value: unknown) {
    const next = [...form.sections];
    next[idx] = {
      ...next[idx],
      settings: { ...(next[idx].settings || {}), [key]: value },
    };
    setForm({ ...form, sections: next });
  }

  function moveSection(idx: number, direction: -1 | 1) {
    const next = [...form.sections];
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    // Re-assign order values
    next.forEach((s, i) => (s.order = i));
    setForm({ ...form, sections: next });
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/r/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  }

  function openAnalytics(id: string) {
    setAnalyticsId(id);
    setAnalyticsOpen(true);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {resumes.length} interactive resume{resumes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" /> New Interactive Resume
        </Button>
      </div>

      {resumes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Globe className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No Interactive Resumes Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a shareable, living resume that pulls your latest skills,
              experience, and certifications.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Your First
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {resumes.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="h-5 w-5 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">
                        {r.title}
                      </CardTitle>
                      {r.targetRole && (
                        <p className="text-xs text-muted-foreground truncate">
                          {r.targetRole}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      className={
                        r.isPublished
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }
                    >
                      {r.isPublished ? "Live" : "Draft"}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(r)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            togglePublish.mutate({
                              id: r.id,
                              publish: !r.isPublished,
                            })
                          }
                        >
                          {r.isPublished ? (
                            <>
                              <EyeOff className="mr-2 h-4 w-4" /> Unpublish
                            </>
                          ) : (
                            <>
                              <Eye className="mr-2 h-4 w-4" /> Publish
                            </>
                          )}
                        </DropdownMenuItem>
                        {r.isPublished && (
                          <DropdownMenuItem onClick={() => copyLink(r.slug)}>
                            <Copy className="mr-2 h-4 w-4" /> Copy Link
                          </DropdownMenuItem>
                        )}
                        {r.isPublished && (
                          <DropdownMenuItem
                            onClick={() =>
                              window.open(`/r/${r.slug}`, "_blank")
                            }
                          >
                            <ExternalLink className="mr-2 h-4 w-4" /> Preview
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openAnalytics(r.id)}>
                          <BarChart3 className="mr-2 h-4 w-4" /> Analytics
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteMutation.mutate(r.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {r._count.views} view{r._count.views !== 1 ? "s" : ""}
                  </span>
                  <span>
                    Updated {format(new Date(r.updatedAt), "MMM d, yyyy")}
                  </span>
                </div>
                {r.isPublished && (
                  <div className="mt-2">
                    <button
                      onClick={() => copyLink(r.slug)}
                      className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1 truncate"
                    >
                      <Copy className="h-3 w-3 shrink-0" />
                      <span className="truncate">/r/{r.slug}</span>
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Interactive Resume" : "New Interactive Resume"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Senior Full-Stack Engineer Resume"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Role</Label>
                <Input
                  value={form.targetRole}
                  onChange={(e) =>
                    setForm({ ...form, targetRole: e.target.value })
                  }
                  placeholder="e.g. Full-Stack Developer"
                />
              </div>
              <div>
                <Label>Theme</Label>
                <Select
                  value={form.theme}
                  onValueChange={(v) => setForm({ ...form, theme: v ?? "modern" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEMES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Summary</Label>
              <Textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="A brief introduction that appears at the top of your interactive resume..."
                rows={3}
              />
            </div>

            {/* Section Editor */}
            <div>
              <Label className="mb-2 block">Sections</Label>
              <div className="rounded-lg border divide-y">
                {form.sections
                  .sort((a, b) => a.order - b.order)
                  .map((section, idx) => (
                    <div
                      key={section.type}
                      className="px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveSection(idx, -1)}
                            disabled={idx === 0}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <ChevronDown className="h-3 w-3 rotate-180" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(idx, 1)}
                            disabled={idx === form.sections.length - 1}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                        <GripVertical className="h-4 w-4 text-gray-300" />
                        <span className="flex-1 text-sm">
                          {SECTION_LABELS[section.type] || section.type}
                        </span>
                        <Switch
                          checked={section.visible}
                          onCheckedChange={() => toggleSectionVisibility(idx)}
                        />
                      </div>
                      {section.type === "experience" && section.visible && (
                        <div className="mt-2 ml-10 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">View:</span>
                          <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                            {([
                              { v: "both", l: "Map + List" },
                              { v: "map", l: "Map only" },
                              { v: "list", l: "List only" },
                            ] as const).map((opt) => {
                              const current =
                                (section.settings?.experienceView as string) || "both";
                              const active = current === opt.v;
                              return (
                                <button
                                  key={opt.v}
                                  type="button"
                                  onClick={() =>
                                    updateSectionSetting(idx, "experienceView", opt.v)
                                  }
                                  className={`px-2 py-1 text-xs rounded ${
                                    active
                                      ? "bg-background text-indigo-600 shadow-sm"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {opt.l}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.isPublished}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isPublished: checked })
                }
              />
              <Label>Publish immediately</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? "Saving..."
                  : editingId
                    ? "Update"
                    : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Analytics Dialog */}
      <Dialog
        open={analyticsOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAnalyticsOpen(false);
            setAnalyticsId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>View Analytics</DialogTitle>
          </DialogHeader>
          {analytics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold">{analytics.totalViews}</p>
                    <p className="text-xs text-muted-foreground">Total Views</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold">
                      {analytics.topReferrers.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Unique Sources
                    </p>
                  </CardContent>
                </Card>
              </div>

              {analytics.viewsByDay.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Views Over Time
                  </h4>
                  <div className="flex items-end gap-1 h-24">
                    {analytics.viewsByDay.slice(-14).map((day) => {
                      const max = Math.max(
                        ...analytics.viewsByDay.map((d) => d.count)
                      );
                      return (
                        <div
                          key={day.date}
                          className="flex-1 bg-indigo-500 rounded-t min-h-[2px]"
                          style={{
                            height: `${(day.count / max) * 100}%`,
                          }}
                          title={`${day.date}: ${day.count} views`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>
                      {analytics.viewsByDay.slice(-14)[0]?.date}
                    </span>
                    <span>
                      {
                        analytics.viewsByDay[
                          analytics.viewsByDay.length - 1
                        ]?.date
                      }
                    </span>
                  </div>
                </div>
              )}

              {analytics.topReferrers.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Top Referrers</h4>
                  <div className="space-y-1">
                    {analytics.topReferrers.map((ref) => (
                      <div
                        key={ref.referrer}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-muted-foreground truncate">
                          {ref.referrer}
                        </span>
                        <span className="font-medium">{ref.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analytics.totalViews === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No views yet. Share your resume link to start tracking!
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-24" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
