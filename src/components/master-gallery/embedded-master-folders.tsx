"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Briefcase, Loader2, ExternalLink, Images } from "lucide-react";
import type { MasterGalleryTree } from "./types";

interface EmbeddedMasterFoldersProps {
  // Called when the user clicks a job folder. Caller is expected to
  // resolve lat/lng from its own `items` list and call its existing
  // focus mechanism.
  onSelectJob: (positionId: string) => void;
}

// Compact folder grid intended to live inside the in-map slide-in
// gallery panel (~360 px wide). Excludes the cross-job "Banner Photos"
// virtual folder (v1 design decision — that view only exists on the
// full /master-gallery page) so the embedded model stays "1 folder = 1 job".
export function EmbeddedMasterFolders({ onSelectJob }: EmbeddedMasterFoldersProps) {
  const { data, isLoading } = useQuery<MasterGalleryTree>({
    queryKey: ["master-gallery"],
    queryFn: async () => {
      const r = await fetch("/api/master-gallery");
      if (!r.ok) throw new Error("Failed to load gallery");
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const positions = data?.positions ?? [];

  if (positions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-muted-foreground">
        <Images className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-xs">No photos yet.</p>
        <p className="text-[10px] mt-1">
          Upload photos from any job and they&apos;ll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="grid grid-cols-3 gap-2">
        {positions.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelectJob(p.id)}
            className="group text-left flex flex-col rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all overflow-hidden"
          >
            <div className="relative aspect-[4/3] bg-muted">
              {p.coverImage ? (
                <Image
                  src={p.coverImage}
                  alt={p.company}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="180px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Briefcase className="w-8 h-8 text-muted-foreground/30" />
                </div>
              )}
              <span className="absolute top-1 right-1 bg-black/60 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                {p.photoCount}
              </span>
            </div>
            <div className="p-2">
              <div className="font-medium text-[11px] truncate">
                {p.company} Gallery
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {p.role}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer link out to the full Master Gallery page (where bulk
          ops, banner-photos folder, cross-job move, etc. live). */}
      <Link
        href="/master-gallery"
        className="mt-3 mx-1 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground py-2 rounded-md hover:bg-muted transition-colors"
      >
        Open full Master Gallery
        <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}
