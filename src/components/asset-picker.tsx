"use client";

/**
 * AssetPicker — searchable multi-select for JobAsset (employer/customer-owned
 * machines, units, vehicles, structures the user works ON).
 *
 * Distinct from EquipmentPicker (which manages PersonalEquipment — tools the
 * user owns). Used by the full worklog editor on /worklog. The lightweight
 * Quick Log dialog uses its own minimal MultiSelect.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, X, Cog, ChevronDown, Search as SearchIcon, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AssetServiceHistory } from "@/components/asset-service-history";
import { AssetTypePicker } from "@/components/asset-type-picker";
import { ASSET_CATEGORIES } from "@/components/asset-types-manager";
import { cn } from "@/lib/utils";

export type JobAsset = {
  id: string;
  name: string;
  assetTypeId?: string | null;
  type?: { id: string; name: string; category: string; tags?: string[] } | null;
  identifier?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  positionId?: string | null;
  customerName?: string | null;
  location?: string | null;
  status: string;
  notes?: string | null;
  tags?: string[];
  photos?: { id: string; filePath: string; isCover: boolean }[];
};

/**
 * Minimal Position shape used by the picker. The full worklog Position type
 * is structurally compatible (extra fields are allowed).
 */
export type AssetPickerPosition = {
  id: string;
  company: string;
  type: string;
};

export const ASSET_TYPES = ASSET_CATEGORIES;

export const ASSET_STATUS = [
  { value: "active", label: "Active" },
  { value: "out-of-service", label: "Out of service" },
  { value: "retired", label: "Retired" },
];

export function AssetPicker({
  label,
  assets,
  positions,
  selectedIds,
  defaultPositionId,
  onChange,
}: {
  label: string;
  assets: JobAsset[];
  positions: AssetPickerPosition[];
  selectedIds: string[];
  defaultPositionId: string | null;
  onChange: (ids: string[]) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPositionId, setNewPositionId] = useState<string | null>(defaultPositionId);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setNewPositionId(defaultPositionId);
  }, [defaultPositionId]);

  const assetMap = useMemo(() => {
    const m = new Map<string, JobAsset>();
    assets.forEach((a) => m.set(a.id, a));
    return m;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Default to assets for the current position first; show all when searching.
    const scoped = q || !defaultPositionId
      ? assets
      : assets.filter((a) => !a.positionId || a.positionId === defaultPositionId);
    const list = q
      ? scoped.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (a.identifier ?? "").toLowerCase().includes(q) ||
                (a.type?.category ?? "").toLowerCase().includes(q) ||
            (a.customerName ?? "").toLowerCase().includes(q),
        )
      : scoped;
    return [...list].sort((a, b) => {
      const sa = selectedIds.includes(a.id) ? 1 : 0;
      const sb = selectedIds.includes(b.id) ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });
  }, [assets, query, selectedIds, defaultPositionId]);

  const exactMatch = useMemo(
    () => assets.some((a) => a.name.trim().toLowerCase() === query.trim().toLowerCase()),
    [assets, query],
  );

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  const createAsset = useMutation({
    mutationFn: async (data: { name: string; positionId: string | null }) => {
      const res = await fetch("/api/job-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as JobAsset;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["job-assets"] });
      onChange([...selectedIds, created.id]);
      setCreating(false);
      setNewName("");
      setQuery("");
    },
  });

  function startCreateFromQuery() {
    setNewName(query.trim());
    setNewPositionId(defaultPositionId);
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
            const a = assetMap.get(id);
            if (!a) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 max-w-[220px] rounded-md bg-accent px-2 py-0.5 text-[11px]"
              >
                <Cog className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate" title={a.identifier ? `${a.name} · ${a.identifier}` : a.name}>{a.name}</span>
                <button
                  type="button"
                  onClick={() => setEditingId(id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Edit ${a.name}`}
                  title="Edit details"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${a.name}`}
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
            ? `Add machines / units…`
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
                <div className="text-[11px] font-medium text-muted-foreground">New asset</div>
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Compressor C-204, Truck #427"
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-1 gap-2">
                  <select
                    value={newPositionId ?? ""}
                    onChange={(e) => setNewPositionId(e.target.value || null)}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">No job</option>
                    {positions.filter((p) => p.type === "job").map((p) => (
                      <option key={p.id} value={p.id}>{p.company}</option>
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
                    disabled={!newName.trim() || createAsset.isPending}
                    onClick={() => createAsset.mutate({ name: newName.trim(), positionId: newPositionId })}
                  >
                    {createAsset.isPending ? "Adding…" : "Add asset"}
                  </Button>
                </div>
                {createAsset.isError && (
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
                    placeholder="Search assets or type a new one…"
                    className="w-full bg-transparent pl-7 pr-2 py-2 text-xs outline-none"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {filtered.length === 0 && !query.trim() ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      No assets {defaultPositionId ? "for this job" : "yet"} — add one below.
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">No matches.</div>
                  ) : (
                    filtered.map((a) => {
                      const sel = selectedIds.includes(a.id);
                      return (
                        <div
                          key={a.id}
                          className={cn(
                            "group w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent",
                            sel && "bg-accent/60"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggle(a.id)}
                            className="flex-1 flex items-center gap-2 text-left"
                          >
                            <Checkbox checked={sel} className="pointer-events-none" />
                            <span className="flex-1 truncate" title={a.name}>{a.name}</span>
                            {a.identifier && (
                              <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[80px]">
                                {a.identifier}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {a.type?.category ?? ""}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(a.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                            title="Edit details"
                            aria-label={`Edit ${a.name}`}
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
                    onClick={query.trim() && !exactMatch ? startCreateFromQuery : () => { setNewPositionId(defaultPositionId); setCreating(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {query.trim() && !exactMatch ? (
                      <>Create &ldquo;<span className="font-medium">{query.trim()}</span>&rdquo;</>
                    ) : (
                      <>Add new asset</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Edit details modal */}
      <AssetEditModal
        open={editingId !== null}
        onOpenChange={(o) => { if (!o) setEditingId(null); }}
        asset={editingId ? assetMap.get(editingId) ?? null : null}
        positions={positions}
      />
    </div>
  );
}

// ── Asset edit modal (quick details) ────────────────────────────
function AssetEditModal({
  open,
  onOpenChange,
  asset,
  positions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  asset: JobAsset | null;
  positions: AssetPickerPosition[];
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<JobAsset>>({});

  useEffect(() => {
    if (open && asset) setDraft({ ...asset });
  }, [open, asset]);

  const save = useMutation({
    mutationFn: async (data: Partial<JobAsset>) => {
      const res = await fetch("/api/job-assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset?.id, ...data }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-assets"] });
      onOpenChange(false);
    },
  });

  if (!open || !asset) return null;

  function update<K extends keyof JobAsset>(key: K, v: JobAsset[K] | null) {
    setDraft((d) => ({ ...d, [key]: v as JobAsset[K] }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cog className="h-4 w-4" /> Asset details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={draft.name ?? ""} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Type</Label>
              <AssetTypePicker
                value={draft.assetTypeId ?? null}
                onChange={(id) => update("assetTypeId", id)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <select
              value={draft.status ?? "active"}
              onChange={(e) => update("status", e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {ASSET_STATUS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Asset tag / unit #</Label>
              <Input value={draft.identifier ?? ""} onChange={(e) => update("identifier", e.target.value || null)} placeholder="C-204 / VIN / asset ID" />
            </div>
            <div>
              <Label className="text-xs">Manufacturer</Label>
              <Input value={draft.manufacturer ?? ""} onChange={(e) => update("manufacturer", e.target.value || null)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Model</Label>
              <Input value={draft.model ?? ""} onChange={(e) => update("model", e.target.value || null)} />
            </div>
            <div>
              <Label className="text-xs">Serial number</Label>
              <Input value={draft.serialNumber ?? ""} onChange={(e) => update("serialNumber", e.target.value || null)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Linked job</Label>
              <select
                value={draft.positionId ?? ""}
                onChange={(e) => update("positionId", e.target.value || null)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">No job</option>
                {positions.filter((p) => p.type === "job").map((p) => (
                  <option key={p.id} value={p.id}>{p.company}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Customer (optional)</Label>
              <Input
                value={draft.customerName ?? ""}
                onChange={(e) => update("customerName", e.target.value || null)}
                placeholder="For service techs"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Location</Label>
            <Input
              value={draft.location ?? ""}
              onChange={(e) => update("location", e.target.value || null)}
              placeholder="e.g. Building 3, Floor 2"
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={3}
              value={draft.notes ?? ""}
              onChange={(e) => update("notes", e.target.value || null)}
              placeholder="Service history hints, quirks, install date…"
            />
          </div>

          {/* Service history feed — every worklog entry that touched this asset */}
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs">Service history</Label>
            </div>
            <AssetServiceHistory assetId={asset.id} positions={positions} limit={8} />
          </div>
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
