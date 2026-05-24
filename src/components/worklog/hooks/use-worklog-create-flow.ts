/**
 * useWorklogCreateFlow — bundle of "create a new note" entry points that
 * share the same payload-building / select-after-create / mobile-show-reader
 * choreography.
 *
 *   • createBlankNote(opts) — primitive
 *   • startBlank()          — new empty note via "+ New"
 *   • startQuickCapture()   — from the quick-capture dialog
 *   • copyLast()            — duplicate metadata from most recent note
 *   • applyTemplate(t)      — pre-fill from a Template
 */

import { useCallback } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { Template, WorkLog, WorklogPreferences } from "@/types/worklog";
import type { FolderSelection } from "@/components/worklog/worklog-folders-rail";

interface CreateBlankOpts {
  positionId?: string | null;
  from?: Partial<WorkLog>;
}

interface UseWorklogCreateFlowDeps {
  logs: WorkLog[];
  defaults: WorklogPreferences;
  saveLog: UseMutationResult<WorkLog, Error, Partial<WorkLog>, unknown>;
  setActiveFolder: (f: FolderSelection) => void;
  setSelectedNoteId: (id: string | null) => void;
  setMobileShowReader: (v: boolean) => void;
  closeTemplatePicker: () => void;
}

export function useWorklogCreateFlow({
  logs,
  defaults,
  saveLog,
  setActiveFolder,
  setSelectedNoteId,
  setMobileShowReader,
  closeTemplatePicker,
}: UseWorklogCreateFlowDeps) {
  const createBlankNote = useCallback(
    async (opts: CreateBlankOpts = {}) => {
      const resolvedPositionId =
        opts.from?.positionId ?? opts.positionId ?? defaults.defaultPositionId ?? null;
      const resolvedShiftId =
        opts.from?.shiftId ??
        (defaults.defaultShiftId &&
        resolvedPositionId &&
        defaults.defaultPositionId === resolvedPositionId
          ? defaults.defaultShiftId
          : null);

      const payload: Partial<WorkLog> = {
        date: new Date().toISOString(),
        title: opts.from?.title || "Untitled",
        category: opts.from?.category ?? defaults.defaultCategory ?? "task",
        positionId: resolvedPositionId,
        shiftId: resolvedShiftId,
        content: opts.from?.content ?? "",
        hours: opts.from?.hours ?? defaults.defaultHours ?? null,
        tags: opts.from?.tags ?? null,
        mood: opts.from?.mood ?? defaults.defaultMood ?? null,
        equipmentIds: opts.from?.equipmentIds ?? [],
        assetIds: opts.from?.assetIds ?? [],
        templateId: opts.from?.templateId ?? null,
        isNotable: false,
      };
      try {
        const saved: WorkLog = await saveLog.mutateAsync(payload);
        setActiveFolder({ kind: "all" });
        setSelectedNoteId(saved.id);
        setMobileShowReader(true);
      } catch {
        // mutation surfaces errors via React Query
      }
    },
    [defaults, saveLog, setActiveFolder, setSelectedNoteId, setMobileShowReader],
  );

  const startBlank = useCallback(() => {
    void createBlankNote();
  }, [createBlankNote]);

  const startQuickCapture = useCallback(
    (data: { title: string; category: string; hours: number | null }) => {
      void createBlankNote({
        from: {
          title: data.title,
          category: data.category,
          hours: data.hours,
          content: "",
        },
      });
    },
    [createBlankNote],
  );

  const copyLast = useCallback(() => {
    const last = logs[0];
    if (!last) return;
    void createBlankNote({
      from: {
        title: last.title,
        category: last.category,
        positionId: last.positionId,
        tags: last.tags,
        mood: last.mood,
        equipmentIds: last.equipmentIds,
        assetIds: last.assetIds ?? [],
        hours: last.hours,
        content: "",
      },
    });
  }, [logs, createBlankNote]);

  const applyTemplate = useCallback(
    (t: Template) => {
      closeTemplatePicker();
      void createBlankNote({
        from: {
          title: t.defaultTitle || t.name,
          category: t.defaultCategory,
          positionId: t.defaultPositionId,
          tags: t.defaultTags,
          mood: t.defaultMood,
          equipmentIds: t.defaultEquipmentIds,
          assetIds: t.defaultAssetIds ?? [],
          hours: t.defaultDurationMinutes ? t.defaultDurationMinutes / 60 : null,
          templateId: t.id,
          content: "",
        },
      });
    },
    [createBlankNote, closeTemplatePicker],
  );

  return { createBlankNote, startBlank, startQuickCapture, copyLast, applyTemplate };
}
