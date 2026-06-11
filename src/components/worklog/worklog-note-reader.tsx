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
import {
  Star,
  Trash2,
  ChevronRight,
  FileText,
  Wrench,
  Pencil,
  Check,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InlineTagsField } from "@/components/worklog/inline-tags-field";
import { InlineAssetsField } from "@/components/worklog/inline-assets-field";
import { EquipmentPicker, type EquipmentItem } from "@/components/equipment-picker";
import { type JobAsset } from "@/components/asset-picker";
import { cn } from "@/lib/utils";
import type { WorkLog, Position, WorkShift } from "@/types/worklog";
import { readAutosaveDraft, useAutosaveField } from "@/components/worklog/hooks/use-autosave";
import { useWorklogDrafts } from "@/components/worklog/hooks/use-worklog-drafts";
import { WorklogEditor, type WorklogEditorHandle } from "@/components/worklog/worklog-editor";
import { WorklogNoteView } from "@/components/worklog/worklog-note-view";
import { WorklogNoteMetaStrip } from "@/components/worklog/worklog-note-meta-strip";
// ADR-0023 — Backlinks, History, and Photos moved to the worklog reader
// right-rail. Imports kept out of this file so dead code doesn't drift back in.
import { extractTagsFromDoc, mergeEditorTags } from "@/lib/worklog/tiptap/extract-tags";
import { PromoteToEventDialog } from "@/components/worklog/promote-to-event-dialog";
import {
  computeWorkdayDateLocal,
  localDateAndMinuteFromIso,
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
  /** Unique tag strings from all logs for autocomplete. */
  tagSuggestions?: string[];
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
  tagSuggestions,
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
    tagSuggestions={tagSuggestions}
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
  tagSuggestions?: string[];
}

const ReaderInner = forwardRef<WorklogNoteReaderHandle, ReaderInnerProps>(function ReaderInner({
  log,
  positions,
  equipment,
  assets,
  positionMap,
  onUpdate,
  onDelete,
  tagSuggestions,
}, ref) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<WorklogEditorHandle | null>(null);
  const { draftsLoading, draftMap, saveFieldDraft, clearFieldDraft } = useWorklogDrafts(log.id);

  const titleKey = `worklog:draft:${log.id}:title`;
  const hoursKey = `worklog:draft:${log.id}:hours`;

  const titleInitial =
    typeof draftMap.title === "string"
      ? draftMap.title
      : readAutosaveDraft<string>(titleKey) ?? (log.title ?? "");
  const hoursInitial =
    typeof draftMap.hours === "string"
      ? draftMap.hours
      : readAutosaveDraft<string>(hoursKey) ?? (log.hours != null ? String(log.hours) : "");

  // Editor state (content) lives in Y.js + IndexedDB now; only mirror dirty/saving for the badge.
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);

  // Autosave fields — title/hours still debounce 800 ms while typing and on blur.
  // Tags moved to {@link InlineTagsField} (ADR-0023 Unit 3.1) which owns its own
  // autosave + draft persistence and is rendered in two places: the rail Tags
  // tab at xl+ and an inline mount below at < xl.
  const titleField = useAutosaveField(log.title ?? "", (v) =>
    onUpdate({ id: log.id, title: v.trim() || "Untitled" }),
    {
      persistKey: titleKey,
      initialValue: titleInitial,
      onDraftChange: (v) => saveFieldDraft("title", v),
      onCommitSuccess: () => clearFieldDraft("title"),
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

  const isDirty = titleField.isDirty || hoursField.isDirty || editorDirty;
  const isSaving = titleField.isSaving || hoursField.isSaving || editorSaving;

  function flushAllFields() {
    titleField.flush();
    hoursField.flush();
    editorRef.current?.flush();
  }

  useImperativeHandle(ref, () => ({
    flushAutosave: flushAllFields,
    focusTitle: () => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    },
  }), [hoursField, titleField]);

  const [equipOpen, setEquipOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  // Auto-start in edit mode and expand details only for brand-new notes
  // (created within the last 15 s). Old notes that happen to have no body
  // text should open in read mode — the user is reviewing, not capturing.
  const isNewNote = Date.now() - new Date(log.createdAt).getTime() < 15_000;
  const [editMode, setEditMode] = useState(isNewNote);

  const qc = useQueryClient();

  const pos = log.positionId ? positionMap.get(log.positionId) : null;

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

  if (draftsLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading draft...
      </div>
    );
  }

  return (
    <>
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
              title="Save now — fields also auto-save on blur and after a short pause (⌘/Ctrl+S)"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant={editMode ? "default" : "ghost"}
              onClick={() => {
                if (editMode) {
                  editorRef.current?.flush();
                  setEditMode(false);
                } else {
                  setEditMode(true);
                }
              }}
              className="h-8 px-2.5"
              title={editMode ? "Switch back to read view" : "Edit note body"}
              aria-pressed={editMode}
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onUpdate({ id: log.id, isNotable: !log.isNotable })}
              className="h-8 w-8 p-0"
              title={log.isNotable ? "Unmark notable" : "Mark notable"}
              aria-pressed={!!log.isNotable}
            >
              <Star className={cn("h-4 w-4", log.isNotable && "fill-amber-400 text-amber-500")} />
            </Button>
            {/* Promote button — only for notable entries that have a position and aren't promoted yet */}
            {log.isNotable && log.positionId && !log.promotedToCareerEventId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPromoteOpen(true)}
                className="h-8 px-2 gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                title="Promote to career event"
              >
                <Trophy className="h-3.5 w-3.5" />
                <span className="text-xs font-medium hidden sm:inline">Promote</span>
              </Button>
            )}
            {/* Promoted indicator */}
            {log.promotedToCareerEventId && (
              <span
                className="inline-flex items-center gap-1 px-2 h-8 rounded text-xs font-medium text-emerald-700 dark:text-emerald-300"
                title="Already promoted to a career event"
              >
                <Trophy className="h-3.5 w-3.5" /> Promoted
              </span>
            )}
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

      {/* Meta strip — collapsible details (date/time/category/job/shift/hours/mood) */}
      <WorklogNoteMetaStrip
        log={log}
        positions={positions}
        positionMap={positionMap}
        shifts={shifts}
        dateInput={dateInput}
        setDateInput={setDateInput}
        timeInput={timeInput}
        setTimeInput={setTimeInput}
        hoursValue={hoursField.value}
        onHoursChange={hoursField.onChange}
        onHoursBlur={hoursField.onBlur}
        commitDateTime={commitDateTime}
        buildShiftAwarePatch={buildShiftAwarePatch}
        onUpdate={onUpdate}
        onShiftsRefetch={() =>
          qc.invalidateQueries({ queryKey: ["work-history-shifts", log.positionId] })
        }
        defaultExpanded={isNewNote}
      />

      {/* Body + sections */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="px-6 py-5 space-y-7">
          <div className="min-w-0">
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
          {/*
            ADR-0023 — Backlinks, History, and Photos now live in the worklog
            reader right-rail (WorklogReaderRightRail) mounted as a sibling of
            this reader by worklog-notes-and-reader. Tags moved to the rail's
            Tags tab in Unit 3.1 (xl+); below xl the rail is hidden and Tags
            stay inline via the InlineTagsField mount below.
          */}

          {/* Tags — inline at < xl, hidden at xl+ (rail Tags tab owns it). */}
          <InlineTagsField
            log={log}
            onUpdate={onUpdate}
            tagSuggestions={tagSuggestions}
            className="xl:hidden"
          />

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

          {/* Assets section — InlineAssetsField owns its own collapsible
              shell + auto-tag merge bridge (ADR-0025 Unit 1). */}
          <InlineAssetsField
            log={log}
            assets={assets}
            positions={positions}
            onUpdate={onUpdate}
          />
        </div>
      </div>
    </div>

    {/* Promotion dialog — mounts only when a promotable notable is open */}
    {log.isNotable && log.positionId && !log.promotedToCareerEventId && (
      <PromoteToEventDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        logId={log.id}
        logTitle={log.title}
        logDate={log.date instanceof Date ? log.date.toISOString() : String(log.date)}
        positionId={log.positionId}
        onPromoted={(eventId) =>
          onUpdate({ id: log.id, promotedToCareerEventId: eventId })
        }
      />
    )}
    </>
  );
});
