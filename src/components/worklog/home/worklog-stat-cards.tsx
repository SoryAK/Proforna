/**
 * WorklogStatCards — three glance cards on the worklog home (ADR-0014):
 *   1. Streak (with mini sparkline of last 14 days)
 *   2. This month (count + per-category mini chips)
 *   3. Notable (count + CTA link)
 *
 * Reuses useWorklogStats() and the existing category list. Clicks navigate
 * to filtered views on /worklog/notes.
 */

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isSameMonth, parseISO, startOfDay, subDays } from "date-fns";
import { CalendarDays, Flame, Star } from "lucide-react";
import { useWorklogStats } from "@/components/worklog/hooks/use-worklog-stats";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";

const SPARK_DAYS = 14;

export function WorklogStatCards() {
  const { data: logs = [] } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    queryFn: () => fetch("/api/work-logs").then((r) => r.json()),
    staleTime: 30_000,
  });

  const { streak, totalThisMonth, notableCount } = useWorklogStats(logs);

  // 14-day sparkline buckets (today on the right).
  const sparkline = useMemo(() => {
    const today = startOfDay(new Date());
    const cells: { key: string; count: number; isToday: boolean }[] = [];
    for (let i = SPARK_DAYS - 1; i >= 0; i--) {
      const d = subDays(today, i);
      const key = format(d, "yyyy-MM-dd");
      cells.push({ key, count: 0, isToday: i === 0 });
    }
    const map = new Map(cells.map((c) => [c.key, c]));
    for (const log of logs) {
      if (!log.date) continue;
      const key = format(startOfDay(parseISO(log.date)), "yyyy-MM-dd");
      const cell = map.get(key);
      if (cell) cell.count += 1;
    }
    return cells;
  }, [logs]);

  // Per-category breakdown for "this month".
  const monthBreakdown = useMemo(() => {
    const now = new Date();
    const counts = new Map<string, number>();
    for (const log of logs) {
      if (!log.date) continue;
      if (!isSameMonth(parseISO(log.date), now)) continue;
      counts.set(log.category, (counts.get(log.category) ?? 0) + 1);
    }
    const entries = Array.from(counts.entries()).sort(([, a], [, b]) => b - a);
    return entries.slice(0, 3);
  }, [logs]);

  const sparkMax = Math.max(1, ...sparkline.map((c) => c.count));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Streak */}
      <Link
        href="/worklog/notes"
        className="rounded-xl border bg-card p-4 hover:border-foreground/20 transition-colors group"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-500" />
            {streak}-day streak
          </h3>
          <span className="text-[10px] text-muted-foreground">last 14 days</span>
        </div>
        <div className="flex gap-0.5 h-5">
          {sparkline.map((cell) => {
            const intensity = cell.count === 0 ? 0 : Math.min(1, cell.count / sparkMax);
            return (
              <div
                key={cell.key}
                title={`${cell.key} · ${cell.count} note${cell.count === 1 ? "" : "s"}`}
                className={cn(
                  "flex-1 rounded-sm",
                  intensity === 0 ? "bg-muted/40" : "",
                  cell.isToday && intensity > 0 && "ring-1 ring-orange-300",
                )}
                style={{
                  background:
                    intensity > 0
                      ? `rgba(251, 146, 60, ${0.25 + intensity * 0.7})`
                      : undefined,
                }}
              />
            );
          })}
        </div>
        <div className="mt-3 text-xs text-orange-600 dark:text-orange-300 group-hover:translate-x-0.5 transition-transform">
          Open notes →
        </div>
      </Link>

      {/* This month */}
      <Link
        href="/worklog/notes"
        className="rounded-xl border bg-card p-4 hover:border-foreground/20 transition-colors group"
      >
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          This month
        </h3>
        <div className="text-3xl font-bold tabular-nums">{totalThisMonth}</div>
        <div className="text-xs text-muted-foreground mt-1">notes captured</div>
        {monthBreakdown.length > 0 && (
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {monthBreakdown.map(([cat, n]) => (
              <span
                key={cat}
                className="px-2 py-0.5 rounded text-[10px] bg-muted/60 text-foreground/70 tabular-nums"
              >
                {n} {cat}
              </span>
            ))}
          </div>
        )}
      </Link>

      {/* Notable */}
      <Link
        href="/worklog/notes?folder=notable"
        className="rounded-xl border bg-card p-4 hover:border-foreground/20 transition-colors group"
      >
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          Notable
        </h3>
        <div className="text-3xl font-bold tabular-nums">{notableCount}</div>
        <div className="text-xs text-muted-foreground mt-1">ready to promote to your resume</div>
        <div className="mt-3 text-xs text-orange-600 dark:text-orange-300 group-hover:translate-x-0.5 transition-transform">
          Review notable →
        </div>
      </Link>
    </div>
  );
}
