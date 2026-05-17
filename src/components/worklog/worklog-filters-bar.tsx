/**
 * WorklogFiltersBar — the chip-row of filters above the timeline.
 *
 * Reads its values + setters from the orchestrator (which owns the
 * useWorklogFilters() hook). The bar is pure markup + click handlers; the
 * filtering logic itself lives in use-worklog-filters.ts.
 */

import { Star, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <Card className="p-3 flex flex-wrap items-center gap-2">
      <Select value={filterPositionId} onValueChange={(v) => setFilterPositionId(v ?? "all")}>
        <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
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
      <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
        <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
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
      <Button
        size="sm"
        variant={filterNotable ? "default" : "outline"}
        onClick={() => setFilterNotable((v) => !v)}
        className="h-8"
      >
        <Star className={cn("h-3.5 w-3.5 mr-1.5", filterNotable && "fill-current")} />
        Notable only
      </Button>
      {filterEquipmentId !== "all" && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setFilterEquipmentId("all")}
          className="h-8 text-xs"
        >
          Tool: {equipmentMap.get(filterEquipmentId)?.name ?? "filtered"} ✕
        </Button>
      )}
      {activeAsset && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setFilterAssetId("all")}
          className="h-8 text-xs gap-1.5 pl-1.5"
        >
          {activeAssetCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeAssetCover.filePath} alt="" className="h-5 w-5 rounded-sm object-cover" />
          ) : (
            <Cog className="h-3 w-3" />
          )}
          Asset: {activeAsset.name ?? "filtered"} ✕
        </Button>
      )}
      {isAnyFilterActive && (
        <Button size="sm" variant="ghost" onClick={onClearAll} className="h-8">
          Clear
        </Button>
      )}
      <div className="ml-auto text-xs text-muted-foreground">
        {filteredCount} of {totalCount} entries
      </div>
    </Card>
  );
}
