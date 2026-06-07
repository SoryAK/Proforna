/**
 * WorklogNotesFilterChips — Drive-style filter row above the notes table
 * (per ADR-0015). Replaces the slide-down dropdown panel in <WorklogToolbar>
 * for the /worklog/notes route. The compact embed and old <WorklogPage>
 * keep the dropdown.
 *
 * Each chip:
 *   • Inactive: muted background + label + small chevron-down (opens dropdown).
 *   • Active:   orange-tinted background + active-value text + ✕ to clear.
 * "Clear all" appears on the right when ANY chip is active.
 *
 * Filter state is owned by the parent (WorklogNotesView); this component is
 * a pure presentational reflection of the 5 filter selectors.
 */

"use client";

import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EquipmentItem, JobAsset, Position } from "@/types/worklog";

const SENTINEL = "all";

interface FilterChipProps {
  /** Visible label (e.g. "Position"). */
  label: string;
  /** Active selection's display string, or null when the chip is inactive. */
  activeValue: string | null;
  /** Render the dropdown body. The dropdown root and trigger are owned here. */
  renderMenu: () => React.ReactNode;
  /** Called when the user clicks the ✕ on an active chip. */
  onClear: () => void;
}

function FilterChip({ label, activeValue, renderMenu, onClear }: FilterChipProps) {
  const active = activeValue !== null;
  return (
    <div className="inline-flex items-stretch">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-l text-xs transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active
              ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 hover:bg-orange-500/25"
              : "bg-muted/40 hover:bg-muted/60",
            // When inactive we round the right side too (no clear-X follows).
            !active && "rounded-r",
          )}
        >
          <span>{active ? activeValue : label}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px] max-h-[60vh] overflow-y-auto">
          {renderMenu()}
        </DropdownMenuContent>
      </DropdownMenu>
      {active && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label} filter`}
          className="px-1.5 rounded-r text-xs bg-orange-500/15 text-orange-700 dark:text-orange-300 hover:bg-orange-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export interface WorklogNotesFilterChipsProps {
  // Sources
  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];

  // State (4 cross-cutting filters; Category lives in the sidebar)
  filterPositionId: string;
  setFilterPositionId: (v: string) => void;
  filterNotable: boolean;
  setFilterNotable: (v: boolean) => void;
  filterEquipmentId: string;
  setFilterEquipmentId: (v: string) => void;
  filterAssetId: string;
  setFilterAssetId: (v: string) => void;

  // Bulk
  onClearAll: () => void;
}

export function WorklogNotesFilterChips({
  positions,
  equipment,
  assets,
  filterPositionId,
  setFilterPositionId,
  filterNotable,
  setFilterNotable,
  filterEquipmentId,
  setFilterEquipmentId,
  filterAssetId,
  setFilterAssetId,
  onClearAll,
}: WorklogNotesFilterChipsProps) {
  // ── Position chip ─────────────────────────────────────────────────────
  const positionActive = (() => {
    if (filterPositionId === SENTINEL) return null;
    if (filterPositionId === "none") return "No position";
    const p = positions.find((x) => x.id === filterPositionId);
    if (!p) return "Position";
    return p.title || p.company || "Position";
  })();

  // ── Equipment chip ────────────────────────────────────────────────────
  const equipmentActive = (() => {
    if (filterEquipmentId === SENTINEL) return null;
    const e = equipment.find((x) => x.id === filterEquipmentId);
    return e?.name ?? "Equipment";
  })();

  // ── Asset chip ────────────────────────────────────────────────────────
  const assetActive = (() => {
    if (filterAssetId === SENTINEL) return null;
    const a = assets.find((x) => x.id === filterAssetId);
    return a?.name ?? "Asset";
  })();

  const anyActive =
    filterPositionId !== SENTINEL ||
    filterNotable ||
    filterEquipmentId !== SENTINEL ||
    filterAssetId !== SENTINEL;

  return (
    <div className="px-4 py-2 flex items-center gap-2 border-b text-xs flex-wrap bg-muted/10">
      <span className="text-muted-foreground">Filters:</span>

      {/* Position */}
      <FilterChip
        label="Position"
        activeValue={positionActive}
        onClear={() => setFilterPositionId(SENTINEL)}
        renderMenu={() => (
          <>
            <DropdownMenuItem onSelect={() => setFilterPositionId(SENTINEL)}>
              All positions
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setFilterPositionId("none")}>
              No position
            </DropdownMenuItem>
            {positions.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => setFilterPositionId(p.id)}>
                {(p.title || "Position") + (p.company ? ` · ${p.company}` : "")}
              </DropdownMenuItem>
            ))}
          </>
        )}
      />

      {/* Notable — boolean toggle, no dropdown needed; render as a single click chip */}
      <button
        type="button"
        onClick={() => setFilterNotable(!filterNotable)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          filterNotable
            ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 hover:bg-orange-500/25"
            : "bg-muted/40 hover:bg-muted/60",
        )}
        aria-pressed={filterNotable}
      >
        Notable
        {filterNotable && <X className="h-3 w-3 opacity-70" />}
      </button>

      {/* Equipment */}
      <FilterChip
        label="Equipment"
        activeValue={equipmentActive}
        onClear={() => setFilterEquipmentId(SENTINEL)}
        renderMenu={() => (
          <>
            <DropdownMenuItem onSelect={() => setFilterEquipmentId(SENTINEL)}>
              All equipment
            </DropdownMenuItem>
            {equipment.length === 0 ? (
              <DropdownMenuItem disabled>No equipment</DropdownMenuItem>
            ) : (
              equipment.map((e) => (
                <DropdownMenuItem key={e.id} onSelect={() => setFilterEquipmentId(e.id)}>
                  {e.name}
                </DropdownMenuItem>
              ))
            )}
          </>
        )}
      />

      {/* Asset */}
      <FilterChip
        label="Asset"
        activeValue={assetActive}
        onClear={() => setFilterAssetId(SENTINEL)}
        renderMenu={() => (
          <>
            <DropdownMenuItem onSelect={() => setFilterAssetId(SENTINEL)}>
              All assets
            </DropdownMenuItem>
            {assets.length === 0 ? (
              <DropdownMenuItem disabled>No assets</DropdownMenuItem>
            ) : (
              assets.map((a) => (
                <DropdownMenuItem key={a.id} onSelect={() => setFilterAssetId(a.id)}>
                  {a.name}
                </DropdownMenuItem>
              ))
            )}
          </>
        )}
      />

      {anyActive && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  );
}
