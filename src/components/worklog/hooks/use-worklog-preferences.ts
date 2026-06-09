/**
 * useWorklogPreferences — owns the user's worklog defaults (default position,
 * shift, category, mood, hours) plus the dependent default-shifts query and
 * the human-readable summary string shown in the toolbar.
 */

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Position, WorkShift, WorklogPreferences } from "@/types/worklog";

const EMPTY_PREFERENCES: WorklogPreferences = {
  defaultPositionId: null,
  defaultShiftId: null,
  defaultCategory: "task",
  defaultMood: null,
  defaultHours: null,
  voiceDictationConsentedAt: null,
};

export function useWorklogPreferences(
  positionMap: Map<string, Position>,
  opts: { onSaveSuccess?: () => void } = {},
) {
  const queryClient = useQueryClient();

  const { data: defaults = EMPTY_PREFERENCES } = useQuery<WorklogPreferences>({
    queryKey: ["worklog-preferences"],
    queryFn: async () => {
      const r = await fetch("/api/work-logs/preferences");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: defaultShifts = [], isLoading: loadingDefaultShifts } = useQuery<WorkShift[]>({
    queryKey: ["work-history-shifts", defaults.defaultPositionId],
    queryFn: async () => {
      const r = await fetch(`/api/work-history/${defaults.defaultPositionId}/shifts`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: !!defaults.defaultPositionId,
    staleTime: 60_000,
  });

  const defaultsSummary = useMemo(() => {
    const company = defaults.defaultPositionId
      ? positionMap.get(defaults.defaultPositionId)?.company ?? "Default company"
      : null;
    const shift = defaults.defaultShiftId
      ? defaultShifts.find((s) => s.id === defaults.defaultShiftId)?.name ?? null
      : null;

    if (company && shift) return `${company} · ${shift}`;
    if (company) return company;

    const hasOtherDefaults =
      defaults.defaultCategory !== "task" ||
      defaults.defaultMood != null ||
      defaults.defaultHours != null;
    return hasOtherDefaults ? "Custom defaults" : null;
  }, [defaults, positionMap, defaultShifts]);

  const saveDefaults = useMutation({
    mutationFn: async (next: WorklogPreferences) => {
      const r = await fetch("/api/work-logs/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<WorklogPreferences>;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["worklog-preferences"], saved);
      queryClient.invalidateQueries({
        queryKey: ["work-history-shifts", saved.defaultPositionId],
      });
      opts.onSaveSuccess?.();
      toast.success("Worklog defaults saved");
    },
    onError: () => toast.error("Could not save defaults"),
  });

  return {
    defaults,
    defaultShifts,
    loadingDefaultShifts,
    defaultsSummary,
    saveDefaults,
  };
}
