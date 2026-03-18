"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import {
  Heart,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  GraduationCap,
  Dumbbell,
  Eye,
  Stethoscope,
  BadgeDollarSign,
} from "lucide-react";
import { format } from "date-fns";

interface Benefit {
  id: string;
  positionId: string;
  category: string;
  name: string;
  provider: string | null;
  coverage: string | null;
  employerCost: number | null;
  employeeCost: number | null;
  notes: string | null;
  enrolledAt: string | null;
  expiresAt: string | null;
}

const CATEGORIES = [
  { value: "health", label: "Health", icon: Stethoscope },
  { value: "dental", label: "Dental", icon: Heart },
  { value: "vision", label: "Vision", icon: Eye },
  { value: "retirement", label: "Retirement", icon: BadgeDollarSign },
  { value: "insurance", label: "Insurance", icon: ShieldCheck },
  { value: "wellness", label: "Wellness", icon: Dumbbell },
  { value: "education", label: "Education", icon: GraduationCap },
  { value: "other", label: "Other", icon: Heart },
];

const CATEGORY_COLORS: Record<string, string> = {
  health: "bg-red-100 text-red-700",
  dental: "bg-pink-100 text-pink-700",
  vision: "bg-orange-100 text-orange-700",
  retirement: "bg-green-100 text-green-700",
  insurance: "bg-yellow-100 text-yellow-700",
  wellness: "bg-emerald-100 text-emerald-700",
  education: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-700",
};

const emptyForm = {
  category: "health",
  name: "",
  provider: "",
  coverage: "",
  employerCost: "",
  employeeCost: "",
  notes: "",
  enrolledAt: "",
  expiresAt: "",
};

export function BenefitsTracker({ positionId }: { positionId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: benefits = [] } = useQuery<Benefit[]>({
    queryKey: ["benefits", positionId],
    queryFn: () =>
      fetch(`/api/benefits?positionId=${positionId}`).then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/benefits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits", positionId] });
      toast.success("Benefit added");
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/benefits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits", positionId] });
      toast.success("Benefit updated");
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/benefits/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits", positionId] });
      toast.success("Removed");
    },
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const openEdit = (b: Benefit) => {
    setForm({
      category: b.category,
      name: b.name,
      provider: b.provider || "",
      coverage: b.coverage || "",
      employerCost: b.employerCost?.toString() || "",
      employeeCost: b.employeeCost?.toString() || "",
      notes: b.notes || "",
      enrolledAt: b.enrolledAt ? format(new Date(b.enrolledAt), "yyyy-MM-dd") : "",
      expiresAt: b.expiresAt ? format(new Date(b.expiresAt), "yyyy-MM-dd") : "",
    });
    setEditingId(b.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      positionId,
      ...form,
      employerCost: form.employerCost ? parseInt(form.employerCost) : null,
      employeeCost: form.employeeCost ? parseInt(form.employeeCost) : null,
      enrolledAt: form.enrolledAt || null,
      expiresAt: form.expiresAt || null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Group benefits by category
  const grouped = benefits.reduce<Record<string, Benefit[]>>((acc, b) => {
    (acc[b.category] ??= []).push(b);
    return acc;
  }, {});

  const monthlyTotal = benefits.reduce(
    (sum, b) => sum + (b.employeeCost || 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-red-50">
              <Heart className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Benefits</p>
              <p className="text-lg font-bold">{benefits.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-green-50">
              <BadgeDollarSign className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly Cost (You)</p>
              <p className="text-lg font-bold">
                {monthlyTotal > 0 ? `$${monthlyTotal.toLocaleString()}` : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-purple-50">
              <ShieldCheck className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Categories Covered</p>
              <p className="text-lg font-bold">{Object.keys(grouped).length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Benefits List */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Benefits</CardTitle>
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {benefits.length === 0 ? (
            <div className="text-center py-8">
              <Heart className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No benefits tracked yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { resetForm(); setShowForm(true); }}
              >
                Add your first benefit
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([category, items]) => {
                const catConfig = CATEGORIES.find((c) => c.value === category);
                const Icon = catConfig?.icon ?? Heart;
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">
                        {catConfig?.label ?? category}
                      </h3>
                      <Badge variant="secondary" className="text-xs">
                        {items.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {items.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-start justify-between gap-3 p-3 rounded-lg border"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{b.name}</p>
                              <Badge className={CATEGORY_COLORS[b.category] ?? CATEGORY_COLORS.other}>
                                {catConfig?.label ?? b.category}
                              </Badge>
                            </div>
                            {b.provider && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Provider: {b.provider}
                              </p>
                            )}
                            {b.coverage && (
                              <p className="text-xs text-muted-foreground">
                                Coverage: {b.coverage}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              {b.employerCost != null && (
                                <span>Employer: ${b.employerCost.toLocaleString()}/mo</span>
                              )}
                              {b.employeeCost != null && (
                                <span>You: ${b.employeeCost.toLocaleString()}/mo</span>
                              )}
                            </div>
                            {b.enrolledAt && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Enrolled: {format(new Date(b.enrolledAt), "MMM d, yyyy")}
                                {b.expiresAt && ` — Expires: ${format(new Date(b.expiresAt), "MMM d, yyyy")}`}
                              </p>
                            )}
                            {b.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{b.notes}</p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => deleteMutation.mutate(b.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Benefit</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="mb-1">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v ?? "health" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Benefit Name *</Label>
              <Input
                required
                placeholder="e.g. Blue Cross PPO, 401(k) Match"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Provider</Label>
              <Input
                placeholder="e.g. Blue Cross Blue Shield"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Coverage Level</Label>
              <Input
                placeholder="e.g. Individual, Family, Employee+Spouse"
                value={form.coverage}
                onChange={(e) => setForm({ ...form, coverage: e.target.value })}
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label className="mb-1">Employer Cost $/mo</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.employerCost}
                  onChange={(e) => setForm({ ...form, employerCost: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Your Cost $/mo</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.employeeCost}
                  onChange={(e) => setForm({ ...form, employeeCost: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label className="mb-1">Enrolled Date</Label>
                <Input
                  type="date"
                  value={form.enrolledAt}
                  onChange={(e) => setForm({ ...form, enrolledAt: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Expires Date</Label>
                <Input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1">Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1">
                {editingId ? "Save Changes" : "Add"}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
