"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Star, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type JobAssetPhoto = {
  id: string;
  filePath: string;
  fileName: string;
  caption: string | null;
  isCover: boolean;
  sortOrder: number;
};

const MAX_PHOTOS = 6;

export function JobAssetPhotos({ assetId, className }: { assetId: string; className?: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: photos = [], isLoading } = useQuery<JobAssetPhoto[]>({
    queryKey: ["job-asset-photos", assetId],
    queryFn: async () => (await fetch(`/api/job-assets/photos?assetId=${assetId}`)).json(),
    enabled: !!assetId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["job-asset-photos", assetId] });
    qc.invalidateQueries({ queryKey: ["job-assets"] });
    qc.invalidateQueries({ queryKey: ["work-logs"] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("assetId", assetId);
      fd.append("file", file);
      const res = await fetch("/api/job-assets/photos", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast.success("Photo added");
    },
    onError: (e) => toast.error(String(e)),
  });

  const setCover = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/job-assets/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isCover: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(String(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/job-assets/photos?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      invalidate();
      toast.success("Photo removed");
    },
    onError: (e) => toast.error(String(e)),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        if (photos.length + 1 > MAX_PHOTOS) {
          toast.error(`Max ${MAX_PHOTOS} photos`);
          break;
        }
        await upload.mutateAsync(f);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Photos</span>
          <span className="text-[10px] text-muted-foreground">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={uploading || photos.length >= MAX_PHOTOS}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Add
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={onPick}
        />
      </div>

      {isLoading ? (
        <div className="text-[11px] text-muted-foreground">Loading…</div>
      ) : photos.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-[11px] text-muted-foreground">
          No photos yet. Add up to {MAX_PHOTOS} (5MB each).
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div
              key={p.id}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-md border",
                p.isCover && "ring-2 ring-amber-400"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.filePath}
                alt={p.caption ?? p.fileName}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {p.isCover && (
                <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-amber-500/90 text-white text-[9px] px-1.5 py-0.5">
                  <Star className="h-2.5 w-2.5 fill-current" /> Cover
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                {!p.isCover && (
                  <button
                    type="button"
                    title="Make cover"
                    className="h-6 w-6 inline-flex items-center justify-center rounded bg-background/80 hover:bg-background"
                    onClick={() => setCover.mutate(p.id)}
                  >
                    <Star className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete photo"
                  className="h-6 w-6 inline-flex items-center justify-center rounded bg-background/80 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => {
                    if (confirm("Delete this photo?")) remove.mutate(p.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
