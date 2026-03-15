"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Code2,
  User,
  Layers,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Position {
  id: string;
  company: string;
  role: string;
  department: string | null;
  location: string | null;
  type: string;
  startDate: string;
  salary: number | null;
  currency: string;
  description: string | null;
  responsibilities: string | null;
  techStack: string | null;
  managerName: string | null;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = {
  company: "",
  role: "",
  department: "",
  location: "",
  type: "remote",
  startDate: "",
  salary: "",
  currency: "USD",
  description: "",
  responsibilities: "",
  techStack: "",
  managerName: "",
};

export default function CurrentPositionPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: positions = [], isLoading } = useQuery<Position[]>({
    queryKey: ["current-position"],
    queryFn: () => fetch("/api/current-position").then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/current-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      toast.success("Position added!");
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/current-position/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      toast.success("Position updated!");
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/current-position/${id}`, { method: "DELETE" }).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      toast.success("Position removed");
    },
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const openEdit = (pos: Position) => {
    setForm({
      company: pos.company,
      role: pos.role,
      department: pos.department || "",
      location: pos.location || "",
      type: pos.type,
      startDate: pos.startDate ? format(new Date(pos.startDate), "yyyy-MM-dd") : "",
      salary: pos.salary?.toString() || "",
      currency: pos.currency,
      description: pos.description || "",
      responsibilities: pos.responsibilities || "",
      techStack: pos.techStack || "",
      managerName: pos.managerName || "",
    });
    setEditingId(pos.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      salary: form.salary ? parseInt(form.salary) : null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const activePosition = positions.find((p) => p.isActive);
  const pastPositions = positions.filter((p) => !p.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Current Role
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Track your current employment and role details.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Position
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : positions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">No position added yet</h3>
            <p className="text-sm text-gray-400 mt-1">
              Add your current job to track your role and make it visible on your recruiter portal.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your Current Role
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active Position */}
          {activePosition && (
            <Card className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {activePosition.type}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl">{activePosition.role}</CardTitle>
                    <p className="text-lg text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-1">
                      <Building2 className="h-4 w-4" />
                      {activePosition.company}
                      {activePosition.department && (
                        <span className="text-sm">· {activePosition.department}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(activePosition)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => deleteMutation.mutate(activePosition.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Details Column */}
                  <div className="space-y-3">
                    {activePosition.location && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span>{activePosition.location}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span>
                        Started {format(new Date(activePosition.startDate), "MMMM yyyy")}
                        <span className="text-gray-400 ml-1">
                          ({formatDistanceToNow(new Date(activePosition.startDate))} ago)
                        </span>
                      </span>
                    </div>
                    {activePosition.salary && (
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span>
                          {activePosition.currency} {activePosition.salary.toLocaleString()} / year
                        </span>
                      </div>
                    )}
                    {activePosition.managerName && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-gray-400" />
                        <span>Reports to: {activePosition.managerName}</span>
                      </div>
                    )}
                  </div>

                  {/* Tech Stack */}
                  {activePosition.techStack && (
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                        <Code2 className="h-4 w-4 text-gray-400" />
                        Tech Stack
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {activePosition.techStack.split(",").map((tech) => (
                          <Badge key={tech.trim()} variant="secondary" className="text-xs">
                            {tech.trim()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Description */}
                {activePosition.description && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-2">About the Role</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                      {activePosition.description}
                    </p>
                  </div>
                )}

                {/* Responsibilities */}
                {activePosition.responsibilities && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                      <Layers className="h-4 w-4 text-gray-400" />
                      Key Responsibilities
                    </h4>
                    <ul className="space-y-1">
                      {activePosition.responsibilities.split("\n").filter(Boolean).map((r, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          {r.trim()}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Past Positions */}
          {pastPositions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                Previous Positions
              </h2>
              <div className="space-y-3">
                {pastPositions.map((pos) => (
                  <Card key={pos.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{pos.role}</p>
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {pos.company}
                            {pos.department && ` · ${pos.department}`}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {format(new Date(pos.startDate), "MMM yyyy")}
                            {pos.location && ` · ${pos.location}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(pos)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => deleteMutation.mutate(pos.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Position" : "Add Position"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Company *</Label>
                <Input
                  required
                  placeholder="Acme Corp"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Role / Title *</Label>
                <Input
                  required
                  placeholder="Senior Software Engineer"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Department</Label>
                <Input
                  placeholder="Engineering"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Location</Label>
                <Input
                  placeholder="San Francisco, CA"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Work Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v ?? "remote" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1">Start Date *</Label>
                <Input
                  required
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Annual Salary</Label>
                <Input
                  type="number"
                  placeholder="150000"
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v ?? "USD" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1">Manager Name</Label>
              <Input
                placeholder="Jane Smith"
                value={form.managerName}
                onChange={(e) => setForm({ ...form, managerName: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Tech Stack (comma-separated)</Label>
              <Input
                placeholder="React, TypeScript, Node.js, PostgreSQL"
                value={form.techStack}
                onChange={(e) => setForm({ ...form, techStack: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Role Description</Label>
              <Textarea
                placeholder="Brief description of the role..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Key Responsibilities (one per line)</Label>
              <Textarea
                placeholder="Lead frontend architecture&#10;Mentor junior engineers&#10;Code reviews and technical design"
                rows={4}
                value={form.responsibilities}
                onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1">
                {editingId ? "Save Changes" : "Add Position"}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
