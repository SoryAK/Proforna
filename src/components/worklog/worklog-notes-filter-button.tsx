/**
 * WorklogNotesFilterButton — Compact-mode filter entry point.
 *
 * When the notes list collapses to w-72 (a note is open) the inline
 * <WorklogNotesFilterChips> row eats two lines of vertical space even
 * when no filter is active. This wrapper replaces that row with a single
 * [Filter] icon button in the toolbar.
 *
 * Behavior:
 *   • Always visible in compact mode.
 *   • Shows a count badge when ≥1 filter is active (orange-tinted button).
 *   • Click → Popover containing the existing <WorklogNotesFilterChips>
 *     row, which already renders active values as orange pills with ✕
 *     buttons (so the popover doubles as the "what's currently set"
 *     surface). No separate pills strip needed for v1.
 *
 * Full mode (no note open) continues to render <WorklogNotesFilterChips>
 * inline beneath the toolbar — unchanged.
 *
 * Props are 1:1 with WorklogNotesFilterChips so the button is a drop-in
 * replacement at the call site.
 */

"use client";

import { Filter } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  WorklogNotesFilterChips,
  type WorklogNotesFilterChipsProps,
} from "@/components/worklog/worklog-notes-filter-chips";

// Mirrors the sentinel used inside WorklogNotesFilterChips. Kept in sync
// manually because exporting it from the chips module just for this
// counter would be over-coupling.
const SENTINEL = "all";

export function WorklogNotesFilterButton(props: WorklogNotesFilterChipsProps) {
  const activeCount =
    (props.filterPositionId !== SENTINEL ? 1 : 0) +
    (props.filterNotable ? 1 : 0) +
    (props.filterEquipmentId !== SENTINEL ? 1 : 0) +
    (props.filterAssetId !== SENTINEL ? 1 : 0);

  const active = activeCount > 0;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "h-7 inline-flex items-center gap-1 rounded-md text-xs transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "px-2 bg-orange-500/15 text-orange-700 dark:text-orange-300 hover:bg-orange-500/25"
            : "w-7 justify-center text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label={
          active
            ? `Filter notes (${activeCount} active)`
            : "Filter notes"
        }
        title={active ? `Filters (${activeCount} active)` : "Filter notes"}
        // base-ui Trigger owns its own onClick — don't add one (last-write-wins
        // would clobber the open handler). See dropdown kebab in this file for
        // the same constraint.
      >
        <Filter className="h-3.5 w-3.5" />
        {active && (
          <span className="tabular-nums font-medium leading-none">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-0">
        <WorklogNotesFilterChips {...props} />
      </PopoverContent>
    </Popover>
  );
}
