"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  ChevronLeft,
  Plus,
  Loader2,
  MapPin,
  Trash2,
  Star,
  X,
  LayoutGrid,
  FolderOpen,
  FolderPlus,
  Maximize2,
} from "lucide-react";
import { PhotoGrid } from "./photo-grid";
import { PhotoDetailDrawer } from "./photo-detail-drawer";
import { PositionFolderGrid } from "./folder-grid";
import type {
  MasterGalleryPhoto,
  MasterGalleryTree,
  MasterGalleryPosition,
} from "./types";
import { UNFILED_ALBUM_ID } from "./types";

interface EmbeddedPositionGalleryProps {
  positionId: string;
  companyName: string;
  // Caller-supplied callbacks. Keeping them as props (rather than
  // hard-wiring router/store inside) keeps this component reusable
  // outside the in-map slide-in (e.g. could later embed in a dialog).
  onBack: () => void;
  onClose?: () => void;
  onOpenInMap?: () => void;
}

// In-panel gallery for a single position. Lets the user upload, edit,
// banner-toggle and delete photos for a job WITHOUT triggering map
// focus or work-history focus mode. Mirrors the focused-mode header
// controls (Photos/Albums toggle, single/album/folder upload, fullscreen)
// so quick-browse and focused-edit feel identical.
export function EmbeddedPositionGallery({
  positionId,
  companyName,
  onBack,
  onClose,
  onOpenInMap,
}: EmbeddedPositionGalleryProps) {
  const qc = useQueryClient();
  const [view, setView] = useState<"photos" | "albums">("photos");
  // null in photos view = "all photos for this position".
  // Set when the user drills into an album from albums view.
  const [currentAlbumId, setCurrentAlbumId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Pull position metadata (albums list, etc.) from the cached master-gallery
  // tree so we don't double-fetch. EmbeddedMasterFolders already populates it.
  const { data: tree } = useQuery<MasterGalleryTree>({
    queryKey: ["master-gallery"],
    queryFn: async () => {
      const r = await fetch("/api/master-gallery");
      if (!r.ok) throw new Error("Failed to load gallery");
      return r.json();
    },
  });
  const position: MasterGalleryPosition | undefined = useMemo(
    () => tree?.positions.find((p) => p.id === positionId),
    [tree, positionId],
  );

  // Reuse the same query key the full page uses so cache stays in sync
  // between the embedded panel and /master-gallery.
  const photosQueryKey = [
    "master-gallery",
    "photos",
    positionId,
    currentAlbumId ?? "all",
  ];

  const { data: photos = [], isLoading } = useQuery<MasterGalleryPhoto[]>({
    queryKey: photosQueryKey,
    queryFn: async () => {
      const qs = new URLSearchParams({ positionId });
      if (currentAlbumId) qs.set("albumId", currentAlbumId);
      const r = await fetch(`/api/master-gallery/photos?${qs.toString()}`);
      if (!r.ok) throw new Error("Failed to load photos");
      return r.json();
    },
  });

  // Total photos for this position regardless of album filter — used to
  // compute the "Unfiled" virtual-album count in albums view.
  const { data: allPhotos = [] } = useQuery<MasterGalleryPhoto[]>({
    queryKey: ["master-gallery", "photos", positionId, "all"],
    queryFn: async () => {
      const r = await fetch(
        `/api/master-gallery/photos?positionId=${positionId}`,
      );
      if (!r.ok) throw new Error("Failed to load photos");
      return r.json();
    },
    enabled: view === "albums",
  });

  const unfiledCount = useMemo(
    () => allPhotos.filter((p) => !p.albumId).length,
    [allPhotos],
  );

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["master-gallery"] });
  }, [qc]);

  const savePhoto = useMutation({
    mutationFn: async (vars: {
      id: string;
      patch: Record<string, unknown>;
    }) => {
      const r = await fetch("/api/gallery", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: vars.id, ...vars.patch }),
      });
      if (!r.ok) throw new Error("Save failed");
      return r.json();
    },
    onSuccess: invalidate,
  });

  const deletePhotos = useMutation({
    mutationFn: async (ids: string[]) => {
      const r = await fetch("/api/gallery", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) throw new Error("Delete failed");
      return r.json();
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      invalidate();
    },
  });

  // Generic uploader. albumName creates a new album if provided; albumId
  // attaches to an existing album when known. Both omitted = unfiled.
  const uploadFiles = async (
    files: File[],
    extras: { albumId?: string; albumName?: string } = {},
  ) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.set("file", f);
        fd.set("positionId", positionId);
        if (extras.albumId) fd.set("albumId", extras.albumId);
        if (extras.albumName) fd.set("albumName", extras.albumName);
        const r = await fetch("/api/gallery", { method: "POST", body: fd });
        if (!r.ok) console.error("Upload failed for", f.name);
      }
      invalidate();
    } finally {
      setUploading(false);
    }
  };

  const handleSingleUpload = (files: FileList | null) => {
    if (!files?.length) return;
    // If the user is currently inside an album, attach to it; otherwise
    // unfiled. (Same behavior as the full /master-gallery page.)
    const albumId =
      currentAlbumId && currentAlbumId !== UNFILED_ALBUM_ID
        ? currentAlbumId
        : undefined;
    void uploadFiles(Array.from(files), { albumId });
  };

  const handleAlbumUpload = (files: FileList | null) => {
    if (!files?.length) return;
    const defaultName = `Album ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    const name = window.prompt(
      `Album name for these ${files.length} photo${files.length === 1 ? "" : "s"}:`,
      defaultName,
    );
    const trimmed = name?.trim();
    if (!trimmed) return;
    void uploadFiles(Array.from(files), { albumName: trimmed.slice(0, 80) });
  };

  const handleFolderUpload = (files: FileList | null) => {
    const all = files ? Array.from(files) : [];
    const images = all.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const firstRel =
      (images[0] as File & { webkitRelativePath?: string })
        .webkitRelativePath || "";
    const folderName = firstRel.split("/")[0] || "Folder";
    const name = window.prompt(
      `Album name for ${images.length} photo${images.length === 1 ? "" : "s"}:`,
      folderName,
    );
    const trimmed = name?.trim();
    if (!trimmed) return;
    void uploadFiles(images, { albumName: trimmed.slice(0, 80) });
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
  const anyBanner = selectedPhotos.some((p) => p.isBanner);

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.size} photo${selectedIds.size === 1 ? "" : "s"}?`,
      )
    )
      return;
    deletePhotos.mutate(Array.from(selectedIds));
  };

  const handleBulkBanner = async () => {
    const target = !anyBanner;
    await Promise.all(
      Array.from(selectedIds).map((id) =>
        savePhoto.mutateAsync({ id, patch: { isBanner: target } }),
      ),
    );
    setSelectedIds(new Set());
  };

  const openPhoto = openPhotoId
    ? photos.find((p) => p.id === openPhotoId) ?? null
    : null;

  // Header back: if drilled into an album, go back to albums view; else
  // bubble up to the master folder grid.
  const handleHeaderBack = () => {
    if (currentAlbumId) {
      setCurrentAlbumId(null);
      setView("albums");
      setSelectedIds(new Set());
      return;
    }
    onBack();
  };

  const headerTitle = currentAlbumId
    ? currentAlbumId === UNFILED_ALBUM_ID
      ? `${companyName} · Unfiled`
      : `${companyName} · ${position?.albums.find((a) => a.id === currentAlbumId)?.name ?? "Album"}`
    : companyName;

  const albumsTotal =
    (position?.albums.length ?? 0) + (unfiledCount > 0 ? 1 : 0);
  const headerCount =
    view === "albums"
      ? `${albumsTotal} album${albumsTotal === 1 ? "" : "s"}`
      : `${photos.length} photo${photos.length === 1 ? "" : "s"}`;

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border bg-background/95 shrink-0">
        <button
          type="button"
          onClick={handleHeaderBack}
          className="p-1 -ml-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title={currentAlbumId ? "Back to albums" : "Back to all jobs"}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{headerTitle}</p>
          <p className="text-[10px] text-muted-foreground">{headerCount}</p>
        </div>

        {/* Photos / Albums toggle (hidden when inside an album) */}
        {!currentAlbumId && (
          <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-0.5 shrink-0">
            <button
              type="button"
              title="Photos view"
              onClick={() => setView("photos")}
              className={`p-0.5 rounded transition-colors ${view === "photos" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="h-3 w-3" />
            </button>
            <button
              type="button"
              title="Albums view"
              onClick={() => setView("albums")}
              className={`p-0.5 rounded transition-colors ${view === "albums" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <FolderOpen className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Open viewer (lightbox entry point) */}
        {photos.length > 0 && view === "photos" && (
          <button
            type="button"
            onClick={() => setOpenPhotoId(photos[0].id)}
            className="p-1 rounded hover:bg-pink-500/10 text-pink-500 transition-colors shrink-0"
            title="Open viewer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Single-photo upload */}
        <label
          className={`p-1 rounded hover:bg-pink-500/10 text-pink-500 cursor-pointer transition-colors shrink-0 ${uploading ? "pointer-events-none opacity-50" : ""}`}
          title="Add photos"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleSingleUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {/* Album upload (multi-select files → named album) */}
        <label
          className={`p-1 rounded hover:bg-pink-500/10 text-pink-500 cursor-pointer transition-colors shrink-0 ${uploading ? "pointer-events-none opacity-50" : ""}`}
          title="Upload as album"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleAlbumUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {/* Folder upload (whole directory → named album) */}
        <label
          className={`hidden md:inline-flex p-1 rounded hover:bg-pink-500/10 text-pink-500 cursor-pointer transition-colors shrink-0 ${uploading ? "pointer-events-none opacity-50" : ""}`}
          title="Upload folder"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <input
            type="file"
            multiple
            className="hidden"
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={(e) => {
              handleFolderUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {onOpenInMap && (
          <button
            type="button"
            onClick={onOpenInMap}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Show on map"
          >
            <MapPin className="h-3.5 w-3.5" />
          </button>
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        <p className="text-[10px] text-muted-foreground/70">
          Avoid uploading faces, serial numbers, proprietary screens, or
          customer-sensitive images.
        </p>

        {view === "albums" && position ? (
          <>
            <PositionFolderGrid
              position={position}
              unfiledCount={unfiledCount}
              onOpenAlbum={(albumId) => {
                setCurrentAlbumId(albumId);
                setView("photos");
                setSelectedIds(new Set());
              }}
            />
            {position.albums.length === 0 && unfiledCount === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">
                No albums yet. Use the folder-upload buttons above to create
                one.
              </div>
            )}
          </>
        ) : isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <PhotoGrid
            photos={photos}
            selectedIds={selectedIds}
            selectionMode={selectedIds.size > 0}
            onToggleSelect={toggleSelect}
            onOpenPhoto={(id) => setOpenPhotoId(id)}
          />
        )}
      </div>

      {/* Inline bulk action bar — panel-local, not a fixed viewport bar.
          The full-page version uses `fixed bottom-4` which would render
          behind our z-[1300] panel, so a slim inline strip is clearer. */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border bg-background/95 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="px-2 py-1 rounded hover:bg-muted text-xs flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            <span className="font-medium">{selectedIds.size}</span>
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            type="button"
            onClick={handleBulkBanner}
            className="px-2 py-1 rounded hover:bg-yellow-500/15 text-xs flex items-center gap-1"
          >
            <Star
              className={`w-3 h-3 ${anyBanner ? "fill-yellow-500 text-yellow-500" : ""}`}
            />
            <span>{anyBanner ? "Unmark" : "Banner"}</span>
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="ml-auto px-2 py-1 rounded hover:bg-destructive/15 text-destructive text-xs flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete</span>
          </button>
        </div>
      )}

      <PhotoDetailDrawer
        photo={openPhoto}
        onClose={() => setOpenPhotoId(null)}
        onSave={async (id, patch) => {
          await savePhoto.mutateAsync({ id, patch });
        }}
        onDelete={async (id) => {
          await deletePhotos.mutateAsync([id]);
          setOpenPhotoId(null);
        }}
      />
    </>
  );
}
