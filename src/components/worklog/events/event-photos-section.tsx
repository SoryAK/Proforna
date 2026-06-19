/**
 * EventPhotosSection — photo gallery for the inline event editor
 * (companion to ADR-0034). Renders in two modes:
 *
 *   • existing event (`eventId !== null`)
 *       useQuery against `eventPhotosUrl(...)`. Upload/delete mutate
 *       same endpoint and invalidate `["event-photos", eventId]` +
 *       `["career-events", "all"]`.
 *
 *   • draft / new event (`eventId === null`)
 *       Pure controlled mode. Files held by parent via `pendingFiles`
 *       + `onPendingChange`. Parent flushes them via POST after the
 *       initial create resolves (queue-and-flush — see NewEventEditor).
 *       Thumbnails render through `URL.createObjectURL`.
 *
 * The free-floating vs anchored URL split lives in `event-patch-url.ts`
 * (parallel to ADR-0027 Q2=B). Focal point + zoom/rotation/flip are
 * read-only display here — editing those is parked (ADR Phase 3).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Images, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eventPhotosUrl } from "./event-patch-url";

// ── Constants — keep in sync with API route validators ──────────────
const MAX_PHOTOS = 12;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

// ── Types ───────────────────────────────────────────────────────────

interface EventPhoto {
  id: string;
  filePath: string;
  fileName: string;
  caption: string | null;
  sortOrder: number;
  focalX: number | null;
  focalY: number | null;
  zoom: number | null;
  rotation: number | null;
  flipH: boolean | null;
  flipV: boolean | null;
}

interface EventPhotosSectionProps {
  /** When null, the editor is still a draft and photos queue locally. */
  eventId: string | null;
  workHistoryId: string | null;
  /** Draft-mode controlled queue. Ignored when eventId !== null. */
  pendingFiles?: File[];
  onPendingChange?: (files: File[]) => void;
  disabled?: boolean;
}

// ── Component ───────────────────────────────────────────────────────

export function EventPhotosSection({
  eventId,
  workHistoryId,
  pendingFiles = [],
  onPendingChange,
  disabled = false,
}: EventPhotosSectionProps) {
  if (eventId === null) {
    return (
      <DraftPhotosGallery
        pendingFiles={pendingFiles}
        onPendingChange={onPendingChange ?? (() => {})}
        disabled={disabled}
      />
    );
  }
  return (
    <PersistedPhotosGallery
      eventId={eventId}
      workHistoryId={workHistoryId}
      disabled={disabled}
    />
  );
}

// ── Draft (queue) mode ──────────────────────────────────────────────

function DraftPhotosGallery({
  pendingFiles,
  onPendingChange,
  disabled,
}: {
  pendingFiles: File[];
  onPendingChange: (files: File[]) => void;
  disabled: boolean;
}) {
  // Object URLs are lifecycle-bound; revoke on unmount or queue change.
  const previews = useMemo(
    () => pendingFiles.map((f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size })),
    [pendingFiles],
  );
  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.url);
    };
  }, [previews]);

  const slotsLeft = MAX_PHOTOS - pendingFiles.length;

  const handlePick = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const incoming = Array.from(files);
      const accepted: File[] = [];
      let rejectedType = 0;
      let rejectedSize = 0;
      for (const f of incoming) {
        if (accepted.length >= slotsLeft) break;
        if (!ALLOWED_TYPES.includes(f.type as (typeof ALLOWED_TYPES)[number])) {
          rejectedType++;
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          rejectedSize++;
          continue;
        }
        accepted.push(f);
      }
      if (rejectedType > 0) toast.error(`${rejectedType} file${rejectedType === 1 ? "" : "s"} rejected (unsupported type)`);
      if (rejectedSize > 0) toast.error(`${rejectedSize} file${rejectedSize === 1 ? "" : "s"} rejected (> 8MB)`);
      if (incoming.length > slotsLeft) toast.info(`Max ${MAX_PHOTOS} photos per event — queue full`);
      if (accepted.length > 0) onPendingChange([...pendingFiles, ...accepted]);
    },
    [pendingFiles, onPendingChange, slotsLeft],
  );

  const removeAt = useCallback(
    (index: number) => {
      onPendingChange(pendingFiles.filter((_, i) => i !== index));
    },
    [pendingFiles, onPendingChange],
  );

  return (
    <GalleryShell
      disabled={disabled}
      countLabel={`${pendingFiles.length} / ${MAX_PHOTOS} queued`}
      onFilesPicked={handlePick}
      slotsLeft={slotsLeft}
    >
      {previews.length === 0 ? (
        <EmptyHint label="Photos will upload after the event is saved." />
      ) : (
        <ThumbGrid>
          {previews.map((p, i) => (
            <Thumb
              key={`${p.name}-${i}`}
              src={p.url}
              alt={p.name}
              pending
              disabled={disabled}
              onRemove={() => removeAt(i)}
            />
          ))}
        </ThumbGrid>
      )}
    </GalleryShell>
  );
}

// ── Persisted (server-backed) mode ──────────────────────────────────

function PersistedPhotosGallery({
  eventId,
  workHistoryId,
  disabled,
}: {
  eventId: string;
  workHistoryId: string | null;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const photosUrl = useMemo(
    () => eventPhotosUrl({ id: eventId, workHistoryId }),
    [eventId, workHistoryId],
  );

  const { data, isLoading, isError } = useQuery<EventPhoto[]>({
    queryKey: ["event-photos", eventId],
    queryFn: async () => {
      const res = await fetch(photosUrl);
      if (!res.ok) throw new Error(`GET photos failed (${res.status})`);
      return (await res.json()) as EventPhoto[];
    },
  });

  const photos = data ?? [];
  const slotsLeft = MAX_PHOTOS - photos.length;

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      // Sequential to stay under per-event POST contention (max 12 anyway).
      let failures = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(photosUrl, { method: "POST", body: fd });
        if (!res.ok) failures++;
      }
      if (failures > 0) throw new Error(`${failures} upload${failures === 1 ? "" : "s"} failed`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-photos", eventId] });
      qc.invalidateQueries({ queryKey: ["career-events", "all"] });
    },
    onError: (e: Error) => toast.error(e.message || "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: async (photoId: string) => {
      const res = await fetch(`${photosUrl}?photoId=${encodeURIComponent(photoId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`DELETE failed (${res.status})`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-photos", eventId] });
      qc.invalidateQueries({ queryKey: ["career-events", "all"] });
    },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });

  const handlePick = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const incoming = Array.from(files);
      const accepted: File[] = [];
      let rejectedType = 0;
      let rejectedSize = 0;
      for (const f of incoming) {
        if (accepted.length >= slotsLeft) break;
        if (!ALLOWED_TYPES.includes(f.type as (typeof ALLOWED_TYPES)[number])) {
          rejectedType++;
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          rejectedSize++;
          continue;
        }
        accepted.push(f);
      }
      if (rejectedType > 0) toast.error(`${rejectedType} file${rejectedType === 1 ? "" : "s"} rejected (unsupported type)`);
      if (rejectedSize > 0) toast.error(`${rejectedSize} file${rejectedSize === 1 ? "" : "s"} rejected (> 8MB)`);
      if (incoming.length > slotsLeft) toast.info(`Max ${MAX_PHOTOS} photos per event`);
      if (accepted.length > 0) upload.mutate(accepted);
    },
    [slotsLeft, upload],
  );

  const busy = disabled || upload.isPending || remove.isPending;

  return (
    <GalleryShell
      disabled={busy}
      countLabel={`${photos.length} / ${MAX_PHOTOS}`}
      onFilesPicked={handlePick}
      slotsLeft={slotsLeft}
      uploading={upload.isPending}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading photos…
        </div>
      ) : isError ? (
        <EmptyHint label="Couldn't load photos. Refresh the page to retry." tone="error" />
      ) : photos.length === 0 ? (
        <EmptyHint label="No photos yet. Add a few — they show on the event card, map, and reader." />
      ) : (
        <ThumbGrid>
          {photos.map((p) => (
            <Thumb
              key={p.id}
              src={p.filePath}
              alt={p.caption ?? p.fileName}
              focalX={p.focalX}
              focalY={p.focalY}
              zoom={p.zoom}
              rotation={p.rotation}
              flipH={p.flipH}
              flipV={p.flipV}
              disabled={busy}
              onRemove={() => remove.mutate(p.id)}
            />
          ))}
        </ThumbGrid>
      )}
    </GalleryShell>
  );
}

// ── Shared UI parts ─────────────────────────────────────────────────

function GalleryShell({
  countLabel,
  slotsLeft,
  onFilesPicked,
  disabled,
  uploading,
  children,
}: {
  countLabel: string;
  slotsLeft: number;
  onFilesPicked: (files: FileList | null) => void;
  disabled: boolean;
  uploading?: boolean;
  children: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Images className="h-3 w-3 text-amber-500" />
          <span>Photos</span>
          <span className="ml-1 normal-case tracking-normal font-normal text-muted-foreground/70">
            {countLabel}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px] gap-1"
          disabled={disabled || slotsLeft <= 0}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Add
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            onFilesPicked(e.target.files);
            // Reset so picking the same file twice re-fires onChange.
            if (e.target.value) e.target.value = "";
          }}
        />
      </div>
      {children}
    </div>
  );
}

function ThumbGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
      {children}
    </div>
  );
}

function Thumb({
  src,
  alt,
  focalX,
  focalY,
  zoom,
  rotation,
  flipH,
  flipV,
  pending,
  disabled,
  onRemove,
}: {
  src: string;
  alt: string;
  focalX?: number | null;
  focalY?: number | null;
  zoom?: number | null;
  rotation?: number | null;
  flipH?: boolean | null;
  flipV?: boolean | null;
  pending?: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const fx = focalX ?? 50;
  const fy = focalY ?? 50;
  const z = zoom ?? 1;
  const rot = rotation ?? 0;
  const scaleX = (flipH ? -1 : 1) * z;
  const scaleY = (flipV ? -1 : 1) * z;
  const hasTransform = z !== 1 || rot !== 0 || flipH || flipV;
  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted/30">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 1280px) 160px, (min-width: 640px) 33vw, 50vw"
        // Always unoptimized — Next.js 16 + Turbopack's image optimizer
        // returns 400 for /public/uploads/* paths even when the file exists
        // on disk (documented gotcha). Thumbnails this small don't benefit
        // from optimization anyway. The `pending` param uses URL.createObjectURL
        // blobs which can't be optimized either.
        unoptimized
        className="object-cover"
        style={{
          objectPosition: `${fx}% ${fy}%`,
          ...(hasTransform
            ? {
                transformOrigin: `${fx}% ${fy}%`,
                transform: `scale(${scaleX}, ${scaleY}) rotate(${rot}deg)`,
              }
            : null),
        }}
      />
      {pending && (
        <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-sm bg-amber-500/90 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          Pending
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className={cn(
          "absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full",
          "bg-background/85 text-muted-foreground shadow-sm transition-opacity",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          "hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
          disabled && "cursor-not-allowed opacity-30",
        )}
        aria-label={pending ? "Remove from queue" : "Delete photo"}
        title={pending ? "Remove from queue" : "Delete photo"}
      >
        {pending ? <X className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
      </button>
    </div>
  );
}

function EmptyHint({ label, tone = "muted" }: { label: string; tone?: "muted" | "error" }) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed px-3 py-4 text-center text-[11px]",
        tone === "error"
          ? "border-destructive/40 text-destructive/80"
          : "border-border/60 text-muted-foreground",
      )}
    >
      {label}
    </div>
  );
}
