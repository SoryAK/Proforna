"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Cog,
  Pencil,
  Plus,
  Search as SearchIcon,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AssetServiceHistory } from "@/components/asset-service-history";
import { JobAssetPhotos } from "@/components/job-asset-photos";
import { cn } from "@/lib/utils";

type JobAssetPhoto = {
  id: string;
  filePath: string;
  caption: string | null;
  isCover: boolean;
  sortOrder: number;
};

type JobAsset = {
  id: string;
  name: string;
  assetTypeId: string | null;
  type?: { id: string; name: string; category: string } | null;
  identifier: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  positionId: string | null;
  customerName: string | null;
  location: string | null;
  status: string;
  notes: string | null;
  installedAt: string | null;
  commissionedAt: string | null;
  createdAt: string;
  photos?: JobAssetPhoto[];
};

import { ASSET_CATEGORIES, type AssetTypeRecord } from "@/components/asset-types-manager";
import { AssetTypePicker } from "@/components/asset-type-picker";

type Position = { id: string; company: string; type: string };

// Alias for backward compat with filter/group label lookups
const ASSET_TYPES = ASSET_CATEGORIES;

const ASSET_STATUS = [
  { value: "active", label: "Active" },
  { value: "out-of-service", label: "Out of service" },
  { value: "retired", label: "Retired" },
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "out-of-service": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  retired: "bg-muted text-muted-foreground border-border",
};

export function JobAssetsPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: assets = [], isLoading } = useQuery<JobAsset[]>({
    queryKey: ["job-assets"],
    queryFn: async () => (await fetch("/api/job-assets")).json(),
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["work-history"],
    queryFn: async () => (await fetch("/api/work-history")).json(),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (typeFilter !== "all" && a.type?.category !== typeFilter) return false;
      if (positionFilter !== "all") {
        if (positionFilter === "none" && a.positionId) return false;
        if (positionFilter !== "none" && a.positionId !== positionFilter) return false;
      }
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        (a.identifier ?? "").toLowerCase().includes(q) ||
        (a.manufacturer ?? "").toLowerCase().includes(q) ||
        (a.model ?? "").toLowerCase().includes(q) ||
        (a.serialNumber ?? "").toLowerCase().includes(q) ||
        (a.customerName ?? "").toLowerCase().includes(q) ||
        (a.location ?? "").toLowerCase().includes(q)
      );
    });
  }, [assets, query, statusFilter, typeFilter, positionFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, JobAsset[]> = {};
    filtered.forEach((a) => {
      const key = a.type?.category || "other";
      (groups[key] ||= []).push(a);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const positionMap = useMemo(() => {
    const m = new Map<string, string>();
    positions.forEach((p) => m.set(p.id, p.company));
    return m;
  }, [positions]);

  const deleteAsset = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/job-assets?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-assets"] });
      setOpenId(null);
    },
  });

  const openAsset = openId ? assets.find((a) => a.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Cog className="h-5 w-5" /> Job Assets
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Machines, vehicles, units, and systems you work on. Service history is built from your worklog entries.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> New asset
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, tag, serial, location…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="all">All statuses</option>
          {ASSET_STATUS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="all">All types</option>
          {ASSET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="all">All jobs</option>
          <option value="none">No job</option>
          {positions.filter((p) => p.type === "job").map((p) => (
            <option key={p.id} value={p.id}>{p.company}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "asset" : "assets"}
        {filtered.length !== assets.length && ` of ${assets.length}`}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <Cog className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {assets.length === 0
              ? "No assets yet. Add machines, units, or vehicles you service to track work history."
              : "No assets match these filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([type, items]) => {
            const typeLabel = ASSET_TYPES.find((t) => t.value === type)?.label ?? type;
            return (
              <div key={type}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {typeLabel} <span className="text-muted-foreground/60">({items.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {items.map((a) => {
                    const cover = a.photos?.find((p) => p.isCover) ?? a.photos?.[0] ?? null;
                    return (
                    <button
                      key={a.id}
                      onClick={() => setOpenId(a.id)}
                      className="text-left rounded-lg border bg-card overflow-hidden hover:border-foreground/30 hover:shadow-sm transition"
                    >
                      {cover && (
                        <div className="relative aspect-[16/9] bg-muted overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cover.filePath}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          {(a.photos?.length ?? 0) > 1 && (
                            <span className="absolute bottom-1 right-1 rounded bg-black/60 text-white text-[9px] px-1.5 py-0.5">
                              +{(a.photos?.length ?? 0) - 1}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate" title={a.name}>{a.name}</div>
                          {a.identifier && (
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{a.identifier}</div>
                          )}
                        </div>
                        <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 shrink-0", STATUS_COLORS[a.status])}>
                          {a.status}
                        </Badge>
                      </div>
                      <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                        {(a.manufacturer || a.model) && (
                          <div className="truncate">{[a.manufacturer, a.model].filter(Boolean).join(" · ")}</div>
                        )}
                        {a.positionId && (
                          <div className="truncate">📍 {positionMap.get(a.positionId) ?? "Unknown job"}</div>
                        )}
                        {a.customerName && (
                          <div className="truncate">👤 {a.customerName}</div>
                        )}
                        {a.location && (
                          <div className="truncate">{a.location}</div>
                        )}
                      </div>
                      </div>
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail / edit modal */}
      {openAsset && (
        <AssetDetailModal
          asset={openAsset}
          positions={positions}
          open={!!openAsset}
          onOpenChange={(o) => { if (!o) setOpenId(null); }}
          onDelete={() => deleteAsset.mutate(openAsset.id)}
          deleting={deleteAsset.isPending}
        />
      )}

      {/* Create modal */}
      {creating && (
        <CreateAssetModal
          positions={positions}
          open={creating}
          onOpenChange={setCreating}
        />
      )}
    </div>
  );
}

function AssetDetailModal({
  asset,
  positions,
  open,
  onOpenChange,
  onDelete,
  deleting,
}: {
  asset: JobAsset;
  positions: Position[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<JobAsset>>({ ...asset });
  const [confirmDelete, setConfirmDelete] = useState(false);

  function update<K extends keyof JobAsset>(key: K, v: JobAsset[K] | null) {
    setDraft((d) => ({ ...d, [key]: v as JobAsset[K] }));
  }

  const save = useMutation({
    mutationFn: async (data: Partial<JobAsset>) => {
      const res = await fetch("/api/job-assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, ...data }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-assets"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cog className="h-4 w-4" />
            <span className="truncate">{asset.name}</span>
            {asset.identifier && (
              <span className="text-xs font-mono text-muted-foreground">{asset.identifier}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left: editable details */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={draft.name ?? ""} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <div className="h-9 flex items-center text-sm text-muted-foreground">
                  {draft.type?.category
                    ? ASSET_CATEGORIES.find((c) => c.value === draft.type!.category)?.label ?? draft.type.category
                    : "(no type set)"}
                  {draft.type?.name && <span className="ml-1 text-foreground">— {draft.type.name}</span>}
                </div>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select
                  value={draft.status ?? "active"}
                  onChange={(e) => update("status", e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {ASSET_STATUS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Asset tag / unit #</Label>
                <Input value={draft.identifier ?? ""} onChange={(e) => update("identifier", e.target.value || null)} />
              </div>
              <div>
                <Label className="text-xs">Serial number</Label>
                <Input value={draft.serialNumber ?? ""} onChange={(e) => update("serialNumber", e.target.value || null)} />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Customer</Label>
                <Input value={draft.customerName ?? ""} onChange={(e) => update("customerName", e.target.value || null)} />
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <Input value={draft.location ?? ""} onChange={(e) => update("location", e.target.value || null)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={3}
                value={draft.notes ?? ""}
                onChange={(e) => update("notes", e.target.value || null)}
              />
            </div>
            <div className="text-[10px] text-muted-foreground pt-1">
              Added {format(parseISO(asset.createdAt), "PPP")}
            </div>
          </div>

          {/* Right: photos + service history */}
          <div className="space-y-4">
            <JobAssetPhotos assetId={asset.id} />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs">Service history</Label>
              </div>
              <AssetServiceHistory assetId={asset.id} positions={positions} />
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between gap-2">
          <div>
            {!confirmDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-500 hover:text-rose-600"
                onClick={() => setConfirmDelete(true)}
                disabled={save.isPending || deleting}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Sure?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
                <Button size="sm" variant="destructive" onClick={onDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending || !draft.name?.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAssetModal({
  positions,
  open,
  onOpenChange,
}: {
  positions: Position[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [assetTypeId, setAssetTypeId] = useState<string | null>(null);
  const [positionId, setPositionId] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/job-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          assetTypeId,
          positionId,
          identifier: identifier.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-assets"] });
      onOpenChange(false);
      setName("");
      setIdentifier("");
      setPositionId(null);
      setAssetTypeId(null);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New job asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Compressor C-204, Truck #427"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type (optional)</Label>
              <AssetTypePicker value={assetTypeId} onChange={setAssetTypeId} />
            </div>
            <div>
              <Label className="text-xs">Asset tag (optional)</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Linked job (optional)</Label>
            <select
              value={positionId ?? ""}
              onChange={(e) => setPositionId(e.target.value || null)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">No job</option>
              {positions.filter((p) => p.type === "job").map((p) => (
                <option key={p.id} value={p.id}>{p.company}</option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Adding…" : "Add asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Asset type picker ────────────────────────────────────────────


