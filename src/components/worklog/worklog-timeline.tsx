/**
 * WorklogTimeline — the "Timeline" tab pane of the worklog page.
 *
 * Renders one of three states:
 *   • selectedDate set → a single DayView (drill-in from the heatmap)
 *   • loadingLogs     → centered "Loading…" line
 *   • timeline empty  → CTA card with "Log your first entry"
 *   • otherwise       → vertical list of DayView / RoutineRollup cards
 *
 * The DayView and RoutineRollup sub-components are co-located in this file
 * because they're only used by the timeline pane and share its prop shape.
 */

"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Plus,
  Star,
  Pencil,
  Trash2,
  Briefcase,
  Sparkles,
  Wrench,
  Cog,
  ChevronDown,
  ClipboardList,
  Meh,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WorkLog, Position } from "@/types/worklog";
import type { EquipmentItem } from "@/components/equipment-picker";
import type { JobAsset } from "@/components/asset-picker";
import { CATEGORIES, MOODS, dateLabel } from "@/components/worklog/constants";
import type { TimelineSegment } from "@/components/worklog/hooks/use-worklog-filters";

interface DayViewProps {
  date: Date;
  logs: WorkLog[];
  positionMap: Map<string, Position>;
  equipmentMap: Map<string, EquipmentItem>;
  assetMap: Map<string, JobAsset>;
  focusId?: string | null;
  onEdit: (l: WorkLog) => void;
  onDelete: (id: string) => void;
  onToggleNotable: (l: WorkLog) => void;
}

export interface WorklogTimelineProps {
  selectedDate: Date | null;
  selectedDayLogs: WorkLog[] | null;
  loadingLogs: boolean;
  timeline: TimelineSegment[];
  positionMap: Map<string, Position>;
  equipmentMap: Map<string, EquipmentItem>;
  assetMap: Map<string, JobAsset>;
  focusId?: string | null;
  onEdit: (l: WorkLog) => void;
  onDelete: (id: string) => void;
  onToggleNotable: (l: WorkLog) => void;
  onStartBlank: () => void;
}

export function WorklogTimeline({
  selectedDate,
  selectedDayLogs,
  loadingLogs,
  timeline,
  positionMap,
  equipmentMap,
  assetMap,
  focusId,
  onEdit,
  onDelete,
  onToggleNotable,
  onStartBlank,
}: WorklogTimelineProps) {
  if (selectedDate) {
    return (
      <DayView
        date={selectedDate}
        logs={selectedDayLogs ?? []}
        positionMap={positionMap}
        equipmentMap={equipmentMap}
        assetMap={assetMap}
        focusId={focusId}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleNotable={onToggleNotable}
      />
    );
  }
  if (loadingLogs) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>;
  }
  if (timeline.length === 0) {
    return (
      <Card className="p-8 text-center">
        <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground mb-3">
          No entries yet. Most days take 5 seconds with a template.
        </p>
        <Button size="sm" onClick={onStartBlank}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Log your first entry
        </Button>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {timeline.map((seg) =>
        seg.kind === "rollup" ? (
          <RoutineRollup
            key={`r-${seg.start.toISOString()}-${seg.end.toISOString()}`}
            segment={seg}
            positionMap={positionMap}
            equipmentMap={equipmentMap}
            assetMap={assetMap}
            focusId={focusId}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleNotable={onToggleNotable}
          />
        ) : (
          <DayView
            key={seg.date.toISOString()}
            date={seg.date}
            logs={seg.logs}
            positionMap={positionMap}
            equipmentMap={equipmentMap}
            assetMap={assetMap}
            focusId={focusId}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleNotable={onToggleNotable}
          />
        ),
      )}
    </div>
  );
}

// ── Day view ────────────────────────────────────────────────────
function DayView({
  date,
  logs,
  positionMap,
  equipmentMap,
  assetMap,
  focusId,
  onEdit,
  onDelete,
  onToggleNotable,
}: DayViewProps) {
  const totalHours = logs.reduce((s, l) => s + (l.hours ?? 0), 0);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold">{dateLabel(date)}</h3>
          <span className="text-xs text-muted-foreground">
            {logs.length} entr{logs.length === 1 ? "y" : "ies"}
          </span>
          {totalHours > 0 && (
            <span className="text-xs text-muted-foreground">· {Math.round(totalHours * 10) / 10}h</span>
          )}
        </div>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No entries.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => {
            const cat = CATEGORIES[l.category] ?? CATEGORIES.other;
            const CatIcon = cat.icon;
            const pos = l.positionId ? positionMap.get(l.positionId) : null;
            const isNotable = l.isNotable || l.accomplishment;
            const isFocused = focusId === l.id;
            return (
              <div
                key={l.id}
                id={`worklog-row-${l.id}`}
                className={cn(
                  "group relative flex items-start gap-3 rounded-md border border-input bg-background p-3 transition-colors duration-150",
                  "hover:border-foreground/30 hover:bg-muted/40",
                  "focus-within:ring-2 focus-within:ring-pink-500/40 focus-within:border-pink-500/60",
                  isFocused &&
                    "border-yellow-400 ring-2 ring-yellow-300/60 bg-yellow-50/40 dark:bg-yellow-500/5",
                )}
              >
                <div className={cn("h-8 w-8 rounded-md flex items-center justify-center shrink-0", cat.color)}>
                  <CatIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm leading-tight flex items-center gap-1.5 min-w-0">
                      {l.isAutoGenerated && (
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1 gap-0.5 border-sky-400/60 text-sky-700 dark:text-sky-400 shrink-0"
                          title="Auto-logged from a photo or activity. Edit to confirm or expand."
                        >
                          <Sparkles className="h-2.5 w-2.5" /> Auto
                        </Badge>
                      )}
                      <span className="truncate">{l.title}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => onToggleNotable(l)}
                        title={isNotable ? "Unmark notable" : "Mark notable"}
                      >
                        <Star className={cn("h-3.5 w-3.5", isNotable && "fill-yellow-400 text-yellow-400")} />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDelete(l.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {l.content && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{l.content}</p>
                  )}
                  {l.photos && l.photos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {l.photos.slice(0, 6).map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={p.id}
                          src={p.filePath}
                          alt={p.caption ?? ""}
                          title={p.caption ?? undefined}
                          className="h-14 w-14 rounded-md object-cover border"
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {isNotable && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-yellow-400/60 text-yellow-700 dark:text-yellow-400"
                      >
                        <Star className="h-2.5 w-2.5 mr-1 fill-current" /> Notable
                      </Badge>
                    )}
                    {pos && (
                      <Badge variant="outline" className="text-[10px]">
                        <Briefcase className="h-2.5 w-2.5 mr-1" /> {pos.company}
                      </Badge>
                    )}
                    {l.hours != null && l.hours > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {Math.round(l.hours * 10) / 10}h
                      </Badge>
                    )}
                    {l.mood &&
                      (() => {
                        const m = MOODS.find((x) => x.value === l.mood);
                        const Icon = m?.icon ?? Meh;
                        return (
                          <span title={m?.label} className={cn("inline-flex", m?.color)}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                        );
                      })()}
                    {l.equipmentIds.slice(0, 3).map((id) => {
                      const e = equipmentMap.get(id);
                      if (!e) return null;
                      return (
                        <Badge key={id} variant="outline" className="text-[10px]">
                          <Wrench className="h-2.5 w-2.5 mr-1" /> {e.name}
                        </Badge>
                      );
                    })}
                    {l.equipmentIds.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{l.equipmentIds.length - 3} more
                      </span>
                    )}
                    {(l.assetIds ?? []).slice(0, 3).map((id) => {
                      const a = assetMap.get(id);
                      if (!a) return null;
                      const cover = a.photos?.find((p) => p.isCover) ?? a.photos?.[0] ?? null;
                      return (
                        <Badge key={id} variant="outline" className="text-[10px] gap-1 pl-1 pr-2">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover.filePath} alt="" className="h-3.5 w-3.5 rounded-sm object-cover" />
                          ) : (
                            <Cog className="h-2.5 w-2.5" />
                          )}
                          {a.name}
                        </Badge>
                      );
                    })}
                    {(l.assetIds?.length ?? 0) > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{l.assetIds!.length - 3} assets
                      </span>
                    )}
                    {l.tags &&
                      l.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .slice(0, 5)
                        .map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">
                            #{t}
                          </Badge>
                        ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Routine-day rollup card (collapses runs of standard days at one position) ──
interface RoutineRollupProps {
  segment: Extract<TimelineSegment, { kind: "rollup" }>;
  positionMap: Map<string, Position>;
  equipmentMap: Map<string, EquipmentItem>;
  assetMap: Map<string, JobAsset>;
  focusId?: string | null;
  onEdit: (l: WorkLog) => void;
  onDelete: (id: string) => void;
  onToggleNotable: (l: WorkLog) => void;
}

function RoutineRollup({
  segment,
  positionMap,
  equipmentMap,
  assetMap,
  focusId,
  onEdit,
  onDelete,
  onToggleNotable,
}: RoutineRollupProps) {
  const [open, setOpen] = useState(false);
  const pos = positionMap.get(segment.positionId);
  const company = pos?.company ?? "position";
  const dayCount = segment.days.length;
  const sameMonth =
    segment.start.getMonth() === segment.end.getMonth() &&
    segment.start.getFullYear() === segment.end.getFullYear();
  const range = sameMonth
    ? `${format(segment.start, "MMM d")}–${format(segment.end, "d, yyyy")}`
    : `${format(segment.start, "MMM d")} – ${format(segment.end, "MMM d, yyyy")}`;
  return (
    <Card className="p-0 overflow-hidden border-dashed">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {range}: {dayCount} standard day{dayCount === 1 ? "" : "s"} at {company}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {segment.totalHours > 0 ? `${Math.round(segment.totalHours * 10) / 10}h logged · ` : ""}
              tap to {open ? "collapse" : "expand"}
            </div>
          </div>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t bg-muted/10 p-3 space-y-3">
          {segment.days.map((d) => (
            <DayView
              key={d.date.toISOString()}
              date={d.date}
              logs={d.logs}
              positionMap={positionMap}
              equipmentMap={equipmentMap}
              assetMap={assetMap}
              focusId={focusId}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleNotable={onToggleNotable}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
