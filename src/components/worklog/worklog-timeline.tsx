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
      <div className="py-16 text-center">
        <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground mb-3">
          No entries yet. Most days take 5 seconds with a template.
        </p>
        <Button size="sm" onClick={onStartBlank}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Log your first entry
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-8">
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
    <section>
      <header className="flex items-center gap-3 mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          {dateLabel(date)}
        </h3>
        <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap tabular-nums">
          {logs.length} entr{logs.length === 1 ? "y" : "ies"}
          {totalHours > 0 ? ` · ${Math.round(totalHours * 10) / 10}h` : ""}
        </span>
        <div className="flex-1 h-px bg-border" />
      </header>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 pl-4">No entries.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {logs.map((l) => {
            const cat = CATEGORIES[l.category] ?? CATEGORIES.other;
            const pos = l.positionId ? positionMap.get(l.positionId) : null;
            const isNotable = l.isNotable || l.accomplishment;
            const isFocused = focusId === l.id;
            return (
              <div
                key={l.id}
                id={`worklog-row-${l.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onEdit(l)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEdit(l);
                  }
                }}
                className={cn(
                  "group relative pl-4 pr-2 py-3 -mx-2 rounded-md transition-colors duration-150 cursor-pointer",
                  "hover:bg-muted/40 focus-within:bg-muted/40",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/40",
                  isFocused && "bg-yellow-50/40 dark:bg-yellow-500/5 ring-2 ring-yellow-300/60",
                )}
              >
                {/* Orange accent bar */}
                <span
                  aria-hidden
                  className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-orange-500"
                  title={cat.label}
                />
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="font-medium text-sm leading-snug flex items-center gap-1.5 min-w-0">
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
                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-7 w-7 p-0 transition-opacity",
                        isNotable
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                      )}
                      onClick={() => onToggleNotable(l)}
                      title={isNotable ? "Unmark notable" : "Mark notable"}
                    >
                      <Star className={cn("h-3.5 w-3.5", isNotable && "fill-yellow-400 text-yellow-400")} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                      onClick={() => onEdit(l)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                      onClick={() => onDelete(l.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {l.content && (
                  <p className="text-sm text-muted-foreground/90 mt-1 whitespace-pre-wrap line-clamp-2">
                    {l.content}
                  </p>
                )}
                {l.photos && l.photos.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {l.photos.slice(0, 8).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.id}
                        src={p.filePath}
                        alt={p.caption ?? ""}
                        title={p.caption ?? undefined}
                        className="h-8 w-8 rounded object-cover border"
                      />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                  {pos && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> {pos.company}
                    </span>
                  )}
                  <span className="opacity-70">{cat.label}</span>
                  {l.hours != null && l.hours > 0 && (
                    <span className="tabular-nums">{Math.round(l.hours * 10) / 10}h</span>
                  )}
                  {l.mood &&
                    (() => {
                      const m = MOODS.find((x) => x.value === l.mood);
                      const Icon = m?.icon ?? Meh;
                      return (
                        <span title={m?.label} className={cn("inline-flex", m?.color)}>
                          <Icon className="h-3 w-3" />
                        </span>
                      );
                    })()}
                  {isNotable && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1.5 border-yellow-400/60 text-yellow-700 dark:text-yellow-400"
                    >
                      <Star className="h-2.5 w-2.5 mr-0.5 fill-current" /> Notable
                    </Badge>
                  )}
                  {l.equipmentIds.slice(0, 2).map((id) => {
                    const e = equipmentMap.get(id);
                    if (!e) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-0.5">
                        <Wrench className="h-3 w-3" /> {e.name}
                      </span>
                    );
                  })}
                  {l.equipmentIds.length > 2 && (
                    <span className="opacity-70">+{l.equipmentIds.length - 2}</span>
                  )}
                  {(l.assetIds ?? []).slice(0, 2).map((id) => {
                    const a = assetMap.get(id);
                    if (!a) return null;
                    const cover = a.photos?.find((p) => p.isCover) ?? a.photos?.[0] ?? null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover.filePath} alt="" className="h-3.5 w-3.5 rounded-sm object-cover" />
                        ) : (
                          <Cog className="h-3 w-3" />
                        )}
                        {a.name}
                      </span>
                    );
                  })}
                  {(l.assetIds?.length ?? 0) > 2 && (
                    <span className="opacity-70">+{l.assetIds!.length - 2}</span>
                  )}
                  {l.tags &&
                    l.tags
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 4)
                      .map((t) => (
                        <span key={t} className="text-muted-foreground/80">
                          #{t}
                        </span>
                      ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
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
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group w-full flex items-center gap-3 mb-2 text-left"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap inline-flex items-center gap-1.5">
          <Briefcase className="h-3 w-3" />
          {range}
        </h3>
        <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
          {dayCount} standard day{dayCount === 1 ? "" : "s"} at {company}
          {segment.totalHours > 0 ? ` · ${Math.round(segment.totalHours * 10) / 10}h` : ""}
        </span>
        <div className="flex-1 h-px border-t border-dashed border-border" />
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-6 pl-2 border-l border-dashed border-border ml-1">
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
    </section>
  );
}
