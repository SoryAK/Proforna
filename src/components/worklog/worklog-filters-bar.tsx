/**
 * WorklogFiltersBar — the chip-row of filters above the timeline.
 *
 * Reads its values + setters from the orchestrator (which owns the
 * useWorklogFilters() hook). The bar is pure markup + click handlers; the
 * filtering logic itself lives in use-worklog-filters.ts.
 */

import { Star, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/components/worklog/constants";
import type { Position } from "@/types/worklog";
import type { EquipmentItem } from "@/components/equipment-picker";
import type { JobAsset } from "@/components/asset-picker";

export interface WorklogFiltersBarProps {
  positions: Position[];
  equipmentMap: Map<string, EquipmentItem>;
  assetMap: Map<string, JobAsset>;
  filterPositionId: string;
  setFilterPositionId: (v: string) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  filterNotable: boolean;
  setFilterNotable: (updater: (v: boolean) => boolean) => void;
  filterEquipmentId: string;
  setFilterEquipmentId: (v: string) => void;
  filterAssetId: string;
  setFilterAssetId: (v: string) => void;
  isAnyFilterActive: boolean;
  onClearAll: () => void;
  filteredCount: number;
  totalCount: number;
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
      {children}
    </div>
  );
}

/**
 * Chrome-less, vertically-stacked filter list designed for the worklog's
 * sticky left rail. Each filter sits under a small uppercase label so the
 * controls feel intentional without card framing.
 */
export function WorklogFiltersBar({
  positions,
  equipmentMap,
  assetMap,
  filterPositionId,
  setFilterPositionId,
  filterCategory,
  setFilterCategory,
  filterNotable,
  setFilterNotable,
  filterEquipmentId,
  setFilterEquipmentId,
  filterAssetId,
  setFilterAssetId,
  isAnyFilterActive,
  onClearAll,
  filteredCount,
  totalCount,
}: WorklogFiltersBarProps) {
  const activeAsset = filterAssetId !== "all" ? assetMap.get(filterAssetId) ?? null : null;
  const activeAssetCover = activeAsset?.photos?.find((p) => p.isCover) ?? activeAsset?.photos?.[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </h3>
        {isAnyFilterActive && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div>
        <FilterLabel>Job</FilterLabel>
        <Select value={filterPositionId} onValueChange={(v) => setFilterPositionId(v ?? "all")}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="All jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            <SelectItem value="none">No job linked</SelectItem>
            {positions
              .filter((p) => p.type === "job")
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.company}
                  {p.title ? ` — ${p.title}` : ""}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <FilterLabel>Category</FilterLabel>
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <SelectItem key={k} value={k}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        size="sm"
        variant={filterNotable ? "default" : "outline"}
        onClick={() => setFilterNotable((v) => !v)}
        className="h-8 w-full justify-start"
      >
        <Star className={cn("h-3.5 w-3.5 mr-1.5", filterNotable && "fill-current")} />
        Notable only
      </Button>

      {(filterEquipmentId !== "all" || activeAsset) && (
        <div className="space-y-1.5">
          <FilterLabel>Active filters</FilterLabel>
          {filterEquipmentId !== "all" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setFilterEquipmentId("all")}
              className="h-7 w-full justify-start text-xs"
            >
              <span className="truncate">
                Tool: {equipmentMap.get(filterEquipmentId)?.name ?? "filtered"}
              </span>
              <span className="ml-auto opacity-60">✕</span>
            </Button>
          )}
          {activeAsset && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setFilterAssetId("all")}
              className="h-7 w-full justify-start text-xs gap-1.5 pl-1.5"
            >
              {activeAssetCover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeAssetCover.filePath} alt="" className="h-5 w-5 rounded-sm object-cover flex-shrink-0" />
              ) : (
                <Cog className="h-3 w-3 flex-shrink-0" />
              )}
              <span className="truncate">Asset: {activeAsset.name ?? "filtered"}</span>
              <span className="ml-auto opacity-60">✕</span>
            </Button>
          )}
        </div>
      )}

      <div className="pt-3 border-t text-[11px] text-muted-foreground tabular-nums">
        {filteredCount} of {totalCount} entries
      </div>
    </div>
  );
}
