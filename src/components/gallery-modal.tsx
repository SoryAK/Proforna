"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X, ChevronLeft, ChevronRight, Star, Pencil, Trash2, Plus, Tag,
  MapPin, ZoomIn, ZoomOut, Search, Images, Download, Archive,
  Maximize2, Minimize2, Play, Pause, Columns2, CheckSquare, Square,
  RotateCw, Eye, EyeOff, Heart, Calendar, Settings2,
  SortAsc, SortDesc, Check, CheckCheck, XCircle, LayoutGrid, FolderOpen,
  Layers, Video as VideoIcon, Upload, Link2,
  GripVertical, Minus, MoreHorizontal,
} from "lucide-react";
import { AnnotationEditor } from "@/components/annotation-editor";

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
  annotationsPublic?: boolean;
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

export interface GalleryVideo {
  id: string;
  filePath: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  posterPath?: string | null;
  durationSec?: number | null;
  isEmbed?: boolean;
  embedProvider?: string | null;
  caption?: string | null;
  isCover?: boolean;
  isFavorite?: boolean;
  isPrivate?: boolean;
  tags?: string | null;
  dateTaken?: string | null;
  sortOrder?: number | null;
  albumId?: string | null;
  album?: { id: string; name: string } | null;
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
type ViewMode = "viewer" | "photos" | "albums" | "videos";

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
  const [annotateOpen, setAnnotateOpen] = useState(false);
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

  /* ── Videos ── */
  const [videos, setVideos] = useState<GalleryVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const res = await fetch(`/api/gallery/videos?positionId=${encodeURIComponent(positionId)}`);
      if (res.ok) {
        const data = (await res.json()) as GalleryVideo[];
        setVideos(data);
      }
    } catch { /* ignore */ }
    finally { setVideosLoading(false); }
  }, [positionId]);

  useEffect(() => { void loadVideos(); }, [loadVideos]);

  async function uploadVideoFiles(files: File[]) {
    if (files.length === 0) return;
    setVideoUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("positionId", positionId);
        const res = await fetch("/api/gallery/videos", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          alert(`Failed to upload ${file.name}: ${err.error ?? "Unknown error"}`);
        }
      }
      await loadVideos();
    } finally {
      setVideoUploading(false);
    }
  }

  async function deleteVideo(id: string) {
    if (settings.confirmDelete && !window.confirm("Delete this video? This cannot be undone.")) return;
    const res = await fetch(`/api/gallery/videos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
    }
  }

  async function addVideoEmbed() {
    const url = window.prompt("Paste a YouTube, Vimeo, Loom, or other video URL:");
    if (!url || !url.trim()) return;
    setVideoUploading(true);
    try {
      const res = await fetch("/api/gallery/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId, url: url.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to add embed" }));
        alert(`Failed to add embed: ${err.error ?? "Unknown error"}`);
        return;
      }
      await loadVideos();
    } finally {
      setVideoUploading(false);
    }
  }

  async function updateVideoCaption(id: string, caption: string) {
    const res = await fetch("/api/gallery/videos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, caption }),
    });
    if (res.ok) {
      setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, caption } : v)));
    }
  }

  /* ── Slideshow ── */
  const [slideshowActive, setSlideshowActive] = useState(false);
  const slideshowRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Compare ── */
  const [compareMode, setCompareMode] = useState(false);
  const [compareIdx, setCompareIdx] = useState<number>(0);

  /* ── Fullscreen ── */
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* ── Minimize ── */
  const [minimized, setMinimized] = useState(false);

  /* ── Overflow menu ── */
  const [showOverflow, setShowOverflow] = useState(false);
  useEffect(() => {
    if (!showOverflow) return;
    const handler = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement;
      if (!tgt.closest("[data-overflow-root]")) setShowOverflow(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOverflow]);

  /* ── Close settings popover on outside click ── */
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement;
      if (!tgt.closest("[data-settings-root]") && !tgt.closest("[data-overflow-root]")) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettings]);

  /* ── Drag ── */
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const [imgViewport, setImgViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = imgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setImgViewport({ w: Math.floor(cr.width), h: Math.floor(cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    ? { left: dragPos.x, top: dragPos.y, width: size ? size.w : "min(900px, 78%)", height: minimized ? undefined : (size ? size.h : "min(520px, 72%)") }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: size ? size.w : "min(900px, 78%)", height: minimized ? undefined : (size ? size.h : "min(520px, 72%)") };

  const thumbArea = settings.thumbnailSize === "sm" ? "w-14 shrink-0" : settings.thumbnailSize === "lg" ? "w-28 shrink-0" : "w-20 shrink-0";

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  const panel = (
    <div
      ref={panelRef}
      className="absolute z-[2000] flex flex-col rounded-xl bg-background border shadow-2xl pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-200 overflow-hidden"
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

      {/* Resize handles (hidden when minimized) */}
      {!minimized && <>
      <div className="absolute top-0 left-0 right-0 h-1.5 cursor-n-resize z-50" onMouseDown={(e) => onResizeStart(e, "t")} />
      <div className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize z-50" onMouseDown={(e) => onResizeStart(e, "b")} />
      <div className="absolute top-0 left-0 bottom-0 w-1.5 cursor-w-resize z-50" onMouseDown={(e) => onResizeStart(e, "l")} />
      <div className="absolute top-0 right-0 bottom-0 w-1.5 cursor-e-resize z-50" onMouseDown={(e) => onResizeStart(e, "r")} />
      <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-50" onMouseDown={(e) => onResizeStart(e, "tl")} />
      <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-50" onMouseDown={(e) => onResizeStart(e, "tr")} />
      <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-50" onMouseDown={(e) => onResizeStart(e, "bl")} />
      <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-50" onMouseDown={(e) => onResizeStart(e, "br")} />
      </>}

      {/* ── Title bar (drag handle) ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 rounded-t-xl shrink-0 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
        onDoubleClick={() => setMinimized((m) => !m)}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        <Images className="h-4 w-4 text-pink-500 shrink-0" />
        <div className="flex-1 text-sm font-semibold truncate">
          Gallery <span className="text-xs font-normal text-muted-foreground">— {filteredPhotos.length}/{photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleFullscreen}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized((m) => !m)}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
          title={minimized ? "Restore" : "Minimize"}
        >
          {minimized ? <Square className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!minimized && <>

      {/* ── Secondary toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20 shrink-0 select-none">

        {/* View mode segmented control */}
        <div className="flex items-center rounded-md bg-muted/60 p-0.5 shrink-0">
          {([
            { v: "viewer", icon: Images, t: "Viewer" },
            { v: "photos", icon: LayoutGrid, t: "Grid" },
            { v: "albums", icon: FolderOpen, t: "Albums" },
            { v: "videos", icon: VideoIcon, t: `Videos${videos.length ? ` (${videos.length})` : ""}` },
          ] as const).map(({ v, icon: Icon, t }) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`p-1 rounded transition-colors ${viewMode === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              title={t}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Album filter */}
        <select
          value={activeAlbumId}
          onChange={(e) => { setActiveAlbumId(e.target.value); setIdx(0); }}
          className="h-7 rounded-md bg-background border border-input text-xs px-2 outline-none cursor-pointer max-w-[160px] hover:border-muted-foreground/40 focus:border-pink-500/50"
          title="Filter by album"
        >
          <option value="__all">All ({photos.length})</option>
          <option value="__unassigned">Unassigned ({albumCounts.get("__unassigned") ?? 0})</option>
          {sortedAlbums.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({albumCounts.get(a.id) ?? 0})</option>
          ))}
        </select>

        {/* Search (flex-1 fills remaining space) */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setIdx(0); }}
            placeholder="Search tags, captions, file names…"
            className="w-full h-7 pl-7 pr-7 rounded-md bg-background border border-input text-xs outline-none focus:border-pink-500/50 placeholder:text-muted-foreground/60"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setIdx(0); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Primary actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => { setBulkMode((b) => !b); setSelectedIds(new Set()); }}
            className={`p-1.5 rounded-md transition-colors ${bulkMode ? "bg-pink-500/15 text-pink-600 dark:text-pink-400" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
            title="Select multiple"
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setViewMode("viewer"); setCompareMode((c) => !c); setSlideshowActive(false); }}
            className={`p-1.5 rounded-md transition-colors ${compareMode ? "bg-pink-500/15 text-pink-600 dark:text-pink-400" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
            title="Compare two photos"
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setViewMode("viewer"); setSlideshowActive((s) => !s); setCompareMode(false); }}
            className={`p-1.5 rounded-md transition-colors ${slideshowActive ? "bg-pink-500/15 text-pink-600 dark:text-pink-400" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
            title={slideshowActive ? "Pause slideshow" : "Start slideshow"}
          >
            {slideshowActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>

          {/* Overflow menu */}
          <div className="relative" data-overflow-root>
            <button
              onClick={() => setShowOverflow((s) => !s)}
              className={`p-1.5 rounded-md transition-colors ${showOverflow ? "bg-muted text-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
              title="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {showOverflow && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border bg-background shadow-xl z-[2100] py-1 text-xs">
                {/* Sort */}
                <div className="px-2 py-1.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sort by</div>
                  <div className="flex items-center gap-1">
                    <select
                      value={settings.sortBy}
                      onChange={(e) => updateSettings({ sortBy: e.target.value as SortBy })}
                      className="flex-1 h-7 rounded-md bg-background border border-input text-xs px-2 outline-none cursor-pointer"
                    >
                      <option value="date">Date</option>
                      <option value="name">Name</option>
                      <option value="size">Size</option>
                      <option value="favorite">Favorites first</option>
                    </select>
                    <button
                      onClick={() => updateSettings({ sortAsc: !settings.sortAsc })}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-input hover:bg-muted text-muted-foreground"
                      title={settings.sortAsc ? "Ascending" : "Descending"}
                    >
                      {settings.sortAsc ? <SortAsc className="h-3.5 w-3.5" /> : <SortDesc className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="h-px bg-border my-1" />

                {/* Album management */}
                <div className="px-1">
                  <button onClick={() => { createAlbum(); setShowOverflow(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" /> New album
                  </button>
                  <button
                    onClick={() => { renameActiveAlbum(); setShowOverflow(false); }}
                    disabled={activeAlbumId === "__all" || activeAlbumId === "__unassigned"}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Rename album
                  </button>
                  <button
                    onClick={() => { deleteActiveAlbum(); setShowOverflow(false); }}
                    disabled={activeAlbumId === "__all" || activeAlbumId === "__unassigned"}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-red-500/10 text-left text-red-600 dark:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete album
                  </button>
                </div>
                <div className="h-px bg-border my-1" />

                {/* Other */}
                <div className="px-1">
                  <button onClick={() => { exportZip(); setShowOverflow(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left">
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" /> Export all as ZIP
                  </button>
                  <button onClick={() => { setShowSettings((s) => !s); setShowOverflow(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left">
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" /> Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {bulkMode && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b shrink-0 text-xs">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-600 dark:text-pink-400 font-medium">
            <CheckSquare className="h-3 w-3" />
            <span>{selectedIds.size} selected</span>
          </div>
          <button onClick={selectAll} className="inline-flex items-center gap-1 h-6 px-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <CheckCheck className="h-3 w-3" /> All
          </button>
          <button onClick={deselectAll} className="inline-flex items-center gap-1 h-6 px-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <XCircle className="h-3 w-3" /> None
          </button>

          {selectedIds.size > 0 && (
            <>
              <div className="h-5 w-px bg-border" />
              <button onClick={() => setShowBulkTagInput((s) => !s)} className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-input bg-background hover:bg-muted text-foreground transition-colors">
                <Tag className="h-3 w-3" /> Tag
              </button>
              <div className="inline-flex items-center gap-1">
                <select
                  value={bulkMoveAlbumId}
                  onChange={(e) => setBulkMoveAlbumId(e.target.value)}
                  className="h-6 rounded-md bg-background border border-input px-2 text-[11px] outline-none cursor-pointer max-w-[160px]"
                  title="Select destination album"
                >
                  <option value="__unassigned">Unassigned</option>
                  {sortedAlbums.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button onClick={bulkMoveAlbum} className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-input bg-background hover:bg-muted text-foreground transition-colors">
                  <FolderOpen className="h-3 w-3" /> Move
                </button>
              </div>
              <div className="ml-auto" />
              <button onClick={bulkDelete} className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </>
          )}
          {showBulkTagInput && (
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); bulkTag(); } }}
                placeholder="Tag name…"
                autoFocus
                className="h-6 px-2 rounded-md bg-background border border-input text-[11px] outline-none focus:border-pink-500/50 w-28"
              />
              <button onClick={bulkTag} className="inline-flex items-center h-6 px-2 rounded-md bg-pink-500 hover:bg-pink-600 text-white text-[11px]">Apply</button>
            </div>
          )}
        </div>
      )}

      {/* ── Settings popover ── */}
      {showSettings && (
        <div
          data-settings-root
          className="absolute top-[88px] right-3 z-[2050] w-72 rounded-lg border bg-background shadow-xl text-xs"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">Settings</span>
            </div>
            <button onClick={() => setShowSettings(false)} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Close">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="p-3 space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Thumbnail size</span>
              <select
                value={settings.thumbnailSize}
                onChange={(e) => updateSettings({ thumbnailSize: e.target.value as ThumbSize })}
                className="h-7 rounded-md bg-background border border-input px-2 outline-none cursor-pointer"
              >
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Slideshow interval</span>
              <select
                value={settings.slideshowInterval}
                onChange={(e) => updateSettings({ slideshowInterval: Number(e.target.value) })}
                className="h-7 rounded-md bg-background border border-input px-2 outline-none cursor-pointer"
              >
                {[1, 2, 3, 5, 8, 10].map((s) => <option key={s} value={s}>{s}s</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Default view</span>
              <select
                value={settings.defaultViewMode}
                onChange={(e) => {
                  const next = e.target.value as ViewMode;
                  updateSettings({ defaultViewMode: next });
                  setViewMode(next);
                }}
                className="h-7 rounded-md bg-background border border-input px-2 outline-none cursor-pointer"
              >
                <option value="viewer">Viewer</option>
                <option value="photos">Photos</option>
                <option value="albums">Albums</option>
              </select>
            </label>
            <div className="h-px bg-border" />
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span>Confirm before delete</span>
              <input type="checkbox" checked={settings.confirmDelete} onChange={(e) => updateSettings({ confirmDelete: e.target.checked })} className="accent-pink-500 h-3.5 w-3.5" />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span>Show private photos</span>
              <input type="checkbox" checked={settings.showPrivate} onChange={(e) => updateSettings({ showPrivate: e.target.checked })} className="accent-pink-500 h-3.5 w-3.5" />
            </label>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: thumbnail strip */}
        {viewMode === "viewer" && <div className={`${thumbArea} border-r bg-muted/20 overflow-y-auto scrollbar-thin p-2 space-y-2`}>
          {filteredPhotos.map((p, i) => {
            const pTags = parseTags(p.tags);
            const pMarkers = parseMarkers(p.markers);
            const isSelected = selectedIds.has(p.id);
            const isActive = !compareMode && i === idx;
            const isCompare = compareMode && i === compareIdx;
            const ringClass = isCompare
              ? "ring-2 ring-blue-500"
              : isSelected
                ? "ring-2 ring-pink-500"
                : isActive
                  ? "ring-2 ring-pink-500"
                  : "ring-1 ring-transparent hover:ring-pink-500/40";
            return (
              <button key={p.id} type="button"
                onClick={() => {
                  if (bulkMode) toggleSelect(p.id);
                  else if (compareMode) setCompareIdx(i);
                  else { setIdx(i); setZoom(1); }
                }}
                className={`group relative w-full aspect-square rounded-md overflow-hidden bg-muted transition-all ${ringClass}`}
              >
                <img src={p.filePath} alt={p.caption || p.fileName} className="w-full h-full object-cover"
                  style={{ transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined }} />

                {/* Bulk select check */}
                {bulkMode && (
                  <div className="absolute top-1 left-1 inline-flex items-center justify-center h-4 w-4 rounded bg-background/80 backdrop-blur-sm shadow">
                    {isSelected
                      ? <CheckSquare className="h-3 w-3 text-pink-500" />
                      : <Square className="h-3 w-3 text-muted-foreground" />}
                  </div>
                )}

                {/* Top-right badges (cover + favorite) */}
                {!bulkMode && (p.isCover || p.isFavorite) && (
                  <div className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded-md bg-background/70 backdrop-blur-sm px-1 py-0.5 shadow">
                    {p.isCover && <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500" />}
                    {p.isFavorite && <Heart className="h-2.5 w-2.5 text-red-500 fill-red-500" />}
                  </div>
                )}

                {/* Bottom-left private */}
                {!bulkMode && p.isPrivate && (
                  <div className="absolute bottom-1 left-1 inline-flex items-center justify-center rounded bg-background/70 backdrop-blur-sm p-0.5 shadow">
                    <EyeOff className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>
                )}

                {/* Bottom-right tag/marker counts */}
                {!bulkMode && (pTags.length > 0 || pMarkers.length > 0) && (
                  <div className="absolute bottom-1 right-1 inline-flex items-center gap-0.5">
                    {pTags.length > 0 && <span className="px-1 rounded-full bg-pink-500 text-white text-[8px] font-bold leading-tight shadow">{pTags.length}</span>}
                    {pMarkers.length > 0 && <span className="px-1 rounded-full bg-blue-500 text-white text-[8px] font-bold leading-tight shadow">{pMarkers.length}</span>}
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
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="h-14 w-14 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                    <LayoutGrid className="h-6 w-6 text-muted-foreground/70" />
                  </div>
                  <p className="text-sm font-medium">No photos match your filters</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Try clearing the search, switching albums, or enabling private photos in settings.
                  </p>
                  {(searchQuery || activeAlbumId !== "__all") && (
                    <button
                      onClick={() => { setSearchQuery(""); setActiveAlbumId("__all"); setIdx(0); }}
                      className="mt-3 inline-flex items-center gap-1 h-7 px-3 rounded-md border border-input bg-background hover:bg-muted text-xs"
                    >
                      <X className="h-3 w-3" /> Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {filteredPhotos.map((p, i) => {
                    const selected = selectedIds.has(p.id);
                    const isRenaming = renamingPhotoId === p.id;
                    const pTagsG = parseTags(p.tags);
                    const pMarkersG = parseMarkers(p.markers);
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
                        className={`group relative rounded-md overflow-hidden bg-muted transition-all ring-1 ${selected ? "ring-2 ring-pink-500" : "ring-transparent hover:ring-pink-500/40"}`}
                      >
                        <img src={p.filePath} alt={p.caption || p.fileName} className="w-full h-32 object-cover" />

                        {/* Status badges (cover/favorite/private) */}
                        {!bulkMode && !isRenaming && (p.isCover || p.isFavorite || p.isPrivate) && (
                          <div className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-md bg-background/70 backdrop-blur-sm px-1 py-0.5 shadow">
                            {p.isCover && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                            {p.isFavorite && <Heart className="h-3 w-3 text-red-500 fill-red-500" />}
                            {p.isPrivate && <EyeOff className="h-3 w-3 text-muted-foreground" />}
                          </div>
                        )}

                        {/* Tag/marker counts */}
                        {!bulkMode && !isRenaming && (pTagsG.length > 0 || pMarkersG.length > 0) && (
                          <div className="absolute bottom-7 right-1 inline-flex items-center gap-0.5">
                            {pTagsG.length > 0 && <span className="px-1 rounded-full bg-pink-500 text-white text-[9px] font-bold leading-tight shadow">{pTagsG.length}</span>}
                            {pMarkersG.length > 0 && <span className="px-1 rounded-full bg-blue-500 text-white text-[9px] font-bold leading-tight shadow">{pMarkersG.length}</span>}
                          </div>
                        )}

                        <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/80 via-black/50 to-transparent text-white text-[10px]">
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
                        {p.album?.name && (
                          <div className="absolute bottom-7 left-1 px-1.5 py-0.5 rounded-md bg-background/80 backdrop-blur-sm text-foreground text-[9px] font-medium shadow truncate max-w-[80%]">
                            {p.album.name}
                          </div>
                        )}
                        {!bulkMode && !isRenaming && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startInlineRename(p);
                            }}
                            className="absolute top-1 right-1 p-1 rounded-md bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow"
                            title="Rename photo"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {bulkMode && (
                          <div className="absolute top-1 right-1 inline-flex items-center justify-center h-5 w-5 rounded bg-background/80 backdrop-blur-sm shadow">
                            {selected ? <CheckSquare className="h-3.5 w-3.5 text-pink-500" /> : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : viewMode === "videos" ? (
            <div
              className="h-full overflow-auto p-3"
              onDragOver={(e) => {
                if (e.dataTransfer?.types?.includes("Files")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(e) => {
                if (!e.dataTransfer?.types?.includes("Files")) return;
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("video/"));
                if (files.length === 0) return;
                void uploadVideoFiles(files);
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm">
                  <span className="font-medium">{videos.length}</span>
                  <span className="text-muted-foreground"> video{videos.length !== 1 ? "s" : ""}</span>
                  {videosLoading && <span className="ml-2 text-xs text-muted-foreground">loading…</span>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/ogg"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (e.target) e.target.value = "";
                      void uploadVideoFiles(files);
                    }}
                  />
                  <button
                    type="button"
                    disabled={videoUploading}
                    onClick={addVideoEmbed}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50 text-xs"
                    title="Embed a YouTube / Vimeo / Loom video"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Add embed
                  </button>
                  <button
                    type="button"
                    disabled={videoUploading}
                    onClick={() => videoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white text-xs"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {videoUploading ? "Uploading…" : "Upload videos"}
                  </button>
                </div>
              </div>

              {videos.length === 0 ? (
                <div className="h-[60%] flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border/60 rounded-lg p-8">
                  <VideoIcon className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm">No videos yet</p>
                  <p className="text-[11px] mt-1 opacity-70">Drag &amp; drop video files here, use Upload, or paste a YouTube/Vimeo/Loom link via Add embed.</p>
                  <p className="text-[10px] mt-2 opacity-60">MP4, WebM, MOV, MKV, OGV — up to 50 MB each. Embeds have no size limit.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {videos.map((v) => (
                    <div
                      key={v.id}
                      className="group relative rounded-md overflow-hidden border border-border/60 bg-black/40"
                    >
                      {v.isEmbed ? (
                        <div className="relative w-full aspect-video bg-black">
                          <iframe
                            src={v.filePath}
                            title={v.fileName}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                            className="absolute inset-0 w-full h-full border-0"
                          />
                          {v.embedProvider && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] uppercase tracking-wide">
                              {v.embedProvider}
                            </span>
                          )}
                        </div>
                      ) : (
                        <video
                          src={v.filePath}
                          poster={v.posterPath ?? undefined}
                          controls
                          preload="metadata"
                          className="w-full aspect-video bg-black object-contain"
                        />
                      )}
                      <div className="px-2 py-1.5 bg-background/95">
                        <input
                          defaultValue={v.caption ?? ""}
                          placeholder="Add a caption…"
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next !== (v.caption ?? "")) void updateVideoCaption(v.id, next);
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className="w-full bg-transparent border-0 text-sm outline-none focus:ring-0 truncate"
                        />
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span className="truncate" title={v.fileName}>{v.fileName}</span>
                          <span className="shrink-0 ml-2">{v.isEmbed ? "embed" : fmtSize(v.fileSize)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteVideo(v.id)}
                        className="absolute top-1 right-1 p-1 rounded bg-black/70 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete video"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
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
            <div className="text-center px-6">
              <div className="h-14 w-14 rounded-full bg-background/80 flex items-center justify-center mb-3 mx-auto">
                <Search className="h-6 w-6 text-muted-foreground/70" />
              </div>
              <p className="text-sm font-medium text-foreground">No matches{searchQuery ? <> for &ldquo;{searchQuery}&rdquo;</> : null}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Try a different search term, switch albums, or upload a new photo.
              </p>
              {(searchQuery || activeAlbumId !== "__all") && (
                <button
                  onClick={() => { setSearchQuery(""); setActiveAlbumId("__all"); setIdx(0); }}
                  className="mt-3 inline-flex items-center gap-1 h-7 px-3 rounded-md border border-input bg-background hover:bg-muted text-xs text-foreground"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
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
                className={`relative w-full h-full overflow-auto flex items-center justify-center ${addingMarker ? "cursor-crosshair" : ""}`}
                onClick={handleImageClick}>
                <div className="relative inline-block" style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}>
                  <img src={currentPhoto.filePath} alt={currentPhoto.caption || currentPhoto.fileName}
                    className="block select-none"
                    draggable={false}
                    style={{
                      objectFit: zoomFit,
                      transform: currentPhoto.rotation ? `rotate(${currentPhoto.rotation}deg)` : undefined,
                      ...(zoom !== 1
                        ? { maxWidth: "none", maxHeight: "none" }
                        : {
                            maxWidth: imgViewport.w ? `${imgViewport.w}px` : "100%",
                            maxHeight: imgViewport.h ? `${imgViewport.h}px` : "100%",
                          }),
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
          <div className="w-60 shrink-0 border-l bg-muted/20 overflow-y-auto scrollbar-thin">
            {/* Header */}
            <div className="px-3 py-3 border-b">
              <h3 className="text-xs font-semibold leading-tight break-all">{currentPhoto.caption || currentPhoto.fileName}</h3>
              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                <span className="text-muted-foreground">Size</span>
                <span className="text-foreground/80 truncate">{fmtSize(currentPhoto.fileSize)} · {currentPhoto.fileMime.split("/")[1]?.toUpperCase()}</span>
                <span className="text-muted-foreground">Album</span>
                <span className="text-foreground/80 truncate">{currentPhoto.album?.name ?? "Unassigned"}</span>
                <span className="text-muted-foreground">Uploaded</span>
                <span className="text-foreground/80 truncate">{new Date(currentPhoto.createdAt).toLocaleDateString()}</span>
                {currentPhoto.dateTaken && (
                  <>
                    <span className="text-muted-foreground">Taken</span>
                    <span className="text-foreground/80 truncate">{new Date(currentPhoto.dateTaken).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>

            {/* Status toggle pills */}
            <div className="px-3 py-2 border-b flex flex-wrap gap-1">
              <button
                onClick={setCover}
                disabled={currentPhoto.isCover}
                className={`inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[10px] transition-colors ${currentPhoto.isCover ? "border-yellow-500/40 bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" : "border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                title={currentPhoto.isCover ? "Cover photo" : "Set as cover"}
              >
                <Star className={`h-2.5 w-2.5 ${currentPhoto.isCover ? "fill-current" : ""}`} />
                Cover
              </button>
              <button
                onClick={toggleFavorite}
                className={`inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[10px] transition-colors ${currentPhoto.isFavorite ? "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400" : "border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                title={currentPhoto.isFavorite ? "Remove favorite" : "Mark as favorite"}
              >
                <Heart className={`h-2.5 w-2.5 ${currentPhoto.isFavorite ? "fill-current" : ""}`} />
                {currentPhoto.isFavorite ? "Favorited" : "Favorite"}
              </button>
              <button
                onClick={togglePrivate}
                className={`inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[10px] transition-colors ${currentPhoto.isPrivate ? "border-muted-foreground/40 bg-muted text-foreground" : "border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                title={currentPhoto.isPrivate ? "Make public" : "Make private"}
              >
                {currentPhoto.isPrivate ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                {currentPhoto.isPrivate ? "Private" : "Public"}
              </button>
            </div>

            {/* Edit actions */}
            <div className="px-3 py-2 border-b">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Edit</div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { icon: Pencil, label: "Caption", onClick: editCaption },
                  { icon: Pencil, label: "Rename", onClick: editFileName },
                  { icon: Calendar, label: "Date taken", onClick: editDateTaken },
                  { icon: FolderOpen, label: "Move", onClick: moveCurrentPhoto },
                ].map(({ icon: Icon, label, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-input bg-background hover:bg-muted text-foreground text-[10px] transition-colors"
                  >
                    <Icon className="h-3 w-3 text-muted-foreground" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tools */}
            <div className="px-3 py-2 border-b">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tools</div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setAnnotateOpen(true)}
                  className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-input bg-background hover:bg-muted text-foreground text-[10px] transition-colors"
                  title="Open annotation editor"
                >
                  <Layers className="h-3 w-3 text-muted-foreground" /> Annotate
                </button>
                <button
                  onClick={() => setAddingMarker(true)}
                  className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-input bg-background hover:bg-muted text-foreground text-[10px] transition-colors"
                >
                  <MapPin className="h-3 w-3 text-muted-foreground" /> Marker
                </button>
                <button
                  onClick={rotatePhoto}
                  className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-input bg-background hover:bg-muted text-foreground text-[10px] transition-colors"
                >
                  <RotateCw className="h-3 w-3 text-muted-foreground" /> Rotate
                </button>
                <button
                  onClick={() => downloadPhoto(currentPhoto)}
                  className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-input bg-background hover:bg-muted text-foreground text-[10px] transition-colors"
                >
                  <Download className="h-3 w-3 text-muted-foreground" /> Download
                </button>
              </div>
            </div>

            {/* Tags */}
            <div className="px-3 py-2 border-b">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Tag className="h-2.5 w-2.5" /> Tags
                </div>
                {tags.length > 0 && <span className="text-[9px] text-muted-foreground">{tags.length}</span>}
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {tags.map((t) => (
                    <span key={t} className="group/tag inline-flex items-center gap-0.5 pl-1.5 pr-0.5 py-0.5 rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400 text-[10px]">
                      {t}
                      <button onClick={() => removeTag(t)} className="ml-0.5 inline-flex items-center justify-center h-3.5 w-3.5 rounded-full hover:bg-pink-500/20 text-pink-500" title="Remove tag">
                        <X className="h-2 w-2" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-1">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag…"
                  className="flex-1 min-w-0 h-6 px-2 rounded-md bg-background border border-input text-[10px] outline-none focus:border-pink-500/50 placeholder:text-muted-foreground/60"
                />
                <button
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-pink-500 hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                  title="Add tag"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Markers */}
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5" /> Markers
                </div>
                {markers.length > 0 && <span className="text-[9px] text-muted-foreground">{markers.length}</span>}
              </div>
              {markers.length === 0 ? (
                <button
                  onClick={() => setAddingMarker(true)}
                  className="w-full inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md border border-dashed border-input hover:border-muted-foreground/40 hover:bg-muted text-[10px] text-muted-foreground"
                >
                  <Plus className="h-3 w-3" /> Add marker
                </button>
              ) : (
                <div className="space-y-0.5">
                  {markers.map((m) => (
                    <div
                      key={m.id}
                      className="group/mlist flex items-start gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted transition-colors"
                      onMouseEnter={() => setHoveredMarker(m.id)}
                      onMouseLeave={() => setHoveredMarker(null)}
                    >
                      <MapPin className="h-2.5 w-2.5 text-red-500 fill-red-500 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium truncate">{m.label}</p>
                        {m.description && <p className="text-[9px] text-muted-foreground truncate">{m.description}</p>}
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover/mlist:opacity-100 transition-opacity">
                        <button onClick={() => editMarker(m)} className="p-0.5 rounded hover:bg-background" title="Edit">
                          <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => removeMarker(m.id)} className="p-0.5 rounded hover:bg-red-500/10" title="Remove">
                          <Trash2 className="h-2.5 w-2.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Destructive action */}
            <div className="px-3 py-2 border-t">
              <button
                onClick={deletePhoto}
                className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] transition-colors"
              >
                <Trash2 className="h-3 w-3" /> Delete photo
              </button>
            </div>
          </div>
        )}
      </div>

      <KeyboardHandler onLeft={prev} onRight={next} onEsc={onClose} />
      {annotateOpen && currentPhoto && (
        <AnnotationEditor
          photoId={currentPhoto.id}
          imageUrl={currentPhoto.filePath}
          imageRotation={currentPhoto.rotation ?? 0}
          initialAnnotationsPublic={currentPhoto.annotationsPublic ?? true}
          siblingPhotos={photos.map((p) => ({
            id: p.id,
            filePath: p.filePath,
            fileName: p.fileName,
            rotation: p.rotation,
            caption: p.caption,
          }))}
          onClose={() => setAnnotateOpen(false)}
          onChange={() => { void onRefresh(); }}
        />
      )}
      </>}
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
