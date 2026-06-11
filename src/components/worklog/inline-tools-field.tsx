/**
 * InlineToolsField — self-contained Tools/Equipment autosave field for a
 * single WorkLog.
 *
 * Lifted out of `WorklogNoteReader` in ADR-0025 Unit 2, mirroring
 * InlineAssetsField (Unit 1) and InlineTagsField (ADR-0023 Unit 3.1). The
 * Properties rail tab (Unit 3) will mount a second instance — both write
 * through the same `onUpdate({ equipmentIds })` mutation so server state
 * stays canonical.
 *
 * Unlike InlineAssetsField, there is no auto-tag merge bridge: equipment
 * types do not carry tag suggestions in the current data model.
 *
 * Returns null when the equipment corpus is empty (matches the original
 * inline behavior — Tools block was gated on `equipment.length > 0`).
 */

"use client";

import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";

import { EquipmentPicker, type EquipmentItem } from "@/components/equipment-picker";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";

export interface InlineToolsFieldProps {
  log: WorkLog;
  /** Equipment corpus for the current user. */
  equipment: EquipmentItem[];
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

export function InlineToolsField({
  log,
  equipment,
  onUpdate,
  className,
  hideLabel = false,
}: InlineToolsFieldProps) {
  const [open, setOpen] = useState(false);

  // Match the original gate: don't render anything when the corpus is empty.
  if (equipment.length === 0) {
    return null;
  }

  const selectedCount = (log.equipmentIds ?? []).length;

  const picker = (
    <EquipmentPicker
      label=""
      equipment={equipment}
      selectedIds={log.equipmentIds ?? []}
      onChange={(ids) => onUpdate({ id: log.id, equipmentIds: ids })}
    />
  );

  if (hideLabel) {
    return <div className={cn("space-y-1.5", className)}>{picker}</div>;
  }

  return (
    <details
      open={open || selectedCount > 0}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className={cn("group border-t pt-3", className)}
    >
      <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground select-none">
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
        <Wrench className="h-3 w-3" />
        Tools
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
