"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { Camera, Boxes, Share2, ChevronLeft, ChevronRight, X } from "lucide-react";

type Photo = {
  id: string;
  filePath: string;
  caption: string | null;
  isCover: boolean;
  focalX: number;
  focalY: number;
  zoom: number;
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
  condition: string;
  proficiency: number | null;
  purchasePrice: number | null;
  currentValue: number | null;
  location: string | null;
  notes: string | null;
  tags: string[];
  photos: Photo[];
};

type ShareInfo = {
  label: string | null;
  scope: string;
  createdAt: string;
  expiresAt: string | null;
  ownerName: string | null;
  ownerImage: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  hardware: "Hardware",
  software: "Software",
  vehicle: "Vehicle",
  safety: "Safety",
  tool: "Tool",
  instrument: "Instrument",
  other: "Other",
};

function PhotoView({ p, fit = "cover", onClick }: { p: Photo; fit?: "cover" | "contain"; onClick?: () => void }) {
  const r = p.rotation ?? 0;
  const sx = p.flipH ? -1 : 1;
  const sy = p.flipV ? -1 : 1;
  const fx = p.focalX ?? 50;
  const fy = p.focalY ?? 50;
  const z = p.zoom ?? 1;
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ transform: `rotate(${r}deg) scaleX(${sx}) scaleY(${sy})`, transformOrigin: "center center" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={p.filePath}
        alt={p.caption ?? ""}
        onClick={onClick}
        draggable={false}
        className={`w-full h-full ${fit === "contain" ? "object-contain" : "object-cover cursor-zoom-in"}`}
        style={{ objectPosition: `${fx}% ${fy}%`, transform: `scale(${z})`, transformOrigin: `${fx}% ${fy}%` }}
      />
    </div>
  );
}

export default function SharedInventoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ item: Item; index: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/personal-equipment/shares/public/${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (res.status === 410) setError("This share link has expired.");
          else if (res.status === 404) setError("This share link is invalid or has been revoked.");
          else setError("Failed to load shared inventory.");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setShare(data.share);
        setItems(data.items);
      } catch {
        if (!cancelled) setError("Failed to load shared inventory.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Keyboard navigation for the photo lightbox.
  // Declared above the early-returns below so the hook order stays stable
  // regardless of share/items/error state.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!lightbox) return;
      if (e.key === "Escape") {
        setLightbox(null);
      } else if (e.key === "ArrowRight") {
        const n = lightbox.item.photos.length;
        setLightbox({ item: lightbox.item, index: (lightbox.index + 1) % n });
      } else if (e.key === "ArrowLeft") {
        const n = lightbox.item.photos.length;
        setLightbox({ item: lightbox.item, index: (lightbox.index - 1 + n) % n });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <Share2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-xl font-semibold">{error}</h1>
        </div>
      </div>
    );
  }

  if (!share || !items) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-muted-foreground text-sm">Loading…</div>
    );
  }

  const lbItem = lightbox?.item;
  const lbPhoto = lbItem?.photos[lightbox!.index];
  function next() {
    if (!lightbox) return;
    const n = lightbox.item.photos.length;
    setLightbox({ item: lightbox.item, index: (lightbox.index + 1) % n });
  }
  function prev() {
    if (!lightbox) return;
    const n = lightbox.item.photos.length;
    setLightbox({ item: lightbox.item, index: (lightbox.index - 1 + n) % n });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Boxes className="h-6 w-6 text-cyan-500" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {share.ownerName ? `${share.ownerName}'s Inventory` : "Shared Inventory"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {items.length} item{items.length === 1 ? "" : "s"}
              {share.label ? ` · ${share.label}` : ""}
              {share.expiresAt ? ` · expires ${new Date(share.expiresAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground">
            <Share2 className="h-3 w-3" /> Read-only share
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">No items in this share.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => {
              const cover = item.photos.find((p) => p.isCover) ?? item.photos[0];
              const value = item.currentValue ?? item.purchasePrice;
              return (
                <div key={item.id} className="rounded-lg border overflow-hidden bg-card">
                  <div className="relative aspect-square bg-muted">
                    {cover ? (
                      <PhotoView p={cover} onClick={() => setLightbox({ item, index: 0 })} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
                        <Camera className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[item.manufacturer, item.model].filter(Boolean).join(" ") || CATEGORY_LABELS[item.category] || item.category}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="capitalize">{item.condition}</span>
                      {value != null && (
                        <span className="tabular-nums font-medium text-foreground">
                          ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                    {item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {item.tags.slice(0, 4).map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {lbItem && lbPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
            className="absolute top-3 right-3 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {lbItem.photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <div className="max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lbPhoto.filePath}
              alt={lbPhoto.caption ?? lbItem.name}
              className="max-w-[92vw] max-h-[78vh] object-contain rounded shadow-2xl"
              style={{
                transform: `rotate(${lbPhoto.rotation ?? 0}deg) scaleX(${lbPhoto.flipH ? -1 : 1}) scaleY(${lbPhoto.flipV ? -1 : 1})`,
              }}
            />
            <div className="text-white text-center">
              <div className="text-sm font-medium">{lbItem.name}</div>
              {lbPhoto.caption && <div className="text-xs text-white/70 italic">{lbPhoto.caption}</div>}
              <div className="text-[11px] text-white/60">
                {lightbox.index + 1} / {lbItem.photos.length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
