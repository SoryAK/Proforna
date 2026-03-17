"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  Calendar,
  Palmtree,
  Plus,
  Pencil,
  Trash2,
  Thermometer,
  Clock,
  PartyPopper,
  Baby,
  Heart,
} from "lucide-react";
import { format } from "date-fns";

interface TimeOffEntry {
  id: string;
  balanceId: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason: string | null;
}

interface TimeOffBalance {
  id: string;
  positionId: string;
  category: string;
  totalDays: number;
  usedDays: number;
  year: number;
  accrual: string;
  carryOver: number;
  notes: string | null;
  entries: TimeOffEntry[];
}

const CATEGORIES = [
  { value: "pto", label: "PTO", icon: Palmtree, color: "text-blue-600", bg: "bg-blue-50" },
  { value: "sick", label: "Sick Leave", icon: Thermometer, color: "text-red-600", bg: "bg-red-50" },
  { value: "personal", label: "Personal", icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
  { value: "holiday", label: "Holiday", icon: PartyPopper, color: "text-amber-600", bg: "bg-amber-50" },
  { value: "parental", label: "Parental", icon: Baby, color: "text-pink-600", bg: "bg-pink-50" },
  { value: "bereavement", label: "Bereavement", icon: Heart, color: "text-gray-600", bg: "bg-gray-50" },
  { value: "other", label: "Other", icon: Calendar, color: "text-gray-600", bg: "bg-gray-50" },
];

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  taken: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

const ACCRUAL_OPTIONS = [
  { value: "annual", label: "Annual" },
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Bi-weekly" },
];

const emptyBalanceForm = {
  category: "pto",
  totalDays: "",
  year: new Date().getFullYear().toString(),
  accrual: "annual",
  carryOver: "0",
  notes: "",
};

const emptyEntryForm = {
  startDate: "",
  endDate: "",
  days: "",
  status: "planned",
  reason: "",
};

export function TimeOffTracker({ positionId }: { positionId: string }) {
  const queryClient = useQueryClient();
  const [showBalanceForm, setShowBalanceForm] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [targetBalanceId, setTargetBalanceId] = useState<string | null>(null);
  const [balanceForm, setBalanceForm] = useState(emptyBalanceForm);
  const [entryForm, setEntryForm] = useState(emptyEntryForm);

  const { data: balances = [] } = useQuery<TimeOffBalance[]>({
    queryKey: ["time-off", positionId],
    queryFn: () =>
      fetch(`/api/time-off?positionId=${positionId}`).then((r) => r.json()),
  });

  const createBalance = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off", positionId] });
      toast.success("Balance created");
      resetBalanceForm();
    },
  });

  const updateBalance = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/time-off/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off", positionId] });
      toast.success("Balance updated");
      resetBalanceForm();
    },
  });

  const deleteBalance = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/time-off/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off", positionId] });
      toast.success("Removed");
    },
  });

  const createEntry = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/time-off-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off", positionId] });
      toast.success("Time off logged");
      resetEntryForm();
    },
  });

  const deleteEntry = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/time-off-entries/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off", positionId] });
      toast.success("Entry removed");
    },
  });

  const resetBalanceForm = () => {
    setBalanceForm(emptyBalanceForm);
    setEditingBalanceId(null);
    setShowBalanceForm(false);
  };

  const resetEntryForm = () => {
    setEntryForm(emptyEntryForm);
    setTargetBalanceId(null);
    setShowEntryForm(false);
  };

  const openEditBalance = (b: TimeOffBalance) => {
    setBalanceForm({
      category: b.category,
      totalDays: b.totalDays.toString(),
      year: b.year.toString(),
      accrual: b.accrual,
      carryOver: b.carryOver.toString(),
      notes: b.notes || "",
    });
    setEditingBalanceId(b.id);
    setShowBalanceForm(true);
  };

  const openAddEntry = (balanceId: string) => {
    setTargetBalanceId(balanceId);
    setEntryForm(emptyEntryForm);
    setShowEntryForm(true);
  };

  const handleBalanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      positionId,
      ...balanceForm,
      totalDays: parseFloat(balanceForm.totalDays),
      year: parseInt(balanceForm.year),
      carryOver: parseFloat(balanceForm.carryOver),
    };
    if (editingBalanceId) {
      updateBalance.mutate({ id: editingBalanceId, data: payload });
    } else {
      createBalance.mutate(payload);
    }
  };

  const handleEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBalanceId) return;
    createEntry.mutate({
      balanceId: targetBalanceId,
      ...entryForm,
      days: parseFloat(entryForm.days),
    });
  };

  // Summary
  const totalDaysAvailable = balances.reduce((sum, b) => sum + b.totalDays, 0);
  const totalDaysUsed = balances.reduce((sum, b) => sum + b.usedDays, 0);
  const remaining = totalDaysAvailable - totalDaysUsed;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-blue-50">
              <Calendar className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Days</p>
              <p className="text-lg font-bold">{totalDaysAvailable}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2.5 bg-amber-50">
              <Palmtree className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Days Used</p>
              <p className="text-lg font-bold">{totalDaysUsed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`rounded-lg p-2.5 ${remaining > 5 ? "bg-green-50" : "bg-red-50"}`}>
              <Clock className={`h-4 w-4 ${remaining > 5 ? "text-green-600" : "text-red-600"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-lg font-bold">{remaining}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Balance Cards */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Time Off Balances</h3>
        <Button size="sm" onClick={() => { resetBalanceForm(); setShowBalanceForm(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Balance
        </Button>
      </div>

      {balances.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No time off balances set up</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => { resetBalanceForm(); setShowBalanceForm(true); }}
            >
              Set up your first balance
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {balances.map((bal) => {
            const cat = CATEGORIES.find((c) => c.value === bal.category);
            const Icon = cat?.icon ?? Calendar;
            const remaining = bal.totalDays - bal.usedDays;
            const pct = bal.totalDays > 0
              ? Math.min(100, (bal.usedDays / bal.totalDays) * 100)
              : 0;

            return (
              <Card key={bal.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`rounded-lg p-2 ${cat?.bg ?? "bg-gray-50"}`}>
                        <Icon className={`h-4 w-4 ${cat?.color ?? "text-gray-600"}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {cat?.label ?? bal.category}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {bal.year} · {ACCRUAL_OPTIONS.find((a) => a.value === bal.accrual)?.label ?? bal.accrual}
                          {bal.carryOver > 0 && ` · ${bal.carryOver}d carry-over`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openAddEntry(bal.id)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEditBalance(bal)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => deleteBalance.mutate(bal.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">
                        {bal.usedDays} / {bal.totalDays} days used
                      </span>
                      <span className="font-semibold">
                        {remaining} remaining
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>

                  {/* Entries */}
                  {bal.entries.length > 0 && (
                    <div>
                      <Separator className="my-2" />
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Recent Entries
                      </p>
                      <div className="space-y-2">
                        {bal.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between text-sm p-2 rounded-md border"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge className={STATUS_COLORS[entry.status] ?? STATUS_COLORS.planned}>
                                {entry.status}
                              </Badge>
                              <span className="truncate">
                                {format(new Date(entry.startDate), "MMM d")}
                                {entry.startDate !== entry.endDate &&
                                  ` – ${format(new Date(entry.endDate), "MMM d")}`}
                              </span>
                              <span className="text-muted-foreground">
                                ({entry.days}d)
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {entry.reason && (
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  {entry.reason}
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => deleteEntry.mutate(entry.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Balance Dialog */}
      <Dialog open={showBalanceForm} onOpenChange={(open) => !open && resetBalanceForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingBalanceId ? "Edit" : "Add"} Time Off Balance
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBalanceSubmit} className="space-y-4">
            <div>
              <Label className="mb-1">Category</Label>
              <Select value={balanceForm.category} onValueChange={(v) => setBalanceForm({ ...balanceForm, category: v ?? "pto" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label className="mb-1">Total Days *</Label>
                <Input
                  required
                  type="number"
                  step="0.5"
                  placeholder="20"
                  value={balanceForm.totalDays}
                  onChange={(e) => setBalanceForm({ ...balanceForm, totalDays: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Year</Label>
                <Input
                  type="number"
                  value={balanceForm.year}
                  onChange={(e) => setBalanceForm({ ...balanceForm, year: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label className="mb-1">Accrual</Label>
                <Select value={balanceForm.accrual} onValueChange={(v) => setBalanceForm({ ...balanceForm, accrual: v ?? "annual" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCRUAL_OPTIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1">Carry-Over Days</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={balanceForm.carryOver}
                  onChange={(e) => setBalanceForm({ ...balanceForm, carryOver: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1">Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                rows={2}
                value={balanceForm.notes}
                onChange={(e) => setBalanceForm({ ...balanceForm, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1">
                {editingBalanceId ? "Save Changes" : "Add"}
              </Button>
              <Button type="button" variant="outline" onClick={resetBalanceForm}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Entry Dialog */}
      <Dialog open={showEntryForm} onOpenChange={(open) => !open && resetEntryForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Time Off</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEntrySubmit} className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label className="mb-1">Start Date *</Label>
                <Input
                  required
                  type="date"
                  value={entryForm.startDate}
                  onChange={(e) => setEntryForm({ ...entryForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">End Date *</Label>
                <Input
                  required
                  type="date"
                  value={entryForm.endDate}
                  onChange={(e) => setEntryForm({ ...entryForm, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label className="mb-1">Days *</Label>
                <Input
                  required
                  type="number"
                  step="0.5"
                  placeholder="1"
                  value={entryForm.days}
                  onChange={(e) => setEntryForm({ ...entryForm, days: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Status</Label>
                <Select value={entryForm.status} onValueChange={(v) => setEntryForm({ ...entryForm, status: v ?? "planned" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="taken">Taken</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1">Reason</Label>
              <Input
                placeholder="Optional reason..."
                value={entryForm.reason}
                onChange={(e) => setEntryForm({ ...entryForm, reason: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1">Log Time Off</Button>
              <Button type="button" variant="outline" onClick={resetEntryForm}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
