"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EquipmentUsageHistory } from "@/components/equipment-usage-history";
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
  Crop,
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  GripVertical,
  Keyboard,
  Laptop,
  Layers,
  LayoutGrid,
  List as ListIcon,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Rows3,
  Search,
  Share2,
  SlidersHorizontal,
  Square,
  Star,
  Tag,
  Trash2,
  Unlock,
  Upload,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
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
  focalX?: number;
  focalY?: number;
  zoom?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
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
  isDraft: boolean;
  notes: string | null;
  tags: string[];
  photos: Photo[];
};

type Kit = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isPrivate: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  itemIds: string[];
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
  activeKitId?: string | null;
  filtersOpen?: boolean;
};
const INVENTORY_UI_PREFS_KEY = "resumsify:inventory-ui-prefs-v1";
const DEFAULT_UI_PREFS: InventoryUiPrefs = {
  view: "grid",
  sort: "recent",
  group: false,
  categories: [],
  ownership: [],
  tags: [],
  activeKitId: null,
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
      activeKitId: typeof raw.activeKitId === "string" ? raw.activeKitId : null,
      filtersOpen: typeof raw.filtersOpen === "boolean" ? raw.filtersOpen : true,
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

// Compose CSS transform for a photo's saved crop/rotate/flip values.
// Rotation/flip happen around CENTER of the frame; zoom pivots around the focal point.
type PhotoLike = { focalX?: number | null; focalY?: number | null; zoom?: number | null; rotation?: number | null; flipH?: boolean | null; flipV?: boolean | null };
function photoFrameStyle(p: PhotoLike): React.CSSProperties {
  const r = p.rotation ?? 0;
  const sx = p.flipH ? -1 : 1;
  const sy = p.flipV ? -1 : 1;
  return {
    transform: `rotate(${r}deg) scaleX(${sx}) scaleY(${sy})`,
    transformOrigin: "center center",
  };
}
function photoImgStyle(p: PhotoLike): React.CSSProperties {
  const fx = p.focalX ?? 50;
  const fy = p.focalY ?? 50;
  const z = p.zoom ?? 1;
  return {
    objectPosition: `${fx}% ${fy}%`,
    transform: `scale(${z})`,
    transformOrigin: `${fx}% ${fy}%`,
  };
}
function PhotoView({
  p,
  alt,
  className,
  imgClassName,
  onClick,
  fit = "cover",
}: {
  p: { filePath: string } & PhotoLike;
  alt?: string;
  className?: string;
  imgClassName?: string;
  onClick?: () => void;
  fit?: "cover" | "contain";
}) {
  return (
    <div className={`relative w-full h-full overflow-hidden ${className ?? ""}`} style={photoFrameStyle(p)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={p.filePath}
        alt={alt ?? ""}
        className={`w-full h-full ${fit === "contain" ? "object-contain" : "object-cover"} ${imgClassName ?? ""}`}
        style={photoImgStyle(p)}
        onClick={onClick}
        draggable={false}
      />
    </div>
  );
}

function CropModal({
  photo,
  itemName,
  onClose,
  onSave,
}: {
  photo: Photo;
  itemName: string;
  onClose: () => void;
  onSave: (vals: { focalX: number; focalY: number; zoom: number; rotation: number; flipH: boolean; flipV: boolean }) => void | Promise<void>;
}) {
  const [focalX, setFocalX] = useState<number>(photo.focalX ?? 50);
  const [focalY, setFocalY] = useState<number>(photo.focalY ?? 50);
  const [zoom, setZoom] = useState<number>(photo.zoom ?? 1);
  const [rotation, setRotation] = useState<number>(photo.rotation ?? 0);
  const [flipH, setFlipH] = useState<boolean>(photo.flipH ?? false);
  const [flipV, setFlipV] = useState<boolean>(photo.flipV ?? false);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function updateFromEvent(clientX: number, clientY: number) {
    const el = dragRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setFocalX(Math.max(0, Math.min(100, x)));
    setFocalY(Math.max(0, Math.min(100, y)));
  }

  return (
    <div
      className="fixed inset-0 z-[2300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-xl shadow-2xl border w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Crop className="h-4 w-4 text-violet-600" /> Adjust crop
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">{itemName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Square preview = how the card will look */}
          <div
            ref={dragRef}
            className="relative aspect-square w-full bg-muted rounded-lg overflow-hidden cursor-move select-none ring-1 ring-border"
            onMouseDown={(e) => {
              draggingRef.current = true;
              updateFromEvent(e.clientX, e.clientY);
              const onMove = (ev: MouseEvent) => { if (draggingRef.current) updateFromEvent(ev.clientX, ev.clientY); };
              const onUp = () => {
                draggingRef.current = false;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            onTouchStart={(e) => {
              const t = e.touches[0]; if (t) updateFromEvent(t.clientX, t.clientY);
            }}
            onTouchMove={(e) => {
              const t = e.touches[0]; if (t) { e.preventDefault(); updateFromEvent(t.clientX, t.clientY); }
            }}
          >
            {/* Frame: rotation + flip around center */}
            <div
              className="absolute inset-0"
              style={{
                transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                transformOrigin: "center center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.filePath}
                alt={photo.caption ?? itemName}
                draggable={false}
                className="w-full h-full object-cover pointer-events-none"
                style={{
                  objectPosition: `${focalX}% ${focalY}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: `${focalX}% ${focalY}%`,
                }}
              />
            </div>
            {/* Focal-point crosshair */}
            <div
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg pointer-events-none mix-blend-difference"
              style={{ left: `${focalX}%`, top: `${focalY}%` }}
            >
              <div className="absolute inset-0 m-auto h-1 w-1 rounded-full bg-white" />
            </div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-white/90 bg-black/40 backdrop-blur px-1.5 py-0.5 rounded">
              Drag to set focal point
            </div>
          </div>

          {/* Zoom slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <Label className="text-xs">Zoom</Label>
              <span className="tabular-nums text-muted-foreground">{zoom.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>

          {/* Rotate + Flip controls */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <Label className="text-xs">Rotate &amp; flip</Label>
              <span className="tabular-nums text-muted-foreground">{rotation}°</span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 flex-1" title="Rotate 90° left" onClick={() => setRotation((r) => (r - 90 + 360) % 360)}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 flex-1" title="Rotate 90° right" onClick={() => setRotation((r) => (r + 90) % 360)}>
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant={flipH ? "default" : "outline"} size="sm" className="h-7 px-2 flex-1" title="Flip horizontal" onClick={() => setFlipH((v) => !v)}>
                <FlipHorizontal className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant={flipV ? "default" : "outline"} size="sm" className="h-7 px-2 flex-1" title="Flip vertical" onClick={() => setFlipV((v) => !v)}>
                <FlipVertical className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Reset */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Focal {Math.round(focalX)}%, {Math.round(focalY)}%</span>
            <button
              type="button"
              onClick={() => { setFocalX(50); setFocalY(50); setZoom(1); setRotation(0); setFlipH(false); setFlipV(false); }}
              className="text-foreground hover:underline"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t bg-muted/30">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try { await onSave({ focalX: Math.round(focalX), focalY: Math.round(focalY), zoom, rotation, flipH, flipV }); }
              finally { setSaving(false); }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
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

// ─── Share modal ──────────────────────────────────────────────
type ShareRecord = {
  id: string;
  token: string;
  label: string | null;
  scope: string;
  itemIds: string[];
  kitId: string | null;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
};

function ShareModal({
  onClose,
  selectedIds,
  totalCount,
  kits,
}: {
  onClose: () => void;
  selectedIds: string[];
  totalCount: number;
  kits: Kit[];
}) {
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<"all" | "selected" | "kit">(selectedIds.length > 0 ? "selected" : "all");
  const [kitId, setKitId] = useState<string>(kits[0]?.id ?? "");
  const [label, setLabel] = useState<string>("");
  const [expiryDays, setExpiryDays] = useState<string>(""); // "" = no expiry
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/personal-equipment/shares");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setShares(Array.isArray(data) ? data : []);
      } catch {
        toast.error("Failed to load existing shares");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function shareUrl(token: string) {
    if (typeof window === "undefined") return `/share/inventory/${token}`;
    return `${window.location.origin}/share/inventory/${token}`;
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopiedToken(token);
      toast.success("Link copied");
      setTimeout(() => setCopiedToken((c) => (c === token ? null : c)), 1500);
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  async function createShare() {
    setCreating(true);
    try {
      const expiresAt = expiryDays
        ? new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const body: Record<string, unknown> = {
        scope,
        label: label.trim() || null,
        expiresAt,
      };
      if (scope === "selected") body.itemIds = selectedIds;
      if (scope === "kit") {
        if (!kitId) {
          toast.error("Pick a kit first");
          setCreating(false);
          return;
        }
        body.kitId = kitId;
      }
      const res = await fetch("/api/personal-equipment/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed");
      }
      const created: ShareRecord = await res.json();
      setShares((prev) => [created, ...prev]);
      setLabel("");
      setExpiryDays("");
      copy(created.token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create share");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this share link? Anyone with the link will lose access.")) return;
    try {
      const res = await fetch(`/api/personal-equipment/shares/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setShares((prev) => prev.filter((s) => s.id !== id));
      toast.success("Share revoked");
    } catch {
      toast.error("Failed to revoke");
    }
  }

  const canSelectScope = selectedIds.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-2xl w-full max-w-xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Share2 className="h-4 w-4 text-cyan-600" /> Share inventory
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Create new share */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Create new share link
            </div>

            <div className="space-y-1">
              <Label className="text-xs">What to share</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`text-left text-xs px-3 py-2 rounded border ${
                    scope === "all" ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="font-medium">All items</div>
                  <div className="text-muted-foreground text-[11px]">{totalCount} item{totalCount === 1 ? "" : "s"}</div>
                </button>
                <button
                  type="button"
                  disabled={!canSelectScope}
                  onClick={() => setScope("selected")}
                  className={`text-left text-xs px-3 py-2 rounded border ${
                    scope === "selected" ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"
                  } ${!canSelectScope ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={!canSelectScope ? "Select items first to share a subset" : ""}
                >
                  <div className="font-medium">Selected only</div>
                  <div className="text-muted-foreground text-[11px]">
                    {selectedIds.length} item{selectedIds.length === 1 ? "" : "s"}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={kits.length === 0}
                  onClick={() => setScope("kit")}
                  className={`text-left text-xs px-3 py-2 rounded border ${
                    scope === "kit" ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"
                  } ${kits.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={kits.length === 0 ? "Create a kit first" : ""}
                >
                  <div className="font-medium flex items-center gap-1"><Layers className="h-3 w-3 text-amber-500" /> Kit</div>
                  <div className="text-muted-foreground text-[11px]">
                    {kits.length} kit{kits.length === 1 ? "" : "s"}
                  </div>
                </button>
              </div>
              {scope === "kit" && kits.length > 0 && (
                <div className="pt-2">
                  <Select value={kitId} onValueChange={(v) => setKitId(v ?? "")}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a kit" />
                    </SelectTrigger>
                    <SelectContent>
                      {kits.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.name} ({k.itemIds.length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Label (optional)</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. For Bob"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expires</Label>
                <Select value={expiryDays || "never"} onValueChange={(v) => setExpiryDays(v === "never" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never</SelectItem>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button size="sm" onClick={createShare} disabled={creating} className="w-full">
              <Share2 className="h-3.5 w-3.5 mr-1" />
              {creating ? "Creating…" : "Create share link"}
            </Button>
          </div>

          {/* Existing shares */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Active links {shares.length > 0 && `(${shares.length})`}
            </div>
            {loading ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Loading…</div>
            ) : shares.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center border rounded-md border-dashed">
                No active share links.
              </div>
            ) : (
              <ul className="space-y-2">
                {shares.map((s) => {
                  const url = shareUrl(s.token);
                  const expired = s.expiresAt && new Date(s.expiresAt).getTime() < Date.now();
                  return (
                    <li key={s.id} className="rounded-md border p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">
                            {s.label || (s.scope === "all" ? "All items" : s.scope === "kit" ? (kits.find((k) => k.id === s.kitId)?.name ?? "Kit") : `${s.itemIds.length} selected items`)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {s.scope === "all" ? "All inventory" : s.scope === "kit" ? `Kit · ${kits.find((k) => k.id === s.kitId)?.itemIds.length ?? 0} item${(kits.find((k) => k.id === s.kitId)?.itemIds.length ?? 0) === 1 ? "" : "s"}` : `${s.itemIds.length} item${s.itemIds.length === 1 ? "" : "s"}`}
                            {" · "}
                            {s.viewCount} view{s.viewCount === 1 ? "" : "s"}
                            {s.expiresAt && (
                              <>
                                {" · "}
                                <span className={expired ? "text-red-500" : ""}>
                                  {expired ? "expired " : "expires "}
                                  {new Date(s.expiresAt).toLocaleDateString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(s.token)}>
                            {copiedToken === s.token ? "Copied!" : "Copy link"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-red-500 hover:text-red-600"
                            onClick={() => revoke(s.id)}
                            title="Revoke"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          readOnly
                          value={url}
                          onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                          className="flex-1 text-[10px] font-mono px-2 py-1 rounded bg-muted text-muted-foreground border focus:outline-none"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t bg-muted/30">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PersonalInventory({
  focusedPositionId = null,
  focusedPositionLabel = null,
  openItemId = null,
  onItemOpened,
}: {
  focusedPositionId?: string | null;
  focusedPositionLabel?: string | null;
  /** When set (e.g. from a Ctrl+/ search hit) auto-open this item's viewer. */
  openItemId?: string | null;
  onItemOpened?: () => void;
} = {}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [kits, setKits] = useState<Kit[]>([]);
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
  const [bulkUploading, setBulkUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [draftsOnly, setDraftsOnly] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const [bulkMenu, setBulkMenu] = useState<null | "category" | "ownership" | "condition" | "crop" | "kit" | "tag" | "untag">(null);
  const [bulkTagDraft, setBulkTagDraft] = useState<string[]>([]);
  const [bulkUntagDraft, setBulkUntagDraft] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<{ item: Item; index: number } | null>(null);
  // Lightbox image manipulation (session-only, doesn't persist)
  const [lbZoom, setLbZoom] = useState(1);
  const [lbPan, setLbPan] = useState({ x: 0, y: 0 });
  const [lbRotation, setLbRotation] = useState(0);
  const [lbFlipH, setLbFlipH] = useState(false);
  const [lbFlipV, setLbFlipV] = useState(false);
  const lbDragRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [viewing, setViewing] = useState<{ item: Item; index: number } | null>(null);
  const [cropping, setCropping] = useState<{ item: Item; photoId: string } | null>(null);
  const [bulkCropping, setBulkCropping] = useState<null | { scope: "covers" | "all" }>(null);
  const [dragPhotoId, setDragPhotoId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [hoveredPhotoId, setHoveredPhotoId] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editingDragActive, setEditingDragActive] = useState(false);
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

  async function loadKits() {
    try {
      const res = await fetch("/api/personal-equipment/kits");
      if (res.ok) setKits(await res.json());
    } catch { /* noop */ }
  }

  async function saveSelectionAsKit() {
    const name = window.prompt("Kit name (e.g. \"Plumbing kit\")");
    if (!name || !name.trim()) return;
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error("Select at least one item first");
      return;
    }
    try {
      const res = await fetch("/api/personal-equipment/kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), itemIds: ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed");
      }
      const created: Kit = await res.json();
      setKits((prev) => [...prev, created]);
      toast.success(`Saved kit "${created.name}" (${created.itemIds.length} items)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save kit");
    }
  }

  async function addSelectionToKit(kitId: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      const res = await fetch(`/api/personal-equipment/kits/${kitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addItemIds: ids }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setKits((prev) => prev.map((k) => (k.id === kitId ? { ...k, itemIds: updated.itemIds } : k)));
      toast.success(`Added ${ids.length} item${ids.length === 1 ? "" : "s"} to kit`);
    } catch {
      toast.error("Failed to add to kit");
    }
  }

  async function renameKit(kit: Kit) {
    const name = window.prompt("Rename kit:", kit.name);
    if (!name || !name.trim() || name.trim() === kit.name) return;
    try {
      const res = await fetch(`/api/personal-equipment/kits/${kit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Rename failed");
      }
      setKits((prev) => prev.map((k) => (k.id === kit.id ? { ...k, name: name.trim() } : k)));
      toast.success("Kit renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  }

  async function deleteKit(kit: Kit) {
    if (!window.confirm(`Delete kit "${kit.name}"? Items themselves are not deleted.`)) return;
    try {
      const res = await fetch(`/api/personal-equipment/kits/${kit.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setKits((prev) => prev.filter((k) => k.id !== kit.id));
      if (uiPrefs.activeKitId === kit.id) setUiPrefs((p) => ({ ...p, activeKitId: null }));
      toast.success("Kit deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  useEffect(() => {
    void loadKits();
  }, []);

  useEffect(() => {
    void load();
  }, []);

  // Auto-open an item when requested by an outside caller (e.g. Ctrl+/ search
  // hit on the work-mapping page). Waits for items to load, then opens the
  // viewer once and notifies the parent to clear the request.
  useEffect(() => {
    if (!openItemId || items.length === 0) return;
    const target = items.find((it) => it.id === openItemId);
    if (!target) return;
    setViewing({ item: target, index: 0 });
    onItemOpened?.();
  }, [openItemId, items, onItemOpened]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cats = uiPrefs.categories;
    const owns = uiPrefs.ownership;
    const tagSel = uiPrefs.tags;
    const kitFilter = uiPrefs.activeKitId
      ? new Set(kits.find((k) => k.id === uiPrefs.activeKitId)?.itemIds ?? [])
      : null;
    return items.filter((i) => {
      if (kitFilter && !kitFilter.has(i.id)) return false;
      if (filterCategory !== "all" && i.category !== filterCategory) return false;
      if (filterOwnership !== "all" && i.ownership !== filterOwnership) return false;
      if (cats.length && !cats.includes(i.category)) return false;
      if (owns.length && !owns.includes(i.ownership)) return false;
      if (tagSel.length && !tagSel.every((t) => (i.tags ?? []).includes(t))) return false;
      if (draftsOnly && !i.isDraft) return false;
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
  }, [items, kits, search, filterCategory, filterOwnership, uiPrefs.categories, uiPrefs.ownership, uiPrefs.tags, uiPrefs.activeKitId, draftsOnly]);

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
      // Saving from the editor always promotes a draft to a real item
      const payload = isNew ? editing : { ...editing, isDraft: false };
      const res = await fetch("/api/personal-equipment", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  async function duplicateItem(item: Item, withPhotos = true) {
    const tid = toast.loading(`Duplicating "${item.name}"…`);
    try {
      const res = await fetch("/api/personal-equipment/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, withPhotos }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created: Item = await res.json();
      toast.success(`Duplicated → "${created.name}"`, { id: tid });
      await load();
      setEditing(created);
    } catch (err) {
      toast.error("Duplicate failed", { id: tid });
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

  async function bulkUploadPhotos(files: File[]) {
    if (files.length === 0) return;
    const valid: File[] = [];
    let oversize = 0;
    let badType = 0;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    for (const f of files) {
      if (!allowed.has(f.type)) { badType++; continue; }
      if (f.size > 5 * 1024 * 1024) { oversize++; continue; }
      valid.push(f);
    }
    if (valid.length === 0) {
      toast.error("No valid images (JPG/PNG/WebP/GIF, max 5 MB each)");
      return;
    }
    if (badType || oversize) {
      toast.warning(`Skipping ${badType + oversize} file${badType + oversize === 1 ? "" : "s"}: ${badType ? `${badType} bad type` : ""}${badType && oversize ? ", " : ""}${oversize ? `${oversize} oversize` : ""}`);
    }
    setBulkUploading(true);
    const tid = toast.loading(`Uploading ${valid.length} photo${valid.length === 1 ? "" : "s"}\u2026`);
    try {
      // Chunk into batches of 10 to keep request bodies modest
      const BATCH = 10;
      let createdTotal = 0;
      let errorTotal = 0;
      for (let i = 0; i < valid.length; i += BATCH) {
        const batch = valid.slice(i, i + BATCH);
        const fd = new FormData();
        for (const f of batch) fd.append("file", f);
        const res = await fetch("/api/personal-equipment/bulk-upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as { createdCount: number; errorCount: number };
        createdTotal += data.createdCount ?? 0;
        errorTotal += data.errorCount ?? 0;
      }
      if (errorTotal === 0) {
        toast.success(`Added ${createdTotal} draft item${createdTotal === 1 ? "" : "s"} \u2014 add details when ready`, { id: tid });
      } else {
        toast.warning(`Added ${createdTotal}, ${errorTotal} failed`, { id: tid });
      }
      setDraftsOnly(true);
      await load();
    } catch (err) {
      toast.error("Bulk upload failed", { id: tid });
      console.error(err);
    } finally {
      setBulkUploading(false);
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
      else if (e.key === "+" || e.key === "=") setLbZoom((z) => Math.min(8, +(z + 0.25).toFixed(2)));
      else if (e.key === "-" || e.key === "_") setLbZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)));
      else if (e.key === "0") { setLbZoom(1); setLbPan({ x: 0, y: 0 }); setLbRotation(0); setLbFlipH(false); setLbFlipV(false); }
      else if (e.key === "r" || e.key === "R") setLbRotation((r) => (r + 90) % 360);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // Reset zoom/pan/rotation/flip when the lightbox photo changes
  useEffect(() => {
    setLbZoom(1);
    setLbPan({ x: 0, y: 0 });
    setLbRotation(0);
    setLbFlipH(false);
    setLbFlipV(false);
  }, [lightbox?.item.id, lightbox?.index]);

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

  // Keep quick-view modal in sync with refreshed items
  useEffect(() => {
    if (!viewing) return;
    const fresh = items.find((i) => i.id === viewing.item.id);
    if (!fresh) { setViewing(null); return; }
    if (fresh !== viewing.item) {
      const maxIdx = Math.max(0, fresh.photos.length - 1);
      setViewing({ item: fresh, index: Math.min(viewing.index, maxIdx) });
    }
  }, [items, viewing]);

  // Quick-view keyboard nav
  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setViewing((v) => v && v.item.photos.length ? { ...v, index: (v.index + 1) % v.item.photos.length } : v);
      else if (e.key === "ArrowLeft") setViewing((v) => v && v.item.photos.length ? { ...v, index: (v.index - 1 + v.item.photos.length) % v.item.photos.length } : v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

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
        if (viewing) { setViewing(null); return; }
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
      if (viewing) return;
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
    <div
      className={`space-y-4 relative ${dragActive ? "ring-2 ring-cyan-500/60 ring-offset-2 ring-offset-background rounded-lg" : ""}`}
      onDragEnter={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(e) => {
        // Only clear if leaving the root, not crossing children
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={async (e) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault();
        setDragActive(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) {
          toast.error("Drop image files only");
          return;
        }
        await bulkUploadPhotos(files);
      }}
    >
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-[2100] flex items-center justify-center bg-cyan-500/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-cyan-400 bg-background/90 px-8 py-6 text-center shadow-2xl">
            <Upload className="h-10 w-10 text-cyan-500 mx-auto mb-2" />
            <div className="text-base font-semibold">Drop photos to add as draft items</div>
            <div className="text-xs text-muted-foreground mt-1">JPG / PNG / WebP / GIF, max 5 MB each</div>
          </div>
        </div>
      )}
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
        <Button
          variant="outline"
          onClick={() => bulkFileInputRef.current?.click()}
          disabled={bulkUploading}
          title="Upload photos to create draft items you can fill in later"
        >
          <Upload className="h-4 w-4 mr-1" />
          {bulkUploading ? "Uploading\u2026" : "Upload photos"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setShareOpen(true)}
          title="Share your inventory via a link"
        >
          <Share2 className="h-4 w-4 mr-1" /> Share
        </Button>
        <input
          ref={bulkFileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) await bulkUploadPhotos(files);
          }}
        />
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

          {/* Filters toggle */}
          {(() => {
            const filtersOpen = uiPrefs.filtersOpen ?? true;
            const activeCount =
              uiPrefs.categories.length +
              uiPrefs.ownership.length +
              uiPrefs.tags.length +
              (draftsOnly ? 1 : 0);
            return (
              <Button
                type="button"
                size="sm"
                variant={filtersOpen ? "default" : "outline"}
                className="h-9"
                onClick={() => setUiPrefs((p) => ({ ...p, filtersOpen: !(p.filtersOpen ?? true) }))}
                title={filtersOpen ? "Hide filters" : "Show filters"}
              >
                <SlidersHorizontal className="h-3 w-3 mr-1" />
                Filters
                {activeCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-white text-[10px] font-medium">
                    {activeCount}
                  </span>
                )}
                <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
              </Button>
            );
          })()}
        </div>

        {/* Chip strip — categories + ownership multi-select */}
        {(uiPrefs.filtersOpen ?? true) && (
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
          {(() => {
            const draftCount = items.filter((i) => i.isDraft).length;
            if (draftCount === 0 && !draftsOnly) return null;
            return (
              <>
                <span className="mx-1 self-center h-3 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => setDraftsOnly((v) => !v)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${draftsOnly ? "bg-amber-500 text-white border-amber-500" : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/20"}`}
                  title="Show only items that still need details filled in"
                >
                  Needs details <span className={draftsOnly ? "opacity-90" : "opacity-70"}>({draftCount})</span>
                </button>
              </>
            );
          })()}
        </div>
        )}

        {/* Kits chips (only when kits exist) */}
        {(uiPrefs.filtersOpen ?? true) && kits.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground self-center mr-1">Kits</span>
            {kits.map((k) => {
              const active = uiPrefs.activeKitId === k.id;
              return (
                <span key={k.id} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => setUiPrefs((p) => ({ ...p, activeKitId: active ? null : k.id }))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      void renameKit(k);
                    }}
                    className={`inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-l-full border-y border-l transition-colors ${active ? "bg-amber-500 text-white border-amber-500" : "bg-background text-muted-foreground hover:bg-muted border-border"}`}
                    title={`${k.itemIds.length} item${k.itemIds.length === 1 ? "" : "s"} — click to filter, right-click to rename`}
                  >
                    <Layers className="h-2.5 w-2.5" />
                    {k.name}
                    <span className={active ? "opacity-90" : "opacity-60"}>({k.itemIds.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteKit(k)}
                    className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded-r-full border-y border-r transition-colors ${active ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700" : "bg-background text-muted-foreground border-border hover:bg-red-500/10 hover:text-red-600"}`}
                    title="Delete kit"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
            {uiPrefs.activeKitId && (
              <button
                type="button"
                onClick={() => setUiPrefs((p) => ({ ...p, activeKitId: null }))}
                className="text-[11px] px-2 py-0.5 rounded-full text-muted-foreground hover:bg-muted ml-1"
              >
                Clear kit
              </button>
            )}
          </div>
        )}

        {/* Tag chips (only render when tags exist) */}
        {(uiPrefs.filtersOpen ?? true) && Object.keys(tagCounts).length > 0 && (
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
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShareOpen(true)}>
              <Share2 className="h-3 w-3 mr-1" /> Share selected
            </Button>
            <div className="relative">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => setBulkMenu(bulkMenu === "crop" ? null : "crop")}>
                <Crop className="h-3 w-3 mr-1" /> Crop
              </Button>
              {bulkMenu === "crop" && (
                <div className="absolute z-30 mt-1 left-0 min-w-[180px] rounded-md border bg-popover shadow-md py-1">
                  <button
                    type="button"
                    className="w-full text-left text-xs px-2 py-1 hover:bg-muted"
                    onClick={() => { setBulkMenu(null); setBulkCropping({ scope: "covers" }); }}
                  >
                    Cover photo only
                  </button>
                  <button
                    type="button"
                    className="w-full text-left text-xs px-2 py-1 hover:bg-muted"
                    onClick={() => { setBulkMenu(null); setBulkCropping({ scope: "all" }); }}
                  >
                    All photos of each item
                  </button>
                </div>
              )}
            </div>

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
            <div className="relative">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => { setBulkMenu(bulkMenu === "tag" ? null : "tag"); setBulkTagDraft([]); }}>
                <Tag className="h-3 w-3 mr-1" /> Tag
              </Button>
              {bulkMenu === "tag" && (
                <div className="absolute z-30 mt-1 left-0 w-72 rounded-md border bg-popover shadow-md p-2 space-y-2">
                  <div className="text-[11px] text-muted-foreground">Add tags to {selected.size} item{selected.size === 1 ? "" : "s"}</div>
                  <TagInput
                    value={bulkTagDraft}
                    onChange={setBulkTagDraft}
                    suggestions={Object.keys(tagCounts)}
                    placeholder="Type a tag, press Enter"
                    showIcon={false}
                  />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setBulkMenu(null); setBulkTagDraft([]); }}>Cancel</Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={bulkTagDraft.length === 0 || bulkBusy}
                      onClick={() => {
                        const tags = [...bulkTagDraft];
                        setBulkTagDraft([]);
                        bulkPatch({ tagsAdd: tags }, `Tagged "${tags.join(", ")}" on`);
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => {
                if (bulkMenu === "untag") { setBulkMenu(null); return; }
                // Pre-populate suggestions from tags actually present on the selection
                setBulkMenu("untag");
                setBulkUntagDraft([]);
              }}>
                <X className="h-3 w-3 mr-1" /> Untag
              </Button>
              {bulkMenu === "untag" && (() => {
                const selectionTagCounts: Record<string, number> = {};
                for (const it of items) {
                  if (!selected.has(it.id)) continue;
                  for (const t of it.tags ?? []) selectionTagCounts[t] = (selectionTagCounts[t] ?? 0) + 1;
                }
                const selectionTags = Object.keys(selectionTagCounts).sort((a, b) => selectionTagCounts[b] - selectionTagCounts[a]);
                return (
                  <div className="absolute z-30 mt-1 left-0 w-72 rounded-md border bg-popover shadow-md p-2 space-y-2">
                    <div className="text-[11px] text-muted-foreground">Remove tags from {selected.size} item{selected.size === 1 ? "" : "s"}</div>
                    {selectionTags.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-2 text-center">No tags on selected items</div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
                          {selectionTags.map((t) => {
                            const active = bulkUntagDraft.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setBulkUntagDraft((d) => active ? d.filter((x) => x !== t) : [...d, t])}
                                className={`px-2 py-0.5 rounded-full text-[11px] border ${active ? "bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-300" : "bg-muted/40 hover:bg-muted border-transparent"}`}
                              >
                                {t} <span className="opacity-60">({selectionTagCounts[t]})</span>
                              </button>
                            );
                          })}
                        </div>
                        <TagInput
                          value={bulkUntagDraft}
                          onChange={setBulkUntagDraft}
                          suggestions={selectionTags}
                          placeholder="Or type to add"
                          showIcon={false}
                        />
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setBulkMenu(null); setBulkUntagDraft([]); }}>Cancel</Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            disabled={bulkUntagDraft.length === 0 || bulkBusy}
                            onClick={() => {
                              const tags = [...bulkUntagDraft];
                              setBulkUntagDraft([]);
                              bulkPatch({ tagsRemove: tags }, `Removed "${tags.join(", ")}" from`);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Kits — save selection as a new kit, or add selection to an existing kit */}
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={bulkBusy}
                onClick={() => setBulkMenu(bulkMenu === "kit" ? null : "kit")}
              >
                <Layers className="h-3 w-3 mr-1" /> Kit
              </Button>
              {bulkMenu === "kit" && (
                <div className="absolute z-30 mt-1 left-0 min-w-[200px] rounded-md border bg-popover shadow-md py-1 max-h-64 overflow-auto">
                  <button
                    type="button"
                    className="w-full text-left text-xs px-2 py-1 hover:bg-muted flex items-center gap-2 font-medium"
                    onClick={() => { setBulkMenu(null); void saveSelectionAsKit(); }}
                  >
                    <Plus className="h-3 w-3" /> Save selection as new kit…
                  </button>
                  {kits.length > 0 && (
                    <>
                      <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Add to existing</div>
                      {kits.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          className="w-full text-left text-xs px-2 py-1 hover:bg-muted flex items-center justify-between gap-2"
                          onClick={() => { setBulkMenu(null); void addSelectionToKit(k.id); }}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Layers className="h-3 w-3 text-amber-500" />
                            <span className="truncate">{k.name}</span>
                          </span>
                          <span className="text-muted-foreground text-[10px] shrink-0">{k.itemIds.length}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

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
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => bulkFileInputRef.current?.click()}
                  disabled={bulkUploading}
                >
                  <Upload className="h-3 w-3 mr-1" /> Bulk upload photos
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/70 max-w-md">
                Tip: drop photos anywhere on this page to bulk-create draft items you can fill in later.
              </p>
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
                          <tr key={item.id} data-inv-row={item.id} data-search-highlight-id={`personalEquipment:${item.id}`} className={`border-t hover:bg-muted/30 group ${isSel ? "bg-foreground/[0.04]" : ""} ${isFocused ? "outline outline-2 outline-cyan-500/60 outline-offset-[-2px]" : ""}`}>
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
                                <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => duplicateItem(item)} title="Duplicate">
                                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
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
                      <Card key={item.id} data-inv-row={item.id} data-search-highlight-id={`personalEquipment:${item.id}`} onClick={() => setViewing({ item, index: 0 })} className={`overflow-hidden group cursor-pointer hover:bg-muted/40 ${isSel ? "ring-2 ring-foreground/40" : ""} ${isFocused ? "ring-2 ring-cyan-500/70" : ""}`}>
                        <div className="flex items-stretch gap-3 p-2">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 mt-1 cursor-pointer self-start"
                            aria-label={`Select ${item.name}`}
                          />
                          <div className={`h-14 w-14 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center`}>
                            {cover ? (
                              <PhotoView p={cover} alt={cover.caption ?? item.name} />
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
                                  <button type="button" className="p-1 rounded hover:bg-emerald-500/10 disabled:opacity-50" onClick={(e) => { e.stopPropagation(); assignToPosition(item); }} disabled={assigningId === item.id} title={`Add to ${focusedPositionLabel ?? "focused job"}`}>
                                    <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                                  </button>
                                )}
                                <button type="button" className="p-1 rounded hover:bg-muted" onClick={(e) => { e.stopPropagation(); togglePrivacy(item); }} title={item.isPrivate ? "Make public" : "Make private"}>
                                  {item.isPrivate ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Unlock className="h-3.5 w-3.5 text-blue-500" />}
                                </button>
                                <button type="button" className="p-1 rounded hover:bg-muted" onClick={(e) => { e.stopPropagation(); setEditing(item); }} title="Edit">
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button type="button" className="p-1 rounded hover:bg-muted" onClick={(e) => { e.stopPropagation(); duplicateItem(item); }} title="Duplicate">
                                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button type="button" className="p-1 rounded hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} title="Delete">
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
                              {item.isDraft && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setEditing(item); }}
                                  className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40 hover:bg-amber-500/25"
                                  title="Click to add details"
                                >
                                  Needs details
                                </button>
                              )}
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
            // Default: grid (e-commerce style product cards)
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {arr.map((item) => {
                  const cover = item.photos.find((p) => p.isCover) ?? item.photos[0];
                  const isSel = selected.has(item.id);
                  const isFocused = focusedIndex !== null && sorted[focusedIndex]?.id === item.id;
                  const isHovered = hoveredCardId === item.id;
                  const price = item.currentValue ?? item.purchasePrice;
                  const subtitle = [item.manufacturer, item.model].filter(Boolean).join(" ");
                  return (
                    <Card
                      key={item.id}
                      data-inv-row={item.id}
                      data-search-highlight-id={`personalEquipment:${item.id}`}
                      onClick={() => setViewing({ item, index: 0 })}
                      onMouseEnter={() => setHoveredCardId(item.id)}
                      onMouseLeave={() => setHoveredCardId((cur) => (cur === item.id ? null : cur))}
                      className={`overflow-hidden relative border-border/60 hover:border-foreground/30 hover:shadow-md transition-all duration-200 p-0 gap-0 cursor-pointer ${isSel ? "ring-2 ring-foreground/40" : ""} ${isFocused ? "ring-2 ring-cyan-500/70" : ""}`}
                    >
                      {/* Image area */}
                      <div
                        className="relative aspect-square bg-gradient-to-br from-muted/40 to-muted overflow-hidden"
                      >
                        {cover ? (
                          <>
                            <PhotoView p={cover} alt={cover.caption ?? item.name} className="transition-transform duration-300" />
                            {item.photos.length > 1 && (
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1">
                                {item.photos.slice(0, Math.min(item.photos.length, 5)).map((_, i) => (
                                  <span
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all ${i === 0 ? "bg-white w-3 shadow" : "bg-white/60 w-1.5"}`}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                            <Camera className="h-8 w-8 mb-1" />
                            <span className="text-[10px] uppercase tracking-wide">No photo</span>
                          </div>
                        )}

                        {/* Top-left: select checkbox */}
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute top-2 left-2 z-10 h-4 w-4 cursor-pointer rounded bg-background/90 ring-1 ring-border ${isSel || isHovered ? "opacity-100" : "opacity-0"} transition-opacity`}
                          aria-label={`Select ${item.name}`}
                        />

                        {/* Top-right: privacy heart-style toggle */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); togglePrivacy(item); }}
                          title={item.isPrivate ? "Private — make public" : "Public — make private"}
                          className={`absolute top-2 right-2 z-10 h-7 w-7 rounded-full backdrop-blur flex items-center justify-center transition ${
                            item.isPrivate
                              ? "bg-white/85 text-foreground hover:bg-white shadow-sm"
                              : "bg-blue-500 text-white hover:bg-blue-600 shadow"
                          }`}
                        >
                          {item.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        </button>

                        {/* Bottom-right corner badges */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                          {item.isDraft && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditing(item); }}
                              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500 text-white shadow hover:bg-amber-600"
                              title="Click to add details"
                            >
                              Needs details
                            </button>
                          )}
                        </div>

                        {/* Hover action bar */}
                        <div className={`absolute bottom-1.5 right-1.5 left-1.5 z-20 flex items-center justify-end gap-0.5 rounded-full bg-black/65 backdrop-blur-sm ring-1 ring-white/15 px-1 py-0.5 shadow-lg transition-opacity ${isHovered ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                          {focusedPositionId && (
                            <button
                              type="button"
                              className="h-6 w-6 shrink-0 rounded-full text-white/95 hover:bg-emerald-500 hover:text-white flex items-center justify-center disabled:opacity-50"
                              onClick={(e) => { e.stopPropagation(); assignToPosition(item); }}
                              disabled={assigningId === item.id}
                              title={`Add to ${focusedPositionLabel ?? "focused job"}`}
                            >
                              <Briefcase className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded-full text-white/95 hover:bg-white hover:text-foreground flex items-center justify-center"
                            onClick={(e) => { e.stopPropagation(); setEditing(item); }}
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded-full text-white/95 hover:bg-sky-500 hover:text-white flex items-center justify-center"
                            onClick={(e) => { e.stopPropagation(); duplicateItem(item); }}
                            title="Duplicate"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          {cover && (
                            <button
                              type="button"
                              className="h-6 w-6 shrink-0 rounded-full text-white/95 hover:bg-violet-500 hover:text-white flex items-center justify-center"
                              onClick={(e) => { e.stopPropagation(); setCropping({ item, photoId: cover.id }); }}
                              title="Adjust crop"
                            >
                              <Crop className="h-3 w-3" />
                            </button>
                          )}
                          <label
                            className="h-6 w-6 shrink-0 rounded-full text-white/95 hover:bg-cyan-500 hover:text-white flex items-center justify-center cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                            title="Add photo"
                          >
                            <Upload className="h-3 w-3" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={item.photos.length >= 5}
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                await uploadPhoto(item.id, f, item.photos.length === 0);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded-full text-white/95 hover:bg-red-500 hover:text-white flex items-center justify-center"
                            onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Info area */}
                      <div className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${CATEGORY_BAR_COLOR[item.category] ?? "bg-slate-400"}`} />
                              {CATEGORY_LABELS[item.category]}
                            </p>
                            <h3 className="text-sm font-semibold leading-snug truncate mt-0.5">
                              <Highlight text={item.name} query={search} />
                            </h3>
                            {subtitle && (
                              <p className="text-[11px] text-muted-foreground truncate">
                                <Highlight text={subtitle} query={search} />
                              </p>
                            )}
                          </div>
                          {price != null && (
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold tabular-nums">
                                ${Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </p>
                              {item.currentValue != null && item.purchasePrice != null && item.currentValue !== item.purchasePrice && (
                                <p className="text-[10px] text-muted-foreground line-through tabular-nums">
                                  ${Number(item.purchasePrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Proficiency dots + condition pill */}
                        <div className="flex items-center justify-between gap-2">
                          {item.proficiency ? (
                            <div className="flex items-center gap-0.5" title={`Skill ${item.proficiency}/5`}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <span
                                  key={n}
                                  className={`h-1.5 w-1.5 rounded-full ${n <= (item.proficiency ?? 0) ? "bg-orange-500" : "bg-muted"}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/60">—</span>
                          )}
                          <div className="flex items-center gap-1">
                            <ConditionBadge
                              item={item}
                              open={inlinePopover?.itemId === item.id && inlinePopover.field === "condition"}
                              onOpen={() => setInlinePopover({ itemId: item.id, field: "condition" })}
                              onSelect={(v) => inlinePatch(item.id, "condition", v)}
                            />
                            <OwnershipBadge
                              item={item}
                              open={inlinePopover?.itemId === item.id && inlinePopover.field === "ownership"}
                              onOpen={() => setInlinePopover({ itemId: item.id, field: "ownership" })}
                              onSelect={(v) => inlinePatch(item.id, "ownership", v)}
                            />
                          </div>
                        </div>

                        {/* Optional meta row: location / serial */}
                        {(item.location || item.serialNumber) && (
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground truncate">
                            {item.location && (
                              <span className="truncate">📍 {item.location}</span>
                            )}
                            {item.serialNumber && (
                              <span className="font-mono truncate">SN: {item.serialNumber}</span>
                            )}
                          </div>
                        )}

                        {/* Tags row (compact) */}
                        {(item.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {(item.tags ?? []).slice(0, 3).map((t) => (
                              <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 text-[10px]">
                                <Tag className="h-2 w-2" />{t}
                              </span>
                            ))}
                            {(item.tags ?? []).length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{(item.tags ?? []).length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
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

      {/* Edit / Add — modal overlay */}
      {editing && (
        <div
          className="fixed inset-0 z-[2150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <Card
            className={`relative border-cyan-500/40 ring-1 ring-cyan-500/20 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${editingDragActive ? "ring-2 ring-cyan-500" : ""}`}
            onDragEnter={(e) => {
              if (e.dataTransfer?.types?.includes("Files")) {
                e.preventDefault();
                setEditingDragActive(true);
              }
            }}
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes("Files")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setEditingDragActive(false);
            }}
            onDrop={async (e) => {
              if (!e.dataTransfer?.types?.includes("Files")) return;
              e.preventDefault();
              setEditingDragActive(false);
              const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
              if (!files.length) return;
              if (!editing?.id) {
                toast.message("Save the item first, then drop photos");
                return;
              }
              const tid = toast.loading(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
              const startIndex = editing.photos?.length ?? 0;
              for (let i = 0; i < files.length; i++) {
                await uploadPhoto(editing.id, files[i], startIndex === 0 && i === 0);
              }
              toast.success("Photos added", { id: tid });
            }}
          >
            {editingDragActive && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-cyan-500/15 backdrop-blur-sm pointer-events-none rounded-lg border-2 border-dashed border-cyan-500">
                <Upload className="h-10 w-10 text-cyan-500 mb-2" />
                <div className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                  {editing?.id ? "Drop to add photos" : "Save the item first"}
                </div>
              </div>
            )}
            <div className="flex items-start justify-between gap-3 px-3 py-2 border-b bg-cyan-500/5 shrink-0">
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
          <CardContent className="p-3 space-y-3 overflow-y-auto flex-1">
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
                <TagInput
                  value={editing.tags ?? []}
                  onChange={(next) => setEditing({ ...editing, tags: next })}
                  placeholder="Type a tag and press Enter (e.g. field-kit)"
                  maxTags={20}
                  maxTagLength={32}
                  suggestions={Object.keys(tagCounts)}
                />
                <p className="text-[10px] text-muted-foreground">Press Enter, Tab, or comma to add. Backspace removes the last. Max 20 tags / 32 chars each.</p>
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
                    {editing.photos!.map((p, idx) => {
                      const isPhotoHovered = hoveredPhotoId === p.id;
                      return (
                      <div
                        key={p.id}
                        draggable
                        onMouseEnter={() => setHoveredPhotoId(p.id)}
                        onMouseLeave={() => setHoveredPhotoId((cur) => (cur === p.id ? null : cur))}
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
                        className={`relative aspect-square rounded border overflow-hidden bg-muted ${dragPhotoId === p.id ? "opacity-40" : ""} ${reorderBusy ? "pointer-events-none" : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <PhotoView
                          p={p}
                          alt={p.caption ?? editing.name ?? "photo"}
                          imgClassName="cursor-zoom-in"
                          onClick={() => {
                            const fresh = items.find((i) => i.id === editing.id);
                            if (fresh) setLightbox({ item: fresh, index: idx });
                          }}
                        />
                        <span className={`absolute top-1 right-1 p-0.5 rounded bg-black/50 text-white transition-opacity cursor-grab active:cursor-grabbing ${isPhotoHovered ? "opacity-100" : "opacity-0"}`} title="Drag to reorder">
                          <GripVertical className="h-3 w-3" />
                        </span>
                        {p.isCover && (
                          <Star className="absolute top-1 left-1 h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                        )}
                        <div className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/70 transition-opacity py-1 ${isPhotoHovered ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
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
                              onClick={(e) => {
                                e.stopPropagation();
                                const fresh = items.find((i) => i.id === editing.id);
                                if (fresh) setCropping({ item: fresh, photoId: p.id });
                              }}
                              title="Adjust crop"
                              className="p-1 rounded hover:bg-violet-500/40"
                            >
                              <Crop className="h-3.5 w-3.5 text-violet-200" />
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
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/80">
                  JPG/PNG/WebP/GIF, max 5 MB each. Drag thumbnails to reorder. Avoid serial numbers, faces, or sensitive info.
                </p>
              </div>
            </div>
          )}
          </CardContent>
          <div className="flex items-center justify-end gap-2 px-3 py-2 border-t bg-background shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" onClick={saveItem} disabled={saving || !editing?.name?.trim()}>
              {saving ? "Saving…" : editing?.id ? "Save" : "Add"}
            </Button>
          </div>
          </Card>
        </div>
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

      {/* Share modal */}
      {shareOpen && (
        <ShareModal
          onClose={() => setShareOpen(false)}
          selectedIds={Array.from(selected)}
          totalCount={items.length}
          kits={kits}
        />
      )}

      {/* Bulk crop — apply same focal/zoom/rotation/flip across many photos */}
      {bulkCropping && (() => {
        const selectedItems = items.filter((i) => selected.has(i.id));
        const photoIds: string[] = [];
        for (const it of selectedItems) {
          if (!it.photos || it.photos.length === 0) continue;
          if (bulkCropping.scope === "covers") {
            const cover = it.photos.find((p) => p.isCover) ?? it.photos[0];
            photoIds.push(cover.id);
          } else {
            for (const p of it.photos) photoIds.push(p.id);
          }
        }
        const previewPhoto =
          selectedItems.find((i) => i.photos && i.photos.length > 0)?.photos[0] ?? null;
        if (!previewPhoto || photoIds.length === 0) {
          setBulkCropping(null);
          toast.message("No photos in selected items");
          return null;
        }
        const itemName =
          bulkCropping.scope === "covers"
            ? `${selectedItems.length} cover photo${selectedItems.length === 1 ? "" : "s"}`
            : `${photoIds.length} photo${photoIds.length === 1 ? "" : "s"} across ${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`;
        return (
          <CropModal
            key="bulk-crop"
            photo={previewPhoto}
            itemName={itemName}
            onClose={() => setBulkCropping(null)}
            onSave={async ({ focalX, focalY, zoom, rotation, flipH, flipV }) => {
              const tid = toast.loading(`Applying crop to ${photoIds.length} photo${photoIds.length === 1 ? "" : "s"}…`);
              let ok = 0;
              let fail = 0;
              for (const pid of photoIds) {
                try {
                  const res = await fetch("/api/personal-equipment/photos", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: pid, focalX, focalY, zoom, rotation, flipH, flipV }),
                  });
                  if (res.ok) ok++; else fail++;
                } catch {
                  fail++;
                }
              }
              if (fail === 0) {
                toast.success(`Crop applied to ${ok} photo${ok === 1 ? "" : "s"}`, { id: tid });
              } else if (ok === 0) {
                toast.error(`Crop failed for all ${fail} photo${fail === 1 ? "" : "s"}`, { id: tid });
              } else {
                toast.warning(`Crop applied to ${ok}, failed for ${fail}`, { id: tid });
              }
              setBulkCropping(null);
              await load();
            }}
          />
        );
      })()}

      {/* Crop / focal-point editor */}
      {cropping && (() => {
        const photo = cropping.item.photos.find((p) => p.id === cropping.photoId);
        if (!photo) return null;
        return (
          <CropModal
            key={photo.id}
            photo={photo}
            itemName={cropping.item.name}
            onClose={() => setCropping(null)}
            onSave={async ({ focalX, focalY, zoom, rotation, flipH, flipV }) => {
              const tid = toast.loading("Saving crop…");
              try {
                const res = await fetch("/api/personal-equipment/photos", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: photo.id, focalX, focalY, zoom, rotation, flipH, flipV }),
                });
                if (!res.ok) throw new Error(await res.text());
                toast.success("Crop saved", { id: tid });
                setCropping(null);
                if (editing?.id === cropping.item.id) {
                  await refreshEditing(cropping.item.id);
                } else {
                  await load();
                }
              } catch (err) {
                toast.error("Save failed", { id: tid });
                console.error(err);
              }
            }}
          />
        );
      })()}

      {/* Quick view (Amazon-style product detail) */}
      {viewing && (() => {
        const item = viewing.item;
        const photos = item.photos;
        const photo = photos[viewing.index] ?? photos[0];
        const price = item.currentValue ?? item.purchasePrice;
        const subtitle = [item.manufacturer, item.model].filter(Boolean).join(" ");
        const setIdx = (i: number) => setViewing((v) => v ? { ...v, index: i } : v);
        const next = () => photos.length && setIdx((viewing.index + 1) % photos.length);
        const prev = () => photos.length && setIdx((viewing.index - 1 + photos.length) % photos.length);
        return (
          <div
            className="fixed inset-0 z-[2150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setViewing(null)}
          >
            <div
              className="bg-background text-foreground rounded-lg shadow-2xl border border-border max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${CATEGORY_BAR_COLOR[item.category] ?? "bg-slate-400"}`} />
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{CATEGORY_LABELS[item.category]}</span>
                  {item.isDraft && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white">Draft</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(item); setViewing(null); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                  <button
                    type="button"
                    onClick={() => setViewing(null)}
                    className="p-1.5 rounded hover:bg-muted"
                    title="Close (Esc)"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="grid md:grid-cols-2 gap-0 overflow-y-auto">
                {/* Image gallery */}
                <div className="bg-muted/30 p-4 flex flex-col items-center gap-3 border-b md:border-b-0 md:border-r border-border">
                  <div className="relative w-full aspect-square max-w-md bg-muted rounded-lg overflow-hidden">
                    {photo ? (
                      <>
                        <PhotoView
                          p={photo}
                          alt={photo.caption ?? item.name}
                          imgClassName="cursor-zoom-in"
                          onClick={() => setLightbox({ item, index: viewing.index })}
                        />
                        {photos.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={prev}
                              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"
                              title="Previous (←)"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={next}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"
                              title="Next (→)"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white tabular-nums">
                              {viewing.index + 1} / {photos.length}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                        <Camera className="h-10 w-10 mb-2" />
                        <span className="text-xs uppercase tracking-wide">No photo</span>
                      </div>
                    )}
                  </div>
                  {photos.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap justify-center">
                      {photos.map((p, i) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setIdx(i)}
                          className={`h-12 w-12 rounded overflow-hidden border-2 transition-all ${i === viewing.index ? "border-foreground" : "border-transparent opacity-60 hover:opacity-100"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <PhotoView p={p} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info panel */}
                <div className="p-5 space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold leading-tight">{item.name}</h2>
                    {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
                  </div>

                  {price != null && (
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-bold tabular-nums">${Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      {item.currentValue != null && item.purchasePrice != null && item.currentValue !== item.purchasePrice && (
                        <span className="text-sm text-muted-foreground line-through tabular-nums">
                          ${Number(item.purchasePrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      )}
                      {item.currentValue != null && (
                        <span className="text-[11px] text-muted-foreground">current value</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${CONDITION_BADGE[item.condition]}`}>{item.condition}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${OWNERSHIP_BADGE[item.ownership]}`}>{item.ownership}</span>
                    {item.isPrivate ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Private</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-600 inline-flex items-center gap-1"><Unlock className="h-3 w-3" /> Public</span>
                    )}
                  </div>

                  {item.proficiency != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Skill level</span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} className={`h-2 w-2 rounded-full ${n <= (item.proficiency ?? 0) ? "bg-orange-500" : "bg-muted"}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{item.proficiency}/5</span>
                    </div>
                  )}

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {item.manufacturer && (<><dt className="text-xs text-muted-foreground">Manufacturer</dt><dd className="text-foreground">{item.manufacturer}</dd></>)}
                    {item.model && (<><dt className="text-xs text-muted-foreground">Model</dt><dd className="text-foreground">{item.model}</dd></>)}
                    {item.serialNumber && (<><dt className="text-xs text-muted-foreground">Serial</dt><dd className="font-mono text-xs">{item.serialNumber}</dd></>)}
                    {item.location && (<><dt className="text-xs text-muted-foreground">Location</dt><dd className="text-foreground">📍 {item.location}</dd></>)}
                    {item.purchaseDate && (<><dt className="text-xs text-muted-foreground">Purchased</dt><dd className="text-foreground">{new Date(item.purchaseDate).toLocaleDateString()}</dd></>)}
                    {item.purchasePrice != null && (<><dt className="text-xs text-muted-foreground">Purchase price</dt><dd className="tabular-nums">${Number(item.purchasePrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}</dd></>)}
                  </dl>

                  {(item.tags ?? []).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(item.tags ?? []).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 text-xs">
                            <Tag className="h-2.5 w-2.5" />{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
                      <p className="text-sm whitespace-pre-wrap text-foreground/90">{item.notes}</p>
                    </div>
                  )}

                  {/* ── Worklog usage history (item #19 Phase A) ── */}
                  <div className="pt-2 border-t border-border">
                    <EquipmentUsageHistory
                      equipmentId={item.id}
                      equipmentName={item.name}
                      limit={5}
                    />
                  </div>

                  {focusedPositionId && (
                    <div className="pt-2 border-t border-border">
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => { assignToPosition(item); setViewing(null); }}
                        disabled={assigningId === item.id}
                      >
                        <Briefcase className="h-3.5 w-3.5 mr-2" />
                        Add to {focusedPositionLabel ?? "focused job"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Lightbox */}
      {lightbox && lightbox.item.photos.length > 0 && (() => {
        const photos = lightbox.item.photos;
        const photo = photos[lightbox.index];
        if (!photo) return null;
        const next = () => setLightbox((lb) => lb ? { ...lb, index: (lb.index + 1) % photos.length } : lb);
        const prev = () => setLightbox((lb) => lb ? { ...lb, index: (lb.index - 1 + photos.length) % photos.length } : lb);
        const totalRotation = ((photo.rotation ?? 0) + lbRotation) % 360;
        const flipH = (photo.flipH ? -1 : 1) * (lbFlipH ? -1 : 1);
        const flipV = (photo.flipV ? -1 : 1) * (lbFlipV ? -1 : 1);
        const reset = () => { setLbZoom(1); setLbPan({ x: 0, y: 0 }); setLbRotation(0); setLbFlipH(false); setLbFlipV(false); };
        const isZoomed = lbZoom > 1.001;
        return (
          <div
            className="fixed inset-0 z-[2200] bg-black/90 flex items-center justify-center select-none"
            onClick={() => setLightbox(null)}
            onWheel={(e) => {
              if (!e.ctrlKey && !e.metaKey) {
                // Only zoom on wheel — let normal scroll alone if modifier not held
                e.preventDefault();
              }
              const delta = -e.deltaY * 0.0015;
              setLbZoom((z) => Math.min(8, Math.max(1, +(z + delta * z).toFixed(3))));
            }}
          >
            {/* Top toolbar */}
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1 text-white text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" onClick={() => setLbZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} className="p-1.5 rounded-full hover:bg-white/15" title="Zoom out (-)"><ZoomOut className="h-4 w-4" /></button>
              <span className="px-1 tabular-nums w-12 text-center">{Math.round(lbZoom * 100)}%</span>
              <button type="button" onClick={() => setLbZoom((z) => Math.min(8, +(z + 0.25).toFixed(2)))} className="p-1.5 rounded-full hover:bg-white/15" title="Zoom in (+)"><ZoomIn className="h-4 w-4" /></button>
              <span className="h-4 w-px bg-white/20 mx-1" />
              <button type="button" onClick={() => setLbRotation((r) => (r + 270) % 360)} className="p-1.5 rounded-full hover:bg-white/15" title="Rotate left"><RotateCcw className="h-4 w-4" /></button>
              <button type="button" onClick={() => setLbRotation((r) => (r + 90) % 360)} className="p-1.5 rounded-full hover:bg-white/15" title="Rotate right (R)"><RotateCw className="h-4 w-4" /></button>
              <button type="button" onClick={() => setLbFlipH((f) => !f)} className={`p-1.5 rounded-full hover:bg-white/15 ${lbFlipH ? "bg-white/20" : ""}`} title="Flip horizontal"><FlipHorizontal className="h-4 w-4" /></button>
              <button type="button" onClick={() => setLbFlipV((f) => !f)} className={`p-1.5 rounded-full hover:bg-white/15 ${lbFlipV ? "bg-white/20" : ""}`} title="Flip vertical"><FlipVertical className="h-4 w-4" /></button>
              <span className="h-4 w-px bg-white/20 mx-1" />
              <button type="button" onClick={reset} className="px-2 py-1 rounded-full hover:bg-white/15 text-[11px]" title="Reset (0)">Reset</button>
              <a href={photo.filePath} download className="p-1.5 rounded-full hover:bg-white/15" title="Download" onClick={(e) => e.stopPropagation()}><Download className="h-4 w-4" /></a>
            </div>

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
              <div
                className="overflow-hidden flex items-center justify-center"
                style={{ width: "92vw", height: "78vh", cursor: isZoomed ? (lbDragRef.current ? "grabbing" : "grab") : "zoom-in" }}
                onDoubleClick={() => setLbZoom((z) => (z > 1.001 ? 1 : 2))}
                onMouseDown={(e) => {
                  if (!isZoomed) return;
                  lbDragRef.current = { x: e.clientX, y: e.clientY, sx: lbPan.x, sy: lbPan.y };
                }}
                onMouseMove={(e) => {
                  const d = lbDragRef.current;
                  if (!d) return;
                  setLbPan({ x: d.sx + (e.clientX - d.x), y: d.sy + (e.clientY - d.y) });
                }}
                onMouseUp={() => { lbDragRef.current = null; }}
                onMouseLeave={() => { lbDragRef.current = null; }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.filePath}
                  alt={photo.caption ?? lightbox.item.name}
                  draggable={false}
                  className="max-w-full max-h-full object-contain rounded shadow-2xl will-change-transform transition-transform duration-75"
                  style={{
                    transform: `translate(${lbPan.x}px, ${lbPan.y}px) scale(${lbZoom}) rotate(${totalRotation}deg) scaleX(${flipH}) scaleY(${flipV})`,
                  }}
                />
              </div>
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
                  <span className="opacity-60">· scroll to zoom · drag to pan · R rotate · 0 reset</span>
                </div>
                {photos.length > 1 && (
                  <div className="flex items-center gap-1 mt-2">
                    {photos.map((p, i) => (
                      <div
                        key={p.id}
                        draggable={!reorderBusy}
                        onDragStart={() => setDragPhotoId(p.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!dragPhotoId || dragPhotoId === p.id) { setDragPhotoId(null); return; }
                          const ids = photos.map((x) => x.id);
                          const from = ids.indexOf(dragPhotoId);
                          if (from < 0) { setDragPhotoId(null); return; }
                          ids.splice(i, 0, ids.splice(from, 1)[0]);
                          setDragPhotoId(null);
                          void reorderPhotos(lightbox.item.id, ids);
                        }}
                        onDragEnd={() => setDragPhotoId(null)}
                        className={`relative ${dragPhotoId === p.id ? "opacity-40" : ""}`}
                        title="Click to view · Drag to reorder"
                      >
                        <button
                          type="button"
                          onClick={() => setLightbox({ item: lightbox.item, index: i })}
                          className={`block h-10 w-10 rounded overflow-hidden border-2 transition-all ${i === lightbox.index ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <PhotoView p={p} />
                        </button>
                        {p.isCover && (
                          <Star className="absolute -top-1 -left-1 h-3 w-3 text-yellow-300 fill-yellow-300 drop-shadow" />
                        )}
                      </div>
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
