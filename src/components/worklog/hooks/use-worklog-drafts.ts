import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type WorklogDraftField = "title" | "content" | "tags" | "hours";

export type WorklogDraftRow = {
  field: WorklogDraftField;
  valueJson: unknown;
  updatedAt: string;
  expiresAt: string;
};

type DraftMap = Partial<Record<WorklogDraftField, unknown>>;

export function useWorklogDrafts(workLogId: string) {
  const qc = useQueryClient();

  const query = useQuery<WorklogDraftRow[]>({
    queryKey: ["worklog-drafts", workLogId],
    queryFn: async () => {
      const res = await fetch(`/api/work-logs/drafts?workLogId=${encodeURIComponent(workLogId)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!workLogId,
  });

  const draftMap = useMemo<DraftMap>(() => {
    const out: DraftMap = {};
    for (const row of query.data ?? []) {
      out[row.field] = row.valueJson;
    }
    return out;
  }, [query.data]);

  const saveDraft = useMutation({
    mutationFn: async (payload: { field: WorklogDraftField; value: unknown }) => {
      const res = await fetch("/api/work-logs/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workLogId, field: payload.field, value: payload.value }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<WorklogDraftRow>;
    },
    onMutate: async ({ field, value }) => {
      await qc.cancelQueries({ queryKey: ["worklog-drafts", workLogId] });
      const previous = qc.getQueryData<WorklogDraftRow[]>(["worklog-drafts", workLogId]);
      const nowIso = new Date().toISOString();
      qc.setQueryData<WorklogDraftRow[]>(["worklog-drafts", workLogId], (old = []) => {
        const others = old.filter((row) => row.field !== field);
        return [
          ...others,
          {
            field,
            valueJson: value,
            updatedAt: nowIso,
            expiresAt: nowIso,
          },
        ];
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["worklog-drafts", workLogId], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["worklog-drafts", workLogId] });
    },
  });

  const clearDraft = useMutation({
    mutationFn: async (field?: WorklogDraftField) => {
      const qs = new URLSearchParams({ workLogId });
      if (field) qs.set("field", field);
      const res = await fetch(`/api/work-logs/drafts?${qs.toString()}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: async (field) => {
      await qc.cancelQueries({ queryKey: ["worklog-drafts", workLogId] });
      const previous = qc.getQueryData<WorklogDraftRow[]>(["worklog-drafts", workLogId]);
      qc.setQueryData<WorklogDraftRow[]>(["worklog-drafts", workLogId], (old = []) => {
        if (!field) return [];
        return old.filter((row) => row.field !== field);
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["worklog-drafts", workLogId], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["worklog-drafts", workLogId] });
    },
  });

  return {
    draftsLoading: query.isLoading,
    draftMap,
    saveFieldDraft: (field: WorklogDraftField, value: unknown) => saveDraft.mutate({ field, value }),
    clearFieldDraft: (field: WorklogDraftField) => clearDraft.mutate(field),
  };
}
