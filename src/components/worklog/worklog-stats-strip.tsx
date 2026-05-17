/**
 * WorklogStatsStrip — the 4-card summary row at the top of the worklog page
 * (streak, entries this month, notable count, template count).
 *
 * Pure presentational: receives the already-computed numbers from the
 * orchestrator.
 */

import { Flame, CalendarDays, Star, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface WorklogStatsStripProps {
  streak: number;
  totalThisMonth: number;
  notableCount: number;
  templateCount: number;
}

export function WorklogStatsStrip({
  streak,
  totalThisMonth,
  notableCount,
  templateCount,
}: WorklogStatsStripProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5" /> Current streak
        </div>
        <div className="text-2xl font-bold mt-1">
          {streak} <span className="text-sm font-normal text-muted-foreground">days</span>
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" /> This month
        </div>
        <div className="text-2xl font-bold mt-1">
          {totalThisMonth} <span className="text-sm font-normal text-muted-foreground">entries</span>
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5" /> Notable
        </div>
        <div className="text-2xl font-bold mt-1">
          {notableCount} <span className="text-sm font-normal text-muted-foreground">all-time</span>
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Templates
        </div>
        <div className="text-2xl font-bold mt-1">{templateCount}</div>
      </Card>
    </div>
  );
}
