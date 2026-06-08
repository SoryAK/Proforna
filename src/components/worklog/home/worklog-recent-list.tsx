/**
 * WorklogRecentList — "Earlier this week" one-liner list for the worklog
 * home. Shows the most recent ~8 notes EXCLUDING today (today gets its own
 * dedicated list above). Click → /worklog/notes?focus=<id>.
 *
 * Same row pattern as WorklogTodayList; consider extracting if a third
 * surface adopts it.
 */

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isToday, parseISO, formatDistanceToNowStrict } from "date-fns";
import { ArrowRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCategoryMeta } from "@/components/worklog/constants";
import type { WorkLog } from "@/types/worklog";

const RECENT_LIMIT = 8;

const CATEGORY_DOT: Record<string, string> = {
  task: "bg-orange-500",
  project: "bg-purple-500",
  meeting: "bg-indigo-500",
  training: "bg-emerald-500",
  administrative: "bg-slate-400",
  maintenance: "bg-amber-500",
  troubleshooting: "bg-cyan-500",
  "on-call": "bg-red-500",
  other: "bg-gray-400",
};

function previewLine(content: string | null | undefined): string {
  if (!content) return "";
  const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > 160 ? `${plain.slice(0, 160)}…` : plain;
}

export function WorklogRecentList() {
  const { data: logs = [] } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    queryFn: () => fetch("/api/work-logs").then((r) => r.json()),
    staleTime: 30_000,
  });

  const recent = useMemo(
    () =>
      logs
        .filter((l) => l.date && !isToday(parseISO(l.date)))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .slice(0, RECENT_LIMIT),
    [logs],
  );

  if (recent.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Earlier this week
        </h2>
        <Link
          href="/worklog/notes"
          className="text-xs text-orange-600 dark:text-orange-300 hover:underline flex items-center gap-1"
        >
          View all notes <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <ul className="rounded-lg border bg-card divide-y divide-border/60">
        {recent.map((log) => {
          const dotClass = CATEGORY_DOT[log.category] ?? "bg-gray-400";
          const meta = resolveCategoryMeta(log.category);
          const preview = previewLine(log.content);
          return (
            <li key={log.id}>
              <Link
                href={`/worklog/notes?focus=${log.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
              >
                <span
                  className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass)}
                  title={meta?.label}
                />
                <span className="font-medium truncate shrink-0 max-w-[24ch]">
                  {log.title || "Untitled"}
                </span>
                {log.isNotable && (
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                )}
                {preview && (
                  <span className="text-muted-foreground truncate flex-1 min-w-0">
                    — {preview}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-auto">
                  {formatDistanceToNowStrict(parseISO(log.date), { addSuffix: true })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
