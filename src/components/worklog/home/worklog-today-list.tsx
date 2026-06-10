/**
 * WorklogTodayList — one-liner list of today's notes for the worklog home.
 *
 * Density-first per ADR-0014 G1 decision (one-liner over cards). Each row:
 *   • category dot color
 *   • title (truncated)
 *   • optional first-line preview (truncated, dim)
 *   • optional notable star
 *   • relative time (e.g. "2h ago")
 *
 * Click → router.push(`/worklog/notes/<id>`) per ADR-0024. Empty state
 * encourages Quick Capture above.
 */

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isToday, parseISO, formatDistanceToNowStrict } from "date-fns";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCategoryMeta } from "@/components/worklog/constants";
import type { WorkLog } from "@/types/worklog";

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
  // Strip HTML tags + collapse whitespace; first ~140 chars.
  const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > 160 ? `${plain.slice(0, 160)}…` : plain;
}

export function WorklogTodayList() {
  const { data: logs = [], isLoading } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    queryFn: () => fetch("/api/work-logs").then((r) => r.json()),
    staleTime: 30_000,
  });

  const today = useMemo(
    () =>
      logs
        .filter((l) => l.date && isToday(parseISO(l.date)))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [logs],
  );

  if (isLoading) {
    return (
      <div className="space-y-1">
        <div className="h-9 rounded-md bg-muted/40 animate-pulse" />
        <div className="h-9 rounded-md bg-muted/30 animate-pulse" />
      </div>
    );
  }

  if (today.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic px-1 py-2">
        Nothing logged today yet — capture a thought above to get started.
      </p>
    );
  }

  return (
    <ul className="rounded-lg border bg-card divide-y divide-border/60">
      {today.map((log) => {
        const dotClass = CATEGORY_DOT[log.category] ?? "bg-gray-400";
        const meta = resolveCategoryMeta(log.category);
        const preview = previewLine(log.content);
        return (
          <li key={log.id}>
            <Link
              href={`/worklog/notes/${log.id}`}
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
                {formatDistanceToNowStrict(parseISO(log.date), { addSuffix: false })} ago
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
