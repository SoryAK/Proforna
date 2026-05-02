"use client";
/**
 * AnnotationCompare — side-by-side photo + annotations overlay viewer.
 * Read-only: pick two photos from the same gallery and inspect their pins
 * and shapes simultaneously. Useful for before/after, multi-angle, or
 * comparing how the same scene was annotated by different sessions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, ArrowLeftRight } from "lucide-react";
import { AnnotationOverlay, type Annotation } from "@/components/annotation-overlay";

type SiblingPhoto = {
  id: string;
  filePath: string;
  fileName: string;
  rotation?: number | null;
  caption?: string | null;
};

type Props = {
  /** Photo currently open in the editor — fills the left pane initially. */
  currentPhoto: SiblingPhoto;
  /** All sibling photos in the same gallery (incl. currentPhoto). */
  siblingPhotos: SiblingPhoto[];
  onClose: () => void;
};

function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

function ComparePane({
  photo,
  options,
  onPick,
  side,
}: {
  photo: SiblingPhoto | null;
  options: SiblingPhoto[];
  onPick: (id: string) => void;
  side: "left" | "right";
}) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  const measure = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setImgSize({ w: Math.round(r.width), h: Math.round(r.height) });
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (imgRef.current) ro.observe(imgRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure, photo?.id]);

  const reload = useCallback(async () => {
    if (!photo) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery/annotations?photoId=${encodeURIComponent(photo.id)}`);
      if (!res.ok) throw new Error(await res.text());
      const items: Annotation[] = (await res.json()).map((a: Annotation & { tags?: unknown }) => ({
        ...a,
        tags: parseTags(a.tags),
      }));
      setAnnotations(items);
    } catch (e) {
      toast.error(`Compare load failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [photo]);

  useEffect(() => { reload(); }, [reload]);

  const tourSorted = useMemo(
    () => annotations.filter((a) => a.sortOrder != null).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [annotations],
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-black/60">
      <div className="flex items-center gap-2 px-3 py-2 bg-background/90 border-b">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{side}</span>
        <select
          value={photo?.id ?? ""}
          onChange={(e) => onPick(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded border bg-background"
        >
          <option value="" disabled>Pick a photo…</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>{p.fileName}</option>
          ))}
        </select>
        {loading && <span className="text-[10px] text-muted-foreground">Loading…</span>}
        <span className="text-[10px] text-muted-foreground tabular-nums">{annotations.length} annot</span>
      </div>
      <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
        {photo ? (
          <div className="relative max-h-full max-w-full" style={{ transform: `rotate(${photo.rotation ?? 0}deg)`, transformOrigin: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={photo.filePath}
              alt={photo.fileName}
              onLoad={measure}
              className="block max-h-[calc(100vh-180px)] max-w-full object-contain"
            />
            <div className="absolute inset-0 pointer-events-none">
              <AnnotationOverlay annotations={annotations} width={imgSize.w} height={imgSize.h} />
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Pick a photo above to compare.</div>
        )}
      </div>
      {tourSorted.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 bg-background/90 border-t scrollbar-thin">
          {tourSorted.map((a) => (
            <span
              key={a.id}
              className="shrink-0 px-1.5 py-0.5 text-[10px] rounded-full bg-muted border tabular-nums"
              title={a.title ?? a.id}
            >
              #{(a.sortOrder ?? 0) + 1} {a.title ? a.title.slice(0, 18) : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnnotationCompare({ currentPhoto, siblingPhotos, onClose }: Props) {
  const [leftId, setLeftId] = useState<string>(currentPhoto.id);
  const initialRight = siblingPhotos.find((p) => p.id !== currentPhoto.id) ?? null;
  const [rightId, setRightId] = useState<string>(initialRight?.id ?? "");

  const left = siblingPhotos.find((p) => p.id === leftId) ?? null;
  const right = siblingPhotos.find((p) => p.id === rightId) ?? null;

  const swap = () => { setLeftId(rightId); setRightId(leftId); };

  if (typeof document === "undefined") return null;

  const overlay = (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Compare annotations</h2>
          <span className="text-[10px] text-muted-foreground">Pick two photos to view their annotations side-by-side</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={swap}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border hover:bg-muted"
            title="Swap left and right"
          >
            <ArrowLeftRight className="h-3 w-3" /> Swap
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-muted"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex">
        <ComparePane side="left" photo={left} options={siblingPhotos} onPick={setLeftId} />
        <div className="w-px bg-border" />
        <ComparePane side="right" photo={right} options={siblingPhotos} onPick={setRightId} />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
