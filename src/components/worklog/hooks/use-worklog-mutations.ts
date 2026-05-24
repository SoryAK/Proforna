/**
 * useWorklogMutations — all worklog & template create/update/delete mutations.
 * Owns query-cache invalidation. Accepts optional callbacks so the calling
 * component can react to successful saves (e.g. close a dialog).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkLog, Template } from "@/types/worklog";

export interface WorklogMutationCallbacks {
  /** Called after a log create/update succeeds (cache already invalidated). */
  onSaveLogSuccess?: () => void;
  /** Called after a template create/update succeeds. */
  onSaveTemplateSuccess?: () => void;
}

export function useWorklogMutations(cb: WorklogMutationCallbacks = {}) {
  const qc = useQueryClient();

  const saveLog = useMutation({
    mutationFn: async (data: Partial<WorkLog>) => {
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

      qc.setQueryData<WorkLog[]>(["worklogs"], (old = []) =>
        old.map((log) => {
          if (log.id !== data.id) return log;
          return {
            ...log,
            ...data,
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
   * Bulk multi-select action (W1.3). Posts to /api/work-logs/bulk which
   * runs `move` or `delete` over an id list inside a Prisma $transaction.
   * Invalidates both worklogs and folder counts on success.
   */
  const bulkAction = useMutation({
    mutationFn: async (input: {
      action: "move" | "delete";
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

  return { saveLog, deleteLog, saveTemplate, deleteTemplate, bulkAction };
}
