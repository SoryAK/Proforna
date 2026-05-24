/**
 * useWorklogStats — quick aggregates for the folders rail (current streak,
 * total notes this month, count of notable notes).
 */

import { useMemo } from "react";
import { parseISO } from "date-fns";
import type { WorkLog } from "@/types/worklog";
import { calcStreak } from "@/components/worklog/heatmap-utils";

export function useWorklogStats(logs: WorkLog[]) {
  const streak = useMemo(() => calcStreak(logs), [logs]);

  const totalThisMonth = useMemo(() => {
    const now = new Date();
    return logs.filter((l) => {
      const d = parseISO(l.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [logs]);

  const notableCount = useMemo(
    () => logs.filter((l) => l.isNotable || l.accomplishment).length,
    [logs],
  );

  return { streak, totalThisMonth, notableCount };
}
