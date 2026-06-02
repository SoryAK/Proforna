/**
 * Worklog heatmap utilities — pure functions for the 12-week activity grid
 * and the daily streak counter.
 *
 * Pure module: no React, no side effects.
 */

import {
  format,
  startOfDay,
  subDays,
  parseISO,
  eachDayOfInterval,
  startOfWeek,
} from "date-fns";
import type { WorkLog } from "@/types/worklog";

export interface HeatmapCell {
  date: Date;
  key: string;
  count: number;
}

/**
 * Build a heatmap matrix grouped into weeks (one column = one week, Sun→Sat).
 * The window ends today and spans `days` days back, snapped to the start of
 * the containing week.
 */
export function buildHeatmap(logs: WorkLog[], days = 84): HeatmapCell[][] {
  const today = startOfDay(new Date());
  const start = startOfWeek(subDays(today, days - 1), { weekStartsOn: 0 });
  const all = eachDayOfInterval({ start, end: today });

  const counts = new Map<string, number>();
  for (const log of logs) {
    const key = format(startOfDay(parseISO(log.date)), "yyyy-MM-dd");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cells: HeatmapCell[] = all.map((d) => ({
    date: d,
    key: format(d, "yyyy-MM-dd"),
    count: counts.get(format(d, "yyyy-MM-dd")) ?? 0,
  }));

  const weeks: HeatmapCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Tailwind class for a heatmap cell at a given entry count. */
export function intensityClass(count: number): string {
  if (count === 0) return "bg-muted/40";
  if (count === 1) return "bg-emerald-200 dark:bg-emerald-900/60";
  if (count === 2) return "bg-emerald-300 dark:bg-emerald-700/70";
  if (count <= 4) return "bg-emerald-400 dark:bg-emerald-600/80";
  return "bg-emerald-500 dark:bg-emerald-500";
}

/** Count the consecutive days ending today that have at least one entry. */
export function calcStreak(logs: WorkLog[]): number {
  if (logs.length === 0) return 0;
  const days = new Set(logs.map((l) => format(startOfDay(parseISO(l.date)), "yyyy-MM-dd")));
  let streak = 0;
  let cursor = startOfDay(new Date());
  while (days.has(format(cursor, "yyyy-MM-dd"))) {
    streak += 1;
    cursor = subDays(cursor, 1);
  }
  return streak;
}
