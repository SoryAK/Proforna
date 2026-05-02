"use client";
/**
 * AnnotationViewer — read-only display of an image with its annotations,
 * including a guided "tour" mode that steps through annotations with a
 * configured sortOrder. Used in the owner gallery (read mode) and on the
 * public Interactive Resume.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, X, ListOrdered } from "lucide-react";
import { AnnotationOverlay, type Annotation } from "@/components/annotation-overlay";
import { sanitizeAnnotationHtml } from "@/lib/sanitize-html";

type Props = {
  imageUrl: string;
  imageRotation?: number;
  annotations: Annotation[];
  /** Auto-start in tour mode if there are tour annotations */
  autoTour?: boolean;
  /** Hide tour controls altogether (show pins/shapes only) */
  hideTourControls?: boolean;
  /** Annotation id to auto-select / jump to (e.g. from `?ann=` deep link) */
  initialAnnotationId?: string | null;
  /** Fired when an annotation becomes the active one (selected, hovered focus, or tour step). */
  onAnnotationView?: (annotationId: string) => void;
  /** Fired once when the tour reaches its last step. */
  onTourComplete?: () => void;
  className?: string;
};

export function AnnotationViewer({
  imageUrl,
  imageRotation = 0,
  annotations,
  autoTour = false,
  hideTourControls = false,
  initialAnnotationId = null,
  onAnnotationView,
  onTourComplete,
  className,
}: Props) {
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tourMode, setTourMode] = useState(false);
  const [tourIdx, setTourIdx] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const tour = useMemo(
    () =>
      annotations
        .filter((a) => a.sortOrder != null)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [annotations]
  );

  useEffect(() => {
    if (autoTour && tour.length > 0) setTourMode(true);
  }, [autoTour, tour.length]);

  // Deep link: select annotation by id, or jump tour into matching step.
  useEffect(() => {
    if (!initialAnnotationId) return;
    const tourPos = tour.findIndex((a) => a.id === initialAnnotationId);
    if (tourPos >= 0) {
      setTourMode(true);
      setTourIdx(tourPos);
    } else if (annotations.some((a) => a.id === initialAnnotationId)) {
      setSelectedId(initialAnnotationId);
    }
  }, [initialAnnotationId, annotations, tour]);

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

  // Autoplay tour
  useEffect(() => {
    if (!autoplay || !tourMode || tour.length === 0) return;
    const t = setTimeout(() => {
      setTourIdx((i) => (i + 1) % tour.length);
    }, 4500);
    return () => clearTimeout(t);
  }, [autoplay, tourMode, tour.length, tourIdx]);

  const tourActive = tourMode && tour.length > 0 ? tour[tourIdx] : null;
  const activeNote = tourActive ?? annotations.find((a) => a.id === selectedId) ?? null;
  const highlightId = tourActive?.id ?? null;

  // Fire analytics: annot_view per active note (deduped) and tour_complete on last step.
  const lastViewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeNote && activeNote.id !== lastViewedRef.current) {
      lastViewedRef.current = activeNote.id;
      onAnnotationView?.(activeNote.id);
    }
  }, [activeNote, onAnnotationView]);
  const tourCompletedRef = useRef(false);
  useEffect(() => {
    if (!tourMode) { tourCompletedRef.current = false; return; }
    if (tour.length > 0 && tourIdx === tour.length - 1 && !tourCompletedRef.current) {
      tourCompletedRef.current = true;
      onTourComplete?.();
    }
  }, [tourMode, tourIdx, tour.length, onTourComplete]);

  return (
    <div className={`relative w-full ${className ?? ""}`}>
      <div className="relative inline-block w-full">
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
          style={{ transform: imageRotation ? `rotate(${imageRotation}deg)` : undefined }}
          className="block w-full h-auto"
        />
        {imgSize.w > 0 && (
          <AnnotationOverlay
            annotations={annotations}
            width={imgSize.w}
            height={imgSize.h}
            selectedId={selectedId}
            hoveredId={hoveredId}
            highlightedId={highlightId}
            onSelect={(id) => setSelectedId(id)}
            onHover={setHoveredId}
          />
        )}
      </div>

      {/* Tour controls */}
      {!hideTourControls && tour.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full bg-black/80 backdrop-blur px-2 py-1 text-white shadow-lg">
          {!tourMode ? (
            <button
              type="button"
              onClick={() => { setTourMode(true); setTourIdx(0); }}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium hover:bg-white/10 rounded-full"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              Start tour ({tour.length})
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setTourIdx((i) => (i - 1 + tour.length) % tour.length)}
                className="p-1 hover:bg-white/10 rounded-full"
                title="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium w-12 text-center">
                {tourIdx + 1} / {tour.length}
              </span>
              <button
                type="button"
                onClick={() => setTourIdx((i) => (i + 1) % tour.length)}
                className="p-1 hover:bg-white/10 rounded-full"
                title="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setAutoplay((v) => !v)}
                className="p-1 hover:bg-white/10 rounded-full"
                title={autoplay ? "Pause" : "Autoplay"}
              >
                {autoplay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => { setTourMode(false); setAutoplay(false); }}
                className="p-1 hover:bg-white/10 rounded-full"
                title="Exit tour"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Active note panel */}
      {activeNote && (activeNote.title || activeNote.body) && (
        <div className="absolute bottom-3 right-3 z-30 max-w-sm rounded-lg border bg-background/95 backdrop-blur shadow-xl p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            {activeNote.title && (
              <h4 className="text-sm font-semibold leading-tight" style={{ color: activeNote.color }}>
                {activeNote.title}
              </h4>
            )}
            {!tourActive && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-muted-foreground hover:text-foreground -mt-1 -mr-1"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {activeNote.body && (
            <div
              className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 text-foreground/90"
              dangerouslySetInnerHTML={{ __html: sanitizeAnnotationHtml(activeNote.body) }}
            />
          )}
        </div>
      )}
    </div>
  );
}
