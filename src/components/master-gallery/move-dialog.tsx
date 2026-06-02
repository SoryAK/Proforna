"use client";

import { useState } from "react";
import { X, FolderInput, Briefcase } from "lucide-react";
import type { MasterGalleryPosition } from "./types";

interface MoveDialogProps {
  open: boolean;
  // Photos being moved (just IDs + count for the message).
  photoCount: number;
  positions: MasterGalleryPosition[];
  // The position the photos currently belong to (highlighted, since
  // moving to the same job + same album is a no-op).
  currentPositionId?: string | null;
  onClose: () => void;
  // Resolves with the chosen target. Caller decides whether to call
  // /api/gallery (same-job) or /api/master-gallery/move (cross-job).
  onConfirm: (target: {
    positionId: string;
    albumId: string | null;
  }) => void | Promise<void>;
}

export function MoveDialog({
  open,
  photoCount,
  positions,
  currentPositionId,
  onClose,
  onConfirm,
}: MoveDialogProps) {
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(
    null,
  );
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const selectedPosition = positions.find((p) => p.id === selectedPositionId);

  const handleConfirm = async () => {
    if (!selectedPositionId) return;
    setSubmitting(true);
    try {
      await onConfirm({
        positionId: selectedPositionId,
        albumId: selectedAlbumId,
      });
      onClose();
      setSelectedPositionId(null);
      setSelectedAlbumId(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderInput className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">
              Move {photoCount} {photoCount === 1 ? "photo" : "photos"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-4 min-h-0">
          {/* Position picker */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Job
            </h3>
            <div className="flex-1 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {positions.map((p) => {
                const isCurrent = p.id === currentPositionId;
                const isSelected = p.id === selectedPositionId;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPositionId(p.id);
                      setSelectedAlbumId(null);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{p.company}</div>
                      <div className="truncate text-xs opacity-70">
                        {p.role}
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider opacity-70">
                        current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Album picker (depends on position selection) */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Album (optional)
            </h3>
            <div className="flex-1 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {!selectedPosition ? (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  Pick a job first.
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setSelectedAlbumId(null)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      selectedAlbumId === null
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="font-medium">No album (Unfiled)</div>
                  </button>
                  {selectedPosition.albums.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAlbumId(a.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        selectedAlbumId === a.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium truncate">{a.name}</div>
                      <div className="text-xs opacity-70">
                        {a.photoCount}{" "}
                        {a.photoCount === 1 ? "photo" : "photos"}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedPositionId || submitting}
            className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Moving..." : "Move here"}
          </button>
        </div>
      </div>
    </div>
  );
}
