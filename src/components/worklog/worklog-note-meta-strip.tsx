/**
 * WorklogNoteMetaStrip — collapsible "details" header for a worklog note.
 *
 * Two display modes:
 *   • Collapsed (default for non-empty notes, and ALWAYS on mobile <md):
 *     a single read-only summary line — "Thu, May 21 · 8:00 PM · Troubleshooting
 *     · Barry Callebaut · Night Shift · 4h · 😐". Click anywhere to expand.
 *   • Expanded: three labelled clusters (WHEN · WHERE · EFFORT) with proper
 *     <label>s and aria-labels on every native control. The "+ New shift…"
 *     affordance lives quietly inside the WHERE cluster.
 *
 * Extracted from WorklogNoteReader so the reader stays under the
 * "god file" budget and the details UI is reusable in templates/previews.
 */

"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Position, WorkLog, WorkShift } from "@/types/worklog";
import { CATEGORIES, MOODS } from "@/components/worklog/constants";
import {
  minutesFromTimeLabel,
  timeLabelFromMinutes,
} from "@/lib/worklog-shifts";

export interface WorklogNoteMetaStripProps {
  log: WorkLog;
  positions: Position[];
  positionMap: Map<string, Position>;
  shifts: WorkShift[];
  /** Local date input string (yyyy-MM-dd). Reader owns this state. */
  dateInput: string;
  setDateInput: (v: string) => void;
  /** Local time input string (HH:mm). */
  timeInput: string;
  setTimeInput: (v: string) => void;
  /** Hours field (autosave-managed by reader). */
  hoursValue: string;
  onHoursChange: (v: string) => void;
  onHoursBlur: () => void;
  /** Apply shift-aware date/time commits. */
  commitDateTime: (date: string, time: string) => void;
  /** Build a shift-aware patch for position / shift edits. */
  buildShiftAwarePatch: (partial: Partial<WorkLog>) => Partial<WorkLog>;
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  /** Refetch shifts after creating a new template. */
  onShiftsRefetch: () => void;
  /**
   * Default-expand on first render. Reader passes `true` for empty/new notes
   * so first-capture flow shows controls immediately.
   */
  defaultExpanded?: boolean;
}

export function WorklogNoteMetaStrip({
  log,
  positions,
  positionMap,
  shifts,
  dateInput,
  setDateInput,
  timeInput,
  setTimeInput,
  hoursValue,
  onHoursChange,
  onHoursBlur,
  commitDateTime,
  buildShiftAwarePatch,
  onUpdate,
  onShiftsRefetch,
  defaultExpanded,
}: WorklogNoteMetaStripProps) {
  const [expanded, setExpanded] = useState<boolean>(!!defaultExpanded);
  const [newShiftOpen, setNewShiftOpen] = useState(false);
  const [newShiftName, setNewShiftName] = useState("");
  const [newShiftStart, setNewShiftStart] = useState("23:00");
  const [newShiftEnd, setNewShiftEnd] = useState("07:00");

  const cat = CATEGORIES[log.category];
  const CatIcon = cat?.icon;
  const pos = log.positionId ? positionMap.get(log.positionId) : null;
  const selectedShift = shifts.find((s) => s.id === log.shiftId) ?? null;
  const mood = MOODS.find((m) => m.value === log.mood) ?? null;
  const MoodIcon = mood?.icon ?? null;

  const dateLabel = (() => {
    try {
      return format(parseISO(log.date), "EEE, MMM d");
    } catch {
      return dateInput;
    }
  })();

  async function createShiftTemplate() {
    if (!log.positionId) return;
    const startMinute = minutesFromTimeLabel(newShiftStart);
    const endMinute = minutesFromTimeLabel(newShiftEnd);
    if (!newShiftName.trim() || startMinute == null || endMinute == null) return;

    const r = await fetch(`/api/work-history/${log.positionId}/shifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newShiftName.trim(),
        startMinute,
        endMinute,
      }),
    });
    if (!r.ok) return;
    const created: WorkShift = await r.json();
    onShiftsRefetch();
    onUpdate({ id: log.id, ...buildShiftAwarePatch({ shiftId: created.id }) });
    setNewShiftName("");
    setNewShiftOpen(false);
  }

  // ── Collapsed mode ────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div className="border-b bg-muted/20">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full px-4 sm:px-6 py-2.5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors group text-left"
          aria-label="Show note details"
          aria-expanded={false}
        >
          <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 shrink-0" />
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="text-foreground">{dateLabel}</span>
            <Separator />
            <Clock className="h-3 w-3 shrink-0" />
            <span className="text-foreground tabular-nums">{timeInput}</span>
            {cat && (
              <>
                <Separator />
                {CatIcon && <CatIcon className="h-3 w-3 shrink-0" />}
                <span className="text-foreground">{cat.label}</span>
              </>
            )}
            {pos && (
              <>
                <Separator />
                <Briefcase className="h-3 w-3 shrink-0" />
                <span className="text-foreground truncate max-w-[160px]">{pos.company}</span>
              </>
            )}
            {selectedShift && (
              <>
                <Separator />
                <span className="text-foreground">{selectedShift.name}</span>
              </>
            )}
            {hoursValue && (
              <>
                <Separator />
                <span className="text-foreground tabular-nums">{hoursValue}h</span>
              </>
            )}
            {mood && MoodIcon && (
              <>
                <Separator />
                <MoodIcon className={cn("h-3 w-3 shrink-0", mood.color)} />
              </>
            )}
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-70 shrink-0 hidden sm:inline">
            Edit
          </span>
        </button>
      </div>
    );
  }

  // ── Expanded mode ─────────────────────────────────────────────────────
  return (
    <div className="border-b bg-muted/20 px-4 sm:px-6 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Details
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(false)}
        >
          <ChevronDown className="h-3 w-3" />
          Collapse
        </Button>
      </div>

      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
        {/* WHEN */}
        <fieldset className="space-y-1.5 min-w-0">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1">
            When
          </legend>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="date"
              aria-label="Date"
              value={dateInput}
              onChange={(e) => {
                setDateInput(e.target.value);
                commitDateTime(e.target.value, timeInput);
              }}
              className="bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none cursor-pointer flex-1 min-w-0"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="time"
              aria-label="Time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              onBlur={() => commitDateTime(dateInput, timeInput)}
              className="bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none flex-1 min-w-0 tabular-nums"
            />
          </div>
        </fieldset>

        {/* WHERE */}
        <fieldset className="space-y-1.5 min-w-0">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1">
            Where
          </legend>
          <Select
            value={log.positionId ?? "__none__"}
            onValueChange={(v) => {
              const nextPosition = v === "__none__" ? null : (v ?? null);
              onUpdate({
                id: log.id,
                ...buildShiftAwarePatch({ positionId: nextPosition, shiftId: null }),
              });
            }}
          >
            <SelectTrigger
              aria-label="Job"
              className="h-7 px-2 text-xs gap-1 w-full shadow-none"
            >
              <SelectValue>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{pos ? pos.company : "No job"}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No job</SelectItem>
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
          {log.positionId && (
            <>
              <Select
                value={log.shiftId ?? "__none__"}
                onValueChange={(v) => {
                  const nextShiftId = v === "__none__" ? null : (v ?? null);
                  onUpdate({
                    id: log.id,
                    ...buildShiftAwarePatch({ shiftId: nextShiftId }),
                  });
                }}
              >
                <SelectTrigger
                  aria-label="Shift"
                  className="h-7 px-2 text-xs gap-1 w-full shadow-none"
                >
                  <SelectValue>
                    <span className="truncate">
                      {selectedShift
                        ? `${selectedShift.name} (${timeLabelFromMinutes(selectedShift.startMinute)}–${timeLabelFromMinutes(selectedShift.endMinute)})`
                        : "No shift"}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No shift</SelectItem>
                  {shifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({timeLabelFromMinutes(s.startMinute)}–
                      {timeLabelFromMinutes(s.endMinute)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setNewShiftOpen((v) => !v)}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              >
                {newShiftOpen ? "Cancel new shift" : "+ New shift…"}
              </button>
            </>
          )}
        </fieldset>

        {/* EFFORT */}
        <fieldset className="space-y-1.5 min-w-0">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1">
            Effort
          </legend>
          <Select
            value={log.category}
            onValueChange={(v) =>
              onUpdate({
                id: log.id,
                category: (v ?? "task") as WorkLog["category"],
              })
            }
          >
            <SelectTrigger
              aria-label="Category"
              className="h-7 px-2 text-xs gap-1 w-full shadow-none"
            >
              <SelectValue>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  {CatIcon && <CatIcon className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{cat?.label ?? log.category}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIES).map(([k, c]) => (
                <SelectItem key={k} value={k}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="inline-flex items-center gap-1.5 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <input
              type="number"
              step="0.25"
              min="0"
              aria-label="Hours worked"
              value={hoursValue}
              onChange={(e) => onHoursChange(e.target.value)}
              onBlur={onHoursBlur}
              placeholder="—"
              className="w-14 bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none tabular-nums"
            />
            <span className="text-muted-foreground">hours</span>
          </label>
          <div
            className="inline-flex items-center gap-0.5"
            role="group"
            aria-label="Mood"
          >
            {MOODS.map((m) => {
              const Icon = m.icon;
              const sel = log.mood === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() =>
                    onUpdate({ id: log.id, mood: sel ? null : m.value })
                  }
                  aria-label={m.label}
                  aria-pressed={sel}
                  title={m.label}
                  className={cn(
                    "h-6 w-6 rounded flex items-center justify-center transition-colors",
                    sel
                      ? cn("bg-accent", m.color)
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* New-shift inline form (only when WHERE has a job and user clicked "+ New shift…") */}
      {newShiftOpen && log.positionId && (
        <div className="border-t pt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[160px]">
            <p className="text-[10px] text-muted-foreground mb-1">Shift name</p>
            <Input
              value={newShiftName}
              onChange={(e) => setNewShiftName(e.target.value)}
              placeholder="Night shift"
              className="h-7 text-xs"
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Start</p>
            <Input
              type="time"
              value={newShiftStart}
              onChange={(e) => setNewShiftStart(e.target.value)}
              className="h-7 text-xs w-[120px]"
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">End</p>
            <Input
              type="time"
              value={newShiftEnd}
              onChange={(e) => setNewShiftEnd(e.target.value)}
              className="h-7 text-xs w-[120px]"
            />
          </div>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => void createShiftTemplate()}
          >
            Save shift
          </Button>
        </div>
      )}
    </div>
  );
}

function Separator() {
  return <span aria-hidden className="opacity-40">·</span>;
}
