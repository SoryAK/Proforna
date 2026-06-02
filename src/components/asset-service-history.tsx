"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Activity, Clock, Sparkles, Star, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ServiceHistoryEntry = {
  id: string;
  date: string;
  title: string;
  content: string | null;
  category: string;
  hours: number | null;
  positionId: string | null;
  accomplishment: boolean;
  isNotable: boolean;
};

type Position = { id: string; company: string };

const CATEGORY_LABEL: Record<string, string> = {
  task: "Task",
  meeting: "Meeting",
  learning: "Learning",
  service: "Service",
  inspection: "Inspection",
  install: "Install",
  repair: "Repair",
  other: "Other",
};

/**
 * Reusable feed of work-log entries scoped to a single asset.
 * Use inside AssetEditModal, on the assets page, or anywhere an asset is shown.
 */
export function AssetServiceHistory({
  assetId,
  positions = [],
  limit,
  emptyHint,
  className,
}: {
  assetId: string;
  positions?: Position[];
  limit?: number;
  emptyHint?: string;
  className?: string;
}) {
  const { data: logs, isLoading, isError } = useQuery<ServiceHistoryEntry[]>({
    queryKey: ["work-logs", "by-asset", assetId],
    queryFn: async () => {
      const res = await fetch(`/api/work-logs?assetId=${encodeURIComponent(assetId)}`);
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
    enabled: !!assetId,
  });

  const positionMap = useMemo(() => {
    const m = new Map<string, string>();
    positions.forEach((p) => m.set(p.id, p.company));
    return m;
  }, [positions]);

  const stats = useMemo(() => {
    if (!logs) return null;
    const totalHours = logs.reduce((s, l) => s + (l.hours ?? 0), 0);
    const last = logs[0]?.date ? parseISO(logs[0].date) : null;
    return {
      total: logs.length,
      totalHours,
      lastVisit: last,
      notable: logs.filter((l) => l.isNotable).length,
    };
  }, [logs]);

  const visible = limit && logs ? logs.slice(0, limit) : logs;

  if (isLoading) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>Loading service history…</div>
    );
  }
  if (isError) {
    return (
      <div className={cn("text-xs text-rose-500", className)}>Failed to load service history.</div>
    );
  }
  if (!logs || logs.length === 0) {
    return (
      <div className={cn("rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground", className)}>
        <Activity className="mx-auto h-4 w-4 mb-1 opacity-60" />
        {emptyHint ?? "No service entries yet. Log work against this asset and it will appear here."}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Quick stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Visits</div>
            <div className="text-sm font-semibold">{stats.total}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Hours</div>
            <div className="text-sm font-semibold">{stats.totalHours.toFixed(1)}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Last</div>
            <div className="text-sm font-semibold" title={stats.lastVisit ? format(stats.lastVisit, "PPP") : ""}>
              {stats.lastVisit ? formatDistanceToNow(stats.lastVisit, { addSuffix: false }) : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <ol className="relative border-l border-border ml-2 space-y-2.5 pl-4">
        {visible!.map((log) => {
          const d = parseISO(log.date);
          const company = log.positionId ? positionMap.get(log.positionId) : null;
          return (
            <li key={log.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium truncate">{log.title || "Untitled entry"}</span>
                    {log.accomplishment && (
                      <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" /> Win
                      </Badge>
                    )}
                    {log.isNotable && (
                      <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-0.5">
                        <Star className="h-2.5 w-2.5" /> Notable
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span title={format(d, "PPP")}>{format(d, "MMM d, yyyy")}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Wrench className="h-2.5 w-2.5" />
                      {CATEGORY_LABEL[log.category] ?? log.category}
                    </span>
                    {log.hours != null && log.hours > 0 && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {log.hours}h
                        </span>
                      </>
                    )}
                    {company && (
                      <>
                        <span>·</span>
                        <span className="truncate">{company}</span>
                      </>
                    )}
                  </div>
                  {log.content && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                      {log.content}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {limit && logs.length > limit && (
        <div className="text-[10px] text-muted-foreground text-center">
          Showing {limit} of {logs.length} entries
        </div>
      )}
    </div>
  );
}
