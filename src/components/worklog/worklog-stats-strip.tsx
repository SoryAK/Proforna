/**
 * WorklogStatsStrip — compact inline summary row for the worklog left rail.
 *
 * Renders streak · entries-this-month · notable count as a single line of
 * labeled numbers separated by hairline dividers. Templates count is shown
 * on the Templates tab itself, not here.
 *
 * Pure presentational: receives the already-computed numbers from the
 * orchestrator.
 */

import { Flame, CalendarDays, Star } from "lucide-react";

export interface WorklogStatsStripProps {
  streak: number;
  totalThisMonth: number;
  notableCount: number;
}

export function WorklogStatsStrip({
  streak,
  totalThisMonth,
  notableCount,
}: WorklogStatsStripProps) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <Flame className="h-3.5 w-3.5 text-orange-500" />
        <span className="font-semibold text-foreground tabular-nums">{streak}</span>
        <span>day streak</span>
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground tabular-nums">{totalThisMonth}</span>
        <span>this month</span>
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="inline-flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground tabular-nums">{notableCount}</span>
        <span>notable</span>
      </span>
    </div>
  );
}
