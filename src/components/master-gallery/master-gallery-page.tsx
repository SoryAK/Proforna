"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Home, Star, Briefcase, FolderOpen, Loader2 } from "lucide-react";
import { RootFolderGrid, PositionFolderGrid } from "./folder-grid";
import { PhotoGrid } from "./photo-grid";
import { BulkActionBar } from "./bulk-action-bar";
import { MoveDialog } from "./move-dialog";
import { PhotoDetailDrawer } from "./photo-detail-drawer";
import {
  BANNERS_VIEW,
  UNFILED_ALBUM_ID,
  type MasterGalleryPhoto,
  type MasterGalleryTree,
} from "./types";

// URL-driven navigation:
//   /master-gallery                              → root (folders for each job + Banner Photos)
//   /master-gallery?view=banners                 → all banner photos
//   /master-gallery?job=<id>                     → job folder (its albums + unfiled photos)
//   /master-gallery?job=<id>&album=<id>          → album folder
//   /master-gallery?job=<id>&album=__unfiled__   → unfiled photos in a job
//
// Back-button "just works" because every navigation is a pushState.
export function MasterGalleryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();

  const view = params.get("view");
  const jobId = params.get("job");
  const albumId = params.get("album");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  // ── Tree (root level + sidebar info) ────────────────────────────
  const { data: tree, isLoading: treeLoading } = useQuery<MasterGalleryTree>({
    queryKey: ["master-gallery"],
    queryFn: async () => {
      const r = await fetch("/api/master-gallery");
      if (!r.ok) throw new Error("Failed to load gallery");
      return r.json();
    },
  });

  // ── Photos for the current folder ───────────────────────────────
  const photoQueryKey = useMemo(() => {
    if (view === BANNERS_VIEW) return ["master-gallery", "photos", "banners"];
    if (jobId)
      return ["master-gallery", "photos", jobId, albumId ?? "all"];
    return ["master-gallery", "photos", "none"];
  }, [view, jobId, albumId]);

  const photoQueryEnabled = view === BANNERS_VIEW || !!jobId;

  const { data: photos = [], isLoading: photosLoading } = useQuery<
    MasterGalleryPhoto[]
  >({
    queryKey: photoQueryKey,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (view === BANNERS_VIEW) qs.set("view", "banners");
      else if (jobId) {
        qs.set("positionId", jobId);
        if (albumId) qs.set("albumId", albumId);
      }
      const r = await fetch(`/api/master-gallery/photos?${qs}`);
      if (!r.ok) throw new Error("Failed to load photos");
      return r.json();
    },
    enabled: photoQueryEnabled,
  });

  const currentPosition = jobId ? tree?.positions.find((p) => p.id === jobId) : null;
  const currentAlbum =
    currentPosition && albumId && albumId !== UNFILED_ALBUM_ID
      ? currentPosition.albums.find((a) => a.id === albumId)
      : null;

  // ── Mutations ──────────────────────────────────────────────────
  const invalidateAll = useCallback(() => {
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
    onSuccess: invalidateAll,
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
      setSelectionMode(false);
      invalidateAll();
    },
  });

  // Move = decides between same-position (existing /api/gallery PATCH
  // with action:"move") and cross-position (new /api/master-gallery/move).
  const movePhotos = useMutation({
    mutationFn: async (vars: {
      ids: string[];
      sourcePositionIds: string[];
      targetPositionId: string;
      targetAlbumId: string | null;
    }) => {
      const sameJob =
        vars.sourcePositionIds.every((id) => id === vars.targetPositionId);
      if (sameJob) {
        const r = await fetch("/api/gallery", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ids: vars.ids,
            action: "move",
            albumId: vars.targetAlbumId,
          }),
        });
        if (!r.ok) throw new Error("Move failed");
        return r.json();
      }
      const r = await fetch("/api/master-gallery/move", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: vars.ids,
          targetPositionId: vars.targetPositionId,
          targetAlbumId: vars.targetAlbumId,
        }),
      });
      if (!r.ok) throw new Error("Move failed");
      return r.json();
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setSelectionMode(false);
      invalidateAll();
    },
  });

  // ── Navigation helpers ─────────────────────────────────────────
  const goRoot = () => router.push("/master-gallery");
  const goBanners = () => router.push("/master-gallery?view=banners");
  const goJob = (id: string) => router.push(`/master-gallery?job=${id}`);
  const goAlbum = (id: string) =>
    jobId && router.push(`/master-gallery?job=${jobId}&album=${id}`);

  // ── Selection helpers ──────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };
  const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
  const anyBanner = selectedPhotos.some((p) => p.isBanner);
  const sourcePositionIds = Array.from(
    new Set(selectedPhotos.map((p) => p.workHistoryId)),
  );

  // ── Bulk handlers ──────────────────────────────────────────────
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.size} photo${selectedIds.size === 1 ? "" : "s"}? This removes them from each job's gallery too.`,
      )
    )
      return;
    deletePhotos.mutate(Array.from(selectedIds));
  };

  const handleBulkBanner = async () => {
    // Idempotent: if any selected is banner, set all to false; else all to true.
    const target = !anyBanner;
    await Promise.all(
      Array.from(selectedIds).map((id) =>
        savePhoto.mutateAsync({ id, patch: { isBanner: target } }),
      ),
    );
    clearSelection();
  };

  const handleMoveConfirm = (target: {
    positionId: string;
    albumId: string | null;
  }) => {
    return movePhotos.mutateAsync({
      ids: Array.from(selectedIds),
      sourcePositionIds,
      targetPositionId: target.positionId,
      targetAlbumId: target.albumId,
    });
  };

  // ── Render: breadcrumb ─────────────────────────────────────────
  const breadcrumb = (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
      <button
        onClick={goRoot}
        className="px-2 py-1 rounded-md hover:bg-muted flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <Home className="w-3.5 h-3.5" />
        Master Gallery
      </button>
      {view === BANNERS_VIEW && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="px-2 py-1 font-medium flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-yellow-500" />
            Banner Photos
          </span>
        </>
      )}
      {currentPosition && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          {currentAlbum || albumId === UNFILED_ALBUM_ID ? (
            <button
              onClick={() => goJob(currentPosition.id)}
              className="px-2 py-1 rounded-md hover:bg-muted flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Briefcase className="w-3.5 h-3.5" />
              {currentPosition.company}
            </button>
          ) : (
            <span className="px-2 py-1 font-medium flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              {currentPosition.company}
            </span>
          )}
        </>
      )}
      {currentAlbum && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="px-2 py-1 font-medium flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            {currentAlbum.name}
          </span>
        </>
      )}
      {albumId === UNFILED_ALBUM_ID && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="px-2 py-1 font-medium flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            Unfiled
          </span>
        </>
      )}
    </nav>
  );

  // ── Render: body ───────────────────────────────────────────────
  let body: React.ReactNode;

  if (treeLoading) {
    body = (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (!tree) {
    body = (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Could not load gallery.
      </div>
    );
  } else if (view === BANNERS_VIEW) {
    body = (
      <PhotoGrid
        photos={photos}
        selectedIds={selectedIds}
        selectionMode={selectionMode}
        showLocation
        onToggleSelect={toggleSelect}
        onOpenPhoto={(id) => setOpenPhotoId(id)}
      />
    );
  } else if (currentPosition && !albumId) {
    // Job folder view: show albums + unfiled bucket as sub-folders,
    // plus a flat photo grid of every photo in the job underneath.
    const unfiledCount =
      currentPosition.photoCount -
      currentPosition.albums.reduce((s, a) => s + a.photoCount, 0);
    body = (
      <div>
        <PositionFolderGrid
          position={currentPosition}
          unfiledCount={unfiledCount}
          onOpenAlbum={goAlbum}
        />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          All photos
        </h3>
        {photosLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <PhotoGrid
            photos={photos}
            selectedIds={selectedIds}
            selectionMode={selectionMode}
            onToggleSelect={toggleSelect}
            onOpenPhoto={(id) => setOpenPhotoId(id)}
          />
        )}
      </div>
    );
  } else if (currentPosition && albumId) {
    body = photosLoading ? (
      <div className="py-10 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    ) : (
      <PhotoGrid
        photos={photos}
        selectedIds={selectedIds}
        selectionMode={selectionMode}
        onToggleSelect={toggleSelect}
        onOpenPhoto={(id) => setOpenPhotoId(id)}
      />
    );
  } else {
    body = (
      <RootFolderGrid
        positions={tree.positions}
        bannerCount={tree.bannerCount}
        onOpenPosition={goJob}
        onOpenBanners={goBanners}
      />
    );
  }

  const openPhoto = openPhotoId
    ? photos.find((p) => p.id === openPhotoId) ?? null
    : null;

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h1 className="text-2xl font-bold">Master Gallery</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {tree && (
              <>
                <span>{tree.totalPhotos} photos</span>
                <span>·</span>
                <span>{tree.positions.length} jobs</span>
              </>
            )}
            {(view === BANNERS_VIEW || jobId) && (
              <button
                onClick={() => {
                  setSelectionMode((v) => !v);
                  if (selectionMode) setSelectedIds(new Set());
                }}
                className={`px-2 py-1 rounded-md text-xs ${
                  selectionMode
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted"
                }`}
              >
                {selectionMode ? "Done" : "Select"}
              </button>
            )}
          </div>
        </div>
        {breadcrumb}
      </header>

      <main className="pb-24">{body}</main>

      <BulkActionBar
        count={selectedIds.size}
        anyBanner={anyBanner}
        onClear={clearSelection}
        onMove={() => setMoveOpen(true)}
        onToggleBanner={handleBulkBanner}
        onDelete={handleBulkDelete}
      />

      <MoveDialog
        open={moveOpen}
        photoCount={selectedIds.size}
        positions={tree?.positions ?? []}
        currentPositionId={
          sourcePositionIds.length === 1 ? sourcePositionIds[0] : null
        }
        onClose={() => setMoveOpen(false)}
        onConfirm={handleMoveConfirm}
      />

      <PhotoDetailDrawer
        photo={openPhoto}
        onClose={() => setOpenPhotoId(null)}
        onSave={async (id, patch) => {
          await savePhoto.mutateAsync({ id, patch });
        }}
        onDelete={async (id) => {
          await deletePhotos.mutateAsync([id]);
        }}
      />
    </div>
  );
}
