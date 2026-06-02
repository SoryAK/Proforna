"use client";

import Image from "next/image";
import { Briefcase, Star, FolderOpen, Folder, Image as ImageIcon } from "lucide-react";
import type { MasterGalleryPosition, MasterGalleryAlbum } from "./types";

interface JobFolderProps {
  position: MasterGalleryPosition;
  onOpen: (positionId: string) => void;
}

function JobFolder({ position, onOpen }: JobFolderProps) {
  const dateStr = position.startDate
    ? `${new Date(position.startDate).getFullYear()}${
        position.endDate
          ? "–" + new Date(position.endDate).getFullYear()
          : "–present"
      }`
    : "";

  return (
    <button
      onClick={() => onOpen(position.id)}
      className="group text-left flex flex-col rounded-xl border border-border bg-card hover:border-primary hover:shadow-md transition-all overflow-hidden"
    >
      <div className="relative aspect-[4/3] bg-muted">
        {position.coverImage ? (
          <Image
            src={position.coverImage}
            alt={position.company}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 50vw, 240px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Briefcase className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          {position.bannerCount > 0 && (
            <span className="bg-yellow-500 text-black text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-current" />
              {position.bannerCount}
            </span>
          )}
          <span className="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full backdrop-blur-sm">
            {position.photoCount}
          </span>
        </div>
      </div>
      <div className="p-3">
        <div className="font-medium text-sm truncate">{position.company} Gallery</div>
        <div className="text-xs text-muted-foreground truncate">
          {position.role}
        </div>
        {dateStr && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {dateStr}
          </div>
        )}
      </div>
    </button>
  );
}

interface AlbumFolderProps {
  album: MasterGalleryAlbum | { id: string; name: string; photoCount: number; coverPhoto?: string | null; isVirtual?: boolean };
  onOpen: (albumId: string) => void;
}

function AlbumFolder({ album, onOpen }: AlbumFolderProps) {
  return (
    <button
      onClick={() => onOpen(album.id)}
      className="group text-left flex flex-col rounded-xl border border-border bg-card hover:border-primary hover:shadow-md transition-all overflow-hidden"
    >
      <div className="relative aspect-[4/3] bg-muted">
        {album.coverPhoto ? (
          <Image
            src={album.coverPhoto}
            alt={album.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 50vw, 240px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Folder className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
        <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full backdrop-blur-sm">
          {album.photoCount}
        </span>
      </div>
      <div className="p-3 flex items-start gap-2">
        <FolderOpen className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{album.name}</div>
          <div className="text-xs text-muted-foreground">
            {album.photoCount} {album.photoCount === 1 ? "photo" : "photos"}
          </div>
        </div>
      </div>
    </button>
  );
}

interface RootFolderGridProps {
  positions: MasterGalleryPosition[];
  bannerCount: number;
  onOpenPosition: (positionId: string) => void;
  onOpenBanners: () => void;
}

export function RootFolderGrid({
  positions,
  bannerCount,
  onOpenPosition,
  onOpenBanners,
}: RootFolderGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {bannerCount > 0 && (
        <button
          onClick={onOpenBanners}
          className="group text-left flex flex-col rounded-xl border-2 border-yellow-500/50 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 hover:border-yellow-500 hover:shadow-md transition-all overflow-hidden"
        >
          <div className="relative aspect-[4/3] flex items-center justify-center">
            <Star className="w-16 h-16 text-yellow-500 fill-yellow-500/30 group-hover:scale-110 transition-transform" />
          </div>
          <div className="p-3">
            <div className="font-medium text-sm">Banner Photos</div>
            <div className="text-xs text-muted-foreground">
              {bannerCount} across all jobs
            </div>
          </div>
        </button>
      )}
      {positions.map((p) => (
        <JobFolder key={p.id} position={p} onOpen={onOpenPosition} />
      ))}
      {positions.length === 0 && bannerCount === 0 && (
        <div className="col-span-full py-16 text-center text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No photos yet.</p>
          <p className="text-xs mt-1">
            Upload photos from any job&apos;s gallery and they&apos;ll appear
            here.
          </p>
        </div>
      )}
    </div>
  );
}

interface PositionFolderGridProps {
  position: MasterGalleryPosition;
  unfiledCount: number;
  onOpenAlbum: (albumId: string) => void;
}

export function PositionFolderGrid({
  position,
  unfiledCount,
  onOpenAlbum,
}: PositionFolderGridProps) {
  const showUnfiled = unfiledCount > 0;
  if (position.albums.length === 0 && !showUnfiled) return null;
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Albums
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {showUnfiled && (
          <AlbumFolder
            album={{
              id: "__unfiled__",
              name: "Unfiled",
              photoCount: unfiledCount,
              coverPhoto: null,
              isVirtual: true,
            }}
            onOpen={onOpenAlbum}
          />
        )}
        {position.albums.map((a) => (
          <AlbumFolder key={a.id} album={a} onOpen={onOpenAlbum} />
        ))}
      </div>
    </div>
  );
}
