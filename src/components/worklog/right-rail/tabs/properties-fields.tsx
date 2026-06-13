/**
 * PropertiesFields — Tolaria-style key-value rows for the active note's
 * editable metadata, rendered at the top of the rail's Properties tab.
 *
 * Mirrors the same field set as <WorklogNoteMetaStrip>'s expanded view
 * (Date · Time · Category · Job · Shift · Folder · Hours · Mood) but laid
 * out as a single column of rows that fits the 320px rail width.
 *
 * Design intent (Tolaria parity):
 *   • Each row is `[icon · label]  [control]` with the label rail-fixed at
 *     ~80px so controls align in a clean column.
 *   • Controls are calm — borderless, no shadow, hover-reveal where useful.
 *   • All edits commit on change/blur via the same `onUpdate` patch the
 *     reader uses, so there's a single mutation path.
 *
 * Coexistence with <WorklogNoteMetaStrip>:
 *   • The rail (and therefore this component) only mounts at xl+. The
 *     reader hides <WorklogNoteMetaStrip> at xl+ via `xl:hidden`.
 *   • Both surfaces share the same `useAutosaveField` persist key for
 *     hours. Safe in practice because only one is visible at a time —
 *     CSS visibility means only the active surface receives input events,
 *     so no concurrent IndexedDB writes to the same key.
 */

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Calendar,
  Clock,
  Folder as FolderIcon,
  Hash,
  Inbox,
  Smile,
  Star,
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
import { MOODS, resolveCategoryMeta } from "@/components/worklog/constants";
import { useWorklogCategories } from "@/components/worklog/hooks/use-worklog-categories";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import { WORKLOG_CATEGORY_FALLBACK } from "@/lib/worklog-categories";
import {
  computeWorkdayDateLocal,
  localDateAndMinuteFromIso,
  minutesFromTimeLabel,
  timeLabelFromMinutes,
  toIsoFromLocalDate,
  toIsoFromLocalDateTime,
} from "@/lib/worklog-shifts";
import { readAutosaveDraft, useAutosaveField } from "@/components/worklog/hooks/use-autosave";
import { useWorklogDrafts } from "@/components/worklog/hooks/use-worklog-drafts";
import { WorklogMoveToFolderDialog } from "@/components/worklog/worklog-move-to-folder-dialog";

export interface PropertiesFieldsProps {
  log: WorkLog;
  positions: Position[];
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
}

export function PropertiesFields({ log, positions, onUpdate }: PropertiesFieldsProps) {
  // ── derive shared state ─────────────────────────────────────────────
  const positionMap = useMemo(
    () => new Map(positions.map((p) => [p.id, p])),
    [positions],
  );
  const pos = log.positionId ? positionMap.get(log.positionId) ?? null : null;
  const cat = resolveCategoryMeta(log.category);
  const CatIcon = cat?.icon ?? Hash;

  // ── shifts (TanStack dedupes with reader's same-key query) ──────────
  const { data: shifts = [], refetch: refetchShifts } = useQuery<WorkShift[]>({
    queryKey: ["work-history-shifts", log.positionId],
    queryFn: async () => {
      if (!log.positionId) return [];
      const r = await fetch(`/api/work-history/${log.positionId}/shifts`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!log.positionId,
    staleTime: 60_000,
  });
  const selectedShift = shifts.find((s) => s.id === log.shiftId) ?? null;

  // ── categories + folders ────────────────────────────────────────────
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

  const { folders } = useWorklogFolders();
  const currentFolder = log.folderId
    ? folders.find((f) => f.id === log.folderId) ?? null
    : null;

  // ── date / time inputs (locally controlled, commit on change/blur) ──
  const { localDate: initialLocalDate, minuteOfDay: initialMinute } = useMemo(
    () => localDateAndMinuteFromIso(log.date),
    [log.date],
  );
  const [dateInput, setDateInput] = useState(initialLocalDate);
  const [timeInput, setTimeInput] = useState(timeLabelFromMinutes(initialMinute));

  function buildShiftAwarePatch(partial: Partial<WorkLog>) {
    const nextDate = partial.date ?? log.date;
    const { localDate, minuteOfDay } = localDateAndMinuteFromIso(String(nextDate));

    const shiftId = partial.shiftId !== undefined ? partial.shiftId : log.shiftId;
    const shift = shiftId ? shifts.find((s) => s.id === shiftId) ?? null : null;
    const workdayLocal = computeWorkdayDateLocal(
      localDate,
      minuteOfDay,
      shift ? { startMinute: shift.startMinute, endMinute: shift.endMinute } : null,
    );
    const workdayIso = toIsoFromLocalDate(workdayLocal);

    return {
      ...partial,
      workdayDate: workdayIso,
    };
  }

  function commitDateTime(nextDate: string, nextTime: string) {
    const iso = toIsoFromLocalDateTime(nextDate, nextTime);
    if (!iso) return;
    onUpdate({ id: log.id, ...buildShiftAwarePatch({ date: iso }) });
  }

  // ── hours autosave (lifted from the reader; same persistKey is safe
  //     because only one surface receives input at a time) ──────────────
  const { draftMap, saveFieldDraft, clearFieldDraft } = useWorklogDrafts(log.id);
  const hoursKey = `worklog:draft:${log.id}:hours`;
  const hoursInitial =
    typeof draftMap.hours === "string"
      ? draftMap.hours
      : readAutosaveDraft<string>(hoursKey) ?? (log.hours != null ? String(log.hours) : "");
  const hoursField = useAutosaveField(
    log.hours != null ? String(log.hours) : "",
    (v) => onUpdate({ id: log.id, hours: v ? parseFloat(v) : null }),
    {
      persistKey: hoursKey,
      initialValue: hoursInitial,
      onDraftChange: (v) => saveFieldDraft("hours", v),
      onCommitSuccess: () => clearFieldDraft("hours"),
    },
  );

  // ── New-shift inline form (collapsed by default) ────────────────────
  const [newShiftOpen, setNewShiftOpen] = useState(false);
  const [newShiftName, setNewShiftName] = useState("");
  const [newShiftStart, setNewShiftStart] = useState("23:00");
  const [newShiftEnd, setNewShiftEnd] = useState("07:00");
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
    void refetchShifts();
    onUpdate({ id: log.id, ...buildShiftAwarePatch({ shiftId: created.id }) });
    setNewShiftName("");
    setNewShiftOpen(false);
  }

  // ── Folder picker dialog ────────────────────────────────────────────
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <div className="space-y-0.5">
      {/* Date */}
      <Row icon={Calendar} label="Date">
        <input
          type="date"
          aria-label="Date"
          value={dateInput}
          onChange={(e) => {
            setDateInput(e.target.value);
            commitDateTime(e.target.value, timeInput);
          }}
          className="w-full bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none cursor-pointer tabular-nums"
        />
      </Row>

      {/* Time */}
      <Row icon={Clock} label="Time">
        <input
          type="time"
          aria-label="Time"
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          onBlur={() => commitDateTime(dateInput, timeInput)}
          className="w-full bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none tabular-nums"
        />
      </Row>

      {/* Category */}
      <Row icon={CatIcon} label="Category">
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
            className="h-7 px-1.5 text-xs gap-1 w-full border-0 shadow-none hover:bg-accent/50 -mx-1.5"
          >
            <SelectValue>
              <span className="truncate">{cat?.label ?? log.category}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map(({ key, label }) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      {/* Job */}
      <Row icon={Briefcase} label="Job">
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
            className="h-7 px-1.5 text-xs gap-1 w-full border-0 shadow-none hover:bg-accent/50 -mx-1.5"
          >
            <SelectValue>
              <span className="truncate text-left">
                {pos ? pos.company : <span className="text-muted-foreground">No job</span>}
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
      </Row>

      {/* Shift — only when a job is selected */}
      {log.positionId && (
        <>
          <Row icon={Clock} label="Shift">
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
                className="h-7 px-1.5 text-xs gap-1 w-full border-0 shadow-none hover:bg-accent/50 -mx-1.5"
              >
                <SelectValue>
                  <span className="truncate text-left">
                    {selectedShift ? (
                      `${selectedShift.name} (${timeLabelFromMinutes(selectedShift.startMinute)}–${timeLabelFromMinutes(selectedShift.endMinute)})`
                    ) : (
                      <span className="text-muted-foreground">No shift</span>
                    )}
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
          </Row>

          {/* + New shift… inline expander, lives under the Shift row so
              it's discoverable without taking up its own row when unused. */}
          <div className="pl-[88px] pr-1.5 pb-1">
            <button
              type="button"
              onClick={() => setNewShiftOpen((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
            >
              {newShiftOpen ? "Cancel new shift" : "+ New shift…"}
            </button>
          </div>
          {newShiftOpen && (
            <div className="pl-[88px] pr-1.5 pb-2 space-y-1.5">
              <Input
                value={newShiftName}
                onChange={(e) => setNewShiftName(e.target.value)}
                placeholder="Shift name (e.g. Night)"
                className="h-7 text-xs"
              />
              <div className="flex items-center gap-1.5">
                <Input
                  type="time"
                  value={newShiftStart}
                  onChange={(e) => setNewShiftStart(e.target.value)}
                  className="h-7 text-xs flex-1 tabular-nums"
                  aria-label="New shift start"
                />
                <span className="text-muted-foreground text-xs">–</span>
                <Input
                  type="time"
                  value={newShiftEnd}
                  onChange={(e) => setNewShiftEnd(e.target.value)}
                  className="h-7 text-xs flex-1 tabular-nums"
                  aria-label="New shift end"
                />
              </div>
              <Button
                size="sm"
                className="h-7 text-xs w-full"
                onClick={() => void createShiftTemplate()}
              >
                Save shift
              </Button>
            </div>
          )}
        </>
      )}

      {/* Folder */}
      <Row icon={currentFolder ? FolderIcon : Inbox} label="Folder">
        <button
          type="button"
          onClick={() => setMoveOpen(true)}
          aria-label="Move to folder"
          className="w-full text-left text-xs px-1.5 -mx-1.5 h-7 rounded-md hover:bg-accent/50 transition-colors flex items-center min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate">
            {currentFolder ? (
              currentFolder.name
            ) : (
              <span className="text-muted-foreground">Unfiled</span>
            )}
          </span>
        </button>
      </Row>

      {/* Hours */}
      <Row icon={Clock} label="Hours">
        <input
          type="number"
          step="0.25"
          min="0"
          aria-label="Hours worked"
          value={hoursField.value}
          onChange={(e) => hoursField.onChange(e.target.value)}
          onBlur={hoursField.onBlur}
          placeholder="—"
          className="w-full bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none tabular-nums"
        />
      </Row>

      {/* Notable — flag that promotes the note as a career-event candidate.
          Lives in Properties because it IS a property of the note, not a
          verb. The Promote action stays in the reader header (it's a verb)
          and reads `log.isNotable` to gate its visibility. */}
      <Row icon={Star} label="Notable">
        <button
          type="button"
          onClick={() => onUpdate({ id: log.id, isNotable: !log.isNotable })}
          aria-pressed={!!log.isNotable}
          aria-label={log.isNotable ? "Unmark notable" : "Mark notable"}
          className="inline-flex items-center gap-1.5 -mx-1.5 px-1.5 h-7 rounded-md hover:bg-accent/50 transition-colors text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={cn(
              "h-3.5 w-3.5 transition-colors",
              log.isNotable ? "fill-amber-400 text-amber-500" : "text-muted-foreground",
            )}
          />
          <span className={log.isNotable ? "text-foreground" : "text-muted-foreground"}>
            {log.isNotable ? "Marked notable" : "Mark notable"}
          </span>
        </button>
      </Row>

      {/* Mood */}
      <Row icon={Smile} label="Mood">
        <div
          className="inline-flex items-center gap-0.5 -ml-1"
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
      </Row>

      <WorklogMoveToFolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        folders={folders}
        currentFolderId={log.folderId ?? null}
        onChoose={(folderId) =>
          onUpdate({ id: log.id, folderId: folderId ?? null })
        }
      />
    </div>
  );
}

// ── Row primitive ─────────────────────────────────────────────────────
//
// Tolaria-style key-value row: fixed-width left rail (icon + label) and a
// flex-1 right column for the editable control. Kept private to this file
// because no other surface needs this exact geometry.

interface RowProps {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}

function Row({ icon: Icon, label, children }: RowProps) {
  return (
    <div className="flex items-center gap-2 px-1.5 py-1 min-h-[28px]">
      <div className="flex items-center gap-1.5 w-[80px] shrink-0 text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="text-[11px] font-medium truncate">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
