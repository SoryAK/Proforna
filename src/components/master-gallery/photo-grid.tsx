"use client";

import Image from "next/image";
import { Star, Lock, Heart, Check } from "lucide-react";
import type { MasterGalleryPhoto } from "./types";

interface PhotoGridProps {
  photos: MasterGalleryPhoto[];
  selectedIds: Set<string>;
  selectionMode: boolean;
  // showLocation = render company/role chip on each tile (used in the
  // Banner Photos virtual folder and search results, where photos come
  // from many jobs).
  showLocation?: boolean;
  onToggleSelect: (id: string) => void;
  onOpenPhoto: (id: string) => void;
}

export function PhotoGrid({
  photos,
  selectedIds,
  selectionMode,
  showLocation,
  onToggleSelect,
  onOpenPhoto,
}: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No photos in this folder.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
      {photos.map((p) => {
        const selected = selectedIds.has(p.id);
        return (
          <div
            key={p.id}
            className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-muted ${
              selected
                ? "border-primary ring-2 ring-primary/30"
                : "border-transparent hover:border-border"
            }`}
            onClick={(e) => {
              // Shift/cmd or active selection-mode → toggle. Plain click → open.
              if (selectionMode || e.shiftKey || e.metaKey || e.ctrlKey) {
                onToggleSelect(p.id);
              } else {
                onOpenPhoto(p.id);
              }
            }}
          >
            <Image
              src={p.filePath}
              alt={p.caption ?? p.fileName}
              fill
              // Skip optimizer: these are locally-hosted user uploads under
              // /public/uploads. Next 16 + Turbopack's image loader returns
              // `null` for some of these paths ("isn't a valid image …
              // received null"), and at thumbnail size optimization gains
              // are negligible.
              unoptimized
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 200px"
              style={{
                transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
              }}
            />

            {/* Status badges — top-left */}
            <div className="absolute top-1 left-1 flex flex-col gap-0.5 pointer-events-none">
              {p.isBanner && (
                <span className="bg-yellow-500 text-black p-1 rounded-full">
                  <Star className="w-2.5 h-2.5 fill-current" />
                </span>
              )}
              {p.isCover && (
                <span className="bg-blue-500 text-white p-1 rounded-full">
                  <Heart className="w-2.5 h-2.5 fill-current" />
                </span>
              )}
              {p.isPrivate && (
                <span className="bg-zinc-800 text-white p-1 rounded-full">
                  <Lock className="w-2.5 h-2.5" />
                </span>
              )}
            </div>

            {/* Selection checkbox — top-right.
                In selection mode it's always visible; otherwise it
                appears on hover so the grid stays clean. */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(p.id);
              }}
              className={`absolute top-1 right-1 w-6 h-6 rounded-md flex items-center justify-center transition-opacity ${
                selected
                  ? "bg-primary text-primary-foreground opacity-100"
                  : "bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70"
              }`}
              aria-label={selected ? "Deselect" : "Select"}
            >
              {selected ? <Check className="w-4 h-4" /> : <span className="w-3 h-3 rounded-sm border border-white" />}
            </button>

            {showLocation && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pointer-events-none">
                <div className="text-[10px] text-white/90 truncate font-medium">
                  {p.workHistory.company}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
