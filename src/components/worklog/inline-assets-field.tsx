/**
 * InlineAssetsField — self-contained Assets autosave field for a single
 * WorkLog.
 *
 * Lifted out of `WorklogNoteReader` in ADR-0025 Unit 1 so the Properties
 * rail tab (Unit 3) can render the same UI without prop-drilling assets,
 * positions, and the auto-tag merge handler through the reader.
 *
 * Each mount owns its own collapsible <details> wrapper and its own auto-tag
 * merge bridge: when the user adds new assets whose types carry tag
 * suggestions, those tags merge into `log.tags` and ship in a single
 * `onUpdate({ assetIds, tags })` patch. Reads server-canonical `log.tags` —
 * same race shape as the editor mention-merge path (in-flight tag typing in
 * the rail can lose asset-derived tags if it commits last). Accepted.
 *
 * Two mounts on the same screen (rail Properties tab at xl+ and inline
 * reader at <xl) are intentional: both write through the same `onUpdate`
 * mutation so server state stays canonical.
 */

"use client";

import { useState } from "react";
import { ChevronRight, Cog } from "lucide-react";

import { AssetPicker, type AssetPickerPosition, type JobAsset } from "@/components/asset-picker";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";

export interface InlineAssetsFieldProps {
  log: WorkLog;
  /** Asset corpus for the current user. */
  assets: JobAsset[];
  /** Position list, used by AssetPicker for "default position" creation. */
  positions: AssetPickerPosition[];
  /** Commit a single-field update for an existing log. */
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  /** Optional wrapper className — used to gate visibility via Tailwind. */
  className?: string;
  /**
   * Hide the eyebrow `<summary>` row (rail mounts may render their own
   * section header). When true, the picker renders without the collapsible
   * shell — always expanded.
   */
  hideLabel?: boolean;
}

/**
 * Merge new asset-type tags into the existing CSV string. Returns `null` if
 * nothing changes. Pure helper (no closures over component state).
 */
function mergeAssetTagsCSV(
  existingCSV: string,
  newAssets: JobAsset[],
): string | null {
  const incoming = newAssets.flatMap((a) => a.type?.tags ?? []);
  if (incoming.length === 0) return null;
  const existing = existingCSV
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const existingLower = new Set(existing.map((t) => t.toLowerCase()));
  const toAdd = incoming.filter((t) => !existingLower.has(t.toLowerCase()));
  if (toAdd.length === 0) return null;
  return [...existing, ...toAdd].join(", ");
}

export function InlineAssetsField({
  log,
  assets,
  positions,
  onUpdate,
  className,
  hideLabel = false,
}: InlineAssetsFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedCount = (log.assetIds ?? []).length;

  const handleChange = (ids: string[]) => {
    const prev = new Set(log.assetIds ?? []);
    const newIds = ids.filter((id) => !prev.has(id));
    let mergedTagsPatch: { tags: string | null } | undefined;
    if (newIds.length > 0) {
      const assetMap = new Map(assets.map((a) => [a.id, a]));
      const newAssets = newIds
        .map((id) => assetMap.get(id))
        .filter((a): a is JobAsset => Boolean(a));
      const merged = mergeAssetTagsCSV(log.tags ?? "", newAssets);
      if (merged !== null) {
        mergedTagsPatch = { tags: merged.length > 0 ? merged : null };
      }
    }
    onUpdate({
      id: log.id,
      assetIds: ids,
      ...(mergedTagsPatch ?? {}),
    });
  };

  const picker = (
    <AssetPicker
      label=""
      assets={assets}
      positions={positions}
      selectedIds={log.assetIds ?? []}
      defaultPositionId={log.positionId ?? null}
      onChange={handleChange}
    />
  );

  if (hideLabel) {
    return <div className={cn("space-y-1.5", className)}>{picker}</div>;
  }

  return (
    <details
      open={open || selectedCount > 0}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className={cn("group border-t pt-3 pb-6", className)}
    >
      <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground select-none">
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
        <Cog className="h-3 w-3" />
        Assets
        {selectedCount > 0 && (
          <Badge variant="secondary" className="ml-1 h-4 text-[10px]">
            {selectedCount}
          </Badge>
        )}
      </summary>
      <div className="mt-3">{picker}</div>
    </details>
  );
}
