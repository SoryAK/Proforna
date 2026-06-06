/**
 * WorklogHomeView — the worklog landing page (ADR-0014).
 *
 * Composition (top → bottom):
 *   1. Greeting + summary line
 *   2. Quick Capture hero        ← WorklogQuickCapture
 *   3. Today's notes             ← WorklogTodayList
 *   4. Stat cards                ← WorklogStatCards
 *   5. Folder grid               ← WorklogFolderGrid
 *   6. Earlier this week         ← WorklogRecentList
 *
 * This is the read-only home of `/worklog`. Editing/scanning lives at
 * `/worklog/notes` (the previous 2-pane experience). The sidebar override
 * from ADR-0013 gates on `pathname.startsWith("/worklog")` so it covers
 * both routes without changes here.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useWorklogStats } from "@/components/worklog/hooks/use-worklog-stats";
import { WorklogQuickCapture } from "@/components/worklog/home/worklog-quick-capture";
import { WorklogTodayList } from "@/components/worklog/home/worklog-today-list";
import { WorklogStatCards } from "@/components/worklog/home/worklog-stat-cards";
import { WorklogFolderGrid } from "@/components/worklog/home/worklog-folder-grid";
import { WorklogRecentList } from "@/components/worklog/home/worklog-recent-list";
import type { WorkLog } from "@/types/worklog";

export function WorklogHomeView() {
  const { data: logs = [] } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    queryFn: () => fetch("/api/work-logs").then((r) => r.json()),
    staleTime: 30_000,
  });
  const { streak, totalThisMonth, notableCount } = useWorklogStats(logs);

  const today = new Date();
  const summary = [
    `${streak}-day streak`,
    `${totalThisMonth} note${totalThisMonth === 1 ? "" : "s"} this month`,
    `${notableCount} notable`,
  ].join(" · ");

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">{format(today, "EEEE, MMMM d")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{summary}</p>
        </header>

        <WorklogQuickCapture />

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Today
            </h2>
          </div>
          <WorklogTodayList />
        </section>

        <WorklogStatCards />

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Folders
            </h2>
          </div>
          <WorklogFolderGrid />
        </section>

        <WorklogRecentList />
      </div>
    </div>
  );
}
