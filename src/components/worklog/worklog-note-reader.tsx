/**
 * WorklogNoteReader — right pane of the notes shell.
 *
 * Inline, save-on-blur reader/editor for the selected WorkLog. There is no
 * "Save" button: every field commits on blur (and text fields also commit
 * after ~800 ms of idle typing via `useAutosaveField`).
 *
 * Layout:
 *   • Top action row: title (large), notable star, delete, mood selector
 *   • Compact meta strip: date · category · position · hours · tags
 *   • Body textarea (auto-expanding)
 *   • Disclosure sections: Photos (lazy via WorklogPhotoSection), Tools,
 *     Assets — each opens to its picker / grid.
 *
 * Empty state: when `log` is null we render a centered call to create or
 * select a note.
 */

"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Star,
  Trash2,
  ChevronRight,
  Briefcase,
  Clock,
  Calendar,
  FileText,
  Wrench,
  Cog,
  Pencil,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/components/ui/tag-input";
import { EquipmentPicker, type EquipmentItem } from "@/components/equipment-picker";
import { AssetPicker, type JobAsset } from "@/components/asset-picker";
import { cn } from "@/lib/utils";
import type { WorkLog, Position, WorkShift } from "@/types/worklog";
import { CATEGORIES, MOODS } from "@/components/worklog/constants";
import { readAutosaveDraft, useAutosaveField } from "@/components/worklog/hooks/use-autosave";
import { useWorklogDrafts } from "@/components/worklog/hooks/use-worklog-drafts";
import { WorklogPhotoSection } from "@/components/worklog/worklog-photo-section";
import { WorklogEditor, type WorklogEditorHandle } from "@/components/worklog/worklog-editor";
import { WorklogNoteView } from "@/components/worklog/worklog-note-view";
import { extractTagsFromDoc, mergeEditorTags } from "@/lib/worklog/tiptap/extract-tags";
import {
  computeWorkdayDateLocal,
  localDateAndMinuteFromIso,
  minutesFromTimeLabel,
  timeLabelFromMinutes,
  toIsoFromLocalDate,
  toIsoFromLocalDateTime,
} from "@/lib/worklog-shifts";

export interface WorklogNoteReaderProps {
  log: WorkLog | null;
  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];
  positionMap: Map<string, Position>;
  /** Commit a single-field update for an existing log. */
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  onDelete: (id: string) => void;
  onNew?: () => void;
  hasLogs?: boolean;
}

export interface WorklogNoteReaderHandle {
  flushAutosave: () => void;
  focusTitle: () => void;
}

export const WorklogNoteReader = forwardRef<WorklogNoteReaderHandle, WorklogNoteReaderProps>(function WorklogNoteReader({
  log,
  positions,
  equipment,
  assets,
  positionMap,
  onUpdate,
  onDelete,
  onNew,
  hasLogs,
}, ref) {
  const innerRef = useRef<WorklogNoteReaderHandle | null>(null);

  useImperativeHandle(ref, () => ({
    flushAutosave: () => innerRef.current?.flushAutosave(),
    focusTitle: () => innerRef.current?.focusTitle(),
  }), []);

  if (!log) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium mb-1">
          {hasLogs ? "Select a note" : "No notes yet"}
        </p>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs">
          {hasLogs
            ? "Pick an entry on the left to read or edit it inline."
            : "Capture your day in seconds. Notes save automatically as you type."}
        </p>
        {onNew && (
          <Button size="sm" onClick={onNew}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            {hasLogs ? "New note" : "Create your first note"}
          </Button>
        )}
      </div>
    );
  }

  return <ReaderInner
    // remount when switching notes so internal autosave field state resets cleanly
    key={log.id}
    ref={innerRef}
    log={log}
    positions={positions}
    equipment={equipment}
    assets={assets}
    positionMap={positionMap}
    onUpdate={onUpdate}
    onDelete={onDelete}
  />;
});

interface ReaderInnerProps {
  log: WorkLog;
  positions: Position[];
  equipment: EquipmentItem[];
  assets: JobAsset[];
  positionMap: Map<string, Position>;
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  onDelete: (id: string) => void;
}

const ReaderInner = forwardRef<WorklogNoteReaderHandle, ReaderInnerProps>(function ReaderInner({
  log,
  positions,
  equipment,
  assets,
  positionMap,
  onUpdate,
  onDelete,
}, ref) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<WorklogEditorHandle | null>(null);
  const { draftsLoading, draftMap, saveFieldDraft, clearFieldDraft } = useWorklogDrafts(log.id);

  const titleKey = `worklog:draft:${log.id}:title`;
  const tagsKey = `worklog:draft:${log.id}:tags`;
  const hoursKey = `worklog:draft:${log.id}:hours`;

  const titleInitial =
    typeof draftMap.title === "string"
      ? draftMap.title
      : readAutosaveDraft<string>(titleKey) ?? (log.title ?? "");
  const tagsInitial =
    typeof draftMap.tags === "string"
      ? draftMap.tags
      : readAutosaveDraft<string>(tagsKey) ?? (log.tags ?? "");
  const hoursInitial =
    typeof draftMap.hours === "string"
      ? draftMap.hours
      : readAutosaveDraft<string>(hoursKey) ?? (log.hours != null ? String(log.hours) : "");

  // Editor state (content) lives in Y.js + IndexedDB now; only mirror dirty/saving for the badge.
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);

  // Autosave fields — title/tags/hours still debounce 800 ms while typing and on blur.
  const titleField = useAutosaveField(log.title ?? "", (v) =>
    onUpdate({ id: log.id, title: v.trim() || "Untitled" }),
    {
      persistKey: titleKey,
      initialValue: titleInitial,
      onDraftChange: (v) => saveFieldDraft("title", v),
      onCommitSuccess: () => clearFieldDraft("title"),
    },
  );
  const tagsField = useAutosaveField(log.tags ?? "", (v) =>
    onUpdate({ id: log.id, tags: v || null }),
    {
      persistKey: tagsKey,
      initialValue: tagsInitial,
      onDraftChange: (v) => saveFieldDraft("tags", v),
      onCommitSuccess: () => clearFieldDraft("tags"),
    },
  );
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

  const isDirty = titleField.isDirty || tagsField.isDirty || hoursField.isDirty || editorDirty;
  const isSaving = titleField.isSaving || tagsField.isSaving || hoursField.isSaving || editorSaving;

  function flushAllFields() {
    titleField.flush();
    tagsField.flush();
    hoursField.flush();
    editorRef.current?.flush();
  }

  useImperativeHandle(ref, () => ({
    flushAutosave: flushAllFields,
    focusTitle: () => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    },
  }), [hoursField, tagsField, titleField]);

  const [equipOpen, setEquipOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(true);
  const [newShiftOpen, setNewShiftOpen] = useState(false);
  const [newShiftName, setNewShiftName] = useState("");
  const [newShiftStart, setNewShiftStart] = useState("23:00");
  const [newShiftEnd, setNewShiftEnd] = useState("07:00");

  // Read-mode by default. Auto-open in edit mode for brand-new empty notes
  // so first-time capture doesn't require an extra click. (Phase 2c.)
  const hasJsonContent =
    !!log.contentJson &&
    typeof log.contentJson === "object" &&
    Array.isArray((log.contentJson as { content?: unknown[] }).content) &&
    ((log.contentJson as { content: unknown[] }).content?.length ?? 0) > 0;
  const hasTextContent = !!log.content && log.content.trim().length > 0;
  const [editMode, setEditMode] = useState(!hasJsonContent && !hasTextContent);

  const qc = useQueryClient();

  const cat = CATEGORIES[log.category];
  const CatIcon = cat?.icon;
  const pos = log.positionId ? positionMap.get(log.positionId) : null;
  const datePretty = useMemo(() => format(parseISO(log.date), "EEEE, MMMM d, yyyy"), [log.date]);

  const { localDate: initialLocalDate, minuteOfDay: initialMinute } = useMemo(
    () => localDateAndMinuteFromIso(log.date),
    [log.date],
  );
  const [dateInput, setDateInput] = useState(initialLocalDate);
  const [timeInput, setTimeInput] = useState(timeLabelFromMinutes(initialMinute));

  useEffect(() => {
    setDateInput(initialLocalDate);
    setTimeInput(timeLabelFromMinutes(initialMinute));
  }, [initialLocalDate, initialMinute]);

  const { data: shifts = [] } = useQuery<WorkShift[]>({
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

  const selectedShift = useMemo(
    () => shifts.find((s) => s.id === log.shiftId) ?? null,
    [shifts, log.shiftId],
  );

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
    qc.invalidateQueries({ queryKey: ["work-history-shifts", log.positionId] });
    onUpdate({ id: log.id, ...buildShiftAwarePatch({ shiftId: created.id }) });
    setNewShiftName("");
    setNewShiftOpen(false);
  }

  if (draftsLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading draft...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Title row */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b space-y-3">
        <div className="flex items-start gap-2">
          <Input
            ref={titleInputRef}
            value={titleField.value}
            onChange={(e) => titleField.onChange(e.target.value)}
            onBlur={titleField.onBlur}
            placeholder="Note title…"
            className="!text-xl font-semibold border-0 shadow-none focus-visible:ring-0 px-2 h-auto py-1 bg-transparent min-w-0 flex-1"
          />
          <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
            <Badge variant={isDirty ? "secondary" : "outline"} className="h-7 gap-1.5 px-2 text-[11px]">
              <span className={cn("h-1.5 w-1.5 rounded-full", isSaving ? "bg-amber-500" : isDirty ? "bg-rose-500" : "bg-emerald-500")} />
              {isSaving ? "Saving" : isDirty ? "Unsaved" : "Saved"}
            </Badge>
            <Button
              size="sm"
              variant="secondary"
              onClick={flushAllFields}
              disabled={!isDirty || isSaving}
              className="h-8 px-3"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onUpdate({ id: log.id, isNotable: !log.isNotable })}
              className="h-8 w-8 p-0"
              title={log.isNotable ? "Unmark notable" : "Mark notable"}
            >
              <Star className={cn("h-4 w-4", log.isNotable && "fill-amber-400 text-amber-500")} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("Delete this note?")) onDelete(log.id);
              }}
              className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              title="Delete note"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Meta strip */}
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs border-b bg-muted/20">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <input
            type="date"
            value={dateInput}
            onChange={(e) => {
              setDateInput(e.target.value);
              commitDateTime(e.target.value, timeInput);
            }}
            className="bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none cursor-pointer"
            title={datePretty}
          />
        </span>

        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <input
            type="time"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            onBlur={() => commitDateTime(dateInput, timeInput)}
            className="bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none"
          />
        </span>

        <Select
          value={log.category}
          onValueChange={(v) => onUpdate({ id: log.id, category: (v ?? "task") as WorkLog["category"] })}
        >
          <SelectTrigger className="h-6 px-1.5 text-xs gap-1 border-0 bg-transparent hover:bg-accent shadow-none w-auto">
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                {CatIcon && <CatIcon className="h-3 w-3" />}
                {cat?.label ?? log.category}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <SelectItem key={k} value={k}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={log.positionId ?? "__none__"}
          onValueChange={(v) => {
            const nextPosition = v === "__none__" ? null : (v ?? null);
            onUpdate({ id: log.id, ...buildShiftAwarePatch({ positionId: nextPosition, shiftId: null }) });
          }}
        >
          <SelectTrigger className="h-6 px-1.5 text-xs gap-1 border-0 bg-transparent hover:bg-accent shadow-none w-auto">
            <SelectValue>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Briefcase className="h-3 w-3" />
                <span className="text-foreground">{pos ? pos.company : "No job"}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No job</SelectItem>
            {positions.filter((p) => p.type === "job").map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.company}{p.title ? ` — ${p.title}` : ""}
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
                onUpdate({ id: log.id, ...buildShiftAwarePatch({ shiftId: nextShiftId }) });
              }}
            >
              <SelectTrigger className="h-6 px-1.5 text-xs gap-1 border-0 bg-transparent hover:bg-accent shadow-none w-auto">
                <SelectValue>
                  <span className="text-foreground">
                    {selectedShift
                      ? `${selectedShift.name} (${timeLabelFromMinutes(selectedShift.startMinute)}-${timeLabelFromMinutes(selectedShift.endMinute)})`
                      : "No shift"}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No shift</SelectItem>
                {shifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({timeLabelFromMinutes(s.startMinute)}-{timeLabelFromMinutes(s.endMinute)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => setNewShiftOpen((v) => !v)}
            >
              {newShiftOpen ? "Cancel shift" : "New shift"}
            </Button>
          </>
        )}

        <label className="inline-flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <input
            type="number"
            step="0.25"
            min="0"
            value={hoursField.value}
            onChange={(e) => hoursField.onChange(e.target.value)}
            onBlur={hoursField.onBlur}
            placeholder="—"
            className="w-12 bg-transparent border-0 p-0 text-xs text-foreground focus:outline-none tabular-nums"
          />
          <span>h</span>
        </label>

        <div className="inline-flex items-center gap-1">
          {MOODS.map((m) => {
            const Icon = m.icon;
            const sel = log.mood === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => onUpdate({ id: log.id, mood: sel ? null : m.value })}
                title={m.label}
                className={cn(
                  "h-5 w-5 rounded flex items-center justify-center transition-colors",
                  sel ? cn("bg-accent", m.color) : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
              </button>
            );
          })}

          <span className="ml-auto text-[11px] text-muted-foreground hidden lg:inline-flex">
            Auto-saves on blur and after a short pause. Use Save or ⌘/Ctrl+S to flush now.
          </span>
        </div>
      </div>

      {newShiftOpen && log.positionId && (
        <div className="px-4 sm:px-6 py-2 border-b bg-muted/10 flex flex-wrap items-end gap-2">
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
          <Button size="sm" className="h-7 text-xs" onClick={() => void createShiftTemplate()}>
            Save shift
          </Button>
        </div>
      )}

      {/* Body + sections */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="px-6 py-4 space-y-5">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              {editMode ? (
                <WorklogEditor
                  ref={editorRef}
                  workLogId={log.id}
                  initialContentJson={log.contentJson ?? null}
                  initialContent={log.content ?? null}
                  placeholder="Start writing…"
                  className="px-0"
                  shifts={shifts}
                  onStateChange={({ dirty, saving }) => {
                    setEditorDirty(dirty);
                    setEditorSaving(saving);
                  }}
                  onSave={async ({ json, text }) => {
                    const editorTags = extractTagsFromDoc(json);
                    const mergedTags = mergeEditorTags(log.tags ?? null, editorTags);
                    await onUpdate({
                      id: log.id,
                      content: text || null,
                      contentJson: json ?? null,
                      ...(mergedTags !== (log.tags ?? null) ? { tags: mergedTags } : {}),
                    });
                  }}
                />
              ) : (
                <WorklogNoteView
                  json={log.contentJson ?? null}
                  contentText={log.content ?? null}
                  className="px-0"
                />
              )}
            </div>
            <Button
              size="sm"
              variant={editMode ? "default" : "ghost"}
              className="h-7 px-2 text-xs shrink-0"
              onClick={() => {
                if (editMode) {
                  editorRef.current?.flush();
                  setEditMode(false);
                } else {
                  setEditMode(true);
                }
              }}
            >
              {editMode ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Done
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <TagInput
              value={tagsField.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)}
              onChange={(next) => tagsField.onChange(next.join(", "))}
              placeholder="Add tags and press Enter"
              className="w-full"
            />
          </div>

          {/* Photos section */}
          <details
            open={photosOpen}
            onToggle={(e) => setPhotosOpen((e.target as HTMLDetailsElement).open)}
            className="group border-t pt-3"
          >
            <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground select-none">
              <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              Photos
            </summary>
            <div className="mt-3">
              <WorklogPhotoSection workLogId={log.id} cols={4} />
            </div>
          </details>

          {/* Tools section */}
          {equipment.length > 0 && (
            <details
              open={equipOpen || (log.equipmentIds ?? []).length > 0}
              onToggle={(e) => setEquipOpen((e.target as HTMLDetailsElement).open)}
              className="group border-t pt-3"
            >
              <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground select-none">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                <Wrench className="h-3 w-3" />
                Tools
                {(log.equipmentIds ?? []).length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 text-[10px]">
                    {(log.equipmentIds ?? []).length}
                  </Badge>
                )}
              </summary>
              <div className="mt-3">
                <EquipmentPicker
                  label=""
                  equipment={equipment}
                  selectedIds={log.equipmentIds ?? []}
                  onChange={(ids) => onUpdate({ id: log.id, equipmentIds: ids })}
                />
              </div>
            </details>
          )}

          {/* Assets section */}
          <details
            open={assetsOpen || (log.assetIds ?? []).length > 0}
            onToggle={(e) => setAssetsOpen((e.target as HTMLDetailsElement).open)}
            className="group border-t pt-3 pb-6"
          >
            <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground select-none">
              <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              <Cog className="h-3 w-3" />
              Assets
              {(log.assetIds ?? []).length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 text-[10px]">
                  {(log.assetIds ?? []).length}
                </Badge>
              )}
            </summary>
            <div className="mt-3">
              <AssetPicker
                label=""
                assets={assets}
                positions={positions}
                selectedIds={log.assetIds ?? []}
                defaultPositionId={log.positionId ?? null}
                onChange={(ids) => onUpdate({ id: log.id, assetIds: ids })}
              />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
});
