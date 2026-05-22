/**
 * WorklogPhotoSection — per-entry photo grid + upload control.
 *
 * Lazy-loads photos for one `workLogId` and owns the upload/delete network
 * calls so any host (note reader, future surfaces) can drop it in. The host
 * only needs to pass the id.
 */

"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Upload, Image as ImageIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { WorkLogPhoto } from "@/types/worklog";

export interface WorklogPhotoSectionProps {
  workLogId: string;
  /** Grid columns — defaults to 3 (matches editor); reader uses 4 on wider panes. */
  cols?: 3 | 4;
}

export function WorklogPhotoSection({ workLogId, cols = 3 }: WorklogPhotoSectionProps) {
  const qc = useQueryClient();
  const { data: photos = [] } = useQuery<WorkLogPhoto[]>({
    queryKey: ["worklog-photos", workLogId],
    queryFn: async () => {
      const r = await fetch(`/api/work-logs/photos?workLogId=${workLogId}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("workLogId", workLogId);
        fd.append("file", file);
        const r = await fetch("/api/work-logs/photos", { method: "POST", body: fd });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setError(j.error || "Upload failed");
          break;
        }
      }
      qc.invalidateQueries({ queryKey: ["worklog-photos", workLogId] });
      qc.invalidateQueries({ queryKey: ["worklogs"] });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/work-logs/photos?id=${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["worklog-photos", workLogId] });
    qc.invalidateQueries({ queryKey: ["worklogs"] });
  }

  const colsClass = cols === 4 ? "grid-cols-4" : "grid-cols-3";

  return (
    <div>
      <Label className="text-xs flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" />
        Photos ({photos.length}/6)
      </Label>
      <div className={`mt-1.5 grid ${colsClass} gap-2`}>
        {photos.map((p) => (
          <div key={p.id} className="relative group aspect-square rounded-md overflow-hidden border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.filePath} alt={p.caption ?? ""} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(p.id)}
              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Delete photo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {photos.length < 6 && (
          <label className="aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-accent/40 transition-colors">
            <Upload className="h-4 w-4 mb-1" />
            <span>{uploading ? "Uploading…" : "Add photo"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}
