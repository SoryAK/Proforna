"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, Star, Heart, Lock, Trash2, Save, Briefcase } from "lucide-react";
import type { MasterGalleryPhoto } from "./types";

interface PhotoDetailDrawerProps {
  photo: MasterGalleryPhoto | null;
  onClose: () => void;
  onSave: (
    id: string,
    patch: {
      caption?: string;
      isBanner?: boolean;
      isCover?: boolean;
      isPrivate?: boolean;
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PhotoDetailDrawer({
  photo,
  onClose,
  onSave,
  onDelete,
}: PhotoDetailDrawerProps) {
  // Local form state — reset whenever a different photo is opened.
  const [caption, setCaption] = useState("");
  const [isBanner, setIsBanner] = useState(false);
  const [isCover, setIsCover] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (photo) {
      setCaption(photo.caption ?? "");
      setIsBanner(photo.isBanner);
      setIsCover(photo.isCover);
      setIsPrivate(photo.isPrivate);
    }
  }, [photo]);

  if (!photo) return null;

  const dirty =
    (caption ?? "") !== (photo.caption ?? "") ||
    isBanner !== photo.isBanner ||
    isCover !== photo.isCover ||
    isPrivate !== photo.isPrivate;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(photo.id, { caption, isBanner, isCover, isPrivate });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this photo? This also removes it from the job's gallery.")) return;
    setSaving(true);
    try {
      await onDelete(photo.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex"
      onClick={onClose}
    >
      {/* Photo viewer (left, fills) */}
      <div
        className="flex-1 flex items-center justify-center p-4 min-w-0"
        onClick={onClose}
      >
        <div
          className="relative max-w-full max-h-full"
          onClick={(e) => e.stopPropagation()}
        >
          <Image
            src={photo.filePath}
            alt={photo.caption ?? photo.fileName}
            width={1600}
            height={1200}
            className="max-w-[80vw] max-h-[90vh] w-auto h-auto object-contain rounded-lg"
            style={{
              transform: photo.rotation
                ? `rotate(${photo.rotation}deg)`
                : undefined,
            }}
            priority
          />
        </div>
      </div>

      {/* Edit panel (right, fixed width) */}
      <aside
        className="w-[340px] bg-background border-l border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-3 border-b border-border">
          <h2 className="font-semibold text-sm">Photo details</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Briefcase className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-foreground">
                {photo.workHistory.company}
              </div>
              <div>{photo.workHistory.role}</div>
              {photo.album && (
                <div className="mt-1">Album: {photo.album.name}</div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Add a caption…"
              className="w-full text-sm rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between text-sm cursor-pointer">
              <span className="flex items-center gap-2">
                <Star
                  className={`w-4 h-4 ${isBanner ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`}
                />
                <span>Use in banner slideshow</span>
              </span>
              <input
                type="checkbox"
                checked={isBanner}
                onChange={(e) => setIsBanner(e.target.checked)}
                className="accent-primary"
              />
            </label>
            <label className="flex items-center justify-between text-sm cursor-pointer">
              <span className="flex items-center gap-2">
                <Heart
                  className={`w-4 h-4 ${isCover ? "fill-blue-500 text-blue-500" : "text-muted-foreground"}`}
                />
                <span>Position cover photo</span>
              </span>
              <input
                type="checkbox"
                checked={isCover}
                onChange={(e) => setIsCover(e.target.checked)}
                className="accent-primary"
              />
            </label>
            <label className="flex items-center justify-between text-sm cursor-pointer">
              <span className="flex items-center gap-2">
                <Lock
                  className={`w-4 h-4 ${isPrivate ? "text-foreground" : "text-muted-foreground"}`}
                />
                <span>Private</span>
              </span>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="accent-primary"
              />
            </label>
          </div>

          <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
            <div>{photo.fileName}</div>
            <div>
              Added {new Date(photo.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between p-3 border-t border-border gap-2">
          <button
            onClick={handleDelete}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-md text-destructive hover:bg-destructive/10 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
