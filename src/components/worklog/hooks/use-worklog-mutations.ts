/**
 * useWorklogMutations — all worklog & template create/update/delete mutations.
 * Owns query-cache invalidation. Accepts optional callbacks so the calling
 * component can react to successful saves (e.g. close a dialog).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkLog, Template } from "@/types/worklog";
import type { FolderListResponse } from "./use-worklog-folders";

export interface WorklogMutationCallbacks {
  /** Called after a log create/update succeeds (cache already invalidated). */
  onSaveLogSuccess?: () => void;
  /** Called after a template create/update succeeds. */
  onSaveTemplateSuccess?: () => void;
}

export function useWorklogMutations(cb: WorklogMutationCallbacks = {}) {
  const qc = useQueryClient();

  const saveLog = useMutation({
    mutationFn: async (
      // `versionSource` is an ADR-0046 follow-up B transient body field
      // (not on WorkLog), forwarded to the PUT route so the auto-snapshot
      // row carries WorkLogVersion.source. Optional; absent on user-typed
      // saves and bulk patches.
      data: Partial<WorkLog> & { archived?: boolean; versionSource?: string },
    ) => {
      const isEdit = !!data.id;
      const url = isEdit ? `/api/work-logs/${data.id}` : "/api/work-logs";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: async (data) => {
      if (!data.id) return { previous: undefined as WorkLog[] | undefined };

      await qc.cancelQueries({ queryKey: ["worklogs"] });
      const previous = qc.getQueryData<WorkLog[]>(["worklogs"]);

      // ADR-0026 — translate the `archived: boolean` intent into an
      // optimistic archivedAt patch (the server is the timestamp
      // authority; this is just so the row visibly flips buckets without
      // waiting for the round-trip). `versionSource` is a transient body
      // tag (ADR-0046 follow-up B) and must NOT leak into cached row state.
      const { archived, versionSource: _versionSource, ...rest } = data;
      const archivedPatch =
        archived === true
          ? { archivedAt: new Date().toISOString() }
          : archived === false
            ? { archivedAt: null }
            : {};

      qc.setQueryData<WorkLog[]>(["worklogs"], (old = []) =>
        old.map((log) => {
          if (log.id !== data.id) return log;
          return {
            ...log,
            ...rest,
            ...archivedPatch,
            updatedAt: new Date().toISOString(),
          } as WorkLog;
        }),
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(["worklogs"], context.previous);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worklogs"] });
      qc.invalidateQueries({ queryKey: ["worklog-templates"] });
      cb.onSaveLogSuccess?.();
    },
  });

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/work-logs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worklogs"] }),
  });

  const saveTemplate = useMutation({
    mutationFn: async (data: Partial<Template>) => {
      const isEdit = !!data.id;
      const url = isEdit ? `/api/work-logs/templates/${data.id}` : "/api/work-logs/templates";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worklog-templates"] });
      cb.onSaveTemplateSuccess?.();
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/work-logs/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worklog-templates"] }),
  });

  /**
   * Bulk multi-select action (W1.3 + ADR-0026). Posts to /api/work-logs/bulk
   * which runs `move` / `delete` / `archive` / `unarchive` over an id list
   * inside a Prisma $transaction. Invalidates both worklogs and folder
   * counts on success.
   */
  const bulkAction = useMutation({
    mutationFn: async (input: {
      action: "move" | "delete" | "archive" | "unarchive";
      ids: string[];
      payload?: { folderId: string | null };
    }) => {
      const res = await fetch("/api/work-logs/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ ok: true; affected: number }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worklogs"] });
      qc.invalidateQueries({ queryKey: ["worklog-folders"] });
    },
  });

  const reorderNotes = useMutation({
    mutationFn: async (input: {
      items: Array<{ id: string; sortOrder: number; folderId?: string | null }>;
    }) => {
      const res = await fetch("/api/work-logs/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ ok: true; affected: number }>;
    },
    onMutate: async ({ items }) => {
      await qc.cancelQueries({ queryKey: ["worklogs"] });
      const previous = qc.getQueryData<WorkLog[]>(["worklogs"]);

      qc.setQueryData<WorkLog[]>(["worklogs"], (old = []) => {
        const patchMap = new Map(items.map((it) => [it.id, it]));
        return old.map((log) => {
          const patch = patchMap.get(log.id);
          if (!patch) return log;
          return { ...log, sortOrder: patch.sortOrder, folderId: patch.folderId ?? log.folderId };
        });
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(["worklogs"], context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["worklogs"] }),
  });

  const reorderFolders = useMutation({
    mutationFn: async (input: {
      items: Array<{ id: string; sortOrder: number; parentId?: string | null }>;
    }) => {
      const res = await fetch("/api/work-logs/folders/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ ok: true; affected: number }>;
    },
    onMutate: async ({ items }) => {
      await qc.cancelQueries({ queryKey: ["worklog-folders"] });
      const previous = qc.getQueryData<FolderListResponse>(["worklog-folders"]);

      qc.setQueryData<FolderListResponse>(["worklog-folders"], (old) => {
        if (!old) return old;
        const patchMap = new Map(items.map((it) => [it.id, it]));
        return {
          ...old,
          folders: old.folders.map((f) => {
            const patch = patchMap.get(f.id);
            if (!patch) return f;
            return { ...f, sortOrder: patch.sortOrder, parentId: patch.parentId ?? f.parentId };
          }),
        };
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(["worklog-folders"], context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["worklog-folders"] }),
  });

  return { saveLog, deleteLog, saveTemplate, deleteTemplate, bulkAction, reorderNotes, reorderFolders };
}
