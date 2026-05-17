/**
 * WorklogHeatmap — 12-week GitHub-style activity grid.
 *
 * Clicking a cell calls back with the selected date (or null to clear).
 * The orchestrator owns the selectedDate state and the actual filtering;
 * this component only handles the visual + the click target.
 */

import { isSameDay, format } from "date-fns";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";
import { buildHeatmap, intensityClass } from "@/components/worklog/heatmap-utils";
import { useMemo } from "react";

export interface WorklogHeatmapProps {
  logs: WorkLog[];
  selectedDate: Date | null;
  onSelectDate: (d: Date | null) => void;
}

export function WorklogHeatmap({ logs, selectedDate, onSelectDate }: WorklogHeatmapProps) {
  const weeks = useMemo(() => buildHeatmap(logs), [logs]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Activity (last 12 weeks)</h2>
        {selectedDate && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSelectDate(null)}
            className="h-7 text-xs"
          >
            <X className="h-3 w-3 mr-1" /> Clear day filter
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {weeks.map((w, i) => (
            <div key={i} className="flex flex-col gap-1">
              {w.map((c) => {
                const isSel = selectedDate && isSameDay(c.date, selectedDate);
                return (
                  <button
                    key={c.key}
                    onClick={() => onSelectDate(isSel ? null : c.date)}
                    title={`${format(c.date, "MMM d, yyyy")} — ${c.count} entr${c.count === 1 ? "y" : "ies"}`}
                    className={cn(
                      "h-3 w-3 rounded-sm transition-all hover:scale-125",
                      intensityClass(c.count),
                      isSel && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className="h-3 w-3 rounded-sm bg-muted/40" />
        <div className="h-3 w-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/60" />
        <div className="h-3 w-3 rounded-sm bg-emerald-300 dark:bg-emerald-700/70" />
        <div className="h-3 w-3 rounded-sm bg-emerald-400 dark:bg-emerald-600/80" />
        <div className="h-3 w-3 rounded-sm bg-emerald-500" />
        <span>More</span>
      </div>
    </Card>
  );
}
