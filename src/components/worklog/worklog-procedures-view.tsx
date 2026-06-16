/**
 * WorklogProceduresView — sibling surface to `/worklog/notes` for runbooks
 * (ADR-0029).
 *
 * Layout (single column, no inline 3-pane — matches WorklogEventsView shape):
 *   Header (icon + title + subtitle + "+ New procedure" CTA)
 *   List of <ProcedureRow> grouped by year
 *     ↓ click row → routes to /worklog/notes/[id] (the standard worklog
 *                   editor — procedures inherit the full Tiptap surface).
 *
 * The "+ New procedure" CTA POSTs `{ kind: "procedure", title: "Untitled
 * procedure", date: nowIso }` to `/api/work-logs`, invalidates the cache,
 * and routes to the new row's editor URL. Per ADR-0029 the home page does
 * NOT surface a procedure quick-capture — creation lives ONLY on this page.
 *
 * Query key `["worklogs", "procedures"]` is shared with the sidebar
 * Procedures count badge so they stay in lockstep.
 */

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";

const PROCEDURES_QUERY_KEY = ["worklogs", "procedures"] as const;

async function fetchProcedures(): Promise<WorkLog[]> {
  const r = await fetch("/api/work-logs?archived=all&kind=procedure");
  if (!r.ok) throw new Error(await r.text());
  const json = await r.json();
  if (!Array.isArray(json)) throw new Error("Unexpected response shape");
  return json as WorkLog[];
}

interface ProcedureRowProps {
  log: WorkLog;
  onClick: () => void;
}

function ProcedureRow({ log, onClick }: ProcedureRowProps) {
  const dateLabel = new Date(log.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border border-border/60 bg-card",
        "px-4 py-3 text-left transition-colors",
        "hover:bg-accent/50 hover:border-border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      )}
    >
      <span
        className={cn(
          "flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md text-xs font-bold",
          "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
        )}
        aria-hidden
      >
        R
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {log.title || "Untitled procedure"}
        </div>
        <div className="text-xs text-muted-foreground">{dateLabel}</div>
      </div>
    </button>
  );
}

function groupByYear(logs: WorkLog[]): Array<{ year: string; rows: WorkLog[] }> {
  const buckets = new Map<string, WorkLog[]>();
  for (const log of logs) {
    const year = String(new Date(log.date).getFullYear());
    const list = buckets.get(year) ?? [];
    list.push(log);
    buckets.set(year, list);
  }
  return Array.from(buckets.entries())
    .map(([year, rows]) => ({ year, rows }))
    .sort((a, b) => Number(b.year) - Number(a.year));
}

export function WorklogProceduresView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: procedures = [], isPending, isError, refetch } = useQuery<WorkLog[]>({
    queryKey: PROCEDURES_QUERY_KEY,
    queryFn: fetchProcedures,
    staleTime: 30_000,
  });

  const sorted = useMemo(
    () =>
      [...procedures].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [procedures],
  );

  const grouped = useMemo(() => groupByYear(sorted), [sorted]);

  async function handleNewProcedure() {
    if (creating) return;
    setCreating(true);
    try {
      const r = await fetch("/api/work-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "procedure",
          title: "Untitled procedure",
          date: new Date().toISOString(),
        }),
      });
      if (!r.ok) {
        throw new Error(await r.text());
      }
      const created = (await r.json()) as { id: string };
      // Invalidate so the sidebar count + this page's list re-fetch on
      // the user's next navigation back here.
      void queryClient.invalidateQueries({ queryKey: PROCEDURES_QUERY_KEY });
      router.push(`/worklog/notes/${created.id}`);
    } catch (err) {
      console.error("[ADR-0029] failed to create procedure", err);
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg",
              "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
            )}
            aria-hidden
          >
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Procedures</h1>
            <p className="text-sm text-muted-foreground">
              Runbooks and how-tos. Each procedure is a worklog row with the
              full editor, version history, and mention surface.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={handleNewProcedure}
          disabled={creating}
          className="flex-shrink-0 gap-2"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          New procedure
        </Button>
      </header>

      {/* Body */}
      {isPending && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {isError && !isPending && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="mb-2">Couldn&apos;t load procedures.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isPending && !isError && sorted.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-8 text-center">
          <ClipboardList
            className="mx-auto mb-3 h-8 w-8 text-muted-foreground"
            aria-hidden
          />
          <h2 className="text-sm font-medium text-foreground">No procedures yet</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the &ldquo;New procedure&rdquo; button to capture your first runbook.
          </p>
        </div>
      )}

      {!isPending && !isError && sorted.length > 0 && (
        <div className="space-y-6">
          {grouped.map(({ year, rows }) => (
            <section key={year} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {year}
              </h2>
              <div className="space-y-1.5">
                {rows.map((log) => (
                  <ProcedureRow
                    key={log.id}
                    log={log}
                    onClick={() => router.push(`/worklog/notes/${log.id}`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
