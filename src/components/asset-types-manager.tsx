"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Plus,
  Search as SearchIcon,
  Tag,
  Trash2,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────

export type AssetTypeRecord = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  manufacturer: string | null;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { instances: number; documents: number; links: number };
};

export type AssetTypeDetail = AssetTypeRecord & {
  documents: AssetDocumentRecord[];
  links: AssetLinkRecord[];
};

export type AssetDocumentRecord = {
  id: string;
  assetTypeId: string | null;
  assetId: string | null;
  docType: string;
  title: string;
  filePath: string | null;
  url: string | null;
  notes: string | null;
  createdAt: string;
};

export type AssetLinkRecord = {
  id: string;
  assetTypeId: string | null;
  assetId: string | null;
  url: string;
  title: string;
  linkType: string;
  notes: string | null;
  createdAt: string;
};

// ─── Constants ───────────────────────────────────────────────────

export const ASSET_CATEGORIES = [
  { value: "machine", label: "Machine" },
  { value: "vehicle", label: "Vehicle" },
  { value: "system", label: "System" },
  { value: "structure", label: "Structure" },
  { value: "unit", label: "Unit" },
  { value: "tool", label: "Tool" },
  { value: "other", label: "Other" },
];

const DOC_TYPES = [
  { value: "manual", label: "Manual" },
  { value: "wiring_diagram", label: "Wiring diagram" },
  { value: "spec_sheet", label: "Spec sheet" },
  { value: "safety_sheet", label: "Safety sheet" },
  { value: "parts_list", label: "Parts list" },
  { value: "other", label: "Other" },
];

const LINK_TYPES = [
  { value: "supplier", label: "Supplier" },
  { value: "video", label: "Video" },
  { value: "forum", label: "Forum" },
  { value: "article", label: "Article" },
  { value: "datasheet", label: "Datasheet" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  machine: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  vehicle: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  system: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  structure: "bg-stone-500/10 text-stone-600 dark:text-stone-400 border-stone-500/20",
  unit: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  tool: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  other: "bg-muted text-muted-foreground border-border",
};

// ─── Main page component ─────────────────────────────────────────

export function AssetTypesManager() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: types = [], isLoading } = useQuery<AssetTypeRecord[]>({
    queryKey: ["asset-types"],
    queryFn: async () => (await fetch("/api/asset-types")).json(),
  });

  const filtered = types.filter((t) => {
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.manufacturer ?? "").toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q))
    );
  });

  const grouped = filtered.reduce<Record<string, AssetTypeRecord[]>>((acc, t) => {
    (acc[t.category] ||= []).push(t);
    return acc;
  }, {});

  const selectedType = selectedId ? types.find((t) => t.id === selectedId) ?? null : null;

  const deleteType = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/asset-types/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-types"] });
      qc.invalidateQueries({ queryKey: ["job-assets"] });
      setSelectedId(null);
    },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Asset Type Library
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generic equipment classes (e.g. &quot;Loss-in-Weight Feeder&quot;). Knowledge accumulates across every job.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> New type
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, manufacturer, tag…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="all">All categories</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "type" : "types"}
        {filtered.length !== types.length && ` of ${types.length}`}
      </div>

      {/* Type list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>
      ) : types.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No asset types yet.</p>
            <p className="text-xs mt-1">Create a type like &quot;Loss-in-Weight Feeder&quot; or &quot;Pneumatic Cylinder&quot;.</p>
            <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create first type
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No types match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {ASSET_CATEGORIES.filter((c) => grouped[c.value]?.length).map(({ value, label }) => (
            <div key={value}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {label} <span className="text-muted-foreground/60">({grouped[value].length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {grouped[value].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="text-left rounded-lg border bg-card p-3 hover:border-foreground/30 hover:shadow-sm transition group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{t.name}</div>
                        {t.manufacturer && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{t.manufacturer}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn("text-[9px] h-4 px-1.5", CATEGORY_COLORS[t.category])}
                        >
                          {label}
                        </Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground transition" />
                      </div>
                    </div>
                    {t.description && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{t.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      {(t._count?.instances ?? 0) > 0 && (
                        <span>{t._count!.instances} instance{t._count!.instances !== 1 ? "s" : ""}</span>
                      )}
                      {(t._count?.documents ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5"><FileText className="h-3 w-3" />{t._count!.documents}</span>
                      )}
                      {(t._count?.links ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5"><Link2 className="h-3 w-3" />{t._count!.links}</span>
                      )}
                      {t.tags.length > 0 && (
                        <span className="flex items-center gap-0.5"><Tag className="h-3 w-3" />{t.tags.slice(0, 2).join(", ")}{t.tags.length > 2 ? ` +${t.tags.length - 2}` : ""}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      {creating && (
        <CreateTypeDialog open={creating} onOpenChange={setCreating} />
      )}

      {/* Detail / edit dialog */}
      {selectedType && (
        <TypeDetailDialog
          typeId={selectedType.id}
          open={!!selectedType}
          onOpenChange={(o) => { if (!o) setSelectedId(null); }}
          onDelete={() => deleteType.mutate(selectedType.id)}
          deleting={deleteType.isPending}
        />
      )}
    </div>
  );
}

// ─── Create dialog ───────────────────────────────────────────────

function CreateTypeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("machine");
  const [description, setDescription] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [tagInput, setTagInput] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const tags = tagInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const res = await fetch("/api/asset-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          description: description.trim() || null,
          manufacturer: manufacturer.trim() || null,
          tags,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-types"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New asset type</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Loss-in-Weight Feeder, Pneumatic Cylinder"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Manufacturer (optional)</Label>
              <Input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Schenck Process"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this equipment class? What does it do?"
            />
          </div>
          <div>
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. conveyor, bulk-handling, gravimetric"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Creating…" : "Create type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Type detail / edit dialog ───────────────────────────────────

function TypeDetailDialog({
  typeId,
  open,
  onOpenChange,
  onDelete,
  deleting,
}: {
  typeId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  const [addingLink, setAddingLink] = useState(false);

  const { data: type, isLoading } = useQuery<AssetTypeDetail>({
    queryKey: ["asset-types", typeId],
    queryFn: async () => (await fetch(`/api/asset-types/${typeId}`)).json(),
    enabled: open,
  });

  const deleteDoc = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/asset-types/${typeId}/documents?docId=${docId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-types", typeId] }),
  });

  const deleteLink = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(`/api/asset-types/${typeId}/links?linkId=${linkId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-types", typeId] }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading || !type ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : editing ? (
          <EditTypeForm
            type={type}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["asset-types"] });
              qc.invalidateQueries({ queryKey: ["asset-types", typeId] });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                <span className="truncate">{type.name}</span>
                <Badge
                  variant="outline"
                  className={cn("text-[9px] h-4 px-1.5 shrink-0", CATEGORY_COLORS[type.category])}
                >
                  {ASSET_CATEGORIES.find((c) => c.value === type.category)?.label ?? type.category}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              {/* Meta row */}
              <div className="text-sm space-y-1.5">
                {type.manufacturer && (
                  <div className="text-muted-foreground text-xs">Manufacturer: <span className="text-foreground">{type.manufacturer}</span></div>
                )}
                {type.description && (
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                )}
                {type.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {type.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5">{tag}</Badge>
                    ))}
                  </div>
                )}
                {(type._count?.instances ?? 0) > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {type._count!.instances} active instance{type._count!.instances !== 1 ? "s" : ""} across your jobs
                  </div>
                )}
              </div>

              {/* Documents section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Documents
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setAddingDoc(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>

                {type.documents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No documents yet.</p>
                ) : (
                  <div className="space-y-1">
                    {type.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 rounded-md border px-3 py-2 bg-card text-sm group">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium text-xs">{doc.title}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {DOC_TYPES.find((d) => d.value === doc.docType)?.label ?? doc.docType}
                          </div>
                        </div>
                        {(doc.url || doc.filePath) && (
                          <a
                            href={doc.url ?? doc.filePath!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => deleteDoc.mutate(doc.id)}
                          className="text-muted-foreground/50 hover:text-rose-500 transition opacity-0 group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {addingDoc && (
                  <AddDocumentForm
                    typeId={typeId}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ["asset-types", typeId] });
                      qc.invalidateQueries({ queryKey: ["asset-types"] });
                      setAddingDoc(false);
                    }}
                    onCancel={() => setAddingDoc(false)}
                  />
                )}
              </div>

              {/* Links section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" /> Web links
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setAddingLink(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>

                {type.links.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No links yet.</p>
                ) : (
                  <div className="space-y-1">
                    {type.links.map((link) => (
                      <div key={link.id} className="flex items-center gap-2 rounded-md border px-3 py-2 bg-card text-sm group">
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium text-xs">{link.title}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{link.url}</div>
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground transition"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={() => deleteLink.mutate(link.id)}
                          className="text-muted-foreground/50 hover:text-rose-500 transition opacity-0 group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {addingLink && (
                  <AddLinkForm
                    typeId={typeId}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ["asset-types", typeId] });
                      qc.invalidateQueries({ queryKey: ["asset-types"] });
                      setAddingLink(false);
                    }}
                    onCancel={() => setAddingLink(false)}
                  />
                )}
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
                    disabled={deleting}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Delete this type?</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
                    <Button size="sm" variant="destructive" onClick={onDelete} disabled={deleting}>
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit type form ───────────────────────────────────────────────

function EditTypeForm({
  type,
  onSaved,
  onCancel,
}: {
  type: AssetTypeDetail;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(type.name);
  const [category, setCategory] = useState(type.category);
  const [description, setDescription] = useState(type.description ?? "");
  const [manufacturer, setManufacturer] = useState(type.manufacturer ?? "");
  const [tagInput, setTagInput] = useState(type.tags.join(", "));

  const save = useMutation({
    mutationFn: async () => {
      const tags = tagInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const res = await fetch(`/api/asset-types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          description: description.trim() || null,
          manufacturer: manufacturer.trim() || null,
          tags,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: onSaved,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit type</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {ASSET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Manufacturer</Label>
            <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Tags (comma-separated)</Label>
          <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Add document inline form ─────────────────────────────────────

function AddDocumentForm({
  typeId,
  onSaved,
  onCancel,
}: {
  typeId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("manual");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/asset-types/${typeId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), docType, url: url.trim() || null, notes: notes.trim() || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: onSaved,
  });

  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Operator Manual v3.2"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          >
            {DOC_TYPES.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="h-8 text-xs"
        />
      </div>
      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => add.mutate()} disabled={add.isPending || !title.trim() || !url.trim()}>
          {add.isPending ? "Adding…" : "Add document"}
        </Button>
      </div>
    </div>
  );
}

// ─── Add link inline form ─────────────────────────────────────────

function AddLinkForm({
  typeId,
  onSaved,
  onCancel,
}: {
  typeId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [linkType, setLinkType] = useState("other");
  const [url, setUrl] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/asset-types/${typeId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), title: title.trim(), linkType }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: onSaved,
  });

  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Manufacturer product page"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={linkType}
            onChange={(e) => setLinkType(e.target.value)}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          >
            {LINK_TYPES.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="h-8 text-xs"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => add.mutate()} disabled={add.isPending || !title.trim() || !url.trim()}>
          {add.isPending ? "Adding…" : "Add link"}
        </Button>
      </div>
    </div>
  );
}
