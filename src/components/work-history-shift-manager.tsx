"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Clock3, Pencil, Trash2, Save, Plus, X } from "lucide-react";
import type { WorkShift } from "@/types/worklog";
import { timeLabelFromMinutes } from "@/lib/worklog-shifts";

export function WorkHistoryShiftManager({ positionId }: { positionId: string }) {
  const qc = useQueryClient();

  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("23:00");
  const [newEnd, setNewEnd] = useState("07:00");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("23:00");
  const [editEnd, setEditEnd] = useState("07:00");

  const { data: shifts = [], isLoading } = useQuery<WorkShift[]>({
    queryKey: ["work-history-shifts", positionId],
    queryFn: async () => {
      const r = await fetch(`/api/work-history/${positionId}/shifts`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: !!positionId,
  });

  const sorted = useMemo(
    () => [...shifts].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [shifts],
  );

  const createShift = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/work-history/${positionId}/shifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), startTime: newStart, endTime: newEnd }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-history-shifts", positionId] });
      setNewName("");
      setNewStart("23:00");
      setNewEnd("07:00");
      toast.success("Shift created");
    },
    onError: () => toast.error("Could not create shift"),
  });

  const updateShift = useMutation({
    mutationFn: async (shiftId: string) => {
      const r = await fetch(`/api/work-history/${positionId}/shifts/${shiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), startTime: editStart, endTime: editEnd }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-history-shifts", positionId] });
      setEditingId(null);
      toast.success("Shift updated");
    },
    onError: () => toast.error("Could not update shift"),
  });

  const deleteShift = useMutation({
    mutationFn: async (shiftId: string) => {
      const r = await fetch(`/api/work-history/${positionId}/shifts/${shiftId}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-history-shifts", positionId] });
      toast.success("Shift deleted");
    },
    onError: () => toast.error("Could not delete shift"),
  });

  function beginEdit(s: WorkShift) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditStart(timeLabelFromMinutes(s.startMinute));
    setEditEnd(timeLabelFromMinutes(s.endMinute));
  }

  function createDisabled() {
    return !newName.trim() || !newStart || !newEnd || createShift.isPending;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock3 className="h-4 w-4" />
          Shift Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div className="sm:col-span-2">
            <Label className="text-xs mb-1">Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Night Shift"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs mb-1">Start</Label>
            <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1">End</Label>
            <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        <Button size="sm" className="h-8 text-xs" onClick={() => createShift.mutate()} disabled={createDisabled()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add shift
        </Button>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading shifts...</p>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">No shifts yet. Add one to reuse it in Worklog.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((s) => {
              const isEditing = editingId === s.id;
              if (isEditing) {
                return (
                  <div key={s.id} className="rounded-md border p-2 space-y-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-xs" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="h-8 text-xs" />
                      <Input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => updateShift.mutate(s.id)} disabled={!editName.trim() || updateShift.isPending}>
                        <Save className="h-3.5 w-3.5 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={s.id} className="rounded-md border p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{s.name}</p>
                    <Badge variant="secondary" className="text-[10px] mt-1">
                      {timeLabelFromMinutes(s.startMinute)}-{timeLabelFromMinutes(s.endMinute)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => beginEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                      onClick={() => deleteShift.mutate(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
