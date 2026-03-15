"use client";

import { useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  JOB_TYPES,
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
  interviews: Array<{ id: string; type: string; scheduledAt: string; status: string }>;
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
};

export default function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const { data: applications = [], isLoading } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => fetch("/api/applications").then((r) => r.json()),
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });

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
    });
    setDialogOpen(true);
  }

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
    };
    saveMutation.mutate(data);
  }

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
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="text-sm text-muted-foreground">
            {applications.length} total applications
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search company or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
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
            onClick={() => window.open("/api/export?type=applications", "_blank")}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {view === "kanban" ? (
          <KanbanView
            grouped={grouped}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
            onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
          />
        ) : (
          <TableView
            applications={filtered}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Application" : "New Application"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-3 gap-4">
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
    </div>
  );
}

/* ─── Kanban View ──────────────────────────────────────────── */

function KanbanView({
  grouped,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  grouped: Record<ApplicationStatus, Application[]>;
  onEdit: (app: Application) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
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
}: {
  app: Application;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
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
      </CardContent>
    </Card>
  );
}

/* ─── Table View ───────────────────────────────────────────── */

function TableView({
  applications,
  onEdit,
  onDelete,
}: {
  applications: Application[];
  onEdit: (app: Application) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
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
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                No applications found
              </TableCell>
            </TableRow>
          ) : (
            applications.map((app) => (
              <TableRow key={app.id}>
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
                <TableCell>{app.interviews.length}</TableCell>
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
                      <DropdownMenuItem onClick={() => onDelete(app.id)} className="text-red-600">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
