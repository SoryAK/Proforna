"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X, ChevronLeft, ChevronRight, Star, Pencil, Trash2, Plus, Tag,
  MapPin, ZoomIn, ZoomOut, Search, Images, Download, Archive,
  Maximize2, Minimize2, Play, Pause, Columns2, CheckSquare, Square,
  RotateCw, Eye, EyeOff, Heart, Calendar, Settings2,
  SortAsc, SortDesc, Check, CheckCheck, XCircle, LayoutGrid, FolderOpen,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface GalleryPhoto {
  id: string;
  filePath: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  caption?: string | null;
  isCover: boolean;
  isFavorite?: boolean;
  isPrivate?: boolean;
  tags?: string | null;
  markers?: string | null;
  dateTaken?: string | null;
  rotation?: number;
  sortOrder?: number | null;
  albumId?: string | null;
  album?: { id: string; name: string } | null;
  createdAt: string;
}

export interface GalleryAlbum {
  id: string;
  name: string;
  sortOrder?: number | null;
  createdAt: string;
}

interface ImageMarker {
  id: string;
  x: number;
  y: number;
  label: string;
  description?: string;
}

interface GalleryModalProps {
  photos: GalleryPhoto[];
  albums?: GalleryAlbum[];
  initialIndex: number;
  positionId: string;
  container: HTMLElement | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

type SortBy = "date" | "name" | "size" | "favorite";
type ThumbSize = "sm" | "md" | "lg";
type ViewMode = "viewer" | "photos" | "albums";

interface GallerySettings {
  sortBy: SortBy;
  sortAsc: boolean;
  thumbnailSize: ThumbSize;
  defaultViewMode: ViewMode;
  confirmDelete: boolean;
  slideshowInterval: number;
  showPrivate: boolean;
}

const DEFAULT_SETTINGS: GallerySettings = {
  sortBy: "date",
  sortAsc: true,
  thumbnailSize: "md",
  defaultViewMode: "viewer",
  confirmDelete: true,
  slideshowInterval: 3,
  showPrivate: true,
};

const SETTINGS_KEY = "gallery-modal-settings";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function parseTags(raw?: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function parseMarkers(raw?: string | null): ImageMarker[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function fmtSize(b: number) {
  return b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function loadSettings(): GallerySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: GallerySettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function GalleryModal({ photos, albums = [], initialIndex, positionId, container, onClose, onRefresh }: GalleryModalProps) {
  /* ── Core state ── */
  const [idx, setIdx] = useState(initialIndex);
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadSettings().defaultViewMode ?? "viewer");
  const [addingMarker, setAddingMarker] = useState(false);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [zoom, setZoom] = useState(1);
  const [zoomFit, setZoomFit] = useState<"contain" | "cover">("contain");
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingPhotoId, setRenamingPhotoId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameToast, setRenameToast] = useState<string | null>(null);
  const renameToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Settings ── */
  const [settings, setSettings] = useState<GallerySettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  /* ── Bulk selection ── */
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkTagInput, setShowBulkTagInput] = useState(false);
  const [bulkMoveAlbumId, setBulkMoveAlbumId] = useState<string>("__unassigned");

  /* ── Albums ── */
  const [activeAlbumId, setActiveAlbumId] = useState<string>("__all");

  /* ── Slideshow ── */
  const [slideshowActive, setSlideshowActive] = useState(false);
  const slideshowRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Compare ── */
  const [compareMode, setCompareMode] = useState(false);
  const [compareIdx, setCompareIdx] = useState<number>(0);

  /* ── Fullscreen ── */
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* ── Drag ── */
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const imgRef = useRef<HTMLDivElement>(null);

  /* ── Resize ── */
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const isResizing = useRef(false);
  const MIN_W = 480, MIN_H = 300;

  /* ── Persist settings ── */
  useEffect(() => { saveSettings(settings); }, [settings]);
  const updateSettings = (patch: Partial<GallerySettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  /* ── Slideshow timer ── */
  useEffect(() => {
    if (!slideshowActive) {
      if (slideshowRef.current) clearInterval(slideshowRef.current);
      return;
    }
    slideshowRef.current = setInterval(() => {
      setIdx((i) => {
        // need filteredPhotos.length but can't capture it in ref directly; use functional update
        return i + 1; // will clamp below via useEffect
      });
      setZoom(1);
    }, settings.slideshowInterval * 1000);
    return () => { if (slideshowRef.current) clearInterval(slideshowRef.current); };
  }, [slideshowActive, settings.slideshowInterval]);

  /* ── Fullscreen listener ── */
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /* ── Resize callbacks ── */
  const onResizeStart = useCallback((e: React.MouseEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const startW = rect.width, startH = rect.height;
    const cR = container?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const startLeft = rect.left - cR.left;
    const startTop = rect.top - cR.top;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const cRect = container?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      let newW = startW, newH = startH, newX = startLeft, newY = startTop;
      if (edge.includes("r")) newW = Math.max(MIN_W, Math.min(startW + dx, cRect.width - startLeft - 4));
      if (edge.includes("l")) { newW = Math.max(MIN_W, startW - dx); newX = startLeft + startW - newW; }
      if (edge.includes("b")) newH = Math.max(MIN_H, Math.min(startH + dy, cRect.height - startTop - 4));
      if (edge.includes("t")) { newH = Math.max(MIN_H, startH - dy); newY = startTop + startH - newH; }
      setSize({ w: newW, h: newH });
      if (edge.includes("l") || edge.includes("t")) setDragPos({ x: Math.max(0, newX), y: Math.max(0, newY) });
    };
    const onUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [container]);

  /* ── Drag callbacks ── */
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, select")) return;
    e.preventDefault();
    isDragging.current = true;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const cR = container?.getBoundingClientRect() ?? { left: 0, top: 0 };
    dragOffset.current = { x: e.clientX - rect.left + cR.left, y: e.clientY - rect.top + cR.top };
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const cRect = container?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const x = Math.max(0, Math.min(ev.clientX - dragOffset.current.x, cRect.width - 200));
      const y = Math.max(0, Math.min(ev.clientY - dragOffset.current.y, cRect.height - 100));
      dragPosRef.current = { x, y };
      if (panelRef.current) {
        panelRef.current.style.left = `${x}px`;
        panelRef.current.style.top = `${y}px`;
        panelRef.current.style.transform = "none";
      }
    };
    const onUp = () => {
      isDragging.current = false;
      if (dragPosRef.current) setDragPos(dragPosRef.current);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [container]);

  /* ── Sort & filter ── */
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of photos) for (const t of parseTags(p.tags)) s.add(t);
    return Array.from(s).sort();
  }, [photos]);

  const sortedAlbums = useMemo(() => {
    return [...albums].sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [albums]);

  const albumCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of photos) {
      const key = p.albumId ?? "__unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [photos]);

  const sortedPhotos = useMemo(() => {
    let list = [...photos];
    if (!settings.showPrivate) list = list.filter((p) => !p.isPrivate);
    // Manual sortOrder takes precedence when set on all photos
    const allHaveOrder = list.every((p) => p.sortOrder != null);
    if (allHaveOrder) {
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    } else {
      list.sort((a, b) => {
        let cmp = 0;
        if (settings.sortBy === "date") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        else if (settings.sortBy === "name") cmp = a.fileName.localeCompare(b.fileName);
        else if (settings.sortBy === "size") cmp = a.fileSize - b.fileSize;
        else if (settings.sortBy === "favorite") cmp = (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
        return settings.sortAsc ? cmp : -cmp;
      });
    }
    return list;
  }, [photos, settings.sortBy, settings.sortAsc, settings.showPrivate]);

  const albumCoverById = useMemo(() => {
    const covers = new Map<string, GalleryPhoto>();
    for (const p of sortedPhotos) {
      const key = p.albumId ?? "__unassigned";
      if (!covers.has(key)) covers.set(key, p);
    }
    return covers;
  }, [sortedPhotos]);

  const filteredPhotos = useMemo(() => {
    const albumScoped = sortedPhotos.filter((p) => {
      if (activeAlbumId === "__all") return true;
      if (activeAlbumId === "__unassigned") return !p.albumId;
      return p.albumId === activeAlbumId;
    });

    if (!searchQuery.trim()) return albumScoped;
    const q = searchQuery.toLowerCase();
    return albumScoped.filter((p) => {
      const tags = parseTags(p.tags);
      const markers = parseMarkers(p.markers);
      return (
        tags.some((t) => t.toLowerCase().includes(q)) ||
        markers.some((m) => m.label.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)) ||
        (p.caption?.toLowerCase().includes(q)) ||
        p.fileName.toLowerCase().includes(q)
      );
    });
  }, [sortedPhotos, searchQuery, activeAlbumId]);

  /* Clamp idx when list changes */
  useEffect(() => {
    if (idx >= filteredPhotos.length) setIdx(Math.max(0, filteredPhotos.length - 1));
  }, [filteredPhotos.length, idx]);

  /* Clamp slideshow idx to list length */
  useEffect(() => {
    if (idx >= filteredPhotos.length && filteredPhotos.length > 0) {
      setIdx(0);
    }
  }, [idx, filteredPhotos.length]);

  const currentPhoto = filteredPhotos[idx] ?? null;
  const tags = currentPhoto ? parseTags(currentPhoto.tags) : [];
  const markers = currentPhoto ? parseMarkers(currentPhoto.markers) : [];

  /* ── Navigation ── */
  const prev = useCallback(() => {
    setIdx((i) => (i > 0 ? i - 1 : filteredPhotos.length - 1));
    setZoom(1);
  }, [filteredPhotos.length]);
  const next = useCallback(() => {
    setIdx((i) => (i < filteredPhotos.length - 1 ? i + 1 : 0));
    setZoom(1);
  }, [filteredPhotos.length]);

  /* ── API helpers ── */
  const patch = useCallback(async (data: Record<string, unknown>) => {
    if (!currentPhoto) return;
    setBusy(true);
    try {
      await fetch("/api/gallery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentPhoto.id, ...data }),
      });
      await onRefresh();
    } finally { setBusy(false); }
  }, [currentPhoto, onRefresh]);

  const startInlineRename = (photo: GalleryPhoto) => {
    setRenamingPhotoId(photo.id);
    setRenameDraft(photo.fileName);
  };

  const cancelInlineRename = () => {
    setRenamingPhotoId(null);
    setRenameDraft("");
  };

  const showRenameToast = (message: string) => {
    setRenameToast(message);
    if (renameToastTimer.current) clearTimeout(renameToastTimer.current);
    renameToastTimer.current = setTimeout(() => setRenameToast(null), 1400);
  };

  const commitInlineRename = async (photo: GalleryPhoto) => {
    const next = renameDraft.trim();
    if (!next || next === photo.fileName) {
      cancelInlineRename();
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/gallery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photo.id, fileName: next }),
      });
      await onRefresh();
      showRenameToast("Photo name saved");
      cancelInlineRename();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (renameToastTimer.current) clearTimeout(renameToastTimer.current);
    };
  }, []);

  /* ── Tag actions ── */
  const addTag = async () => {
    const t = tagInput.trim();
    if (!t) return;
    const updated = [...new Set([...tags, t])];
    setTagInput("");
    await patch({ tags: updated });
  };
  const removeTag = async (tag: string) => await patch({ tags: tags.filter((t) => t !== tag) });

  /* ── Bulk actions ── */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(filteredPhotos.map((p) => p.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (settings.confirmDelete && !confirm(`Delete ${selectedIds.size} photo(s) permanently?`)) return;
    setBusy(true);
    try {
      await fetch("/api/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      await onRefresh();
      setSelectedIds(new Set());
      if (filteredPhotos.length <= selectedIds.size) { onClose(); return; }
      setIdx(0);
    } finally { setBusy(false); }
  };

  const bulkTag = async () => {
    const t = bulkTagInput.trim();
    if (!t || selectedIds.size === 0) return;
    setBusy(true);
    try {
      await fetch("/api/gallery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "tag", tag: t }),
      });
      await onRefresh();
      setBulkTagInput("");
      setShowBulkTagInput(false);
    } finally { setBusy(false); }
  };

  const createAlbum = async () => {
    const name = prompt("Album name:");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gallery/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId, name: name.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Failed to create album");
        return;
      }
      await onRefresh();
    } finally { setBusy(false); }
  };

  const renameActiveAlbum = async () => {
    if (activeAlbumId === "__all" || activeAlbumId === "__unassigned") return;
    const current = sortedAlbums.find((a) => a.id === activeAlbumId);
    if (!current) return;
    const name = prompt("Rename album:", current.name);
    if (name === null) return;
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gallery/albums", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, name: name.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Failed to rename album");
        return;
      }
      await onRefresh();
    } finally { setBusy(false); }
  };

  const deleteActiveAlbum = async () => {
    if (activeAlbumId === "__all" || activeAlbumId === "__unassigned") return;
    if (!confirm("Delete this album? Photos will be moved to unassigned.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gallery/albums", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeAlbumId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Failed to delete album");
        return;
      }
      setActiveAlbumId("__all");
      await onRefresh();
    } finally { setBusy(false); }
  };

  const bulkMoveAlbum = async () => {
    if (selectedIds.size === 0) return;
    const albumId = bulkMoveAlbumId === "__unassigned" ? null : bulkMoveAlbumId;
    setBusy(true);
    try {
      await fetch("/api/gallery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "move", albumId }),
      });
      await onRefresh();
      setSelectedIds(new Set());
    } finally { setBusy(false); }
  };

  /* ── Marker actions ── */
  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!addingMarker) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const label = prompt("Marker label:");
    if (!label?.trim()) return;
    const description = prompt("Description (optional):") || undefined;
    const newMarker: ImageMarker = {
      id: crypto.randomUUID(),
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      label: label.trim(),
      description: description?.trim(),
    };
    await patch({ markers: [...markers, newMarker] });
    setAddingMarker(false);
  };

  const editMarker = async (marker: ImageMarker) => {
    const label = prompt("Label:", marker.label);
    if (label === null) return;
    const description = prompt("Description:", marker.description ?? "") ?? undefined;
    const updated = markers.map((m) =>
      m.id === marker.id ? { ...m, label: label.trim() || m.label, description: description?.trim() } : m
    );
    await patch({ markers: updated });
  };

  const removeMarker = async (markerId: string) => {
    if (!confirm("Remove this marker?")) return;
    await patch({ markers: markers.filter((m) => m.id !== markerId) });
  };

  /* ── Photo actions ── */
  const setCover = () => patch({ isCover: true });
  const toggleFavorite = () => patch({ isFavorite: !currentPhoto?.isFavorite });
  const togglePrivate = () => patch({ isPrivate: !currentPhoto?.isPrivate });
  const rotatePhoto = () => patch({ rotation: ((currentPhoto?.rotation ?? 0) + 90) % 360 });
  const moveCurrentPhoto = async () => {
    if (!currentPhoto) return;
    const choices = ["0) Unassigned", ...sortedAlbums.map((a, i) => `${i + 1}) ${a.name}`)].join("\n");
    const raw = prompt(`Move to album:\n${choices}`);
    if (raw === null) return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > sortedAlbums.length) return;
    const albumId = n === 0 ? null : sortedAlbums[n - 1]?.id ?? null;
    await patch({ albumId });
  };

  const editCaption = async () => {
    if (!currentPhoto) return;
    const c = prompt("Caption:", currentPhoto.caption ?? "");
    if (c === null) return;
    await patch({ caption: c.trim() || null });
  };

  const editFileName = async () => {
    if (!currentPhoto) return;
    const name = prompt("Photo name:", currentPhoto.fileName);
    if (name === null) return;
    const next = name.trim();
    if (!next) return;
    await patch({ fileName: next });
    showRenameToast("Photo name saved");
  };

  const editDateTaken = async () => {
    if (!currentPhoto) return;
    const existing = currentPhoto.dateTaken
      ? new Date(currentPhoto.dateTaken).toISOString().slice(0, 10)
      : "";
    const d = prompt("Date taken (YYYY-MM-DD):", existing);
    if (d === null) return;
    await patch({ dateTaken: d.trim() || null });
  };

  const deletePhoto = async () => {
    if (!currentPhoto) return;
    if (settings.confirmDelete && !confirm("Delete this photo permanently?")) return;
    setBusy(true);
    try {
      await fetch(`/api/gallery?id=${currentPhoto.id}`, { method: "DELETE" });
      await onRefresh();
      if (filteredPhotos.length <= 1) { onClose(); return; }
      setIdx((i) => Math.min(i, filteredPhotos.length - 2));
    } finally { setBusy(false); }
  };

  /* ── Download / Export ── */
  const downloadPhoto = (photo: GalleryPhoto) => {
    const a = document.createElement("a");
    a.href = photo.filePath;
    a.download = photo.fileName;
    a.click();
  };

  const exportZip = () => {
    window.location.href = `/api/gallery/export?positionId=${positionId}`;
  };

  /* ── Fullscreen ── */
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement && panelRef.current) {
      await panelRef.current.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  };

  /* ── Panel style ── */
  const target = container || (typeof document !== "undefined" ? document.body : null);
  if (!target) return null;

  const panelStyle: React.CSSProperties = dragPos
    ? { left: dragPos.x, top: dragPos.y, width: size ? size.w : "min(900px, 78%)", height: size ? size.h : "min(520px, 72%)" }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: size ? size.w : "min(900px, 78%)", height: size ? size.h : "min(520px, 72%)" };

  const thumbArea = settings.thumbnailSize === "sm" ? "w-14 shrink-0" : settings.thumbnailSize === "lg" ? "w-28 shrink-0" : "w-20 shrink-0";

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  const panel = (
    <div
      ref={panelRef}
      className="absolute z-[1200] flex flex-col rounded-xl bg-background/95 backdrop-blur-md border shadow-2xl pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-200 overflow-hidden"
      style={panelStyle}
      onClick={(e) => e.stopPropagation()}
    >
      {renameToast && (
        <div className="absolute top-10 right-3 z-[1300] pointer-events-none">
          <div className="inline-flex items-center gap-1 rounded-full bg-emerald-600/95 text-white px-2 py-1 text-[10px] shadow-lg animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <Check className="h-3 w-3" />
            <span>{renameToast}</span>
          </div>
        </div>
      )}

      {/* Resize handles */}
      <div className="absolute top-0 left-0 right-0 h-1.5 cursor-n-resize z-50" onMouseDown={(e) => onResizeStart(e, "t")} />
      <div className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize z-50" onMouseDown={(e) => onResizeStart(e, "b")} />
      <div className="absolute top-0 left-0 bottom-0 w-1.5 cursor-w-resize z-50" onMouseDown={(e) => onResizeStart(e, "l")} />
      <div className="absolute top-0 right-0 bottom-0 w-1.5 cursor-e-resize z-50" onMouseDown={(e) => onResizeStart(e, "r")} />
      <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-50" onMouseDown={(e) => onResizeStart(e, "tl")} />
      <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-50" onMouseDown={(e) => onResizeStart(e, "tr")} />
      <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-50" onMouseDown={(e) => onResizeStart(e, "bl")} />
      <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-50" onMouseDown={(e) => onResizeStart(e, "br")} />

      {/* ── Top bar (drag handle) ── */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/30 shrink-0 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
      >
        <Images className="h-4 w-4 text-pink-500 shrink-0" />
        <span className="text-sm font-semibold shrink-0">Gallery</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {filteredPhotos.length}/{photos.length} photo{photos.length !== 1 ? "s" : ""}
        </span>

        <div className="flex items-center rounded-md bg-muted/60 p-0.5 shrink-0">
          <button
            onClick={() => setViewMode("viewer")}
            className={`p-1 rounded ${viewMode === "viewer" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Viewer mode"
          >
            <Images className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("photos")}
            className={`p-1 rounded ${viewMode === "photos" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Photos mode"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("albums")}
            className={`p-1 rounded ${viewMode === "albums" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Albums mode"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <select
            value={activeAlbumId}
            onChange={(e) => { setActiveAlbumId(e.target.value); setIdx(0); }}
            className="h-6 rounded bg-muted text-[10px] px-1 outline-none border-0 cursor-pointer max-w-[170px]"
            title="Filter by album"
          >
            <option value="__all">All albums ({photos.length})</option>
            <option value="__unassigned">Unassigned ({albumCounts.get("__unassigned") ?? 0})</option>
            {sortedAlbums.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({albumCounts.get(a.id) ?? 0})</option>
            ))}
          </select>
          <button onClick={createAlbum} className="p-1 rounded hover:bg-muted text-muted-foreground" title="New album">
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={renameActiveAlbum}
            disabled={activeAlbumId === "__all" || activeAlbumId === "__unassigned"}
            className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Rename selected album"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={deleteActiveAlbum}
            disabled={activeAlbumId === "__all" || activeAlbumId === "__unassigned"}
            className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Delete selected album"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-0 max-w-[220px]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setIdx(0); }}
              placeholder="Search tags, captions..."
              className="w-full pl-7 pr-2 py-1 rounded-md bg-muted text-xs outline-none focus:ring-1 focus:ring-pink-500/50 placeholder:text-muted-foreground/60"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setIdx(0); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted-foreground/10">
                <X className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Quick tag pills */}
        {allTags.length > 0 && (
          <div className="hidden xl:flex items-center gap-1">
            {allTags.slice(0, 3).map((t) => (
              <button key={t} onClick={() => { setSearchQuery(searchQuery === t ? "" : t); setIdx(0); }}
                className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors ${searchQuery === t ? "bg-pink-500 text-white" : "bg-pink-500/10 text-pink-500 hover:bg-pink-500/20"}`}>
                {t}
              </button>
            ))}
            {allTags.length > 3 && <span className="text-[10px] text-muted-foreground">+{allTags.length - 3}</span>}
          </div>
        )}

        {/* Sort */}
        <div className="flex items-center gap-0.5 shrink-0">
          <select value={settings.sortBy} onChange={(e) => updateSettings({ sortBy: e.target.value as SortBy })}
            className="h-6 rounded bg-muted text-[10px] px-1 outline-none border-0 cursor-pointer">
            <option value="date">Date</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="favorite">Fav</option>
          </select>
          <button onClick={() => updateSettings({ sortAsc: !settings.sortAsc })}
            className="p-1 rounded hover:bg-muted text-muted-foreground" title={settings.sortAsc ? "Asc" : "Desc"}>
            {settings.sortAsc ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />}
          </button>
        </div>

        {/* Mode buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => { setBulkMode((b) => !b); setSelectedIds(new Set()); }}
            className={`p-1 rounded transition-colors ${bulkMode ? "bg-pink-500/20 text-pink-500" : "hover:bg-muted text-muted-foreground"}`} title="Bulk select">
            <CheckSquare className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setViewMode("viewer"); setCompareMode((c) => !c); setSlideshowActive(false); }}
            className={`p-1 rounded transition-colors ${compareMode ? "bg-blue-500/20 text-blue-500" : "hover:bg-muted text-muted-foreground"}`} title="Compare two photos">
            <Columns2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setViewMode("viewer"); setSlideshowActive((s) => !s); setCompareMode(false); }}
            className={`p-1 rounded transition-colors ${slideshowActive ? "bg-green-500/20 text-green-500" : "hover:bg-muted text-muted-foreground"}`} title="Slideshow">
            {slideshowActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button onClick={toggleFullscreen} className="p-1 rounded hover:bg-muted text-muted-foreground" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={exportZip} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Export all as ZIP">
            <Archive className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setShowSettings((s) => !s)}
            className={`p-1 rounded transition-colors ${showSettings ? "bg-muted text-foreground" : "hover:bg-muted text-muted-foreground"}`} title="Settings">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Bulk action bar ── */}
      {bulkMode && (
        <div className="flex items-center gap-2 px-3 py-1 bg-pink-500/5 border-b shrink-0 text-xs">
          <span className="text-muted-foreground font-medium">{selectedIds.size} selected</span>
          <button onClick={selectAll} className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground">
            <CheckCheck className="h-3 w-3" /> All
          </button>
          <button onClick={deselectAll} className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground">
            <XCircle className="h-3 w-3" /> None
          </button>
          {selectedIds.size > 0 && (
            <>
              <button onClick={() => setShowBulkTagInput((s) => !s)} className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted text-pink-500">
                <Tag className="h-3 w-3" /> Tag
              </button>
              <select
                value={bulkMoveAlbumId}
                onChange={(e) => setBulkMoveAlbumId(e.target.value)}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] outline-none"
                title="Select album to move selected photos"
              >
                <option value="__unassigned">Move to Unassigned</option>
                {sortedAlbums.map((a) => (
                  <option key={a.id} value={a.id}>Move to {a.name}</option>
                ))}
              </select>
              <button onClick={bulkMoveAlbum} className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-blue-500/10 text-blue-500">
                <Images className="h-3 w-3" /> Move
              </button>
              <button onClick={bulkDelete} className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-500/10 text-red-500">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </>
          )}
          {showBulkTagInput && (
            <div className="flex items-center gap-1">
              <input type="text" value={bulkTagInput} onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); bulkTag(); } }}
                placeholder="Tag name..." autoFocus
                className="px-1.5 py-0.5 rounded bg-muted text-[10px] outline-none focus:ring-1 focus:ring-pink-500/50 w-24" />
              <button onClick={bulkTag} className="px-1.5 py-0.5 rounded bg-pink-500/10 hover:bg-pink-500/20 text-pink-500">Apply</button>
            </div>
          )}
        </div>
      )}

      {/* ── Settings panel ── */}
      {showSettings && (
        <div className="border-b bg-muted/20 px-4 py-2.5 shrink-0 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Thumbnail size</span>
            <select value={settings.thumbnailSize} onChange={(e) => updateSettings({ thumbnailSize: e.target.value as ThumbSize })}
              className="rounded bg-muted px-1.5 py-1 text-xs outline-none">
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Slideshow interval</span>
            <select value={settings.slideshowInterval} onChange={(e) => updateSettings({ slideshowInterval: Number(e.target.value) })}
              className="rounded bg-muted px-1.5 py-1 text-xs outline-none">
              {[1, 2, 3, 5, 8, 10].map((s) => <option key={s} value={s}>{s}s</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Default view</span>
            <select
              value={settings.defaultViewMode}
              onChange={(e) => {
                const next = e.target.value as ViewMode;
                updateSettings({ defaultViewMode: next });
                setViewMode(next);
              }}
              className="rounded bg-muted px-1.5 py-1 text-xs outline-none"
            >
              <option value="viewer">Viewer</option>
              <option value="photos">Photos</option>
              <option value="albums">Albums</option>
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.confirmDelete} onChange={(e) => updateSettings({ confirmDelete: e.target.checked })} className="accent-pink-500" />
            <span>Confirm before delete</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.showPrivate} onChange={(e) => updateSettings({ showPrivate: e.target.checked })} className="accent-pink-500" />
            <span>Show private photos</span>
          </label>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: thumbnail strip */}
        {viewMode === "viewer" && <div className={`${thumbArea} border-r bg-muted/20 overflow-y-auto scrollbar-thin p-1.5 space-y-1.5`}>
          {filteredPhotos.map((p, i) => {
            const pTags = parseTags(p.tags);
            const pMarkers = parseMarkers(p.markers);
            const isSelected = selectedIds.has(p.id);
            const isActive = !compareMode && i === idx;
            const isCompare = compareMode && i === compareIdx;
            return (
              <button key={p.id} type="button"
                onClick={() => {
                  if (bulkMode) toggleSelect(p.id);
                  else if (compareMode) setCompareIdx(i);
                  else { setIdx(i); setZoom(1); }
                }}
                className={`relative w-full aspect-square rounded-md overflow-hidden border-2 transition-colors
                  ${isCompare ? "border-blue-500" : ""}
                  ${isActive && !isCompare ? "border-pink-500" : ""}
                  ${isSelected ? "border-pink-500 ring-2 ring-pink-500/30" : ""}
                  ${!isSelected && !isActive && !isCompare ? "border-transparent hover:border-muted-foreground/30" : ""}
                `}
              >
                <img src={p.filePath} alt={p.caption || p.fileName} className="w-full h-full object-cover"
                  style={{ transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined }} />
                {bulkMode && (
                  <div className="absolute top-0.5 left-0.5">
                    {isSelected ? <CheckSquare className="h-3 w-3 text-pink-500 drop-shadow" /> : <Square className="h-3 w-3 text-white/70 drop-shadow" />}
                  </div>
                )}
                {!bulkMode && p.isCover && <Star className="absolute top-0.5 left-0.5 h-2.5 w-2.5 text-yellow-400 fill-yellow-400 drop-shadow" />}
                {!bulkMode && p.isFavorite && <Heart className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-red-400 fill-red-400 drop-shadow" />}
                {!bulkMode && p.isPrivate && <EyeOff className="absolute bottom-0.5 left-0.5 h-2.5 w-2.5 text-gray-300 drop-shadow" />}
                {!bulkMode && (pTags.length > 0 || pMarkers.length > 0) && (
                  <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
                    {pTags.length > 0 && <span className="px-0.5 rounded-full bg-pink-500/80 text-white text-[7px] font-bold leading-tight">{pTags.length}</span>}
                    {pMarkers.length > 0 && <span className="px-0.5 rounded-full bg-blue-500/80 text-white text-[7px] font-bold leading-tight">{pMarkers.length}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>}

        {/* Center: content area */}
        <div className={`flex-1 min-w-0 relative ${viewMode === "viewer" ? "flex items-center justify-center bg-black/40" : "bg-muted/10"} overflow-hidden`}>
          {busy && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}

          {viewMode === "photos" ? (
            <div className="h-full overflow-auto p-3">
              {filteredPhotos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <LayoutGrid className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No photos match current filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {filteredPhotos.map((p, i) => {
                    const selected = selectedIds.has(p.id);
                    const isRenaming = renamingPhotoId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (isRenaming) return;
                          if (bulkMode) {
                            toggleSelect(p.id);
                            return;
                          }
                          setIdx(i);
                          setViewMode("viewer");
                        }}
                        className={`group relative rounded-md overflow-hidden border ${selected ? "border-pink-500 ring-2 ring-pink-500/30" : "border-border/50 hover:border-muted-foreground/40"}`}
                      >
                        <img src={p.filePath} alt={p.caption || p.fileName} className="w-full h-32 object-cover" />
                        <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-black/60 text-white text-[10px]">
                          {isRenaming ? (
                            <input
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => commitInlineRename(p)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void commitInlineRename(p);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelInlineRename();
                                }
                              }}
                              autoFocus
                              className="w-full bg-black/40 border border-white/25 rounded px-1 py-0.5 text-[10px] text-white outline-none"
                            />
                          ) : (
                            <span className="block truncate">{p.fileName}</span>
                          )}
                        </div>
                        {p.album?.name && <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/60 text-white text-[9px]">{p.album.name}</div>}
                        {!bulkMode && !isRenaming && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startInlineRename(p);
                            }}
                            className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white/90 hover:text-white hover:bg-black/75"
                            title="Rename photo"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {bulkMode && (
                          <div className="absolute top-1 right-1">
                            {selected ? <CheckSquare className="h-3.5 w-3.5 text-pink-400" /> : <Square className="h-3.5 w-3.5 text-white/80" />}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : viewMode === "albums" ? (
            <div className="h-full overflow-auto p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[{ id: "__all", name: "All Photos", count: photos.length }, { id: "__unassigned", name: "Unassigned", count: albumCounts.get("__unassigned") ?? 0 }, ...sortedAlbums.map((a) => ({ id: a.id, name: a.name, count: albumCounts.get(a.id) ?? 0 }))].map((a) => {
                  const cover = albumCoverById.get(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setActiveAlbumId(a.id);
                        setIdx(0);
                        setViewMode("photos");
                      }}
                      className="group rounded-lg border border-border/60 hover:border-pink-500/50 bg-background/60 overflow-hidden text-left"
                    >
                      <div className="h-32 bg-muted/50">
                        {cover ? (
                          <img src={cover.filePath} alt={a.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No cover</div>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground">{a.count} photo{a.count !== 1 ? "s" : ""}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No photos match &quot;{searchQuery}&quot;</p>
              <button onClick={() => setSearchQuery("")} className="mt-2 text-xs text-pink-500 hover:underline">Clear search</button>
            </div>
          ) : compareMode ? (
            /* ── Compare view ── */
            <div className="flex w-full h-full">
              {[idx, compareIdx].map((ci, side) => {
                const cp = filteredPhotos[ci];
                if (!cp) return (
                  <div key={side} className="flex-1 flex items-center justify-center text-muted-foreground text-xs border-r last:border-r-0 border-white/10">
                    Click a thumbnail to set photo {side === 0 ? "A" : "B"}
                  </div>
                );
                return (
                  <div key={side} className="flex-1 relative flex items-center justify-center overflow-hidden border-r last:border-r-0 border-white/10">
                    <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-bold">
                      {side === 0 ? "A" : "B"}
                    </div>
                    <div className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px]">
                      {ci + 1}/{filteredPhotos.length}
                    </div>
                    {cp.caption && (
                      <div className="absolute bottom-1 left-1 right-1 z-10 text-center text-[10px] text-white/80 bg-black/50 px-1 py-0.5 rounded truncate">
                        {cp.caption}
                      </div>
                    )}
                    <img src={cp.filePath} alt={cp.fileName} draggable={false}
                      className="max-w-full max-h-full object-contain select-none"
                      style={{ transform: cp.rotation ? `rotate(${cp.rotation}deg)` : undefined }} />
                  </div>
                );
              })}
            </div>
          ) : currentPhoto ? (
            /* ── Normal / Slideshow view ── */
            <>
              <div className="absolute top-2 left-2 z-40 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs select-none">
                {idx + 1} / {filteredPhotos.length}
              </div>

              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1">
                {currentPhoto.isCover && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/90 text-black text-xs font-medium">
                    <Star className="h-3 w-3 fill-current" /> Cover
                  </div>
                )}
                {currentPhoto.isPrivate && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-700/90 text-white text-xs">
                    <EyeOff className="h-3 w-3" /> Private
                  </div>
                )}
                {currentPhoto.isFavorite && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/80 text-white text-xs">
                    <Heart className="h-3 w-3 fill-current" />
                  </div>
                )}
              </div>

              <div className="absolute top-2 right-2 z-40 flex gap-1">
                <button onClick={() => setZoomFit((f) => f === "contain" ? "cover" : "contain")}
                  className="px-1.5 py-1 rounded-full bg-black/50 hover:bg-black/70 text-white text-[9px] font-mono"
                  title={zoomFit === "contain" ? "Switch to fill" : "Switch to fit"}>
                  {zoomFit === "contain" ? "fit" : "fill"}
                </button>
                <button onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="p-1 rounded-full bg-black/50 hover:bg-black/70 text-white" title="Zoom out">
                  <ZoomOut className="h-3 w-3" />
                </button>
                <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="p-1 rounded-full bg-black/50 hover:bg-black/70 text-white" title="Zoom in">
                  <ZoomIn className="h-3 w-3" />
                </button>
                {zoom !== 1 && (
                  <button onClick={() => setZoom(1)} className="px-1.5 py-0.5 rounded-full bg-black/50 hover:bg-black/70 text-white text-[10px] font-mono">
                    {Math.round(zoom * 100)}%
                  </button>
                )}
              </div>

              {filteredPhotos.length > 1 && (
                <>
                  <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 z-40 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 z-40 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Slideshow progress bar */}
              {slideshowActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-40">
                  <div key={`${idx}-${settings.slideshowInterval}`}
                    className="h-full bg-green-400 origin-left"
                    style={{ animation: `slideshow-progress ${settings.slideshowInterval}s linear forwards` }} />
                </div>
              )}

              {/* Image + markers */}
              <div ref={imgRef}
                className={`relative overflow-auto max-h-full max-w-full ${addingMarker ? "cursor-crosshair" : ""}`}
                onClick={handleImageClick}>
                <div className="relative inline-block" style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}>
                  <img src={currentPhoto.filePath} alt={currentPhoto.caption || currentPhoto.fileName}
                    className="max-h-[calc(100vh-320px)] max-w-full select-none"
                    draggable={false}
                    style={{
                      objectFit: zoomFit,
                      transform: currentPhoto.rotation ? `rotate(${currentPhoto.rotation}deg)` : undefined,
                      ...(zoom !== 1 ? { maxWidth: "none", maxHeight: "none" } : {}),
                    }} />
                  {markers.map((m) => (
                    <div key={m.id} className="absolute"
                      style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, transform: "translate(-50%, -100%)" }}
                      onMouseEnter={() => setHoveredMarker(m.id)}
                      onMouseLeave={() => setHoveredMarker(null)}>
                      <MapPin className="h-5 w-5 text-red-500 fill-red-500 drop-shadow-lg" />
                      {hoveredMarker === m.id && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 min-w-[120px] max-w-[200px] rounded-lg bg-black/90 text-white p-2 text-xs shadow-xl z-50 pointer-events-auto">
                          <p className="font-semibold">{m.label}</p>
                          {m.description && <p className="mt-0.5 text-gray-300 text-[10px]">{m.description}</p>}
                          <div className="flex gap-1 mt-1">
                            <button onClick={(e) => { e.stopPropagation(); editMarker(m); }} className="text-blue-400 hover:text-blue-300 text-[10px]">edit</button>
                            <span className="text-gray-600">|</span>
                            <button onClick={(e) => { e.stopPropagation(); removeMarker(m.id); }} className="text-red-400 hover:text-red-300 text-[10px]">remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {currentPhoto.caption && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full bg-black/60 text-white text-xs max-w-[80%] text-center truncate">
                  {currentPhoto.caption}
                </div>
              )}

              {addingMarker && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-medium animate-pulse">
                  Click on the image to place a marker &mdash;{" "}
                  <button onClick={() => setAddingMarker(false)} className="underline">cancel</button>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Right: info sidebar */}
        {viewMode === "viewer" && currentPhoto && !compareMode && (
          <div className="w-56 shrink-0 border-l bg-muted/20 overflow-y-auto scrollbar-thin p-3 space-y-3">
            <div>
              <h3 className="text-xs font-semibold truncate">{currentPhoto.caption || currentPhoto.fileName}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{fmtSize(currentPhoto.fileSize)} · {currentPhoto.fileMime.split("/")[1]?.toUpperCase()}</p>
              <p className="text-[10px] text-muted-foreground">Uploaded: {new Date(currentPhoto.createdAt).toLocaleDateString()}</p>
              <p className="text-[10px] text-muted-foreground">Album: {currentPhoto.album?.name ?? "Unassigned"}</p>
              {currentPhoto.dateTaken && (
                <p className="text-[10px] text-muted-foreground">Taken: {new Date(currentPhoto.dateTaken).toLocaleDateString()}</p>
              )}
            </div>

            {/* Actions — row 1 */}
            <div className="flex flex-wrap gap-1">
              <button onClick={editCaption} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted hover:bg-muted-foreground/10 text-[10px] transition-colors">
                <Pencil className="h-2.5 w-2.5" /> Caption
              </button>
              <button onClick={editFileName} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted hover:bg-muted-foreground/10 text-[10px] transition-colors">
                <Pencil className="h-2.5 w-2.5" /> Rename
              </button>
              {!currentPhoto.isCover && (
                <button onClick={setCover} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-[10px] transition-colors">
                  <Star className="h-2.5 w-2.5" /> Cover
                </button>
              )}
              <button onClick={toggleFavorite}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-colors ${currentPhoto.isFavorite ? "bg-red-500/20 text-red-500" : "bg-muted hover:bg-muted-foreground/10"}`}>
                <Heart className={`h-2.5 w-2.5 ${currentPhoto.isFavorite ? "fill-current" : ""}`} />
                {currentPhoto.isFavorite ? "Unfav" : "Fav"}
              </button>
            </div>

            {/* Actions — row 2 */}
            <div className="flex flex-wrap gap-1">
              <button onClick={togglePrivate}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-colors ${currentPhoto.isPrivate ? "bg-gray-500/20 text-gray-400" : "bg-muted hover:bg-muted-foreground/10"}`}>
                {currentPhoto.isPrivate ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                {currentPhoto.isPrivate ? "Private" : "Public"}
              </button>
              <button onClick={rotatePhoto} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted hover:bg-muted-foreground/10 text-[10px] transition-colors">
                <RotateCw className="h-2.5 w-2.5" /> Rotate
              </button>
              <button onClick={editDateTaken} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted hover:bg-muted-foreground/10 text-[10px] transition-colors">
                <Calendar className="h-2.5 w-2.5" /> Date taken
              </button>
              <button onClick={moveCurrentPhoto} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted hover:bg-muted-foreground/10 text-[10px] transition-colors">
                <Images className="h-2.5 w-2.5" /> Move album
              </button>
            </div>

            {/* Actions — row 3 */}
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setAddingMarker(true)} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] transition-colors">
                <MapPin className="h-2.5 w-2.5" /> Marker
              </button>
              <button onClick={() => downloadPhoto(currentPhoto)} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted hover:bg-muted-foreground/10 text-[10px] transition-colors">
                <Download className="h-2.5 w-2.5" /> Download
              </button>
              <button onClick={deletePhoto} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] transition-colors">
                <Trash2 className="h-2.5 w-2.5" /> Delete
              </button>
            </div>

            {/* Tags */}
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <Tag className="h-2.5 w-2.5" /> Tags
              </h4>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {tags.length === 0 && <span className="text-[9px] text-muted-foreground/60">No tags</span>}
                {tags.map((t) => (
                  <span key={t} className="group/tag inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400 text-[9px]">
                    {t}
                    <button onClick={() => removeTag(t)} className="opacity-0 group-hover/tag:opacity-100 transition-opacity hover:text-red-500">
                      <X className="h-2 w-2" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag..."
                  className="flex-1 min-w-0 px-1.5 py-0.5 rounded-md bg-muted text-[10px] outline-none focus:ring-1 focus:ring-pink-500/50 placeholder:text-muted-foreground/50" />
                <button onClick={addTag} className="px-1.5 py-0.5 rounded-md bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 text-[10px]" title="Add tag">
                  <Plus className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>

            {/* Markers */}
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" /> Markers ({markers.length})
              </h4>
              {markers.length === 0 ? (
                <p className="text-[9px] text-muted-foreground/60">No markers yet.</p>
              ) : (
                <div className="space-y-0.5">
                  {markers.map((m) => (
                    <div key={m.id}
                      className="group/mlist flex items-start gap-1 rounded px-1 py-0.5 hover:bg-muted/50 transition-colors"
                      onMouseEnter={() => setHoveredMarker(m.id)}
                      onMouseLeave={() => setHoveredMarker(null)}>
                      <MapPin className="h-2.5 w-2.5 text-red-500 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium truncate">{m.label}</p>
                        {m.description && <p className="text-[9px] text-muted-foreground truncate">{m.description}</p>}
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover/mlist:opacity-100 transition-opacity">
                        <button onClick={() => editMarker(m)} className="p-0.5 rounded hover:bg-muted" title="Edit">
                          <Pencil className="h-2 w-2 text-muted-foreground" />
                        </button>
                        <button onClick={() => removeMarker(m.id)} className="p-0.5 rounded hover:bg-red-500/10" title="Remove">
                          <Trash2 className="h-2 w-2 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <KeyboardHandler onLeft={prev} onRight={next} onEsc={onClose} />
    </div>
  );

  return createPortal(panel, target);
}

/* ── Keyboard handler ─────────────────────────────────────────────────────── */
function KeyboardHandler({ onLeft, onRight, onEsc }: { onLeft: () => void; onRight: () => void; onEsc: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") onLeft();
      else if (e.key === "ArrowRight") onRight();
      else if (e.key === "Escape") onEsc();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onLeft, onRight, onEsc]);
  return null;
}

/* ── Slideshow CSS keyframe (injected once) ───────────────────────────────── */
if (typeof document !== "undefined") {
  const styleId = "gallery-modal-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@keyframes slideshow-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }`;
    document.head.appendChild(style);
  }
}
