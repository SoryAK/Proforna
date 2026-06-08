/**
 * WorklogToolbar — top bar above the 3-pane notes shell.
 *
 * Layout (left → right):
 *   [ Title / brand ]   [ Search ]   [ Filters disclosure ]   [ + New ]
 *
 * The filters disclosure expands to a second row of compact selectors when
 * open; closing it preserves filter state. Filter selectors mirror the
 * controls that used to live in the sticky left rail (position, notable,
 * equipment, asset). Category lives in the folders rail now.
 */

"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Copy, Plus, Search, Settings2, SlidersHorizontal, Sparkles, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Position } from "@/types/worklog";
import type { EquipmentItem } from "@/components/equipment-picker";
import type { JobAsset } from "@/components/asset-picker";
import { resolveCategoryMeta } from "@/components/worklog/constants";
import { useWorklogCategories } from "@/components/worklog/hooks/use-worklog-categories";
import { WORKLOG_CATEGORY_FALLBACK } from "@/lib/worklog-categories";

export interface WorklogToolbarProps {
  compact?: boolean;
  search: string;
  setSearch: (v: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;

  filtersOpen: boolean;
  setFiltersOpen: (updater: (v: boolean) => boolean) => void;

  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];

  filterPositionId: string;
  setFilterPositionId: (v: string) => void;
  filterNotable: boolean;
  setFilterNotable: (updater: (v: boolean) => boolean) => void;
  filterEquipmentId: string;
  setFilterEquipmentId: (v: string) => void;
  filterAssetId: string;
  setFilterAssetId: (v: string) => void;

  isAnyFilterActive: boolean;
  onClearAll: () => void;

  hasLogs: boolean;
  bulkMode: boolean;
  onToggleBulkMode: () => void;
  onNew: () => void;
  onQuickCapture: (data: { title: string; category: string; hours: number | null }) => void;
  onCopyLast: () => void;
  onFromTemplate: () => void;
  onDefaults: () => void;
  defaultsSummary?: string | null;
}

export function WorklogToolbar(props: WorklogToolbarProps) {
  const {
    compact,
    search,
    setSearch,
    searchInputRef,
    filtersOpen,
    setFiltersOpen,
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
    isAnyFilterActive,
    onClearAll,
    hasLogs,
    bulkMode,
    onToggleBulkMode,
    onNew,
    onQuickCapture,
    onCopyLast,
    onFromTemplate,
    onDefaults,
    defaultsSummary,
  } = props;

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState("task");
  const [quickHours, setQuickHours] = useState("");

  // User-defined categories from Sprint A's WorkLogCategory table, plus the
  // synthetic "Other" fallback entry so quick-capture can target it directly.
  const { categories: userCategories } = useWorklogCategories();
  const categoryOptions = useMemo(
    () => [
      ...userCategories.map((c) => ({
        key: c.name,
        label: resolveCategoryMeta(c.name).label,
      })),
      { key: WORKLOG_CATEGORY_FALLBACK, label: resolveCategoryMeta(WORKLOG_CATEGORY_FALLBACK).label },
    ],
    [userCategories],
  );

  function submitQuickCapture() {
    const title = quickTitle.trim();
    if (!title) return;
    const parsedHours = quickHours.trim() ? Number(quickHours) : null;
    onQuickCapture({
      title,
      category: quickCategory,
      hours: parsedHours != null && Number.isFinite(parsedHours) ? parsedHours : null,
    });
    setQuickTitle("");
    setQuickHours("");
    setQuickCategory("task");
    setQuickOpen(false);
  }

  const activeChipCount =
    (filterPositionId !== "all" ? 1 : 0) +
    (filterNotable ? 1 : 0) +
    (filterEquipmentId !== "all" ? 1 : 0) +
    (filterAssetId !== "all" ? 1 : 0);

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className={cn("flex items-center gap-2 px-3 py-2", compact && "px-2 py-1.5")}>
        {!compact && (
          <div className="flex items-center gap-2 mr-2">
            <h1 className="text-sm font-semibold">Worklog</h1>
            <Badge variant="secondary" className="text-[10px]">Private</Badge>
          </div>
        )}

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="h-8 pl-7 pr-7 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded hover:bg-accent flex items-center justify-center"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant={filtersOpen || activeChipCount > 0 ? "secondary" : "ghost"}
          onClick={() => setFiltersOpen((v) => !v)}
          className="h-8 gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {activeChipCount > 0 && (
            <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">{activeChipCount}</Badge>
          )}
        </Button>

        <Button
          size="sm"
          variant={bulkMode ? "secondary" : "ghost"}
          onClick={onToggleBulkMode}
          className="h-8 gap-1.5"
          aria-label={bulkMode ? "Exit select mode" : "Select multiple notes"}
          aria-pressed={bulkMode}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{bulkMode ? "Done" : "Select"}</span>
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant={quickOpen ? "secondary" : "ghost"}
            onClick={() => setQuickOpen((v) => !v)}
            className="h-8 gap-1.5"
          >
            Quick
          </Button>
          {hasLogs && (
            <Button size="sm" variant="ghost" onClick={onCopyLast} className="h-8 gap-1.5 hidden md:inline-flex">
              <Copy className="h-3.5 w-3.5" />
              Same as last
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onFromTemplate} className="h-8 gap-1.5 hidden md:inline-flex">
            <Sparkles className="h-3.5 w-3.5" />
            From template
          </Button>
          <Button size="sm" variant="ghost" onClick={onDefaults} className="h-8 gap-1.5 hidden md:inline-flex">
            <Settings2 className="h-3.5 w-3.5" />
            Defaults
          </Button>
          {defaultsSummary && (
            <button
              type="button"
              onClick={onDefaults}
              className="hidden lg:inline-flex"
              aria-label="Open worklog defaults"
              title="Open defaults"
            >
              <Badge
                variant="secondary"
                className="h-7 px-2.5 max-w-[220px] truncate hover:bg-secondary/80 transition-colors"
              >
                {defaultsSummary}
              </Badge>
            </button>
          )}
          <Button size="sm" onClick={onNew} className="h-8 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </div>

      {quickOpen && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2 border-t pt-2 bg-orange-50/40 dark:bg-orange-950/10">
          <Input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitQuickCapture();
              }
            }}
            placeholder="Quick title (press Enter to save)"
            className="h-7 text-xs min-w-[220px] flex-1"
            autoFocus
          />

          <Select value={quickCategory} onValueChange={(v) => setQuickCategory(v ?? "task")}>
            <SelectTrigger className="h-7 text-xs w-auto min-w-[130px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(({ key, label }) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            min="0"
            step="0.25"
            value={quickHours}
            onChange={(e) => setQuickHours(e.target.value)}
            placeholder="Hours"
            className="h-7 text-xs w-[90px]"
          />

          <Button size="sm" className="h-7 text-xs px-2.5" onClick={submitQuickCapture}>
            Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setQuickOpen(false)}>
            Cancel
          </Button>
        </div>
      )}

      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2 border-t pt-2 bg-muted/30">
          <Select value={filterPositionId} onValueChange={(v) => setFilterPositionId(v ?? "all")}>
            <SelectTrigger className="h-7 text-xs w-auto min-w-[140px]">
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

          <Button
            size="sm"
            variant={filterNotable ? "default" : "outline"}
            onClick={() => setFilterNotable((v) => !v)}
            className="h-7 text-xs gap-1.5"
          >
            <Star className={cn("h-3 w-3", filterNotable && "fill-current")} />
            Notable
          </Button>

          {equipment.length > 0 && (
            <Select value={filterEquipmentId} onValueChange={(v) => setFilterEquipmentId(v ?? "all")}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[140px]">
                <SelectValue placeholder="All tools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tools</SelectItem>
                {equipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {assets.length > 0 && (
            <Select value={filterAssetId} onValueChange={(v) => setFilterAssetId(v ?? "all")}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[140px]">
                <SelectValue placeholder="All assets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assets</SelectItem>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isAnyFilterActive && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
