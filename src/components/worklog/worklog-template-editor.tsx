/**
 * WorklogTemplateEditor — modal dialog for creating or editing a Template.
 *
 * Templates pre-fill the log editor so a routine day can be logged in one tap.
 * Owns its own draft state (initialised from `value` when the dialog opens) and
 * delegates persistence to the parent via `onSave`.
 */

"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EquipmentPicker, type EquipmentItem } from "@/components/equipment-picker";
import { AssetPicker, type JobAsset } from "@/components/asset-picker";
import type { Template, Position } from "@/types/worklog";
import { CATEGORIES } from "@/components/worklog/constants";

export interface WorklogTemplateEditorProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: Partial<Template> | null;
  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];
  onSave: (data: Partial<Template>) => void;
  saving: boolean;
}

export function WorklogTemplateEditor({
  open,
  onOpenChange,
  value,
  positions,
  equipment,
  assets,
  onSave,
  saving,
}: WorklogTemplateEditorProps) {
  const [draft, setDraft] = useState<Partial<Template>>({});
  useEffect(() => {
    if (open) setDraft(value ?? {});
  }, [open, value]);

  if (!open) return null;
  const isEdit = !!draft.id;

  function update<K extends keyof Template>(key: K, v: Template[K] | null) {
    setDraft((d) => ({ ...d, [key]: v as Template[K] }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            {isEdit ? "Edit template" : "New template"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name <span className="text-rose-500">*</span></Label>
            <Input
              value={draft.name ?? ""}
              onChange={(e) => update("name", e.target.value)}
              placeholder='e.g. "Standard onsite — Acme"'
            />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={draft.description ?? ""}
              onChange={(e) => update("description", e.target.value || null)}
              placeholder="Short note describing this day type"
            />
          </div>
          <div>
            <Label className="text-xs">Default title (used when applying)</Label>
            <Input
              value={draft.defaultTitle ?? ""}
              onChange={(e) => update("defaultTitle", e.target.value || null)}
              placeholder="Defaults to template name if blank"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Default category</Label>
              <select
                value={draft.defaultCategory ?? "task"}
                onChange={(e) => update("defaultCategory", e.target.value as Template["defaultCategory"])}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <option key={k} value={k}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Default duration (minutes)</Label>
              <Input
                type="number"
                min="0"
                step="15"
                value={draft.defaultDurationMinutes ?? ""}
                onChange={(e) =>
                  update("defaultDurationMinutes", e.target.value ? parseInt(e.target.value, 10) : null)
                }
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Linked job (optional)</Label>
            <select
              value={draft.defaultPositionId ?? ""}
              onChange={(e) => update("defaultPositionId", e.target.value || null)}
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
          <div>
            <Label className="text-xs">Default tags (comma-separated)</Label>
            <Input
              value={draft.defaultTags ?? ""}
              onChange={(e) => update("defaultTags", e.target.value || null)}
              placeholder="kubernetes, deploy"
            />
          </div>
          {equipment.length > 0 && (
            <EquipmentPicker
              label="Default tools (optional)"
              equipment={equipment}
              selectedIds={draft.defaultEquipmentIds ?? []}
              onChange={(ids) => update("defaultEquipmentIds", ids)}
            />
          )}

          <AssetPicker
            label="Default assets worked on (optional)"
            assets={assets}
            positions={positions}
            selectedIds={draft.defaultAssetIds ?? []}
            defaultPositionId={draft.defaultPositionId ?? null}
            onChange={(ids) => update("defaultAssetIds", ids)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} disabled={saving || !draft.name?.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
