"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus,
  LayoutGrid,
  List,
  MoreHorizontal,
  ExternalLink,
  Pencil,
  Trash2,
  GripVertical,
  Download,
  CalendarDays,
  Clock,
  Mail,
  FileText as FileTextIcon,
  Link2,
  BookOpen,
  Briefcase,
  CheckSquare,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  JOB_TYPES,
  INTERVIEW_TYPES,
  INTERVIEW_STATUSES,
  type ApplicationStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { OfferComparison } from "@/components/offer-comparison";
import { InterviewPrepDialog } from "@/components/interview-prep";
import { Scale } from "lucide-react";

interface InterviewDetail {
  id: string;
  type: string;
  scheduledAt: string;
  durationMinutes: number | null;
  location?: string | null;
  interviewerName?: string | null;
  interviewerRole?: string | null;
  notes?: string | null;
  status: string;
  rating?: number | null;
  prepNotes?: string | null;
  questions?: string | null;
  reflection?: string | null;
  reflectionRating?: number | null;
}

interface Application {
  id: string;
  company: string;
  role: string;
  url?: string | null;
  location?: string | null;
  type: string;
  status: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency: string;
  appliedDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  interviews: InterviewDetail[];
  resumeVersionId?: string | null;
  resumeVersion?: { id: string; name: string; targetRole: string | null } | null;
  _count?: { linkedEmails: number };
  // Offer details
  offerPayType: string | null;
  offerPayRate: string | null;
  offerSalary: number | null;
  offerPayFrequency: string | null;
  offerHoursPerWeek: number | null;
  offerOtHours: number | null;
  offerOtRate: number | null;
  offerSigningBonus: number | null;
  offerAnnualBonus: number | null;
  offerEquity: string | null;
  offer401kMatch: number | null;
  offerPtoDays: number | null;
  offerHealthCost: number | null;
  offerNotes: string | null;
}

const emptyForm = {
  company: "",
  role: "",
  url: "",
  location: "",
  type: "remote",
  status: "wishlist",
  salaryMin: "",
  salaryMax: "",
  currency: "USD",
  appliedDate: "",
  notes: "",
  resumeVersionId: "",
};

const emptyInterviewForm = {
  jobApplicationId: "",
  type: "phone",
  scheduledAt: "",
  durationMinutes: "60",
  location: "",
  interviewerName: "",
  interviewerRole: "",
  notes: "",
  status: "scheduled",
  rating: "",
};

const interviewStatusStyle: Record<string, string> = {
  scheduled: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function ApplicationsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  // Interview dialog state
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [interviewForm, setInterviewForm] = useState(emptyInterviewForm);

  // Expanded row for table view
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);

  // Offer comparison dialog
  const [compareApp, setCompareApp] = useState<Application | null>(null);

  // Interview prep dialog
  const [prepInterview, setPrepInterview] = useState<{ interview: InterviewDetail; company: string; role: string } | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: applications = [], isLoading } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => fetch("/api/applications").then((r) => r.json()),
  });

  interface ResumeOption { id: string; name: string; targetRole: string | null; isActive: boolean }
  const { data: resumes = [] } = useQuery<ResumeOption[]>({
    queryKey: ["resumes"],
    queryFn: () => fetch("/api/resumes").then((r) => r.json()),
  });

  /* ── Application mutations ── */

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingId ? `/api/applications/${editingId}` : "/api/applications";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success(editingId ? "Application updated" : "Application created");
      closeDialog();
    },
    onError: () => toast.error("Failed to save application"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/applications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Application deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      if (data.createdPositionId) {
        queryClient.invalidateQueries({ queryKey: ["current-position"] });
        toast.success("Position created from accepted offer!", {
          action: {
            label: "View Position",
            onClick: () => router.push("/current-position"),
          },
        });
      }
    },
  });

  const linkEmailsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/emails/link", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ linked: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success(`Linked ${data.linked} email${data.linked !== 1 ? "s" : ""} to applications`);
    },
    onError: () => toast.error("Failed to link emails"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => fetch(`/api/applications/${id}`, { method: "DELETE" }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success(`Deleted ${selectedIds.size} application${selectedIds.size !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
    },
    onError: () => toast.error("Failed to delete some applications"),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      return await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/applications/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          return res.json();
        })
      );
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      const created = results.filter((r: Record<string, unknown>) => r.createdPositionId);
      if (created.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["current-position"] });
        toast.success(`${created.length} position${created.length !== 1 ? "s" : ""} created from accepted offers!`, {
          action: {
            label: "View Positions",
            onClick: () => router.push("/current-position"),
          },
        });
      } else {
        toast.success(`Updated ${selectedIds.size} application${selectedIds.size !== 1 ? "s" : ""}`);
      }
      setSelectedIds(new Set());
    },
    onError: () => toast.error("Failed to update some applications"),
  });

  /* ── Interview mutations ── */

  const saveInterviewMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingInterviewId
        ? `/api/interviews/${editingInterviewId}`
        : "/api/interviews";
      const res = await fetch(url, {
        method: editingInterviewId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success(editingInterviewId ? "Interview updated" : "Interview scheduled");
      closeInterviewDialog();
    },
    onError: () => toast.error("Failed to save interview"),
  });

  const deleteInterviewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/interviews/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Interview deleted");
    },
    onError: () => toast.error("Failed to delete interview"),
  });

  /* ── Dialog helpers ── */

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openEdit(app: Application) {
    setEditingId(app.id);
    setForm({
      company: app.company,
      role: app.role,
      url: app.url || "",
      location: app.location || "",
      type: app.type,
      status: app.status,
      salaryMin: app.salaryMin?.toString() || "",
      salaryMax: app.salaryMax?.toString() || "",
      currency: app.currency,
      appliedDate: app.appliedDate ? app.appliedDate.slice(0, 10) : "",
      notes: app.notes || "",
      resumeVersionId: app.resumeVersionId || "",
    });
    setDialogOpen(true);
  }

  function closeInterviewDialog() {
    setInterviewDialogOpen(false);
    setEditingInterviewId(null);
    setInterviewForm(emptyInterviewForm);
  }

  function openScheduleInterview(appId: string) {
    setInterviewForm({ ...emptyInterviewForm, jobApplicationId: appId });
    setInterviewDialogOpen(true);
  }

  function openEditInterview(interview: InterviewDetail, appId: string) {
    setEditingInterviewId(interview.id);
    setInterviewForm({
      jobApplicationId: appId,
      type: interview.type,
      scheduledAt: interview.scheduledAt ? interview.scheduledAt.slice(0, 16) : "",
      durationMinutes: interview.durationMinutes?.toString() || "60",
      location: interview.location || "",
      interviewerName: interview.interviewerName || "",
      interviewerRole: interview.interviewerRole || "",
      notes: interview.notes || "",
      status: interview.status,
      rating: interview.rating?.toString() || "",
    });
    setInterviewDialogOpen(true);
  }

  /* ── Form submit handlers ── */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      company: form.company,
      role: form.role,
      url: form.url || null,
      location: form.location || null,
      type: form.type,
      status: form.status,
      salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
      salaryMax: form.salaryMax ? parseInt(form.salaryMax) : null,
      currency: form.currency,
      appliedDate: form.appliedDate ? new Date(form.appliedDate).toISOString() : null,
      notes: form.notes || null,
      resumeVersionId: form.resumeVersionId || null,
    };
    saveMutation.mutate(data);
  }

  function handleInterviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      jobApplicationId: interviewForm.jobApplicationId,
      type: interviewForm.type,
      scheduledAt: new Date(interviewForm.scheduledAt).toISOString(),
      durationMinutes: interviewForm.durationMinutes ? parseInt(interviewForm.durationMinutes) : 60,
      location: interviewForm.location || null,
      interviewerName: interviewForm.interviewerName || null,
      interviewerRole: interviewForm.interviewerRole || null,
      notes: interviewForm.notes || null,
      status: interviewForm.status,
      rating: interviewForm.rating ? parseInt(interviewForm.rating) : null,
    };
    saveInterviewMutation.mutate(data);
  }

  /* ── Derived data ── */

  const filtered = applications.filter(
    (a) =>
      a.company.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = APPLICATION_STATUSES.reduce(
    (acc, status) => {
      acc[status] = filtered.filter((a) => a.status === status);
      return acc;
    },
    {} as Record<ApplicationStatus, Application[]>
  );

  const totalInterviews = applications.reduce((sum, a) => sum + a.interviews.length, 0);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Applications</h1>
          <p className="text-sm text-muted-foreground">
            {applications.length} applications &middot; {totalInterviews} interviews
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search company or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 sm:w-64"
          />
          <Tabs value={view} onValueChange={(v) => setView(v as "kanban" | "table")}>
            <TabsList>
              <TabsTrigger value="kanban">
                <LayoutGrid className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="table">
                <List className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Application
          </Button>
          <Button
            variant="outline"
            onClick={() => linkEmailsMutation.mutate()}
            disabled={linkEmailsMutation.isPending}
          >
            <Link2 className="mr-2 h-4 w-4" /> {linkEmailsMutation.isPending ? "Linking…" : "Link Emails"}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open("/api/export?type=applications", "_blank")}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 border-b bg-orange-50 dark:bg-orange-950/30 px-4 py-2">
          <span className="text-sm font-medium">
            <CheckSquare className="mr-1.5 inline h-4 w-4" />
            {selectedIds.size} selected
          </span>
          <Select
            onValueChange={(v) => {
              const status = typeof v === "string" ? v : null;
              if (status) bulkStatusMutation.mutate({ ids: [...selectedIds], status });
            }}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              {APPLICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
            onClick={() => bulkDeleteMutation.mutate([...selectedIds])}
            disabled={bulkDeleteMutation.isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {view === "kanban" ? (
          <KanbanView
            grouped={grouped}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
            onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
            onScheduleInterview={openScheduleInterview}
            onCompare={setCompareApp}
            onOpenPrep={(iv, app) => setPrepInterview({ interview: iv, company: app.company, role: app.role })}
          />
        ) : (
          <TableView
            applications={filtered}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
            onScheduleInterview={openScheduleInterview}
            onEditInterview={openEditInterview}
            onDeleteInterview={(id) => deleteInterviewMutation.mutate(id)}
            expandedAppId={expandedAppId}
            onToggleExpand={(id) => setExpandedAppId(expandedAppId === id ? null : id)}
            onCompare={setCompareApp}
            onOpenPrep={(iv, app) => setPrepInterview({ interview: iv, company: app.company, role: app.role })}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}
      </div>

      {/* Create/Edit Application Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Application" : "New Application"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Company *</Label>
                <Input
                  required
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div>
                <Label>Role *</Label>
                <Input
                  required
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>URL</Label>
              <Input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? form.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {JOB_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v ?? form.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPLICATION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Applied Date</Label>
                <Input
                  type="date"
                  value={form.appliedDate}
                  onChange={(e) => setForm({ ...form, appliedDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Salary Min</Label>
                <Input
                  type="number"
                  value={form.salaryMin}
                  onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                />
              </div>
              <div>
                <Label>Salary Max</Label>
                <Input
                  type="number"
                  value={form.salaryMax}
                  onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            {resumes.length > 0 && (
              <div>
                <Label>Resume Version</Label>
                {(() => {
                  // Suggest best match based on role overlap
                  const suggested = !form.resumeVersionId && form.role
                    ? resumes.find((r) =>
                        r.targetRole &&
                        form.role.toLowerCase().includes(r.targetRole.toLowerCase().split(/\s+/)[0])
                      ) || resumes.find((r) => r.isActive)
                    : null;
                  return (
                    <>
                      <Select
                        value={form.resumeVersionId || "none"}
                        onValueChange={(v) => setForm({ ...form, resumeVersionId: (v ?? "none") === "none" ? "" : v ?? "" })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select resume..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {resumes.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}{r.targetRole ? ` (${r.targetRole})` : ""}{r.isActive ? " ★" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {suggested && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, resumeVersionId: suggested.id })}
                          className="mt-1 text-xs text-orange-600 hover:underline"
                        >
                          Suggested: {suggested.name}{suggested.targetRole ? ` (${suggested.targetRole})` : ""}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule/Edit Interview Dialog */}
      <Dialog open={interviewDialogOpen} onOpenChange={(open) => !open && closeInterviewDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInterviewId ? "Edit Interview" : "Schedule Interview"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInterviewSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={interviewForm.type} onValueChange={(v) => setInterviewForm({ ...interviewForm, type: v ?? interviewForm.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={interviewForm.status} onValueChange={(v) => setInterviewForm({ ...interviewForm, status: v ?? interviewForm.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date & Time *</Label>
                <Input
                  type="datetime-local"
                  required
                  value={interviewForm.scheduledAt}
                  onChange={(e) => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })}
                />
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={interviewForm.durationMinutes}
                  onChange={(e) => setInterviewForm({ ...interviewForm, durationMinutes: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={interviewForm.location}
                onChange={(e) => setInterviewForm({ ...interviewForm, location: e.target.value })}
                placeholder="Zoom link or address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Interviewer Name</Label>
                <Input
                  value={interviewForm.interviewerName}
                  onChange={(e) => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
                />
              </div>
              <div>
                <Label>Interviewer Role</Label>
                <Input
                  value={interviewForm.interviewerRole}
                  onChange={(e) => setInterviewForm({ ...interviewForm, interviewerRole: e.target.value })}
                />
              </div>
            </div>
            {interviewForm.status === "completed" && (
              <div>
                <Label>Rating (1-5)</Label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={interviewForm.rating}
                  onChange={(e) => setInterviewForm({ ...interviewForm, rating: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={interviewForm.notes}
                onChange={(e) => setInterviewForm({ ...interviewForm, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeInterviewDialog}>Cancel</Button>
              <Button type="submit" disabled={saveInterviewMutation.isPending}>
                {saveInterviewMutation.isPending ? "Saving..." : editingInterviewId ? "Update" : "Schedule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Offer Comparison Dialog */}
      {compareApp && (
        <OfferComparison
          application={compareApp}
          open={!!compareApp}
          onOpenChange={(open) => { if (!open) setCompareApp(null); }}
        />
      )}

      {/* Interview Prep Dialog */}
      {prepInterview && (
        <InterviewPrepDialog
          interview={prepInterview.interview}
          company={prepInterview.company}
          role={prepInterview.role}
          open={!!prepInterview}
          onOpenChange={(open) => { if (!open) setPrepInterview(null); }}
        />
      )}
    </div>
  );
}

/* ─── Kanban View ──────────────────────────────────────────── */

function KanbanView({
  grouped,
  onEdit,
  onDelete,
  onStatusChange,
  onScheduleInterview,
  onCompare,
  onOpenPrep,
}: {
  grouped: Record<ApplicationStatus, Application[]>;
  onEdit: (app: Application) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onScheduleInterview: (appId: string) => void;
  onCompare: (app: Application) => void;
  onOpenPrep: (iv: InterviewDetail, app: Application) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, status: ApplicationStatus) {
    e.preventDefault();
    if (dragId) {
      onStatusChange(dragId, status);
      setDragId(null);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 180px)" }}>
      {APPLICATION_STATUSES.map((status) => (
        <div
          key={status}
          className="flex w-72 min-w-[288px] flex-col rounded-lg bg-gray-50 dark:bg-gray-900"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, status)}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-2">
              <Badge className={cn("text-xs", STATUS_COLORS[status])}>
                {STATUS_LABELS[status]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {grouped[status].length}
              </span>
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {grouped[status].map((app) => (
              <ApplicationCard
                key={app.id}
                app={app}
                onEdit={() => onEdit(app)}
                onDelete={() => onDelete(app.id)}
                onDragStart={(e) => handleDragStart(e, app.id)}
                onScheduleInterview={() => onScheduleInterview(app.id)}
                onCompare={() => onCompare(app)}
                onOpenPrep={(iv) => onOpenPrep(iv, app)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplicationCard({
  app,
  onEdit,
  onDelete,
  onDragStart,
  onScheduleInterview,
  onCompare,
  onOpenPrep,
}: {
  app: Application;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onScheduleInterview: () => void;
  onCompare: () => void;
  onOpenPrep: (iv: InterviewDetail) => void;
}) {
  const nextInterview = app.interviews
    .filter((i) => i.status === "scheduled" && new Date(i.scheduledAt) >= new Date())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  return (
    <Card
      draggable
      onDragStart={onDragStart}
      className="cursor-grab active:cursor-grabbing"
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm leading-tight">{app.company}</p>
              <p className="text-xs text-muted-foreground">{app.role}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {app.url && (
                <DropdownMenuItem onClick={() => window.open(app.url!, '_blank', 'noopener,noreferrer')}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Open URL
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onScheduleInterview}>
                <CalendarDays className="mr-2 h-4 w-4" /> Schedule Interview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCompare}>
                <Scale className="mr-2 h-4 w-4" /> Compare Offer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap gap-1">
          {app.location && (
            <span className="text-xs text-muted-foreground">{app.location}</span>
          )}
          <Badge variant="outline" className="text-xs">
            {app.type}
          </Badge>
        </div>
        {(app.salaryMin || app.salaryMax) && (
          <p className="text-xs text-muted-foreground">
            {app.currency}{" "}
            {app.salaryMin && app.salaryMax
              ? `${(app.salaryMin / 1000).toFixed(0)}k - ${(app.salaryMax / 1000).toFixed(0)}k`
              : app.salaryMin
                ? `${(app.salaryMin / 1000).toFixed(0)}k+`
                : `up to ${(app.salaryMax! / 1000).toFixed(0)}k`}
          </p>
        )}
        {app.appliedDate && (
          <p className="text-xs text-muted-foreground">
            Applied {format(new Date(app.appliedDate), "MMM d, yyyy")}
          </p>
        )}
        {/* Interview info */}
        {app.interviews.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {app.interviews.length} interview{app.interviews.length !== 1 ? "s" : ""}
              </span>
            </div>
          </>
        )}
        {nextInterview && (
          <div
            className="flex items-center gap-1.5 rounded bg-orange-50 dark:bg-orange-950 px-2 py-1 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900 transition-colors"
            onClick={() => onOpenPrep(nextInterview)}
            title="Open interview prep"
          >
            <Clock className="h-3 w-3 text-orange-600" />
            <span className="text-xs text-orange-700 dark:text-orange-300">
              Next: {format(new Date(nextInterview.scheduledAt), "MMM d, h:mm a")}
            </span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
              {nextInterview.type}
            </Badge>
            <BookOpen className="h-3 w-3 text-orange-600 dark:text-orange-400 ml-auto" />
          </div>
        )}
        {/* Email + Resume badges */}
        <div className="flex flex-wrap gap-1.5">
          {(app._count?.linkedEmails ?? 0) > 0 && (
            <div className="flex items-center gap-1 rounded bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5">
              <Mail className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
              <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                {app._count!.linkedEmails} email{app._count!.linkedEmails !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {app.resumeVersion && (
            <div className="flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5">
              <FileTextIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300 truncate max-w-[120px]">
                {app.resumeVersion.name}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Table View ───────────────────────────────────────────── */

function TableView({
  applications,
  onEdit,
  onDelete,
  onScheduleInterview,
  onEditInterview,
  onDeleteInterview,
  onCompare,
  onOpenPrep,
  expandedAppId,
  onToggleExpand,
  selectedIds,
  onSelectionChange,
}: {
  applications: Application[];
  onEdit: (app: Application) => void;
  onDelete: (id: string) => void;
  onScheduleInterview: (appId: string) => void;
  onEditInterview: (interview: InterviewDetail, appId: string) => void;
  onDeleteInterview: (id: string) => void;
  onCompare: (app: Application) => void;
  onOpenPrep: (iv: InterviewDetail, app: Application) => void;
  expandedAppId: string | null;
  onToggleExpand: (id: string) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}) {
  const allSelected = applications.length > 0 && applications.every((a) => selectedIds.has(a.id));
  const someSelected = applications.some((a) => selectedIds.has(a.id));

  function toggleAll() {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(applications.map((a) => a.id)));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Salary</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Interviews</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-[300px] text-center">
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-full">
                    <Briefcase className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <p className="font-semibold">No applications yet</p>
                  <p className="text-sm text-muted-foreground flex flex-col gap-1 items-center max-w-[280px]">
                    <span>Track the jobs you've applied for to monitor your progress.</span>
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            applications.map((app) => (
              <>
                <TableRow
                  key={app.id}
                  className={cn(expandedAppId === app.id && "border-b-0 bg-muted/30")}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(app.id)}
                      onCheckedChange={() => toggleOne(app.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{app.company}</TableCell>
                  <TableCell>{app.role}</TableCell>
                  <TableCell>
                    <Badge className={cn("text-xs", STATUS_COLORS[app.status as ApplicationStatus])}>
                      {STATUS_LABELS[app.status as ApplicationStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{app.type}</TableCell>
                  <TableCell>
                    {app.salaryMin || app.salaryMax
                      ? `${app.currency} ${app.salaryMin ? `${(app.salaryMin / 1000).toFixed(0)}k` : ""} - ${app.salaryMax ? `${(app.salaryMax / 1000).toFixed(0)}k` : ""}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {app.appliedDate ? format(new Date(app.appliedDate), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => onToggleExpand(app.id)}
                      className={cn(
                        "text-xs underline-offset-2 hover:underline",
                        app.interviews.length > 0 ? "text-orange-600 cursor-pointer" : "text-muted-foreground cursor-default"
                      )}
                      disabled={app.interviews.length === 0}
                    >
                      {app.interviews.length} interview{app.interviews.length !== 1 ? "s" : ""}
                    </button>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {app.url && (
                          <DropdownMenuItem onClick={() => window.open(app.url!, '_blank', 'noopener,noreferrer')}>
                            <ExternalLink className="mr-2 h-4 w-4" /> Open URL
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onEdit(app)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onScheduleInterview(app.id)}>
                          <CalendarDays className="mr-2 h-4 w-4" /> Schedule Interview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onCompare(app)}>
                          <Scale className="mr-2 h-4 w-4" /> Compare Offer
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(app.id)} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                {expandedAppId === app.id && app.interviews.length > 0 && (
                  <TableRow key={`${app.id}-interviews`} className="bg-muted/30">
                    <TableCell colSpan={9} className="p-0">
                      <div className="px-6 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Interviews
                          </p>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onScheduleInterview(app.id)}>
                            <Plus className="mr-1 h-3 w-3" /> Add
                          </Button>
                        </div>
                        {app.interviews.map((iv) => (
                          <div
                            key={iv.id}
                            className="flex items-center justify-between rounded-md border bg-background px-3 py-2"
                          >
                            <div className="flex items-center gap-3">
                              <Badge className={cn("text-xs capitalize", interviewStatusStyle[iv.status])}>
                                {iv.status}
                              </Badge>
                              <span className="text-sm capitalize">{iv.type}</span>
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(iv.scheduledAt), "MMM d, yyyy h:mm a")}
                              </span>
                              {iv.durationMinutes && (
                                <span className="text-xs text-muted-foreground">
                                  {iv.durationMinutes} min
                                </span>
                              )}
                              {iv.interviewerName && (
                                <span className="text-xs text-muted-foreground">
                                  with {iv.interviewerName}
                                </span>
                              )}
                              {iv.rating && (
                                <span className="text-xs text-muted-foreground">
                                  {iv.rating}/5
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => onOpenPrep(iv, app)}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent text-orange-600"
                                title="Interview prep"
                              >
                                <BookOpen className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => onEditInterview(iv, app.id)}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => onDeleteInterview(iv.id)}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
