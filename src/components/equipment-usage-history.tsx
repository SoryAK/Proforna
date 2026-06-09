"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { Activity, Clock, NotebookPen, Sparkles, Star, Plus, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EquipmentUsageEntry = {
  id: string;
  date: string;
  title: string;
  content: string | null;
  category: string;
  hours: number | null;
  positionId: string | null;
  accomplishment: boolean;
  isNotable: boolean;
  tags: string | null;
};

type Position = { id: string; company: string };

const CATEGORY_LABEL: Record<string, string> = {
  task: "Task",
  project: "Project",
  meeting: "Meeting",
  training: "Training",
  administrative: "Admin",
  maintenance: "Maintenance",
  "on-call": "On-Call",
  other: "Other",
};

/**
 * Reusable feed of work-log entries scoped to a single piece of personal equipment.
 * Mirrors `AssetServiceHistory` but reads via `?equipmentId=` and shows a one-tap
 * "Used today" button that creates a worklog entry pre-attached to this tool.
 */
export function EquipmentUsageHistory({
  equipmentId,
  equipmentName,
  positions = [],
  limit,
  className,
}: {
  equipmentId: string;
  equipmentName?: string;
  positions?: Position[];
  limit?: number;
  className?: string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: logs, isLoading, isError } = useQuery<EquipmentUsageEntry[]>({
    queryKey: ["work-logs", "by-equipment", equipmentId],
    queryFn: async () => {
      const res = await fetch(`/api/work-logs?equipmentId=${encodeURIComponent(equipmentId)}`);
      if (!res.ok) throw new Error("Failed to load usage history");
      return res.json();
    },
    enabled: !!equipmentId,
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
      lastUse: last,
      notable: logs.filter((l) => l.isNotable).length,
    };
  }, [logs]);

  const usedToday = useMutation({
    mutationFn: async () => {
      setBusy(true);
      // Try to reuse most recent log's position so the tap captures context.
      const lastPosId = logs?.[0]?.positionId ?? null;
      const res = await fetch("/api/work-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date().toISOString(),
          title: equipmentName ? `Used ${equipmentName}` : "Used this tool",
          category: "task",
          positionId: lastPosId,
          equipmentIds: [equipmentId],
          assetIds: [],
          isNotable: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-logs", "by-equipment", equipmentId] });
      qc.invalidateQueries({ queryKey: ["worklogs"] });
      toast.success("Logged for today");
    },
    onError: (e) => toast.error(String(e)),
    onSettled: () => setBusy(false),
  });

  const visible = limit && logs ? logs.slice(0, limit) : logs;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <NotebookPen className="h-3.5 w-3.5 text-muted-foreground" />
          Used in
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => usedToday.mutate()}
          >
            <Plus className="h-3 w-3 mr-1" /> Used today
          </Button>
          <Link
            href={`/worklog?focusEquipment=${equipmentId}`}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          >
            Open in worklog <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Quick stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Uses</div>
            <div className="text-sm font-semibold">{stats.total}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Hours</div>
            <div className="text-sm font-semibold">{stats.totalHours.toFixed(1)}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Notable</div>
            <div className="text-sm font-semibold">{stats.notable}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Last</div>
            <div className="text-sm font-semibold" title={stats.lastUse ? format(stats.lastUse, "PPP") : ""}>
              {stats.lastUse ? formatDistanceToNow(stats.lastUse, { addSuffix: false }) : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading usage history…</div>
      ) : isError ? (
        <div className="text-xs text-rose-500">Failed to load usage history.</div>
      ) : !logs || logs.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          <Activity className="mx-auto h-4 w-4 mb-1 opacity-60" />
          No worklog entries yet. Tap <span className="font-semibold">Used today</span> to start tracking.
        </div>
      ) : (
        <ol className="relative border-l border-border ml-2 space-y-2.5 pl-4">
          {visible!.map((log) => {
            const d = parseISO(log.date);
            const company = log.positionId ? positionMap.get(log.positionId) : null;
            return (
              <li key={log.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                <Link href={`/worklog/notes?focus=${log.id}`} className="block group">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium truncate group-hover:underline">
                      {log.title || "Untitled entry"}
                    </span>
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
                    <span>{CATEGORY_LABEL[log.category] ?? log.category}</span>
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
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {limit && logs && logs.length > limit && (
        <div className="text-[10px] text-muted-foreground text-center">
          Showing {limit} of {logs.length} entries
        </div>
      )}
    </div>
  );
}
