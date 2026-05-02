"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownAZ,
  Boxes,
  Briefcase,
  Camera,
  Car,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  Drill,
  Eye,
  EyeOff,
  GripVertical,
  Keyboard,
  Laptop,
  LayoutGrid,
  List as ListIcon,
  Lock,
  Pencil,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
  Square,
  Star,
  Tag,
  Trash2,
  Unlock,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Photo = {
  id: string;
  filePath: string;
  fileName: string;
  caption: string | null;
  isCover: boolean;
};

type Item = {
  id: string;
  name: string;
  category: string;
  ownership: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  condition: string;
  proficiency: number | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  currentValue: number | null;
  location: string | null;
  isPrivate: boolean;
  notes: string | null;
  tags: string[];
  photos: Photo[];
};

const CATEGORIES = ["hardware", "software", "vehicle", "safety", "tool", "instrument", "other"] as const;
const OWNERSHIP = ["personal", "shared", "borrowed", "rental"] as const;
const CONDITIONS = ["new", "good", "fair", "poor"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  hardware: "Hardware",
  software: "Software",
  vehicle: "Vehicle",
  safety: "Safety Gear",
  tool: "Tool",
  instrument: "Instrument",
  other: "Other",
};

const OWNERSHIP_BADGE: Record<string, string> = {
  personal: "bg-emerald-500/10 text-emerald-600",
  shared: "bg-blue-500/10 text-blue-600",
  borrowed: "bg-amber-500/10 text-amber-600",
  rental: "bg-purple-500/10 text-purple-600",
};

const CONDITION_BADGE: Record<string, string> = {
  new: "bg-emerald-500/10 text-emerald-600",
  good: "bg-emerald-500/10 text-emerald-600",
  fair: "bg-amber-500/10 text-amber-600",
  poor: "bg-red-500/10 text-red-600",
};

const CATEGORY_BAR_COLOR: Record<string, string> = {
  hardware: "bg-sky-500",
  software: "bg-violet-500",
  vehicle: "bg-amber-500",
  safety: "bg-red-500",
  tool: "bg-emerald-500",
  instrument: "bg-fuchsia-500",
  other: "bg-slate-400",
};

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium leading-none mb-0.5">{label}</div>
      <div className={`text-sm font-semibold leading-tight ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

type ViewMode = "grid" | "list" | "table";
type SortMode = "recent" | "name" | "value-desc" | "proficiency-desc";
type InventoryUiPrefs = {
  view: ViewMode;
  sort: SortMode;
  group: boolean;
  categories: string[]; // empty = all
  ownership: string[]; // empty = all
  tags: string[]; // empty = all
};
const INVENTORY_UI_PREFS_KEY = "resumsify:inventory-ui-prefs-v1";
const DEFAULT_UI_PREFS: InventoryUiPrefs = {
  view: "grid",
  sort: "recent",
  group: false,
  categories: [],
  ownership: [],
  tags: [],
};
function loadUiPrefs(): InventoryUiPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_UI_PREFS };
  try {
    const raw = JSON.parse(localStorage.getItem(INVENTORY_UI_PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_UI_PREFS };
    const view: ViewMode = raw.view === "list" || raw.view === "table" ? raw.view : "grid";
    const sort: SortMode =
      raw.sort === "name" || raw.sort === "value-desc" || raw.sort === "proficiency-desc" ? raw.sort : "recent";
    return {
      view,
      sort,
      group: !!raw.group,
      categories: Array.isArray(raw.categories) ? raw.categories.filter((s: unknown): s is string => typeof s === "string") : [],
      ownership: Array.isArray(raw.ownership) ? raw.ownership.filter((s: unknown): s is string => typeof s === "string") : [],
      tags: Array.isArray(raw.tags) ? raw.tags.filter((s: unknown): s is string => typeof s === "string") : [],
    };
  } catch { return { ...DEFAULT_UI_PREFS }; }
}

const emptyForm = (): Partial<Item> => ({
  name: "",
  category: "tool",
  ownership: "personal",
  condition: "good",
  isPrivate: true,
  proficiency: null,
});

type StarterTemplate = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  form: Partial<Item>;
};
const STARTER_TEMPLATES: StarterTemplate[] = [
  { key: "laptop",      label: "Laptop",      icon: Laptop, form: { name: "Laptop",      category: "hardware",   ownership: "personal", condition: "good", isPrivate: true, tags: ["computer"] } },
  { key: "vehicle",     label: "Vehicle",     icon: Car,    form: { name: "Vehicle",     category: "vehicle",    ownership: "personal", condition: "good", isPrivate: true, tags: [] } },
  { key: "camera",      label: "Camera",      icon: Camera, form: { name: "Camera",      category: "instrument", ownership: "personal", condition: "good", isPrivate: true, tags: ["photo"] } },
  { key: "power-tools", label: "Power tools", icon: Drill,  form: { name: "Power drill", category: "tool",       ownership: "personal", condition: "good", isPrivate: true, tags: ["power-tools"] } },
];

// Highlights all case-insensitive occurrences of `query` inside `text`.
function Highlight({ text, query }: { text: string | null | undefined; query: string }) {
  const t = text ?? "";
  const q = query.trim();
  if (!q || q.length < 1 || !t) return <>{t}</>;
  const lower = t.toLowerCase();
  const ql = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < t.length) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      out.push(t.slice(i));
      break;
    }
    if (idx > i) out.push(t.slice(i, idx));
    out.push(
      <mark key={key++} className="bg-yellow-300/50 dark:bg-yellow-500/40 text-inherit rounded px-0.5">
        {t.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return <>{out}</>;
}

function ConditionBadge({
  item,
  open,
  onOpen,
  onSelect,
}: {
  item: Item;
  open: boolean;
  onOpen: () => void;
  onSelect: (v: string) => void;
}) {
  return (
    <span className="relative inline-block" data-inline-popover>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className={`px-1.5 py-0.5 rounded-full text-[10px] capitalize hover:ring-1 hover:ring-foreground/20 transition-shadow cursor-pointer ${CONDITION_BADGE[item.condition]}`}
        title="Click to change condition"
      >
        {item.condition}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 min-w-[120px] rounded-md border bg-popover shadow-lg py-1">
          {CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(c); }}
              className={`w-full text-left text-xs px-2 py-1 hover:bg-muted capitalize flex items-center justify-between ${item.condition === c ? "font-semibold" : ""}`}
            >
              <span>{c}</span>
              {item.condition === c && <span className="text-[10px] text-muted-foreground">current</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function OwnershipBadge({
  item,
  open,
  onOpen,
  onSelect,
}: {
  item: Item;
  open: boolean;
  onOpen: () => void;
  onSelect: (v: string) => void;
}) {
  return (
    <span className="relative inline-block" data-inline-popover>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className={`px-1.5 py-0.5 rounded-full text-[10px] capitalize hover:ring-1 hover:ring-foreground/20 transition-shadow cursor-pointer ${OWNERSHIP_BADGE[item.ownership]}`}
        title="Click to change ownership"
      >
        {item.ownership}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 min-w-[140px] rounded-md border bg-popover shadow-lg py-1">
          {OWNERSHIP.map((o) => (
            <button
              key={o}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(o); }}
              className={`w-full text-left text-xs px-2 py-1 hover:bg-muted capitalize flex items-center justify-between ${item.ownership === o ? "font-semibold" : ""}`}
            >
              <span>{o}</span>
              {item.ownership === o && <span className="text-[10px] text-muted-foreground">current</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function PersonalInventory({
  focusedPositionId = null,
  focusedPositionLabel = null,
}: {
  focusedPositionId?: string | null;
  focusedPositionLabel?: string | null;
} = {}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterOwnership, setFilterOwnership] = useState<string>("all");
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [saving, setSaving] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [uiPrefs, setUiPrefs] = useState<InventoryUiPrefs>(() => loadUiPrefs());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMenu, setBulkMenu] = useState<null | "category" | "ownership" | "condition">(null);
  const [lightbox, setLightbox] = useState<{ item: Item; index: number } | null>(null);
  const [dragPhotoId, setDragPhotoId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [inlinePopover, setInlinePopover] = useState<null | { itemId: string; field: "condition" | "ownership" }>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSelection = () => setSelected(new Set());
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(INVENTORY_UI_PREFS_KEY, JSON.stringify(uiPrefs)); } catch { /* noop */ }
  }, [uiPrefs]);
  const toggleCategoryChip = (c: string) => setUiPrefs((p) => ({
    ...p,
    categories: p.categories.includes(c) ? p.categories.filter((x) => x !== c) : [...p.categories, c],
  }));
  const toggleOwnershipChip = (o: string) => setUiPrefs((p) => ({
    ...p,
    ownership: p.ownership.includes(o) ? p.ownership.filter((x) => x !== o) : [...p.ownership, o],
  }));
  const toggleTagChip = (t: string) => setUiPrefs((p) => ({
    ...p,
    tags: p.tags.includes(t) ? p.tags.filter((x) => x !== t) : [...p.tags, t],
  }));
  const toggleGroupCollapse = (key: string) => setCollapsedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  async function assignToPosition(item: Item) {
    if (!focusedPositionId) return;
    setAssigningId(item.id);
    try {
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId: focusedPositionId,
          name: item.name,
          category: item.category === "software" ? "software" : "hardware",
          manufacturer: item.manufacturer,
          model: item.model,
          serialNumber: item.serialNumber,
          condition: item.condition,
          notes: item.notes,
          usage: item.ownership === "personal" ? "used" : "worked-on",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Added "${item.name}" to ${focusedPositionLabel ?? "this job"}`);
    } catch (err) {
      toast.error("Failed to add to job");
      console.error(err);
    } finally {
      setAssigningId(null);
    }
  }

  async function bulkPatch(fields: Record<string, unknown>, label: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const tid = toast.loading(`${label} ${ids.length} item${ids.length === 1 ? "" : "s"}…`);
    try {
      const results = await Promise.allSettled(ids.map((id) =>
        fetch("/api/personal-equipment", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...fields }),
        }).then((r) => { if (!r.ok) throw new Error(`${id}: ${r.status}`); }),
      ));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      if (fail === 0) toast.success(`${label} ${ok} item${ok === 1 ? "" : "s"}`, { id: tid });
      else toast.error(`${label}: ${ok} ok, ${fail} failed`, { id: tid });
      clearSelection();
      setBulkMenu(null);
      await load();
    } catch (err) {
      toast.error("Bulk update failed", { id: tid });
      console.error(err);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkBusy(true);
    const tid = toast.loading(`Deleting ${ids.length}…`);
    try {
      const results = await Promise.allSettled(ids.map((id) =>
        fetch(`/api/personal-equipment?id=${encodeURIComponent(id)}`, { method: "DELETE" })
          .then((r) => { if (!r.ok) throw new Error(`${id}: ${r.status}`); }),
      ));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      if (fail === 0) toast.success(`Deleted ${ok}`, { id: tid });
      else toast.error(`Deleted ${ok}, ${fail} failed`, { id: tid });
      clearSelection();
      await load();
    } catch (err) {
      toast.error("Bulk delete failed", { id: tid });
      console.error(err);
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCsv(rows: Item[]) {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const cols: { key: string; get: (i: Item) => unknown }[] = [
      { key: "name", get: (i) => i.name },
      { key: "category", get: (i) => i.category },
      { key: "ownership", get: (i) => i.ownership },
      { key: "condition", get: (i) => i.condition },
      { key: "manufacturer", get: (i) => i.manufacturer ?? "" },
      { key: "model", get: (i) => i.model ?? "" },
      { key: "serialNumber", get: (i) => i.serialNumber ?? "" },
      { key: "proficiency", get: (i) => i.proficiency ?? "" },
      { key: "purchaseDate", get: (i) => i.purchaseDate ?? "" },
      { key: "purchasePrice", get: (i) => i.purchasePrice ?? "" },
      { key: "currentValue", get: (i) => i.currentValue ?? "" },
      { key: "location", get: (i) => i.location ?? "" },
      { key: "isPrivate", get: (i) => (i.isPrivate ? "true" : "false") },
      { key: "tags", get: (i) => (i.tags ?? []).join("|") },
      { key: "photoCount", get: (i) => i.photos.length },
      { key: "notes", get: (i) => i.notes ?? "" },
    ];
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = cols.map((c) => c.key).join(",");
    const body = rows.map((r) => cols.map((c) => escape(c.get(r))).join(",")).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `inventory-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} item${rows.length === 1 ? "" : "s"}`);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/personal-equipment");
      if (!res.ok) throw new Error(await res.text());
      setItems(await res.json());
    } catch (err) {
      toast.error("Failed to load inventory");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cats = uiPrefs.categories;
    const owns = uiPrefs.ownership;
    const tagSel = uiPrefs.tags;
    return items.filter((i) => {
      if (filterCategory !== "all" && i.category !== filterCategory) return false;
      if (filterOwnership !== "all" && i.ownership !== filterOwnership) return false;
      if (cats.length && !cats.includes(i.category)) return false;
      if (owns.length && !owns.includes(i.ownership)) return false;
      if (tagSel.length && !tagSel.every((t) => (i.tags ?? []).includes(t))) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.manufacturer ?? "").toLowerCase().includes(q) ||
        (i.model ?? "").toLowerCase().includes(q) ||
        (i.serialNumber ?? "").toLowerCase().includes(q) ||
        (i.location ?? "").toLowerCase().includes(q) ||
        (i.notes ?? "").toLowerCase().includes(q) ||
        (i.tags ?? []).some((t) => t.includes(q))
      );
    });
  }, [items, search, filterCategory, filterOwnership, uiPrefs.categories, uiPrefs.ownership, uiPrefs.tags]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (uiPrefs.sort) {
      case "name":
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "value-desc":
        arr.sort((a, b) => (b.currentValue ?? b.purchasePrice ?? 0) - (a.currentValue ?? a.purchasePrice ?? 0));
        break;
      case "proficiency-desc":
        arr.sort((a, b) => (b.proficiency ?? -1) - (a.proficiency ?? -1));
        break;
      case "recent":
      default:
        // API already returns newest first; keep order from server
        break;
    }
    return arr;
  }, [filtered, uiPrefs.sort]);

  const groupedSorted = useMemo(() => {
    if (!uiPrefs.group) return null;
    const map = new Map<string, Item[]>();
    for (const it of sorted) {
      const k = it.category;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    // Order by CATEGORIES enum so output is stable
    return CATEGORIES.map((c) => [c, map.get(c) ?? []] as const).filter(([, arr]) => arr.length > 0);
  }, [sorted, uiPrefs.group]);

  const totalValue = useMemo(
    () => items.reduce((sum, i) => sum + (i.currentValue ?? i.purchasePrice ?? 0), 0),
    [items],
  );

  async function saveItem() {
    if (!editing?.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const res = await fetch("/api/personal-equipment", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved: Item = await res.json();
      toast.success(isNew ? "Added — you can now upload photos" : "Updated");
      // Keep dialog open and switch to edit mode so the user can add photos
      setEditing(saved);
      await load();
    } catch (err) {
      toast.error("Save failed");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item permanently?")) return;
    try {
      const res = await fetch(`/api/personal-equipment?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Deleted");
      await load();
    } catch (err) {
      toast.error("Delete failed");
      console.error(err);
    }
  }

  async function refreshEditing(equipmentId: string) {
    try {
      const res = await fetch("/api/personal-equipment");
      if (!res.ok) return;
      const fresh: Item[] = await res.json();
      setItems(fresh);
      const updated = fresh.find((i) => i.id === equipmentId);
      if (updated) setEditing(updated);
    } catch (err) {
      console.error(err);
    }
  }

  async function uploadPhoto(equipmentId: string, file: File, isFirst: boolean) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    const fd = new FormData();
    fd.append("equipmentId", equipmentId);
    fd.append("file", file);
    if (isFirst) fd.append("isCover", "true");
    const tid = toast.loading("Uploading photo…");
    const res = await fetch("/api/personal-equipment/photos", { method: "POST", body: fd });
    if (!res.ok) {
      toast.error("Upload failed", { id: tid });
      return;
    }
    toast.success("Photo added", { id: tid });
    if (editing?.id === equipmentId) {
      await refreshEditing(equipmentId);
    } else {
      await load();
    }
  }

  async function deletePhoto(id: string, equipmentId: string) {
    const res = await fetch(`/api/personal-equipment/photos?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    if (editing?.id === equipmentId) {
      await refreshEditing(equipmentId);
    } else {
      await load();
    }
  }

  async function setCover(id: string, equipmentId: string) {
    const res = await fetch("/api/personal-equipment/photos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isCover: true }),
    });
    if (!res.ok) {
      toast.error("Failed");
      return;
    }
    if (editing?.id === equipmentId) {
      await refreshEditing(equipmentId);
    } else {
      await load();
    }
  }

  async function reorderPhotos(equipmentId: string, orderedIds: string[]) {
    // Optimistic update of editing.photos order
    if (editing?.id === equipmentId && editing.photos) {
      const byId = new Map(editing.photos.map((p) => [p.id, p]));
      const next = orderedIds.map((id) => byId.get(id)).filter((p): p is Photo => !!p);
      setEditing({ ...editing, photos: next });
    }
    setReorderBusy(true);
    try {
      const res = await fetch("/api/personal-equipment/photos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentId, order: orderedIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Refresh from server so sortOrder is reflected for the lightbox / list
      if (editing?.id === equipmentId) await refreshEditing(equipmentId);
      else await load();
    } catch (err) {
      toast.error("Reorder failed");
      console.error(err);
      if (editing?.id === equipmentId) await refreshEditing(equipmentId);
    } finally {
      setReorderBusy(false);
    }
  }

  async function togglePrivacy(item: Item) {
    // Optimistic flip
    const next = !item.isPrivate;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isPrivate: next } : i)));
    try {
      const res = await fetch("/api/personal-equipment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, isPrivate: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(next ? "Made private" : "Made public");
    } catch (err) {
      // Revert
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isPrivate: !next } : i)));
      toast.error("Failed to update");
      console.error(err);
    }
  }

  // Optimistic single-field PATCH (used by inline popovers on condition/ownership badges).
  async function inlinePatch(itemId: string, field: "condition" | "ownership", value: string) {
    let prev: Item | undefined;
    setItems((curr) => curr.map((i) => {
      if (i.id !== itemId) return i;
      prev = i;
      return { ...i, [field]: value };
    }));
    setInlinePopover(null);
    try {
      const res = await fetch("/api/personal-equipment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, [field]: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`${field === "condition" ? "Condition" : "Ownership"} \u2192 ${value}`);
    } catch (err) {
      if (prev) setItems((curr) => curr.map((i) => (i.id === itemId ? prev! : i)));
      toast.error("Update failed");
      console.error(err);
    }
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.category] = (counts[i.category] ?? 0) + 1;
    return counts;
  }, [items]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) for (const t of i.tags ?? []) counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  }, [items]);

  const stats = useMemo(() => {
    const publicCount = items.filter((i) => !i.isPrivate).length;
    const privateCount = items.length - publicCount;
    const conditionCounts: Record<string, number> = {};
    for (const i of items) conditionCounts[i.condition] = (conditionCounts[i.condition] ?? 0) + 1;
    const ownershipCounts: Record<string, number> = {};
    for (const i of items) ownershipCounts[i.ownership] = (ownershipCounts[i.ownership] ?? 0) + 1;
    const withPhotos = items.filter((i) => i.photos && i.photos.length > 0).length;
    const proficiencies = items.map((i) => i.proficiency).filter((p): p is number => typeof p === "number");
    const avgProficiency = proficiencies.length ? proficiencies.reduce((a, b) => a + b, 0) / proficiencies.length : null;
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { publicCount, privateCount, conditionCounts, ownershipCounts, withPhotos, avgProficiency, topCategory };
  }, [items, categoryCounts]);

  // Lightbox keyboard nav
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowRight") setLightbox((lb) => lb ? { ...lb, index: (lb.index + 1) % lb.item.photos.length } : lb);
      else if (e.key === "ArrowLeft") setLightbox((lb) => lb ? { ...lb, index: (lb.index - 1 + lb.item.photos.length) % lb.item.photos.length } : lb);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // When items refresh, keep lightbox in sync (photos may have been reordered/deleted)
  useEffect(() => {
    if (!lightbox) return;
    const fresh = items.find((i) => i.id === lightbox.item.id);
    if (!fresh || fresh.photos.length === 0) {
      setLightbox(null);
      return;
    }
    if (fresh !== lightbox.item || lightbox.index >= fresh.photos.length) {
      setLightbox({ item: fresh, index: Math.min(lightbox.index, fresh.photos.length - 1) });
    }
  }, [items, lightbox]);

  // Global keyboard shortcuts: /, n, Esc, ArrowUp/Down, Space, Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = !!target && (
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
      );
      // Esc — clear popovers/menus, then dialog, then selection/focus
      if (e.key === "Escape") {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (inlinePopover) { setInlinePopover(null); return; }
        if (bulkMenu) { setBulkMenu(null); return; }
        if (isEditable && tag === "INPUT" && (target as HTMLInputElement).type === "text" && search) {
          // let search clear handle
          setSearch("");
          return;
        }
        if (editing) { setEditing(null); return; }
        if (selected.size > 0) { clearSelection(); return; }
        if (focusedIndex !== null) { setFocusedIndex(null); return; }
        return;
      }
      // Skip the shortcuts below while typing in an input/textarea
      if (isEditable) {
        return;
      }
      // Ignore when modal/dialog is open
      if (editing) return;
      // "/" — focus the search box
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      // "n" — open new-item dialog
      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setEditing(emptyForm());
        return;
      }
      // "?" — toggle shortcuts overlay
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }
      // Arrow navigation through visible items
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (sorted.length === 0) return;
        e.preventDefault();
        setFocusedIndex((idx) => {
          const dir = e.key === "ArrowDown" ? 1 : -1;
          if (idx === null) return dir > 0 ? 0 : sorted.length - 1;
          const next = (idx + dir + sorted.length) % sorted.length;
          return next;
        });
        return;
      }
      // Space — toggle selection on focused item
      if (e.key === " " && focusedIndex !== null) {
        const item = sorted[focusedIndex];
        if (item) {
          e.preventDefault();
          toggleSelect(item.id);
        }
        return;
      }
      // Enter — open editor on focused item
      if (e.key === "Enter" && focusedIndex !== null) {
        const item = sorted[focusedIndex];
        if (item) {
          e.preventDefault();
          setEditing(item);
        }
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, focusedIndex, editing, selected, bulkMenu, inlinePopover, search, showShortcuts]);

  // Close inline popover on outside click
  useEffect(() => {
    if (!inlinePopover) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-inline-popover]")) return;
      setInlinePopover(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [inlinePopover]);

  // Reset focused index when sort/filter shrinks the list
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex >= sorted.length) {
      setFocusedIndex(sorted.length === 0 ? null : sorted.length - 1);
    }
  }, [sorted, focusedIndex]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex === null) return;
    const item = sorted[focusedIndex];
    if (!item) return;
    const el = document.querySelector(`[data-inv-row="${item.id}"]`);
    if (el && "scrollIntoView" in el) {
      (el as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex, sorted]);

  return (
    <div className="space-y-4">
      {/* Focused-position banner */}
      {focusedPositionId && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-500/10 px-3 py-1.5 text-xs">
          <Briefcase className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="text-emerald-700 dark:text-emerald-400">
            Click <span className="font-semibold">Use here</span> on any item to add it to{" "}
            <span className="font-semibold">{focusedPositionLabel ?? "this job"}</span>
          </span>
        </div>
      )}

      {/* Header / summary */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-cyan-500" />
          <h1 className="text-xl font-semibold">Personal Inventory</h1>
        </div>
        <Button className="ml-auto" onClick={() => setEditing(emptyForm())}>
          <Plus className="h-4 w-4 mr-1" /> Add item
          <kbd className="ml-2 hidden sm:inline-flex items-center justify-center h-4 px-1 rounded border border-foreground/20 bg-background/20 text-[10px] font-mono">N</kbd>
        </Button>
        <button
          type="button"
          onClick={() => setShowShortcuts(true)}
          title="Keyboard shortcuts"
          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </div>

      {/* Stats summary */}
      {items.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="Items" value={items.length.toString()} accent="text-foreground" />
            <StatTile
              label="Est. value"
              value={totalValue > 0 ? `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
              accent="text-emerald-600"
            />
            <StatTile
              label="Public / Private"
              value={`${stats.publicCount} / ${stats.privateCount}`}
              accent="text-foreground"
            />
            <StatTile
              label="With photos"
              value={`${stats.withPhotos}/${items.length}`}
              accent={stats.withPhotos === items.length ? "text-emerald-600" : "text-muted-foreground"}
            />
          </div>

          {/* Category sparkbar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">By category</span>
              {stats.avgProficiency !== null && (
                <span className="text-[10px] text-muted-foreground">
                  Avg proficiency: <span className="font-medium text-foreground">{stats.avgProficiency.toFixed(1)}/5</span>
                </span>
              )}
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-background border">
              {CATEGORIES.map((c) => {
                const n = categoryCounts[c] ?? 0;
                if (n === 0) return null;
                const pct = (n / items.length) * 100;
                return (
                  <div
                    key={c}
                    className={CATEGORY_BAR_COLOR[c] ?? "bg-slate-400"}
                    style={{ width: `${pct}%` }}
                    title={`${CATEGORY_LABELS[c]}: ${n}`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {CATEGORIES.map((c) => {
                const n = categoryCounts[c] ?? 0;
                if (n === 0) return null;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFilterCategory(filterCategory === c ? "all" : c)}
                    className={`flex items-center gap-1 text-[10px] transition-opacity ${filterCategory !== "all" && filterCategory !== c ? "opacity-40" : ""} hover:opacity-100`}
                    title={`Filter by ${CATEGORY_LABELS[c]}`}
                  >
                    <span className={`block h-2 w-2 rounded-sm ${CATEGORY_BAR_COLOR[c] ?? "bg-slate-400"}`} />
                    <span className="text-muted-foreground">{CATEGORY_LABELS[c]}</span>
                    <span className="font-medium text-foreground">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, model, serial, location… (press /)"
              className="pl-7 pr-7 h-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                title="Clear search (Esc)"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-md border bg-background h-9 overflow-hidden">
            <button
              type="button"
              onClick={() => setUiPrefs((p) => ({ ...p, view: "grid" }))}
              title="Grid view"
              className={`h-full px-2 flex items-center ${uiPrefs.view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setUiPrefs((p) => ({ ...p, view: "list" }))}
              title="List view"
              className={`h-full px-2 flex items-center border-l ${uiPrefs.view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setUiPrefs((p) => ({ ...p, view: "table" }))}
              title="Compact table"
              className={`h-full px-2 flex items-center border-l ${uiPrefs.view === "table" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Sort */}
          <Select value={uiPrefs.sort} onValueChange={(v) => setUiPrefs((p) => ({ ...p, sort: (v as SortMode) ?? "recent" }))}>
            <SelectTrigger className="h-9 w-[170px]">
              <SlidersHorizontal className="h-3 w-3 mr-1 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recently added</SelectItem>
              <SelectItem value="name"><span className="inline-flex items-center gap-1.5"><ArrowDownAZ className="h-3 w-3" /> Name A → Z</span></SelectItem>
              <SelectItem value="value-desc"><span className="inline-flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> Highest value</span></SelectItem>
              <SelectItem value="proficiency-desc"><span className="inline-flex items-center gap-1.5"><Star className="h-3 w-3" /> Proficiency</span></SelectItem>
            </SelectContent>
          </Select>

          {/* Group toggle */}
          <Button
            type="button"
            size="sm"
            variant={uiPrefs.group ? "default" : "outline"}
            className="h-9"
            onClick={() => setUiPrefs((p) => ({ ...p, group: !p.group }))}
            title="Group items by category"
          >
            Group
          </Button>
        </div>

        {/* Chip strip — categories + ownership multi-select */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => {
            const active = uiPrefs.categories.includes(c);
            const n = categoryCounts[c] ?? 0;
            if (n === 0 && !active) return null;
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategoryChip(c)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >
                {CATEGORY_LABELS[c]} <span className={active ? "opacity-80" : "opacity-60"}>({n})</span>
              </button>
            );
          })}
          <span className="mx-1 self-center h-3 w-px bg-border" />
          {OWNERSHIP.map((o) => {
            const active = uiPrefs.ownership.includes(o);
            const n = items.filter((i) => i.ownership === o).length;
            if (n === 0 && !active) return null;
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggleOwnershipChip(o)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >
                {o.charAt(0).toUpperCase() + o.slice(1)} <span className={active ? "opacity-80" : "opacity-60"}>({n})</span>
              </button>
            );
          })}
          {(uiPrefs.categories.length > 0 || uiPrefs.ownership.length > 0 || uiPrefs.tags.length > 0) && (
            <button
              type="button"
              onClick={() => setUiPrefs((p) => ({ ...p, categories: [], ownership: [], tags: [] }))}
              className="text-[11px] px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* Tag chips (only render when tags exist) */}
        {Object.keys(tagCounts).length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground self-center mr-1">Tags</span>
            {Object.entries(tagCounts)
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([t, n]) => {
                const active = uiPrefs.tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTagChip(t)}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${active ? "bg-cyan-500 text-white border-cyan-500" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {t}
                    <span className={active ? "opacity-90" : "opacity-60"}>({n})</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {(() => {
        const visibleIds = sorted.map((i) => i.id);
        const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
        const selectAllVisible = () => {
          if (allSelected) {
            setSelected((prev) => {
              const next = new Set(prev);
              for (const id of visibleIds) next.delete(id);
              return next;
            });
          } else {
            setSelected((prev) => {
              const next = new Set(prev);
              for (const id of visibleIds) next.add(id);
              return next;
            });
          }
        };
        if (selected.size === 0) {
          return (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={visibleIds.length === 0}
                className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5" /> Select all ({visibleIds.length})
              </button>
              <span className="ml-auto inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => exportCsv(sorted)}
                  disabled={sorted.length === 0}
                  className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50"
                  title="Export currently visible items as CSV"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </span>
            </div>
          );
        }
        return (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-md border border-foreground/20 bg-background/95 backdrop-blur px-2 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={selectAllVisible}
              className="inline-flex items-center gap-1 text-xs font-medium"
              title={allSelected ? "Deselect all visible" : "Select all visible"}
            >
              {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-foreground" /> : <Square className="h-3.5 w-3.5" />}
              {selected.size} selected
            </button>
            <span className="h-4 w-px bg-border" />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => bulkPatch({ isPrivate: false }, "Made public")}>
              <Eye className="h-3 w-3 mr-1" /> Public
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => bulkPatch({ isPrivate: true }, "Made private")}>
              <EyeOff className="h-3 w-3 mr-1" /> Private
            </Button>

            {/* Tag-style metadata setters */}
            <div className="relative">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => setBulkMenu(bulkMenu === "category" ? null : "category")}>
                <Tag className="h-3 w-3 mr-1" /> Category
              </Button>
              {bulkMenu === "category" && (
                <div className="absolute z-30 mt-1 left-0 min-w-[160px] rounded-md border bg-popover shadow-md py-1">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-full text-left text-xs px-2 py-1 hover:bg-muted flex items-center gap-2"
                      onClick={() => bulkPatch({ category: c }, `Set category → ${CATEGORY_LABELS[c]}`)}
                    >
                      <span className={`block h-2 w-2 rounded-sm ${CATEGORY_BAR_COLOR[c] ?? "bg-slate-400"}`} />
                      {CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => setBulkMenu(bulkMenu === "ownership" ? null : "ownership")}>
                Ownership
              </Button>
              {bulkMenu === "ownership" && (
                <div className="absolute z-30 mt-1 left-0 min-w-[140px] rounded-md border bg-popover shadow-md py-1">
                  {OWNERSHIP.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className="w-full text-left text-xs px-2 py-1 hover:bg-muted capitalize"
                      onClick={() => bulkPatch({ ownership: o }, `Set ownership → ${o}`)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => setBulkMenu(bulkMenu === "condition" ? null : "condition")}>
                Condition
              </Button>
              {bulkMenu === "condition" && (
                <div className="absolute z-30 mt-1 left-0 min-w-[120px] rounded-md border bg-popover shadow-md py-1">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-full text-left text-xs px-2 py-1 hover:bg-muted capitalize"
                      onClick={() => bulkPatch({ condition: c }, `Set condition → ${c}`)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => {
              const raw = window.prompt("Add tags (comma-separated)");
              if (raw == null) return;
              const tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
              if (tags.length === 0) return;
              bulkPatch({ tagsAdd: tags }, `Tagged \"${tags.join(", ")}\" on`);
            }}>
              <Tag className="h-3 w-3 mr-1" /> Tag
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => {
              const raw = window.prompt("Remove tags (comma-separated)");
              if (raw == null) return;
              const tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
              if (tags.length === 0) return;
              bulkPatch({ tagsRemove: tags }, `Removed \"${tags.join(", ")}\" from`);
            }}>
              <X className="h-3 w-3 mr-1" /> Untag
            </Button>

            <span className="h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={bulkBusy}
              onClick={() => exportCsv(items.filter((i) => selected.has(i.id)))}
            >
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              disabled={bulkBusy}
              onClick={bulkDelete}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={clearSelection} disabled={bulkBusy}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        );
      })()}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                <Boxes className="h-6 w-6 text-cyan-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Add your first item</h3>
                <p className="text-xs text-muted-foreground max-w-md">
                  Track tools, vehicles, gear, and instruments. Pick a starter to skip the boring fields, or click "Add item" for a blank form.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {STARTER_TEMPLATES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setEditing({ ...emptyForm(), ...t.form })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-background hover:bg-muted text-xs transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 text-cyan-600" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>or</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(emptyForm())}>
                  <Plus className="h-3 w-3 mr-1" /> Blank item
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Wrench className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No items match your filters.</p>
            </CardContent>
          </Card>
        )
      ) : (
        (() => {
          const renderItems = (arr: Item[]) => {
            if (uiPrefs.view === "table") {
              return (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="w-8 px-2 py-1.5"></th>
                        <th className="text-left px-2 py-1.5 font-medium">Name</th>
                        <th className="text-left px-2 py-1.5 font-medium">Category</th>
                        <th className="text-left px-2 py-1.5 font-medium">Condition</th>
                        <th className="text-right px-2 py-1.5 font-medium">Value</th>
                        <th className="text-right px-2 py-1.5 font-medium w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arr.map((item) => {
                        const value = item.currentValue ?? item.purchasePrice;
                        const isSel = selected.has(item.id);
                        const isFocused = focusedIndex !== null && sorted[focusedIndex]?.id === item.id;
                        return (
                          <tr key={item.id} data-inv-row={item.id} className={`border-t hover:bg-muted/30 group ${isSel ? "bg-foreground/[0.04]" : ""} ${isFocused ? "outline outline-2 outline-cyan-500/60 outline-offset-[-2px]" : ""}`}>
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={isSel}
                                onChange={() => toggleSelect(item.id)}
                                className="h-3.5 w-3.5 cursor-pointer"
                                aria-label={`Select ${item.name}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="font-medium truncate max-w-[200px]"><Highlight text={item.name} query={search} /></div>
                              {(item.manufacturer || item.model) && (
                                <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                  <Highlight text={[item.manufacturer, item.model].filter(Boolean).join(" ")} query={search} />
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className="inline-flex items-center gap-1">
                                <span className={`block h-2 w-2 rounded-sm ${CATEGORY_BAR_COLOR[item.category] ?? "bg-slate-400"}`} />
                                {CATEGORY_LABELS[item.category]}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">
                              <ConditionBadge
                                item={item}
                                open={inlinePopover?.itemId === item.id && inlinePopover.field === "condition"}
                                onOpen={() => setInlinePopover({ itemId: item.id, field: "condition" })}
                                onSelect={(v) => inlinePatch(item.id, "condition", v)}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {value ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {focusedPositionId && (
                                  <button type="button" className="p-1 rounded hover:bg-emerald-500/10 disabled:opacity-50" onClick={() => assignToPosition(item)} disabled={assigningId === item.id} title={`Add to ${focusedPositionLabel ?? "focused job"}`}>
                                    <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                                  </button>
                                )}
                                <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => togglePrivacy(item)} title={item.isPrivate ? "Make public" : "Make private"}>
                                  {item.isPrivate ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Unlock className="h-3.5 w-3.5 text-blue-500" />}
                                </button>
                                <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => setEditing(item)} title="Edit">
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button type="button" className="p-1 rounded hover:bg-red-500/10" onClick={() => deleteItem(item.id)} title="Delete">
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            }
            if (uiPrefs.view === "list") {
              return (
                <div className="space-y-2">
                  {arr.map((item) => {
                    const cover = item.photos.find((p) => p.isCover) ?? item.photos[0];
                    const value = item.currentValue ?? item.purchasePrice;
                    const isSel = selected.has(item.id);
                    const isFocused = focusedIndex !== null && sorted[focusedIndex]?.id === item.id;
                    return (
                      <Card key={item.id} data-inv-row={item.id} className={`overflow-hidden group ${isSel ? "ring-2 ring-foreground/40" : ""} ${isFocused ? "ring-2 ring-cyan-500/70" : ""}`}>
                        <div className="flex items-stretch gap-3 p-2">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(item.id)}
                            className="h-3.5 w-3.5 mt-1 cursor-pointer self-start"
                            aria-label={`Select ${item.name}`}
                          />
                          <div className={`h-14 w-14 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center ${cover ? "cursor-zoom-in" : ""}`} onClick={() => { if (cover) setLightbox({ item, index: 0 }); }}>
                            {cover ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={cover.filePath} alt={cover.caption ?? item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Camera className="h-5 w-5 text-muted-foreground/40" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate"><Highlight text={item.name} query={search} /></div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {[item.manufacturer, item.model].filter(Boolean).length
                                    ? <Highlight text={[item.manufacturer, item.model].filter(Boolean).join(" ")} query={search} />
                                    : CATEGORY_LABELS[item.category]}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {focusedPositionId && (
                                  <button type="button" className="p-1 rounded hover:bg-emerald-500/10 disabled:opacity-50" onClick={() => assignToPosition(item)} disabled={assigningId === item.id} title={`Add to ${focusedPositionLabel ?? "focused job"}`}>
                                    <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                                  </button>
                                )}
                                <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => togglePrivacy(item)} title={item.isPrivate ? "Make public" : "Make private"}>
                                  {item.isPrivate ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Unlock className="h-3.5 w-3.5 text-blue-500" />}
                                </button>
                                <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => setEditing(item)} title="Edit">
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button type="button" className="p-1 rounded hover:bg-red-500/10" onClick={() => deleteItem(item.id)} title="Delete">
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                              <OwnershipBadge
                                item={item}
                                open={inlinePopover?.itemId === item.id && inlinePopover.field === "ownership"}
                                onOpen={() => setInlinePopover({ itemId: item.id, field: "ownership" })}
                                onSelect={(v) => inlinePatch(item.id, "ownership", v)}
                              />
                              <ConditionBadge
                                item={item}
                                open={inlinePopover?.itemId === item.id && inlinePopover.field === "condition"}
                                onOpen={() => setInlinePopover({ itemId: item.id, field: "condition" })}
                                onSelect={(v) => inlinePatch(item.id, "condition", v)}
                              />
                              <span className="px-1.5 py-0.5 rounded-full bg-muted">{CATEGORY_LABELS[item.category]}</span>
                              {item.proficiency && <span className="px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600">Skill {item.proficiency}/5</span>}
                              {!item.isPrivate && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600">public</span>}
                              {(item.tags ?? []).map((t) => (
                                <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600">
                                  <Tag className="h-2 w-2" />{t}
                                </span>
                              ))}
                              {value != null && <span className="ml-auto text-muted-foreground tabular-nums">${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              );
            }
            // Default: grid (existing card layout)
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {arr.map((item) => {
                  const cover = item.photos.find((p) => p.isCover) ?? item.photos[0];
                  const isSel = selected.has(item.id);
                  const isFocused = focusedIndex !== null && sorted[focusedIndex]?.id === item.id;
                  return (
                    <Card key={item.id} data-inv-row={item.id} className={`overflow-hidden group relative ${isSel ? "ring-2 ring-foreground/40" : ""} ${isFocused ? "ring-2 ring-cyan-500/70" : ""}`}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(item.id)}
                        className={`absolute top-2 left-2 z-10 h-4 w-4 cursor-pointer rounded bg-background/90 ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
                        aria-label={`Select ${item.name}`}
                      />
                      {cover ? (
                        <div className="relative aspect-video bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cover.filePath}
                            alt={cover.caption ?? item.name}
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={() => setLightbox({ item, index: 0 })}
                          />
                          {item.photos.length > 1 && (
                            <span className="absolute bottom-1 right-1 rounded bg-black/60 text-white text-[10px] px-1.5 py-0.5">
                              {item.photos.length} photos
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); togglePrivacy(item); }}
                            title={item.isPrivate ? "Make public" : "Make private"}
                            className={`absolute top-1 right-1 p-1 rounded-full backdrop-blur ${item.isPrivate ? "bg-black/40 text-white/90 hover:bg-black/60" : "bg-blue-500/80 text-white hover:bg-blue-500"}`}
                          >
                            {item.isPrivate ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          </button>
                        </div>
                      ) : (
                        <div className="aspect-video bg-muted flex items-center justify-center relative">
                          <Camera className="h-6 w-6 text-muted-foreground/40" />
                          <button
                            type="button"
                            onClick={() => togglePrivacy(item)}
                            title={item.isPrivate ? "Make public" : "Make private"}
                            className={`absolute top-1 right-1 p-1 rounded-full ${item.isPrivate ? "bg-muted text-muted-foreground hover:bg-muted/80" : "bg-blue-500 text-white hover:bg-blue-600"}`}
                          >
                            {item.isPrivate ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          </button>
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="text-sm truncate"><Highlight text={item.name} query={search} /></CardTitle>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {[item.manufacturer, item.model].filter(Boolean).length
                                ? <Highlight text={[item.manufacturer, item.model].filter(Boolean).join(" ")} query={search} />
                                : CATEGORY_LABELS[item.category]}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {focusedPositionId && (
                              <button
                                type="button"
                                className="p-1 rounded hover:bg-emerald-500/10 disabled:opacity-50"
                                onClick={() => assignToPosition(item)}
                                disabled={assigningId === item.id}
                                title={`Add to ${focusedPositionLabel ?? "focused job"}`}
                              >
                                <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                              </button>
                            )}
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-muted"
                              onClick={() => togglePrivacy(item)}
                              title={item.isPrivate ? "Make public" : "Make private"}
                            >
                              {item.isPrivate ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Unlock className="h-3.5 w-3.5 text-blue-500" />}
                            </button>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-muted"
                              onClick={() => setEditing(item)}
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-red-500/10"
                              onClick={() => deleteItem(item.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-0">
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          <OwnershipBadge
                            item={item}
                            open={inlinePopover?.itemId === item.id && inlinePopover.field === "ownership"}
                            onOpen={() => setInlinePopover({ itemId: item.id, field: "ownership" })}
                            onSelect={(v) => inlinePatch(item.id, "ownership", v)}
                          />
                          <ConditionBadge
                            item={item}
                            open={inlinePopover?.itemId === item.id && inlinePopover.field === "condition"}
                            onOpen={() => setInlinePopover({ itemId: item.id, field: "condition" })}
                            onSelect={(v) => inlinePatch(item.id, "condition", v)}
                          />
                          <span className="px-1.5 py-0.5 rounded-full bg-muted">
                            {CATEGORY_LABELS[item.category]}
                          </span>
                          {item.proficiency && (
                            <span className="px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600">
                              Skill {item.proficiency}/5
                            </span>
                          )}
                          {!item.isPrivate && (
                            <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                              public
                            </span>
                          )}
                          {(item.tags ?? []).map((t) => (
                            <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600">
                              <Tag className="h-2 w-2" />{t}
                            </span>
                          ))}
                        </div>
                        {(item.location || item.serialNumber) && (
                          <div className="text-[11px] text-muted-foreground space-y-0.5">
                            {item.location && <div>📍 {item.location}</div>}
                            {item.serialNumber && (
                              <div className="font-mono">SN: {item.serialNumber}</div>
                            )}
                          </div>
                        )}
                        {item.notes && (
                          <p className="text-[11px] text-muted-foreground italic line-clamp-2">
                            {item.notes}
                          </p>
                        )}

                        {/* Photo strip */}
                        <div className="flex items-center gap-1 pt-1">
                          {item.photos.map((p, idx) => (
                            <div key={p.id} className="relative group/p">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.filePath}
                                alt={p.caption ?? item.name}
                                className="h-10 w-10 rounded object-cover border cursor-zoom-in"
                                onClick={() => setLightbox({ item, index: idx })}
                              />
                              {p.isCover && (
                                <Star className="absolute -top-1 -left-1 h-3 w-3 text-yellow-400 fill-yellow-400 pointer-events-none" />
                              )}
                              <div className="absolute inset-0 flex items-center justify-center gap-0.5 opacity-0 group-hover/p:opacity-100 bg-black/60 rounded transition-opacity pointer-events-none">
                                {!p.isCover && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setCover(p.id, item.id); }}
                                    title="Set cover"
                                    className="p-0.5 hover:bg-yellow-500/30 rounded pointer-events-auto"
                                  >
                                    <Star className="h-3 w-3 text-yellow-300" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); deletePhoto(p.id, item.id); }}
                                  title="Delete"
                                  className="p-0.5 hover:bg-red-500/30 rounded pointer-events-auto"
                                >
                                  <X className="h-3 w-3 text-white" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {item.photos.length < 5 && (
                            <label className="h-10 w-10 rounded border border-dashed flex items-center justify-center cursor-pointer hover:bg-muted text-muted-foreground">
                              <Upload className="h-3.5 w-3.5" />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  await uploadPhoto(item.id, f, item.photos.length === 0);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          };

          if (groupedSorted) {
            return (
              <div className="space-y-3">
                {groupedSorted.map(([cat, arr]) => {
                  const collapsed = collapsedGroups.has(cat);
                  return (
                    <div key={cat} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(cat)}
                        className="sticky top-0 z-10 w-full flex items-center gap-2 bg-background/95 backdrop-blur px-1 py-1 text-xs font-semibold text-foreground hover:bg-muted/30 rounded"
                      >
                        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        <span className={`block h-2 w-2 rounded-sm ${CATEGORY_BAR_COLOR[cat] ?? "bg-slate-400"}`} />
                        <span>{CATEGORY_LABELS[cat]}</span>
                        <span className="text-muted-foreground font-normal">({arr.length})</span>
                      </button>
                      {!collapsed && renderItems(arr)}
                    </div>
                  );
                })}
              </div>
            );
          }
          return renderItems(sorted);
        })()
      )}

      {/* Edit / Add — inline panel */}
      {editing && (
        <Card className="border-cyan-500/40 ring-1 ring-cyan-500/20 shadow-md">
          <div className="flex items-start justify-between gap-3 px-3 py-2 border-b bg-cyan-500/5">
            <div className="min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2">
                {editing?.id ? <Pencil className="h-4 w-4 text-cyan-600" /> : <Plus className="h-4 w-4 text-cyan-600" />}
                {editing?.id ? "Edit item" : "Add item"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Track personal tools, equipment, and instruments. Marked private by default.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <CardContent className="p-3 space-y-3">
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label>Name *</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. DeWalt 20V Drill"
                />
              </div>

              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={editing.category ?? "tool"}
                  onValueChange={(v) => setEditing({ ...editing, category: v ?? "tool" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Ownership</Label>
                <Select
                  value={editing.ownership ?? "personal"}
                  onValueChange={(v) => setEditing({ ...editing, ownership: v ?? "personal" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OWNERSHIP.map((o) => (
                      <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Manufacturer</Label>
                <Input
                  value={editing.manufacturer ?? ""}
                  onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Model</Label>
                <Input
                  value={editing.model ?? ""}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Serial #</Label>
                <Input
                  value={editing.serialNumber ?? ""}
                  onChange={(e) => setEditing({ ...editing, serialNumber: e.target.value })}
                  className="font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label>Condition</Label>
                <Select
                  value={editing.condition ?? "good"}
                  onValueChange={(v) => setEditing({ ...editing, condition: v ?? "good" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Proficiency (1–5)</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={editing.proficiency ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      proficiency: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Location</Label>
                <Input
                  value={editing.location ?? ""}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                  placeholder="Garage shelf B"
                />
              </div>

              <div className="space-y-1">
                <Label>Purchase date</Label>
                <Input
                  type="date"
                  value={editing.purchaseDate ? String(editing.purchaseDate).slice(0, 10) : ""}
                  onChange={(e) =>
                    setEditing({ ...editing, purchaseDate: e.target.value || null })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Purchase price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.purchasePrice ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      purchasePrice: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Current value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.currentValue ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      currentValue: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label>Tags</Label>
                <Input
                  value={(editing.tags ?? []).join(", ")}
                  placeholder="comma-separated, e.g. field-kit, calibrated, loaner"
                  onChange={(e) => {
                    const raw = e.target.value;
                    const arr = raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
                    setEditing({ ...editing, tags: Array.from(new Set(arr)).slice(0, 20) });
                  }}
                />
                <p className="text-[10px] text-muted-foreground">Lowercased, max 20 tags / 32 chars each.</p>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>

              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <Switch
                  checked={editing.isPrivate ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, isPrivate: v })}
                />
                <div className="text-sm">
                  Private
                  <span className="block text-xs text-muted-foreground">
                    When off, this item may appear in your public interactive resume.
                  </span>
                </div>
              </div>

              {/* Photos */}
              <div className="sm:col-span-2 space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-cyan-500" />
                    Photos {editing.id && `(${editing.photos?.length ?? 0}/5)`}
                  </Label>
                  {editing.id && (editing.photos?.length ?? 0) < 5 && (
                    <label className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border cursor-pointer hover:bg-muted">
                      <Upload className="h-3.5 w-3.5" />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (!files.length || !editing.id) return;
                          const startCount = editing.photos?.length ?? 0;
                          for (let i = 0; i < files.length; i++) {
                            if (startCount + i >= 5) {
                              toast.error("Max 5 photos reached");
                              break;
                            }
                            await uploadPhoto(editing.id, files[i], startCount + i === 0);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>

                {!editing.id ? (
                  <p className="text-xs text-muted-foreground italic">
                    Save the item first, then upload photos.
                  </p>
                ) : (editing.photos?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No photos yet.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {editing.photos!.map((p, idx) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDragPhotoId(p.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!dragPhotoId || dragPhotoId === p.id || !editing.photos || !editing.id) {
                            setDragPhotoId(null);
                            return;
                          }
                          const ids = editing.photos.map((x) => x.id);
                          const from = ids.indexOf(dragPhotoId);
                          const to = idx;
                          if (from < 0) { setDragPhotoId(null); return; }
                          ids.splice(to, 0, ids.splice(from, 1)[0]);
                          setDragPhotoId(null);
                          void reorderPhotos(editing.id, ids);
                        }}
                        onDragEnd={() => setDragPhotoId(null)}
                        className={`relative group/p aspect-square rounded border overflow-hidden bg-muted ${dragPhotoId === p.id ? "opacity-40" : ""} ${reorderBusy ? "pointer-events-none" : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.filePath}
                          alt={p.caption ?? editing.name ?? "photo"}
                          className="w-full h-full object-cover cursor-zoom-in"
                          onClick={() => {
                            const fresh = items.find((i) => i.id === editing.id);
                            if (fresh) setLightbox({ item: fresh, index: idx });
                          }}
                        />
                        <span className="absolute top-1 right-1 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover/p:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" title="Drag to reorder">
                          <GripVertical className="h-3 w-3" />
                        </span>
                        {p.isCover && (
                          <Star className="absolute top-1 left-1 h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 opacity-0 group-hover/p:opacity-100 bg-black/70 transition-opacity py-1">
                          {!p.isCover && editing.id && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setCover(p.id, editing.id!); }}
                              title="Set cover"
                              className="p-1 rounded hover:bg-yellow-500/40"
                            >
                              <Star className="h-3.5 w-3.5 text-yellow-300" />
                            </button>
                          )}
                          {editing.id && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deletePhoto(p.id, editing.id!); }}
                              title="Delete"
                              className="p-1 rounded hover:bg-red-500/40"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-300" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/80">
                  JPG/PNG/WebP/GIF, max 5 MB each. Drag thumbnails to reorder. Avoid serial numbers, faces, or sensitive info.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" onClick={saveItem} disabled={saving || !editing?.name?.trim()}>
              {saving ? "Saving…" : editing?.id ? "Save" : "Add"}
            </Button>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-[2200] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-popover text-popover-foreground rounded-lg border shadow-2xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Keyboard className="h-4 w-4" /> Keyboard shortcuts</h3>
              <button type="button" onClick={() => setShowShortcuts(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                { keys: ["/"], desc: "Focus search" },
                { keys: ["N"], desc: "Add new item" },
                { keys: ["↑", "↓"], desc: "Navigate items" },
                { keys: ["Space"], desc: "Toggle selection on focused row" },
                { keys: ["Enter"], desc: "Open editor for focused row" },
                { keys: ["Esc"], desc: "Clear search · close dialogs · cancel" },
                { keys: ["?"], desc: "Show this help" },
              ].map((row) => (
                <div key={row.desc} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-muted-foreground">{row.desc}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {row.keys.map((k) => (
                      <kbd key={k} className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border bg-muted text-[10px] font-mono">{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 pt-3 border-t">
              Shortcuts pause while you type in inputs.
            </p>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && lightbox.item.photos.length > 0 && (() => {
        const photos = lightbox.item.photos;
        const photo = photos[lightbox.index];
        if (!photo) return null;
        const next = () => setLightbox((lb) => lb ? { ...lb, index: (lb.index + 1) % photos.length } : lb);
        const prev = () => setLightbox((lb) => lb ? { ...lb, index: (lb.index - 1 + photos.length) % photos.length } : lb);
        return (
          <div
            className="fixed inset-0 z-[2200] bg-black/90 flex items-center justify-center"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
              className="absolute top-3 right-3 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); prev(); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                  title="Previous (←)"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); next(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                  title="Next (→)"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <div className="max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.filePath}
                alt={photo.caption ?? lightbox.item.name}
                className="max-w-[92vw] max-h-[78vh] object-contain rounded shadow-2xl"
              />
              <div className="flex flex-col items-center gap-1 text-center text-white">
                <div className="text-sm font-medium">{lightbox.item.name}</div>
                {photo.caption && <div className="text-xs text-white/70 italic">{photo.caption}</div>}
                <div className="flex items-center gap-2 text-[11px] text-white/60">
                  <span>{lightbox.index + 1} / {photos.length}</span>
                  {photo.isCover && (
                    <span className="inline-flex items-center gap-1 text-yellow-300">
                      <Star className="h-3 w-3 fill-yellow-300" /> cover
                    </span>
                  )}
                </div>
                {photos.length > 1 && (
                  <div className="flex items-center gap-1 mt-2">
                    {photos.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setLightbox({ item: lightbox.item, index: i })}
                        className={`h-10 w-10 rounded overflow-hidden border-2 transition-all ${i === lightbox.index ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.filePath} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
