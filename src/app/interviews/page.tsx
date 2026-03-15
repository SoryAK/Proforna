"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, MoreHorizontal, Pencil, Trash2, CalendarDays, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  INTERVIEW_TYPES,
  INTERVIEW_STATUSES,
  type InterviewType,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Interview {
  id: string;
  jobApplicationId: string;
  type: string;
  scheduledAt: string;
  durationMinutes: number | null;
  location?: string | null;
  interviewerName?: string | null;
  interviewerRole?: string | null;
  notes?: string | null;
  status: string;
  rating?: number | null;
  createdAt: string;
  jobApplication: { id: string; company: string; role: string };
}

interface Application {
  id: string;
  company: string;
  role: string;
}

const emptyForm = {
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

const statusStyle: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function InterviewsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: interviews = [], isLoading } = useQuery<Interview[]>({
    queryKey: ["interviews"],
    queryFn: () => fetch("/api/interviews").then((r) => r.json()),
  });

  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => fetch("/api/applications").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingId ? `/api/interviews/${editingId}` : "/api/interviews";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      toast.success(editingId ? "Interview updated" : "Interview scheduled");
      closeDialog();
    },
    onError: () => toast.error("Failed to save interview"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/interviews/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      toast.success("Interview deleted");
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openEdit(item: Interview) {
    setEditingId(item.id);
    setForm({
      jobApplicationId: item.jobApplicationId,
      type: item.type,
      scheduledAt: item.scheduledAt ? item.scheduledAt.slice(0, 16) : "",
      durationMinutes: item.durationMinutes?.toString() || "60",
      location: item.location || "",
      interviewerName: item.interviewerName || "",
      interviewerRole: item.interviewerRole || "",
      notes: item.notes || "",
      status: item.status,
      rating: item.rating?.toString() || "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      jobApplicationId: form.jobApplicationId,
      type: form.type,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : 60,
      location: form.location || null,
      interviewerName: form.interviewerName || null,
      interviewerRole: form.interviewerRole || null,
      notes: form.notes || null,
      status: form.status,
      rating: form.rating ? parseInt(form.rating) : null,
    };
    saveMutation.mutate(data);
  }

  const upcoming = interviews
    .filter((i) => i.status === "scheduled" && new Date(i.scheduledAt) >= new Date())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold">Interviews</h1>
          <p className="text-sm text-muted-foreground">
            {interviews.length} total &middot; {upcoming.length} upcoming
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Schedule Interview
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Upcoming cards */}
        {upcoming.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Upcoming</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((item) => (
                <Card key={item.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold">
                          {item.jobApplication.company}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">{item.jobApplication.role}</p>
                      </div>
                      <Badge className="capitalize text-xs">{item.type}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {format(new Date(item.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {item.durationMinutes} min
                      {item.location && ` · ${item.location}`}
                    </div>
                    {item.interviewerName && (
                      <p className="text-xs text-muted-foreground">
                        with {item.interviewerName}
                        {item.interviewerRole && ` (${item.interviewerRole})`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* All interviews table */}
        <div>
          <h2 className="text-lg font-semibold mb-3">All Interviews</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No interviews yet
                    </TableCell>
                  </TableRow>
                ) : (
                  interviews.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.jobApplication.company}</TableCell>
                      <TableCell>{item.jobApplication.role}</TableCell>
                      <TableCell className="capitalize">{item.type}</TableCell>
                      <TableCell>{format(new Date(item.scheduledAt), "MMM d, yyyy h:mm a")}</TableCell>
                      <TableCell>
                        <Badge className={cn("text-xs capitalize", statusStyle[item.status])}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.rating ? `${item.rating}/5` : "—"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent">
                              <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(item)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(item.id)} className="text-red-600">
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
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Interview" : "Schedule Interview"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Application *</Label>
              <Select value={form.jobApplicationId} onValueChange={(v) => setForm({ ...form, jobApplicationId: v ?? form.jobApplicationId })}>
                <SelectTrigger><SelectValue placeholder="Select application" /></SelectTrigger>
                <SelectContent>
                  {applications.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.company} — {a.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? form.type })}>
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
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v ?? form.status })}>
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
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                />
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Zoom link or address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Interviewer Name</Label>
                <Input
                  value={form.interviewerName}
                  onChange={(e) => setForm({ ...form, interviewerName: e.target.value })}
                />
              </div>
              <div>
                <Label>Interviewer Role</Label>
                <Input
                  value={form.interviewerRole}
                  onChange={(e) => setForm({ ...form, interviewerRole: e.target.value })}
                />
              </div>
            </div>
            {form.status === "completed" && (
              <div>
                <Label>Rating (1-5)</Label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={form.rating}
                  onChange={(e) => setForm({ ...form, rating: e.target.value })}
                />
              </div>
            )}
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
                {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Schedule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
