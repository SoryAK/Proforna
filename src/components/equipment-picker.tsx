"use client";

/**
 * EquipmentPicker — searchable multi-select with inline create + edit details.
 *
 * Used by the full worklog editor on /worklog. The lightweight Quick Log
 * dialog uses its own minimal MultiSelect — this one has the heavier
 * "create new tool" + "edit details" affordances.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, X, Wrench, ChevronDown, Search as SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type EquipmentItem = {
  id: string;
  name: string;
  category: string;
  ownership?: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  condition?: string;
  location?: string | null;
  notes?: string | null;
  tags?: string[];
};

export const EQUIPMENT_CATEGORIES = [
  { value: "tool", label: "Tool" },
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "vehicle", label: "Vehicle" },
  { value: "safety", label: "Safety" },
  { value: "instrument", label: "Instrument" },
  { value: "other", label: "Other" },
];

export const EQUIPMENT_CONDITIONS = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

export function EquipmentPicker({
  label,
  equipment,
  selectedIds,
  onChange,
}: {
  label: string;
  equipment: EquipmentItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("tool");
  const [editingId, setEditingId] = useState<string | null>(null);

  const equipmentMap = useMemo(() => {
    const m = new Map<string, EquipmentItem>();
    equipment.forEach((e) => m.set(e.id, e));
    return m;
  }, [equipment]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? equipment.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            (e.category ?? "").toLowerCase().includes(q),
        )
      : equipment;
    return [...list].sort((a, b) => {
      const sa = selectedIds.includes(a.id) ? 1 : 0;
      const sb = selectedIds.includes(b.id) ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });
  }, [equipment, query, selectedIds]);

  const exactMatch = useMemo(
    () => equipment.some((e) => e.name.trim().toLowerCase() === query.trim().toLowerCase()),
    [equipment, query],
  );

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  const createEquipment = useMutation({
    mutationFn: async (data: { name: string; category: string }) => {
      const res = await fetch("/api/personal-equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as EquipmentItem;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["personal-equipment"] });
      onChange([...selectedIds, created.id]);
      setCreating(false);
      setNewName("");
      setNewCategory("tool");
      setQuery("");
    },
  });

  function startCreateFromQuery() {
    setNewName(query.trim());
    setNewCategory("tool");
    setCreating(true);
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Selected chips */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 mb-1">
          {selectedIds.map((id) => {
            const e = equipmentMap.get(id);
            if (!e) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 max-w-[220px] rounded-md bg-accent px-2 py-0.5 text-[11px]"
              >
                <Wrench className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate" title={e.name}>{e.name}</span>
                <button
                  type="button"
                  onClick={() => setEditingId(id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Edit ${e.name}`}
                  title="Edit details"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${e.name}`}
                  title="Remove from this entry"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Trigger / search */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setCreating(false); }}
        className="mt-1 w-full flex items-center justify-between rounded-md border bg-background px-3 py-2 text-left text-sm hover:border-foreground/30"
      >
        <span className="text-muted-foreground text-xs">
          {selectedIds.length === 0
            ? `Add tools…`
            : `Add another (${selectedIds.length} selected)`}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setCreating(false); }} />
          <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-lg overflow-hidden">
            {creating ? (
              <div className="p-3 space-y-2">
                <div className="text-[11px] font-medium text-muted-foreground">New tool</div>
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Milwaukee M18 Drill"
                  className="h-8 text-sm"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
                  >
                    {EQUIPMENT_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!newName.trim() || createEquipment.isPending}
                    onClick={() => createEquipment.mutate({ name: newName.trim(), category: newCategory })}
                  >
                    {createEquipment.isPending ? "Adding…" : "Add tool"}
                  </Button>
                </div>
                {createEquipment.isError && (
                  <p className="text-[10px] text-rose-500">Failed to create. Try again.</p>
                )}
              </div>
            ) : (
              <>
                <div className="relative border-b">
                  <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search or type to add a new tool…"
                    className="w-full bg-transparent pl-7 pr-2 py-2 text-xs outline-none"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {filtered.length === 0 && !query.trim() ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">No tools yet — add one below.</div>
                  ) : filtered.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">No matches.</div>
                  ) : (
                    filtered.map((e) => {
                      const sel = selectedIds.includes(e.id);
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            "group w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent",
                            sel && "bg-accent/60"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggle(e.id)}
                            className="flex-1 flex items-center gap-2 text-left"
                          >
                            <Checkbox checked={sel} className="pointer-events-none" />
                            <span className="flex-1 truncate" title={e.name}>{e.name}</span>
                            {e.category && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {e.category}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(e.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                            title="Edit details"
                            aria-label={`Edit ${e.name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="border-t">
                  <button
                    type="button"
                    onClick={query.trim() && !exactMatch ? startCreateFromQuery : () => setCreating(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {query.trim() && !exactMatch ? (
                      <>Create &ldquo;<span className="font-medium">{query.trim()}</span>&rdquo;</>
                    ) : (
                      <>Add new tool</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Edit details modal */}
      <EquipmentEditModal
        open={editingId !== null}
        onOpenChange={(o) => { if (!o) setEditingId(null); }}
        equipment={editingId ? equipmentMap.get(editingId) ?? null : null}
      />
    </div>
  );
}

// ── Equipment edit modal (quick details) ────────────────────────
function EquipmentEditModal({
  open,
  onOpenChange,
  equipment,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  equipment: EquipmentItem | null;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<EquipmentItem>>({});

  useEffect(() => {
    if (open && equipment) setDraft({ ...equipment });
  }, [open, equipment]);

  const save = useMutation({
    mutationFn: async (data: Partial<EquipmentItem>) => {
      const res = await fetch("/api/personal-equipment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: equipment?.id, ...data }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal-equipment"] });
      onOpenChange(false);
    },
  });

  if (!open || !equipment) return null;

  function update<K extends keyof EquipmentItem>(key: K, v: EquipmentItem[K] | null) {
    setDraft((d) => ({ ...d, [key]: v as EquipmentItem[K] }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Tool details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={draft.name ?? ""} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={draft.category ?? "tool"}
                onChange={(e) => update("category", e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Condition</Label>
              <select
                value={draft.condition ?? "good"}
                onChange={(e) => update("condition", e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {EQUIPMENT_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Manufacturer</Label>
              <Input value={draft.manufacturer ?? ""} onChange={(e) => update("manufacturer", e.target.value || null)} />
            </div>
            <div>
              <Label className="text-xs">Model</Label>
              <Input value={draft.model ?? ""} onChange={(e) => update("model", e.target.value || null)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Serial number</Label>
              <Input value={draft.serialNumber ?? ""} onChange={(e) => update("serialNumber", e.target.value || null)} />
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Input value={draft.location ?? ""} onChange={(e) => update("location", e.target.value || null)} placeholder="e.g. Garage shelf" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={3}
              value={draft.notes ?? ""}
              onChange={(e) => update("notes", e.target.value || null)}
              placeholder="Quirks, calibration history, accessories…"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Manage photos, purchase info, and proficiency in the full Inventory page.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate(draft)} disabled={save.isPending || !draft.name?.trim()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
