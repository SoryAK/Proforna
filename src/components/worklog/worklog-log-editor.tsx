/**
 * WorklogLogEditor — modal dialog for creating or editing a single WorkLog entry.
 *
 * Owns its own draft state (initialised from `value` when the dialog opens) and
 * delegates persistence to the parent via `onSave`. The co-located
 * `WorkLogPhotoSection` handles per-entry photo upload/delete and is the only
 * piece in the worklog tree that still talks to React Query directly, because
 * photos are fetched lazily per-entry (separate cache key per workLogId).
 */

"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Star, X, Upload, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EquipmentPicker, type EquipmentItem } from "@/components/equipment-picker";
import { AssetPicker, type JobAsset } from "@/components/asset-picker";
import { cn } from "@/lib/utils";
import type { WorkLog, WorkLogPhoto, Position } from "@/types/worklog";
import { CATEGORIES, MOODS } from "@/components/worklog/constants";

// ── Photo upload section (per-entry, lazy-loaded) ───────────────
function WorkLogPhotoSection({ workLogId }: { workLogId: string }) {
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

  return (
    <div>
      <Label className="text-xs flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" />
        Photos ({photos.length}/6)
      </Label>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
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

export interface WorklogLogEditorProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: Partial<WorkLog> | null;
  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];
  onSave: (data: Partial<WorkLog>) => void;
  saving: boolean;
}

export function WorklogLogEditor({
  open,
  onOpenChange,
  value,
  positions,
  equipment,
  assets,
  onSave,
  saving,
}: WorklogLogEditorProps) {
  const [draft, setDraft] = useState<Partial<WorkLog>>({});
  useEffect(() => {
    if (open) setDraft(value ?? {});
  }, [open, value]);

  if (!open) return null;
  const isEdit = !!draft.id;

  function update<K extends keyof WorkLog>(key: K, v: WorkLog[K] | null) {
    setDraft((d) => ({ ...d, [key]: v as WorkLog[K] }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit entry" : "New entry"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={draft.date ? format(parseISO(draft.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => update("date", new Date(e.target.value).toISOString())}
              />
            </div>
            <div>
              <Label className="text-xs">Hours (optional)</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                value={draft.hours ?? ""}
                onChange={(e) => update("hours", e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Title <span className="text-rose-500">*</span></Label>
            <Input
              value={draft.title ?? ""}
              onChange={(e) => update("title", e.target.value)}
              placeholder='Short summary, e.g. "Fixed CI pipeline"'
            />
          </div>

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={draft.content ?? ""}
              onChange={(e) => update("content", e.target.value || null)}
              placeholder="What did you do? Any blockers or wins worth remembering?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={draft.category ?? "task"}
                onChange={(e) => update("category", e.target.value as WorkLog["category"])}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <option key={k} value={k}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Linked job (optional)</Label>
              <select
                value={draft.positionId ?? ""}
                onChange={(e) => update("positionId", e.target.value || null)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">No job</option>
                {positions.filter((p) => p.type === "job").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company}{p.title ? ` — ${p.title}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={draft.tags ?? ""}
              onChange={(e) => update("tags", e.target.value || null)}
              placeholder="kubernetes, deploy, on-call"
            />
          </div>

          {equipment.length > 0 && (
            <EquipmentPicker
              label="Tools used (optional)"
              equipment={equipment}
              selectedIds={draft.equipmentIds ?? []}
              onChange={(ids) => update("equipmentIds", ids)}
            />
          )}

          <AssetPicker
            label="Worked on (machines / units / vehicles)"
            assets={assets}
            positions={positions}
            selectedIds={draft.assetIds ?? []}
            defaultPositionId={draft.positionId ?? null}
            onChange={(ids) => update("assetIds", ids)}
          />

          {draft.id ? (
            <WorkLogPhotoSection workLogId={draft.id} />
          ) : (
            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              Save the entry first to attach photos.
            </div>
          )}

          <div className="flex items-center gap-3">
            <div>
              <Label className="text-xs block mb-1">Mood</Label>
              <div className="flex gap-1">
                {MOODS.map((m) => {
                  const Icon = m.icon;
                  const sel = draft.mood === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => update("mood", sel ? null : m.value)}
                      title={m.label}
                      className={cn(
                        "h-8 w-8 rounded-md flex items-center justify-center border transition-colors",
                        sel ? "bg-accent border-foreground/40" : "border-border hover:border-foreground/30",
                        m.color,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer ml-auto pt-5">
              <Checkbox
                checked={!!draft.isNotable}
                onCheckedChange={(c) => update("isNotable", c === true)}
              />
              <Star className={cn("h-4 w-4", draft.isNotable && "fill-yellow-400 text-yellow-400")} />
              Notable
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} disabled={saving || !draft.title?.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
