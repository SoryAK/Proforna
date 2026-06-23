"use client";
/**
 * AnnotationEditor — inline editor (rendered inside the gallery modal panel)
 * for drawing pins / shapes / freehand on a photo and writing rich-text notes.
 *
 * Coords are normalized 0..1 so they stay correct at any rendered size.
 *
 * Features:
 *   - Tools: select | pin | rect | circle | arrow | freehand
 *   - Color: per-annotation
 *   - Drag/resize selected shapes (8 handles for rect, 4 for circle, 2 for arrow)
 *   - Tour list with drag-to-reorder
 *   - Public/Private toggle
 *   - Undo / Redo with local history stack
 *   - Keyboard shortcuts: V P R O C A D / [ ] / Ctrl+Z / Ctrl+Y / Esc / Delete
 *   - Modifiers while drawing: Shift = constrain (square / circle / 45° arrow)
 *                              Alt   = draw from center
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  X,
  MousePointer2,
  MapPin,
  Square,
  Circle as CircleIcon,
  ArrowUpRight,
  Pencil,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  ListOrdered,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Undo2,
  Redo2,
  SplitSquareHorizontal,
  HelpCircle,
  Download,
  Minus,
  Type,
  Ruler,
} from "lucide-react";
import { AnnotationOverlay, type Annotation, type AnnotationKind } from "@/components/annotation-overlay";
import { RichTextEditor } from "@/components/rich-text-editor";
import { CommentsThread } from "@/components/comments-thread";
import { AnnotationCompare } from "@/components/annotation-compare";

type Tool = "select" | AnnotationKind;

type CompareSibling = {
  id: string;
  filePath: string;
  fileName: string;
  rotation?: number | null;
  caption?: string | null;
};

type Props = {
  photoId: string;
  imageUrl: string;
  imageRotation?: number;
  initialAnnotationsPublic?: boolean;
  /** Other photos in the same gallery — enables Compare mode. */
  siblingPhotos?: CompareSibling[];
  onClose: () => void;
  onChange?: () => void;
};

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#000000", "#ffffff"];

type RectGeo = { x: number; y: number; w: number; h: number; strokeWidth?: number };
type CircleGeo = { cx: number; cy: number; r: number; strokeWidth?: number };
type ArrowGeo = { x1: number; y1: number; x2: number; y2: number; strokeWidth?: number };
type LineGeo = { x1: number; y1: number; x2: number; y2: number; strokeWidth?: number };
type RulerGeo = { x1: number; y1: number; x2: number; y2: number; strokeWidth?: number };
type PinGeo = { x: number; y: number };
type FreehandGeo = { points: Array<{ x: number; y: number }>; strokeWidth?: number };
type TextGeo = { x: number; y: number; text: string; fontSize?: number };
type ScaleGeo = { x1: number; y1: number; x2: number; y2: number; realWorld: number; unit: "mm" | "cm" | "m" | "in" | "ft" };
type AnyGeo = RectGeo | CircleGeo | ArrowGeo | LineGeo | RulerGeo | PinGeo | FreehandGeo | TextGeo | ScaleGeo;

type DraftState =
  | null
  | ({ kind: "rect" } & RectGeo)
  | ({ kind: "circle" } & CircleGeo)
  | ({ kind: "arrow" } & ArrowGeo)
  | ({ kind: "line" } & LineGeo)
  | ({ kind: "ruler" } & RulerGeo)
  | ({ kind: "scale" } & { x1: number; y1: number; x2: number; y2: number })
  | ({ kind: "freehand" } & FreehandGeo);

type DragMode =
  | { type: "move"; id: string; startGeo: AnyGeo; startPt: { x: number; y: number } }
  | {
      type: "resize";
      id: string;
      handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "p1" | "p2";
      startGeo: AnyGeo;
      startPt: { x: number; y: number };
    };

type HistoryEntry = { undo: () => void | Promise<void>; redo: () => void | Promise<void> };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const isTextInput = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
};
const parseGeo = <T extends AnyGeo>(raw: unknown): T => {
  if (typeof raw === "string") return JSON.parse(raw) as T;
  return raw as T;
};
const parseTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string");
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((t) => typeof t === "string") : [];
    } catch { return []; }
  }
  return [];
};
const TAG_COLORS = ["bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300", "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300", "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300", "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300"];
const tagColorFor = (t: string) => {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
};

export function AnnotationEditor({
  photoId,
  imageUrl,
  imageRotation = 0,
  initialAnnotationsPublic = true,
  siblingPhotos,
  onClose,
  onChange,
}: Props) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [drawColor, setDrawColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [annotationsPublic, setAnnotationsPublic] = useState(initialAnnotationsPublic);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPatch = useRef<Map<string, Partial<Annotation>>>(new Map());
  const savedPillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  // ── Drawing in-progress ─────────────────────────────────────
  const [draft, setDraft] = useState<DraftState>(null);
  const drawingRef = useRef(false);
  const startPtRef = useRef<{ x: number; y: number } | null>(null);

  // ── Drag/resize ─────────────────────────────────────────────
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const dragModeRef = useRef<DragMode | null>(null);
  useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);

  // ── Undo / redo stacks ──────────────────────────────────────
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const pushHistory = useCallback((entry: HistoryEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  // ── Load annotations ────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery/annotations?photoId=${encodeURIComponent(photoId)}`);
      if (!res.ok) throw new Error(await res.text());
      const items: Annotation[] = (await res.json()).map((a: Annotation & { tags?: unknown }) => ({
        ...a,
        tags: parseTags(a.tags),
      }));
      setAnnotations(items);
    } catch (e) {
      toast.error(`Failed to load annotations: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [photoId]);

  useEffect(() => { reload(); }, [reload]);

  // Deep link: ?ann=<annotationId> auto-selects the matching annotation after load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (annotations.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const annId = params.get("ann");
    if (annId && annotations.some((a) => a.id === annId)) {
      setSelectedId(annId);
    }
    // run only when the annotation set first becomes non-empty for the current photo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId, annotations.length === 0]);

  // ── Track rendered image size ───────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const el = imgRef.current;
      if (!el) return;
      setImgSize({ w: el.clientWidth, h: el.clientHeight });
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [imageUrl]);

  // ── Selected annotation ─────────────────────────────────────
  const selected = useMemo(
    () => annotations.find((a) => a.id === selectedId) ?? null,
    [annotations, selectedId]
  );

  // ── Stable per-annotation labels (1, 2, 3…) ─────────────────
  // Sort by [sortOrder asc nulls last, createdAt asc] — same order the side
  // panel uses — so labels match what the user sees in the list.
  const labelLookup = useMemo(() => {
    const ordered = [...annotations].sort((a, b) => {
      const sa = a.sortOrder ?? Number.POSITIVE_INFINITY;
      const sb = b.sortOrder ?? Number.POSITIVE_INFINITY;
      return sa !== sb ? sa - sb : a.id.localeCompare(b.id);
    });
    const map = new Map<string, number>();
    ordered.forEach((a, i) => map.set(a.id, i + 1));
    return map;
  }, [annotations]);

  // ── Pointer to normalized coords ────────────────────────────
  const ptToNorm = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  }, []);

  // ── CRUD (raw, no history) ──────────────────────────────────
  const apiCreate = useCallback(
    async (payload: { kind: AnnotationKind; geometry: unknown; color?: string; title?: string | null; body?: string | null; isPrivate?: boolean; sortOrder?: number | null }) => {
      const res = await fetch("/api/gallery/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId, color: drawColor, ...payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as Annotation;
    },
    [photoId, drawColor]
  );

  const apiPatch = useCallback(async (id: string, patch: Partial<Annotation> & { expectedUpdatedAt?: string }) => {
    const res = await fetch("/api/gallery/annotations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.status === 409) {
      const err: Error & { code?: string } = new Error("conflict");
      err.code = "stale";
      throw err;
    }
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as Annotation;
  }, []);

  const apiDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/gallery/annotations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
  }, []);

  // ── Debounced save (for high-frequency text edits) ──────────
  const flashSaved = useCallback(() => {
    if (savedPillTimer.current) clearTimeout(savedPillTimer.current);
    setSaveStatus("saved");
    savedPillTimer.current = setTimeout(() => setSaveStatus("idle"), 1500);
  }, []);

  const flushSave = useCallback(async (id: string) => {
    const t = saveTimers.current.get(id);
    if (t) { clearTimeout(t); saveTimers.current.delete(id); }
    const patch = pendingPatch.current.get(id);
    if (!patch || Object.keys(patch).length === 0) return;
    pendingPatch.current.delete(id);
    setSaveStatus("saving");
    try {
      const current = annotations.find((a) => a.id === id);
      const expectedUpdatedAt = current?.updatedAt ? new Date(current.updatedAt).toISOString() : undefined;
      const updated = await apiPatch(id, { ...patch, expectedUpdatedAt });
      setAnnotations((arr) => arr.map((a) => (a.id === id ? { ...a, updatedAt: updated.updatedAt } : a)));
      flashSaved();
      onChange?.();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "stale") {
        setSaveStatus("conflict");
        toast.error("Edit conflict — reloaded latest from server.");
        await reload();
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        toast.error(`Save failed: ${String(e)}`);
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPatch, flashSaved, onChange]);

  const scheduleSave = useCallback((id: string, patch: Partial<Annotation>) => {
    // optimistic local update
    setAnnotations((arr) => arr.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    const merged = { ...(pendingPatch.current.get(id) ?? {}), ...patch };
    pendingPatch.current.set(id, merged);
    setSaveStatus("saving");
    const prev = saveTimers.current.get(id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => { void flushSave(id); }, 600);
    saveTimers.current.set(id, t);
  }, [flushSave]);

  // Flush all pending edits when unmounting or switching photo
  useEffect(() => {
    const timers = saveTimers.current;
    const pending = pendingPatch.current;
    return () => {
      // best-effort flush on unmount
      for (const t of timers.values()) clearTimeout(t);
      for (const id of Array.from(pending.keys())) {
        // fire-and-forget
        void flushSave(id);
      }
      if (savedPillTimer.current) clearTimeout(savedPillTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  // ── User-facing actions (with history) ──────────────────────
  const createAnnotation = useCallback(
    async (
      kind: AnnotationKind,
      geometry: AnyGeo,
      options: { selectAfter?: boolean; title?: string; isPrivate?: boolean } = { selectAfter: true },
    ) => {
      setSaving(true);
      try {
        const created = await apiCreate({ kind, geometry, title: options.title, isPrivate: options.isPrivate });
        setAnnotations((prev) => [...prev, created]);
        if (options.selectAfter !== false) {
          setSelectedId(created.id);
          setTool("select");
        }
        let currentId = created.id;
        pushHistory({
          undo: async () => {
            try { await apiDelete(currentId); } catch { /* noop */ }
            setAnnotations((prev) => prev.filter((a) => a.id !== currentId));
            if (selectedIdRef.current === currentId) setSelectedId(null);
          },
          redo: async () => {
            try {
              const recreated = await apiCreate({
                kind,
                geometry,
                color: created.color,
                title: created.title,
                body: created.body,
                isPrivate: created.isPrivate,
                sortOrder: created.sortOrder,
              });
              setAnnotations((prev) => [...prev, recreated]);
              currentId = recreated.id;
            } catch (e) { toast.error(`Redo failed: ${String(e)}`); }
          },
        });
        onChange?.();
        return created;
      } catch (e) {
        toast.error(`Failed to add: ${String(e)}`);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [apiCreate, apiDelete, onChange, pushHistory]
  );

  // Need a ref to selected id for closures inside history entries
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  /** Optimistic update with optional history. */
  const updateAnnotation = useCallback(
    async (id: string, patch: Partial<Annotation>, opts: { recordHistory?: boolean } = { recordHistory: true }) => {
      const prev = annotations.find((a) => a.id === id);
      if (!prev) return;
      const inverse: Partial<Annotation> = {};
      (Object.keys(patch) as Array<keyof Annotation>).forEach((k) => {
        // For geometry, ensure inverse value is an object (API rejects strings)
        if (k === "geometry") {
          const g = prev.geometry;
          inverse.geometry = typeof g === "string" ? JSON.parse(g) : g;
          return;
        }
        // @ts-expect-error - generic key access produces an intersected-down value type
        inverse[k] = prev[k] ?? null;
      });
      setAnnotations((arr) => arr.map((a) => (a.id === id ? { ...a, ...patch } : a)));
      try {
        await apiPatch(id, patch);
        if (opts.recordHistory) {
          pushHistory({
            undo: async () => {
              try { await apiPatch(id, inverse); } catch { /* noop */ }
              setAnnotations((arr) => arr.map((a) => (a.id === id ? { ...a, ...inverse } : a)));
            },
            redo: async () => {
              try { await apiPatch(id, patch); } catch { /* noop */ }
              setAnnotations((arr) => arr.map((a) => (a.id === id ? { ...a, ...patch } : a)));
            },
          });
        }
        onChange?.();
      } catch (e) {
        toast.error(`Save failed: ${String(e)}`);
        reload();
      }
    },
    [annotations, apiPatch, onChange, pushHistory, reload]
  );

  const handleDelete = useCallback(
    async (id: string, skipConfirm = false) => {
      const target = annotations.find((a) => a.id === id);
      if (!target) return;
      if (!skipConfirm && !confirm("Delete this annotation?")) return;
      setAnnotations((arr) => arr.filter((a) => a.id !== id));
      if (selectedId === id) setSelectedId(null);
      try {
        await apiDelete(id);
        let currentId = id;
        pushHistory({
          undo: async () => {
            try {
              const recreated = await apiCreate({
                kind: target.kind,
                geometry: parseGeo(target.geometry),
                color: target.color,
                title: target.title,
                body: target.body,
                isPrivate: target.isPrivate,
                sortOrder: target.sortOrder,
              });
              setAnnotations((arr) => [...arr, recreated]);
              currentId = recreated.id;
            } catch (e) { toast.error(`Undo failed: ${String(e)}`); }
          },
          redo: async () => {
            try { await apiDelete(currentId); } catch { /* noop */ }
            setAnnotations((arr) => arr.filter((a) => a.id !== currentId));
          },
        });
        onChange?.();
      } catch (e) {
        toast.error(`Delete failed: ${String(e)}`);
        reload();
      }
    },
    [annotations, selectedId, apiDelete, apiCreate, onChange, pushHistory, reload]
  );

  const togglePublic = useCallback(async () => {
    const next = !annotationsPublic;
    setAnnotationsPublic(next);
    try {
      const res = await fetch("/api/gallery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photoId, annotationsPublic: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChange?.();
    } catch (e) {
      toast.error(`Toggle failed: ${String(e)}`);
      setAnnotationsPublic(!next);
    }
  }, [annotationsPublic, photoId, onChange]);

  // ── PNG export of the annotated canvas ──────────────────────
  const exportPng = useCallback(async () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(surface, {
        backgroundColor: null,
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to encode PNG");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annotated-${photoId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PNG downloaded");
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [photoId]);

  // ── Tour reorder ────────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const onDragOverItem = (e: React.DragEvent) => e.preventDefault();
  const onDropOnItem = async (targetId: string) => {
    if (!dragId || dragId === targetId) return setDragId(null);
    const inTour = annotations.filter((a) => a.sortOrder != null).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const others = annotations.filter((a) => a.sortOrder == null);
    const ordered = inTour.filter((a) => a.id !== dragId);
    const targetIdx = ordered.findIndex((a) => a.id === targetId);
    const dragged = annotations.find((a) => a.id === dragId)!;
    const insertAt = targetIdx >= 0 ? targetIdx : ordered.length;
    ordered.splice(insertAt, 0, { ...dragged, sortOrder: insertAt });
    const reorderPayload = ordered.map((a, i) => ({ id: a.id, sortOrder: i }));
    setAnnotations([...ordered.map((a, i) => ({ ...a, sortOrder: i })), ...others]);
    setDragId(null);
    try {
      const res = await fetch("/api/gallery/annotations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: reorderPayload }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChange?.();
    } catch (e) {
      toast.error(`Reorder failed: ${String(e)}`);
      reload();
    }
  };

  const toggleInTour = async (a: Annotation) => {
    if (a.sortOrder != null) {
      await updateAnnotation(a.id, { sortOrder: null });
      const remaining = annotations
        .filter((x) => x.id !== a.id && x.sortOrder != null)
        .sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
      const reorderPayload = remaining.map((x, i) => ({ id: x.id, sortOrder: i }));
      if (reorderPayload.length > 0) {
        await fetch("/api/gallery/annotations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reorder: reorderPayload }),
        });
        reload();
      }
    } else {
      const tourCount = annotations.filter((x) => x.sortOrder != null).length;
      await updateAnnotation(a.id, { sortOrder: tourCount });
    }
  };

  // ── Surface pointer handlers ────────────────────────────────
  const constrainDraft = (start: { x: number; y: number }, pt: { x: number; y: number }, shift: boolean, alt: boolean) => {
    let x1 = start.x, y1 = start.y, x2 = pt.x, y2 = pt.y;
    if (shift) {
      // Square / circle / 45°
      const dx = x2 - x1;
      const dy = y2 - y1;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      x2 = x1 + Math.sign(dx || 1) * m;
      y2 = y1 + Math.sign(dy || 1) * m;
    }
    if (alt) {
      // Draw from center: mirror around start
      x1 = start.x - (x2 - start.x);
      y1 = start.y - (y2 - start.y);
    }
    return { x1: clamp01(x1), y1: clamp01(y1), x2: clamp01(x2), y2: clamp01(y2) };
  };

  const onSurfacePointerDown = (e: React.PointerEvent) => {
    // 1) If user clicked a handle/body of the selected annotation, start drag
    const target = e.target as HTMLElement;
    const handleAttr = target.getAttribute?.("data-handle") || target.parentElement?.getAttribute?.("data-handle");
    if (tool === "select" && selected && handleAttr) {
      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture?.(e.pointerId);
      const startPt = ptToNorm(e.clientX, e.clientY);
      const startGeo = parseGeo<AnyGeo>(selected.geometry);
      if (handleAttr === "body") {
        setDragMode({ type: "move", id: selected.id, startGeo, startPt });
      } else {
        setDragMode({
          type: "resize",
          id: selected.id,
          handle: handleAttr as DragMode extends { handle: infer H } ? H : never,
          startGeo,
          startPt,
        });
      }
      return;
    }

    // 2) Select-mode click on shape selects (handled by overlay onClick) — empty area deselects
    if (tool === "select") {
      const annotId = target.getAttribute?.("data-annot-id") || target.parentElement?.getAttribute?.("data-annot-id");
      if (!annotId) setSelectedId(null);
      return;
    }

    // 3) Drawing
    e.preventDefault();
    target.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const pt = ptToNorm(e.clientX, e.clientY);
    startPtRef.current = pt;

    if (tool === "pin") {
      void createAnnotation("pin", { x: pt.x, y: pt.y });
      drawingRef.current = false;
      return;
    }
    if (tool === "text") {
      drawingRef.current = false;
      const text = window.prompt("Text label:");
      const trimmed = text?.trim();
      if (trimmed) {
        void createAnnotation("text", { x: pt.x, y: pt.y, text: trimmed.slice(0, 500), fontSize: 16 } as TextGeo);
      }
      return;
    }
    if (tool === "rect") setDraft({ kind: "rect", x: pt.x, y: pt.y, w: 0, h: 0, strokeWidth });
    if (tool === "circle") setDraft({ kind: "circle", cx: pt.x, cy: pt.y, r: 0, strokeWidth });
    if (tool === "arrow") setDraft({ kind: "arrow", x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, strokeWidth });
    if (tool === "line") setDraft({ kind: "line", x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, strokeWidth });
    if (tool === "ruler") setDraft({ kind: "ruler", x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, strokeWidth });
    if (tool === "scale") setDraft({ kind: "scale", x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    if (tool === "freehand") setDraft({ kind: "freehand", points: [pt], strokeWidth });
  };

  const onSurfacePointerMove = (e: React.PointerEvent) => {
    // Drag/resize takes priority
    const dm = dragModeRef.current;
    if (dm) {
      const pt = ptToNorm(e.clientX, e.clientY);
      const dx = pt.x - dm.startPt.x;
      const dy = pt.y - dm.startPt.y;
      const annot = annotations.find((a) => a.id === dm.id);
      if (!annot) return;
      const next = applyDrag(annot.kind, dm, dx, dy, pt);
      if (next) {
        // Local-only update; commit on pointerup
        setAnnotations((arr) => arr.map((a) => (a.id === dm.id ? { ...a, geometry: next } : a)));
      }
      return;
    }

    if (!drawingRef.current || tool === "select" || tool === "pin") return;
    const pt = ptToNorm(e.clientX, e.clientY);
    const start = startPtRef.current;
    if (!start) return;
    const shift = e.shiftKey;
    const alt = e.altKey;
    setDraft((d) => {
      if (!d) return d;
      if (d.kind === "rect") {
        const c = constrainDraft(start, pt, shift, alt);
        return { kind: "rect", x: Math.min(c.x1, c.x2), y: Math.min(c.y1, c.y2), w: Math.abs(c.x2 - c.x1), h: Math.abs(c.y2 - c.y1), strokeWidth };
      }
      if (d.kind === "circle") {
        const dx = pt.x - start.x;
        const dy = pt.y - start.y;
        const r = shift ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.sqrt(dx * dx + dy * dy);
        return { kind: "circle", cx: start.x, cy: start.y, r, strokeWidth };
      }
      if (d.kind === "arrow") {
        const c = constrainDraft(start, pt, shift, alt);
        return { kind: "arrow", x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, strokeWidth };
      }
      if (d.kind === "line") {
        const c = constrainDraft(start, pt, shift, alt);
        return { kind: "line", x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, strokeWidth };
      }
      if (d.kind === "ruler") {
        const c = constrainDraft(start, pt, shift, alt);
        return { kind: "ruler", x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, strokeWidth };
      }
      if (d.kind === "scale") {
        const c = constrainDraft(start, pt, shift, alt);
        return { kind: "scale", x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 };
      }
      if (d.kind === "freehand") return { kind: "freehand", points: [...d.points, pt], strokeWidth };
      return d;
    });
  };

  const onSurfacePointerUp = async () => {
    // Finish drag/resize
    const dm = dragModeRef.current;
    if (dm) {
      setDragMode(null);
      const annot = annotations.find((a) => a.id === dm.id);
      if (annot) {
        const finalGeo = parseGeo<AnyGeo>(annot.geometry);
        // Persist new geometry, with history for undo
        await updateAnnotation(dm.id, { geometry: finalGeo as unknown as Annotation["geometry"] }, { recordHistory: true });
        // Replace inverse to use original startGeo by re-pushing… already handled by updateAnnotation's diff
      }
      return;
    }

    if (!drawingRef.current) return;
    drawingRef.current = false;
    const d = draft;
    setDraft(null);
    if (!d) return;
    if (d.kind === "rect" && (d.w < 0.01 || d.h < 0.01)) return;
    if (d.kind === "circle" && d.r < 0.01) return;
    if (d.kind === "arrow") {
      const dx = d.x2 - d.x1;
      const dy = d.y2 - d.y1;
      if (Math.sqrt(dx * dx + dy * dy) < 0.01) return;
    }
    if (d.kind === "line" || d.kind === "ruler" || d.kind === "scale") {
      const dx = d.x2 - d.x1;
      const dy = d.y2 - d.y1;
      if (Math.sqrt(dx * dx + dy * dy) < 0.01) return;
    }
    if (d.kind === "freehand" && d.points.length < 3) return;
    if (d.kind === "scale") {
      const raw = window.prompt("Real-world distance for this calibration line (e.g. '12 cm', '3 in'):");
      if (!raw) return;
      const m = raw.trim().match(/^([\d.]+)\s*(mm|cm|m|in|ft)?$/i);
      if (!m) { toast.error("Couldn't parse distance. Try '12 cm' or '3 in'."); return; }
      const realWorld = parseFloat(m[1]);
      const unit = (m[2]?.toLowerCase() || "cm") as ScaleGeo["unit"];
      if (!Number.isFinite(realWorld) || realWorld <= 0) return;
      await createAnnotation("scale", { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, realWorld, unit } as ScaleGeo, { title: `Scale: ${realWorld} ${unit}`, isPrivate: true });
      return;
    }
    await createAnnotation(d.kind, d as AnyGeo);
  };

  // ── Undo / redo ─────────────────────────────────────────────
  const onUndo = useCallback(async () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    setHistoryTick((t) => t + 1);
    await entry.undo();
    onChange?.();
  }, [onChange]);

  const onRedo = useCallback(async () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    setHistoryTick((t) => t + 1);
    await entry.redo();
    onChange?.();
  }, [onChange]);

  // ── Keyboard ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return;
      // Ctrl/Cmd combos
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        void onUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y" || (e.shiftKey && (e.key === "z" || e.key === "Z")))) {
        e.preventDefault();
        void onRedo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "Escape":
          if (drawingRef.current || draft) {
            // Cancel in-progress draft
            drawingRef.current = false;
            setDraft(null);
            return;
          }
          if (dragModeRef.current) {
            setDragMode(null);
            reload();
            return;
          }
          if (tool !== "select") { setTool("select"); return; }
          if (selectedId) { setSelectedId(null); return; }
          onClose();
          return;
        case "Delete":
        case "Backspace":
          if (selected) { void handleDelete(selected.id, true); }
          return;
        case "v": case "V": setTool("select"); return;
        case "p": case "P": setTool("pin"); return;
        case "r": case "R": setTool("rect"); return;
        case "o": case "O": case "c": case "C": setTool("circle"); return;
        case "a": case "A": setTool("arrow"); return;
        case "l": case "L": setTool("line"); return;
        case "d": case "D": setTool("freehand"); return;
        case "t": case "T": setTool("text"); return;
        case "m": case "M": setTool("ruler"); return;
        case "k": case "K": setTool("scale"); return;
        case "?": setShowHelp((v) => !v); return;
        case "[":
        case "]": {
          if (annotations.length === 0) return;
          const ordered = [...annotations].sort((x, y) => {
            const sa = x.sortOrder ?? Number.POSITIVE_INFINITY;
            const sb = y.sortOrder ?? Number.POSITIVE_INFINITY;
            return sa !== sb ? sa - sb : x.id.localeCompare(y.id);
          });
          const idx = selectedId ? ordered.findIndex((a) => a.id === selectedId) : -1;
          const dir = e.key === "]" ? 1 : -1;
          const next = ordered[((idx === -1 ? 0 : idx + dir) + ordered.length) % ordered.length];
          setSelectedId(next.id);
          setTool("select");
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selected, selectedId, onClose, handleDelete, onUndo, onRedo, draft, annotations, reload]);

  // ── Build live overlay items (incl. draft) ──────────────────
  const overlayItems: Annotation[] = useMemo(() => {
    const filtered = tagFilter.size > 0
      ? annotations.filter((a) => (a.tags ?? []).some((t) => tagFilter.has(t)))
      : annotations;
    const items = [...filtered];
    if (draft) {
      items.push({
        id: "__draft__",
        kind: draft.kind as AnnotationKind,
        geometry: draft,
        title: null,
        body: null,
        color: drawColor,
        sortOrder: null,
        isPrivate: false,
      });
    }
    return items;
  }, [annotations, draft, drawColor, tagFilter]);

  // ── Tag aggregates ──────────────────────────────────────────
  const allTags = useMemo(() => {
    const set = new Set<string>();
    annotations.forEach((a) => (a.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [annotations]);
  const visibleAnnotations = useMemo(
    () => (tagFilter.size > 0 ? annotations.filter((a) => (a.tags ?? []).some((t) => tagFilter.has(t))) : annotations),
    [annotations, tagFilter]
  );
  const toggleTagFilter = (t: string) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  // ── Render ──────────────────────────────────────────────────
  const cursorClass = tool === "select" ? "cursor-default" : "cursor-crosshair";

  const ToolBtn = ({ value, icon: Icon, label, hotkey }: { value: Tool; icon: React.ComponentType<{ className?: string }>; label: string; hotkey: string }) => (
    <button
      type="button"
      onClick={() => setTool(value)}
      title={`${label} (${hotkey})`}
      className={`p-2 rounded-md transition-colors ${tool === value ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  const inTourSorted = visibleAnnotations.filter((a) => a.sortOrder != null).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const offTour = visibleAnnotations.filter((a) => a.sortOrder == null);
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  void historyTick; // ensure re-render when stacks change

  return (
    <div className="absolute inset-0 z-30 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-background border-b shrink-0">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Annotate photo</h2>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            title="Keyboard shortcuts (?)"
            className={`p-1.5 rounded-md hover:bg-muted text-muted-foreground ${showHelp ? "bg-muted" : ""}`}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {siblingPhotos && siblingPhotos.length > 1 && (
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              title="Compare with another photo"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            >
              <SplitSquareHorizontal className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={exportPng}
            title="Download annotated image (PNG)"
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={togglePublic}
            title={annotationsPublic ? "Annotations are visible publicly" : "Annotations hidden from public"}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
              annotationsPublic ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900" : "bg-muted text-muted-foreground"
            }`}
          >
            {annotationsPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {annotationsPublic ? "Public" : "Private"}
          </button>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 bg-background">
        {/* Toolbar */}
        <div className="w-12 shrink-0 border-r bg-muted/20 flex flex-col items-center gap-1 py-2">
          <ToolBtn value="select" icon={MousePointer2} label="Select" hotkey="V" />
          <ToolBtn value="pin" icon={MapPin} label="Pin" hotkey="P" />
          <ToolBtn value="rect" icon={Square} label="Rectangle" hotkey="R" />
          <ToolBtn value="circle" icon={CircleIcon} label="Circle" hotkey="O" />
          <ToolBtn value="arrow" icon={ArrowUpRight} label="Arrow" hotkey="A" />
          <ToolBtn value="line" icon={Minus} label="Line" hotkey="L" />
          <ToolBtn value="freehand" icon={Pencil} label="Freehand" hotkey="D" />
          <ToolBtn value="text" icon={Type} label="Text" hotkey="T" />
          <ToolBtn value="ruler" icon={Ruler} label="Ruler / Measure" hotkey="M" />
          <ToolBtn value="scale" icon={Ruler} label="Calibrate scale (private)" hotkey="K" />
          <div className="mt-2 grid grid-cols-2 gap-1 px-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDrawColor(c)}
                className={`h-4 w-4 rounded-full border-2 transition-transform ${drawColor === c ? "scale-110 border-foreground" : "border-white/40"}`}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
          {/* Stroke width */}
          <div className="mt-2 flex flex-col items-center gap-1 px-1" title="Stroke width">
            {[1, 2, 4, 8].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setStrokeWidth(w)}
                className={`h-6 w-6 rounded flex items-center justify-center transition ${strokeWidth === w ? "bg-foreground/15 ring-1 ring-foreground" : "hover:bg-foreground/10"}`}
                aria-label={`Stroke ${w}px`}
              >
                <span
                  className="rounded-full bg-foreground"
                  style={{ width: Math.max(2, w + 1), height: Math.max(2, w + 1) }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center bg-black/40 overflow-hidden p-4 relative">
          <div
            ref={surfaceRef}
            className={`relative max-h-full max-w-full ${cursorClass} touch-none select-none`}
            style={{ display: "inline-block" }}
            onPointerDown={onSurfacePointerDown}
            onPointerMove={onSurfacePointerMove}
            onPointerUp={onSurfacePointerUp}
            onPointerCancel={onSurfacePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                setImgSize({ w: el.clientWidth, h: el.clientHeight });
              }}
              style={{ transform: imageRotation ? `rotate(${imageRotation}deg)` : undefined, maxHeight: "calc(100vh - 200px)" }}
              className="block max-w-full max-h-full object-contain pointer-events-none"
            />
            {imgSize.w > 0 && (
              <AnnotationOverlay
                annotations={overlayItems}
                width={imgSize.w}
                height={imgSize.h}
                selectedId={selectedId}
                labelLookup={labelLookup}
                clusterPins={false}
                onSelect={(id) => tool === "select" && setSelectedId(id)}
              />
            )}
            {imgSize.w > 0 && tool === "select" && selected && (
              <SelectionHandles
                annotation={selected}
                width={imgSize.w}
                height={imgSize.h}
              />
            )}
          </div>

          {showHelp && (
            <div className="absolute top-3 right-3 z-40 w-72 rounded-lg border bg-background/95 backdrop-blur shadow-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Shortcuts</h3>
                <button onClick={() => setShowHelp(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
              <ShortcutRow k="V" desc="Select tool" />
              <ShortcutRow k="P" desc="Pin" />
              <ShortcutRow k="R" desc="Rectangle" />
              <ShortcutRow k="O" desc="Circle" />
              <ShortcutRow k="A" desc="Arrow" />
              <ShortcutRow k="D" desc="Freehand draw" />
              <ShortcutRow k="[ / ]" desc="Cycle annotations" />
              <ShortcutRow k="Del" desc="Delete selected" />
              <ShortcutRow k="Esc" desc="Cancel / deselect / close" />
              <ShortcutRow k="Ctrl+Z" desc="Undo" />
              <ShortcutRow k="Ctrl+Y" desc="Redo" />
              <hr className="my-1" />
              <ShortcutRow k="Shift" desc="Constrain (square / circle / 45°)" />
              <ShortcutRow k="Alt" desc="Draw from center" />
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-80 shrink-0 border-l bg-background flex flex-col min-h-0">
          {selected ? (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span className="rounded-full text-white text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center" style={{ background: selected.color }}>
                    {labelLookup.get(selected.id)}
                  </span>
                  {selected.kind} annotation
                </span>
                <button type="button" onClick={() => handleDelete(selected.id)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
              <input
                type="text"
                value={selected.title ?? ""}
                onChange={(e) => scheduleSave(selected.id, { title: e.target.value })}
                placeholder="Title (optional)"
                className="w-full px-2 py-1.5 text-sm rounded-md border bg-background"
                maxLength={200}
              />
              <RichTextEditor
                value={selected.body ?? ""}
                onChange={(html) => scheduleSave(selected.id, { body: html })}
                placeholder="Add notes, troubleshooting steps, links…"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Color</span>
                <div className="flex items-center gap-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateAnnotation(selected.id, { color: c })}
                      className={`h-5 w-5 rounded-full border-2 ${selected.color === c ? "border-foreground scale-110" : "border-white/40"}`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selected.sortOrder != null}
                  onChange={() => toggleInTour(selected)}
                  className="rounded"
                />
                <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
                Include in guided tour
                {selected.sortOrder != null && (
                  <span className="ml-auto rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center">
                    {selected.sortOrder + 1}
                  </span>
                )}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={selected.isPrivate}
                  onChange={(e) => updateAnnotation(selected.id, { isPrivate: e.target.checked })}
                  className="rounded"
                />
                Private (hide on public surfaces)
              </label>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</span>
                <TagInput
                  value={selected.tags ?? []}
                  suggestions={allTags}
                  onChange={(next) => updateAnnotation(selected.id, { tags: next as unknown as Annotation["tags"] })}
                />
              </div>
              <div className="pt-2 border-t">
                <CommentsThread annotationId={selected.id} />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
              <div className="text-xs text-muted-foreground">
                {loading ? "Loading…" : annotations.length === 0
                  ? "Pick a tool from the left and click on the photo to add your first annotation. Hint: press ? for shortcuts."
                  : "Select an annotation to edit, or pick a tool to add a new one."}
              </div>
              {allTags.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Filter by tag</span>
                    {tagFilter.size > 0 && (
                      <button onClick={() => setTagFilter(new Set())} className="text-[10px] text-primary hover:underline">
                        Clear ({tagFilter.size})
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {allTags.map((t) => {
                      const active = tagFilter.has(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTagFilter(t)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                            active ? "ring-2 ring-foreground/40 " : ""
                          }${tagColorFor(t)}`}
                        >
                          #{t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {inTourSorted.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <ListOrdered className="h-3 w-3" /> Tour ({inTourSorted.length})
                    <span className="ml-auto text-[10px] text-muted-foreground/70 font-normal">drag to reorder</span>
                  </div>
                  <ul className="space-y-1">
                    {inTourSorted.map((a) => (
                      <li
                        key={a.id}
                        draggable
                        onDragStart={() => setDragId(a.id)}
                        onDragOver={onDragOverItem}
                        onDrop={() => onDropOnItem(a.id)}
                        onClick={() => setSelectedId(a.id)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md border bg-card hover:bg-muted/50 cursor-grab text-xs"
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                        <span className="rounded-full text-white text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center shrink-0" style={{ background: a.color }}>
                          {labelLookup.get(a.id)}
                        </span>
                        <span className="truncate flex-1">{a.title || `${a.kind}`}</span>
                        {(a.tags ?? []).slice(0, 2).map((t) => (
                          <span key={t} className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${tagColorFor(t)}`}>#{t}</span>
                        ))}
                        <span className="text-[10px] text-muted-foreground">T{(a.sortOrder ?? 0) + 1}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {offTour.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Other ({offTour.length})
                  </div>
                  <ul className="space-y-1">
                    {offTour.map((a) => (
                      <li
                        key={a.id}
                        onClick={() => setSelectedId(a.id)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-xs"
                      >
                        <span className="rounded-full text-white text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center shrink-0" style={{ background: a.color }}>
                          {labelLookup.get(a.id)}
                        </span>
                        <span className="truncate flex-1">{a.title || `${a.kind}`}</span>
                        {(a.tags ?? []).slice(0, 2).map((t) => (
                          <span key={t} className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${tagColorFor(t)}`}>#{t}</span>
                        ))}
                        <span className="text-[10px] text-muted-foreground capitalize">{a.kind}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="border-t px-3 py-2 text-[10px] flex items-center gap-2">
            <SaveStatusPill status={saveStatus} />
            <span className="text-muted-foreground">Auto-saved as you edit</span>
          </div>
        </div>
      </div>
      {compareOpen && siblingPhotos && siblingPhotos.length > 1 && (() => {
        const cur = siblingPhotos.find((p) => p.id === photoId) ?? siblingPhotos[0];
        return (
          <AnnotationCompare
            currentPhoto={cur}
            siblingPhotos={siblingPhotos}
            onClose={() => setCompareOpen(false)}
          />
        );
      })()}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Helpers: drag math + selection-handle overlay                  */
/* ────────────────────────────────────────────────────────────── */

function applyDrag(kind: AnnotationKind, dm: DragMode, dx: number, dy: number, pt: { x: number; y: number }): AnyGeo | null {
  const startGeo = dm.startGeo;
  if (dm.type === "move") {
    if (kind === "pin") {
      const p = startGeo as PinGeo;
      return { x: clamp01(p.x + dx), y: clamp01(p.y + dy) };
    }
    if (kind === "rect") {
      const r = startGeo as RectGeo;
      return { x: clamp01(r.x + dx), y: clamp01(r.y + dy), w: r.w, h: r.h };
    }
    if (kind === "circle") {
      const c = startGeo as CircleGeo;
      return { cx: clamp01(c.cx + dx), cy: clamp01(c.cy + dy), r: c.r };
    }
    if (kind === "arrow") {
      const a = startGeo as ArrowGeo;
      return { x1: clamp01(a.x1 + dx), y1: clamp01(a.y1 + dy), x2: clamp01(a.x2 + dx), y2: clamp01(a.y2 + dy), strokeWidth: a.strokeWidth };
    }
    if (kind === "line" || kind === "ruler" || kind === "scale") {
      const a = startGeo as LineGeo & { realWorld?: number; unit?: string };
      const moved: Record<string, unknown> = { x1: clamp01(a.x1 + dx), y1: clamp01(a.y1 + dy), x2: clamp01(a.x2 + dx), y2: clamp01(a.y2 + dy) };
      if (a.strokeWidth != null) moved.strokeWidth = a.strokeWidth;
      if (kind === "scale") {
        moved.realWorld = a.realWorld;
        moved.unit = a.unit;
      }
      return moved as AnyGeo;
    }
    if (kind === "text") {
      const t = startGeo as TextGeo;
      return { x: clamp01(t.x + dx), y: clamp01(t.y + dy), text: t.text, fontSize: t.fontSize };
    }
    if (kind === "freehand") {
      const f = startGeo as FreehandGeo;
      return { points: f.points.map((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) })), strokeWidth: f.strokeWidth };
    }
    return null;
  }
  // resize
  if (kind === "rect") {
    const r = startGeo as RectGeo;
    let { x, y, w, h } = r;
    const x2 = r.x + r.w;
    const y2 = r.y + r.h;
    const handle = dm.handle;
    if (handle.includes("w")) { x = clamp01(pt.x); w = Math.max(0.005, x2 - x); }
    if (handle.includes("e")) { w = Math.max(0.005, clamp01(pt.x) - r.x); }
    if (handle.includes("n")) { y = clamp01(pt.y); h = Math.max(0.005, y2 - y); }
    if (handle.includes("s")) { h = Math.max(0.005, clamp01(pt.y) - r.y); }
    return { x, y, w, h };
  }
  if (kind === "circle") {
    const c = startGeo as CircleGeo;
    const dx2 = pt.x - c.cx;
    const dy2 = pt.y - c.cy;
    return { cx: c.cx, cy: c.cy, r: Math.max(0.005, Math.sqrt(dx2 * dx2 + dy2 * dy2)) };
  }
  if (kind === "arrow") {
    const a = startGeo as ArrowGeo;
    if (dm.handle === "p1") return { x1: clamp01(pt.x), y1: clamp01(pt.y), x2: a.x2, y2: a.y2, strokeWidth: a.strokeWidth };
    if (dm.handle === "p2") return { x1: a.x1, y1: a.y1, x2: clamp01(pt.x), y2: clamp01(pt.y), strokeWidth: a.strokeWidth };
  }
  if (kind === "line" || kind === "ruler" || kind === "scale") {
    const a = startGeo as LineGeo & { realWorld?: number; unit?: string };
    const base: Record<string, unknown> = {};
    if (a.strokeWidth != null) base.strokeWidth = a.strokeWidth;
    if (kind === "scale") { base.realWorld = a.realWorld; base.unit = a.unit; }
    if (dm.handle === "p1") return { ...base, x1: clamp01(pt.x), y1: clamp01(pt.y), x2: a.x2, y2: a.y2 } as AnyGeo;
    if (dm.handle === "p2") return { ...base, x1: a.x1, y1: a.y1, x2: clamp01(pt.x), y2: clamp01(pt.y) } as AnyGeo;
  }
  if (kind === "pin") {
    return { x: clamp01(pt.x), y: clamp01(pt.y) };
  }
  return null;
}

function ShortcutRow({ k, desc }: { k: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{desc}</span>
      <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">{k}</kbd>
    </div>
  );
}

function SaveStatusPill({ status }: { status: "idle" | "saving" | "saved" | "error" | "conflict" }) {
  if (status === "idle") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
        <Save className="h-3 w-3" /> Idle
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Saved
      </span>
    );
  }
  if (status === "conflict") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertCircle className="h-3 w-3" /> Conflict
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  );
}

function SelectionHandles({ annotation, width, height }: { annotation: Annotation; width: number; height: number }) {
  const g = (() => { try { return parseGeo<AnyGeo>(annotation.geometry); } catch { return null; } })();
  if (!g) return null;
  const handleSize = 10;
  const handle = (cx: number, cy: number, name: string, cursor: string) => (
    <div
      key={name}
      data-handle={name}
      className="absolute bg-white border-2 border-blue-500 rounded-sm shadow"
      style={{
        left: cx - handleSize / 2,
        top: cy - handleSize / 2,
        width: handleSize,
        height: handleSize,
        cursor,
        pointerEvents: "auto",
      }}
    />
  );

  switch (annotation.kind) {
    case "pin": {
      const p = g as PinGeo;
      return (
        <div className="absolute inset-0 pointer-events-none">
          {handle(p.x * width, p.y * height, "body", "move")}
        </div>
      );
    }
    case "rect": {
      const r = g as RectGeo;
      const x = r.x * width, y = r.y * height, w = r.w * width, h = r.h * height;
      return (
        <div className="absolute inset-0 pointer-events-none">
          {/* Body for move */}
          <div data-handle="body" className="absolute" style={{ left: x, top: y, width: w, height: h, cursor: "move", pointerEvents: "auto" }} />
          {handle(x, y, "nw", "nwse-resize")}
          {handle(x + w / 2, y, "n", "ns-resize")}
          {handle(x + w, y, "ne", "nesw-resize")}
          {handle(x + w, y + h / 2, "e", "ew-resize")}
          {handle(x + w, y + h, "se", "nwse-resize")}
          {handle(x + w / 2, y + h, "s", "ns-resize")}
          {handle(x, y + h, "sw", "nesw-resize")}
          {handle(x, y + h / 2, "w", "ew-resize")}
        </div>
      );
    }
    case "circle": {
      const c = g as CircleGeo;
      const cx = c.cx * width, cy = c.cy * height;
      const rad = c.r * Math.min(width, height);
      return (
        <div className="absolute inset-0 pointer-events-none">
          <div data-handle="body" className="absolute rounded-full" style={{ left: cx - rad, top: cy - rad, width: rad * 2, height: rad * 2, cursor: "move", pointerEvents: "auto" }} />
          {handle(cx + rad, cy, "e", "ew-resize")}
          {handle(cx - rad, cy, "w", "ew-resize")}
          {handle(cx, cy - rad, "n", "ns-resize")}
          {handle(cx, cy + rad, "s", "ns-resize")}
        </div>
      );
    }
    case "arrow": {
      const a = g as ArrowGeo;
      return (
        <div className="absolute inset-0 pointer-events-none">
          {handle(a.x1 * width, a.y1 * height, "p1", "move")}
          {handle(a.x2 * width, a.y2 * height, "p2", "move")}
        </div>
      );
    }
    case "line":
    case "ruler":
    case "scale": {
      const a = g as LineGeo;
      return (
        <div className="absolute inset-0 pointer-events-none">
          {handle(a.x1 * width, a.y1 * height, "p1", "move")}
          {handle(a.x2 * width, a.y2 * height, "p2", "move")}
        </div>
      );
    }
    case "text": {
      const t = g as TextGeo;
      const fs = t.fontSize ?? 16;
      const w = Math.max(20, t.text.length * fs * 0.6);
      return (
        <div className="absolute inset-0 pointer-events-none">
          <div data-handle="body" className="absolute" style={{ left: t.x * width - w / 2, top: t.y * height - fs / 2, width: w, height: fs + 4, cursor: "move", pointerEvents: "auto" }} />
        </div>
      );
    }
    case "freehand": {
      const f = g as FreehandGeo;
      if (f.points.length === 0) return null;
      const xs = f.points.map((p) => p.x);
      const ys = f.points.map((p) => p.y);
      const minX = Math.min(...xs) * width;
      const maxX = Math.max(...xs) * width;
      const minY = Math.min(...ys) * height;
      const maxY = Math.max(...ys) * height;
      return (
        <div className="absolute inset-0 pointer-events-none">
          <div data-handle="body" className="absolute" style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY, cursor: "move", pointerEvents: "auto" }} />
        </div>
      );
    }
    default:
      return null;
  }
}

function TagInput({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraftLocal] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 24);
    if (!t) return;
    if (value.includes(t)) { setDraftLocal(""); return; }
    if (value.length >= 16) return;
    onChange([...value, t]);
    setDraftLocal("");
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const filteredSuggestions = suggestions
    .filter((s) => !value.includes(s) && (!draft || s.toLowerCase().includes(draft.toLowerCase())))
    .slice(0, 6);

  return (
    <div>
      <div className="flex flex-wrap gap-1 px-2 py-1.5 rounded-md border bg-background min-h-[34px]">
        {value.map((t) => (
          <span key={t} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${tagColorFor(t)}`}>
            #{t}
            <button onClick={() => remove(t)} className="opacity-60 hover:opacity-100" title="Remove tag">×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onChange={(e) => setDraftLocal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
            else if (e.key === "Backspace" && !draft && value.length > 0) { remove(value[value.length - 1]); }
          }}
          placeholder={value.length === 0 ? "add tag…" : ""}
          className="flex-1 min-w-[80px] text-xs bg-transparent outline-none"
          maxLength={24}
        />
      </div>
      {focused && filteredSuggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(s); }}
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium opacity-80 hover:opacity-100 ${tagColorFor(s)}`}
            >
              + #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
