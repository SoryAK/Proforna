"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  parseISO,
  startOfDay,
  subDays,
  isToday,
  isYesterday,
} from "date-fns";
import { toast } from "sonner";
import {
  NotebookPen,
  Plus,
  Star,
  Pencil,
  Trash2,
  Flame,
  Sparkles,
  ClipboardList,
  Wrench,
  Users,
  BookOpen,
  FolderKanban,
  Phone,
  MoreHorizontal,
  Image as ImageIcon,
  ArrowUpRight,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PromoteToEventDialog } from "@/components/worklog/promote-to-event-dialog";

// ── Types (mirror /api/work-logs response) ────────────────────
type Photo = { id: string; filePath: string; caption: string | null };
type WorkLog = {
  id: string;
  positionId: string | null;
  date: string;
  title: string;
  content: string | null;
  category: string;
  hours: number | null;
  tags: string | null;
  isNotable: boolean;
  mood: string | null;
  promotedToCareerEventId: string | null;
  createdAt: string;
  photos?: Photo[];
};

const CATEGORIES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  task: { label: "Task", icon: ClipboardList, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  project: { label: "Project", icon: FolderKanban, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  meeting: { label: "Meeting", icon: Users, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  training: { label: "Training", icon: BookOpen, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  administrative: { label: "Admin", icon: FolderKanban, color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  maintenance: { label: "Maintenance", icon: Wrench, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "on-call": { label: "On-Call", icon: Phone, color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  other: { label: "Other", icon: MoreHorizontal, color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d, yyyy");
}

function calcPositionStreak(logs: WorkLog[]) {
  if (logs.length === 0) return 0;
  const days = new Set(logs.map((l) => format(startOfDay(parseISO(l.date)), "yyyy-MM-dd")));
  let streak = 0;
  let cursor = startOfDay(new Date());
  while (days.has(format(cursor, "yyyy-MM-dd"))) {
    streak += 1;
    cursor = subDays(cursor, 1);
  }
  return streak;
}

// ── Mini 6-week activity strip (compact heatmap) ──────────────
function MiniActivityStrip({ logs }: { logs: WorkLog[] }) {
  const cells = useMemo(() => {
    const today = startOfDay(new Date());
    const days: { date: Date; count: number }[] = [];
    const counts = new Map<string, number>();
    for (const l of logs) {
      const k = format(startOfDay(parseISO(l.date)), "yyyy-MM-dd");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (let i = 41; i >= 0; i--) {
      const d = subDays(today, i);
      days.push({ date: d, count: counts.get(format(d, "yyyy-MM-dd")) ?? 0 });
    }
    return days;
  }, [logs]);

  return (
    <div className="flex gap-0.5">
      {cells.map((c, i) => (
        <div
          key={i}
          title={`${format(c.date, "MMM d")} — ${c.count} entr${c.count === 1 ? "y" : "ies"}`}
          className={cn(
            "h-3 w-2 rounded-sm",
            c.count === 0 && "bg-muted/40",
            c.count === 1 && "bg-emerald-200 dark:bg-emerald-900/60",
            c.count === 2 && "bg-emerald-300 dark:bg-emerald-700/70",
            c.count >= 3 && c.count <= 4 && "bg-emerald-400 dark:bg-emerald-600/80",
            c.count >= 5 && "bg-emerald-500"
          )}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export function PositionWorklogTab({ positionId }: { positionId: string }) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  /** The worklog id whose promote dialog is currently open, or null. */
  const [promotingLog, setPromotingLog] = useState<WorkLog | null>(null);

  const { data: logs = [], isLoading } = useQuery<WorkLog[]>({
    queryKey: ["worklogs", "position", positionId],
    queryFn: async () => {
      const res = await fetch(`/api/work-logs?positionId=${positionId}`);
      if (!res.ok) throw new Error("Failed to fetch work logs");
      return res.json();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/work-logs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worklogs", "position", positionId] });
      qc.invalidateQueries({ queryKey: ["worklogs"] });
      toast.success("Entry removed");
    },
    onError: (e) => toast.error(String(e)),
  });

  // Group by day
  const grouped = useMemo(() => {
    const byDay = new Map<string, { date: Date; logs: WorkLog[] }>();
    for (const l of logs) {
      const d = startOfDay(parseISO(l.date));
      const key = format(d, "yyyy-MM-dd");
      if (!byDay.has(key)) byDay.set(key, { date: d, logs: [] });
      byDay.get(key)!.logs.push(l);
    }
    return Array.from(byDay.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [logs]);

  const visible = showAll ? grouped : grouped.slice(0, 14);
  const streak = useMemo(() => calcPositionStreak(logs), [logs]);
  const notableCount = useMemo(() => logs.filter((l) => l.isNotable).length, [logs]);

  return (
    <div className="space-y-4">
      {/* Header / stats */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Worklog for this position</h3>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/worklog?focusPosition=${positionId}`}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Open full worklog <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link href={`/worklog?new=1&positionId=${positionId}`}>
            <Button size="sm" className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add entry
            </Button>
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <NotebookPen className="h-3 w-3" /> Entries
          </div>
          <div className="text-xl font-bold mt-0.5">{logs.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Flame className="h-3 w-3" /> Streak
          </div>
          <div className="text-xl font-bold mt-0.5">
            {streak} <span className="text-xs font-normal text-muted-foreground">days</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Star className="h-3 w-3" /> Notable
          </div>
          <div className="text-xl font-bold mt-0.5">{notableCount}</div>
        </Card>
        <Card className="p-3 flex flex-col justify-between">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Last 6 weeks
          </div>
          <MiniActivityStrip logs={logs} />
        </Card>
      </div>

      {/* Phase D promotion — list unpromoted notable entries as action items */}
      {notableCount > 0 && (() => {
        const unpromoted = logs.filter((l) => l.isNotable && !l.promotedToCareerEventId);
        if (unpromoted.length === 0) return null;
        return (
          <Card className="p-3 border-amber-300/40 dark:border-amber-700/40 bg-amber-50/60 dark:bg-amber-950/20">
            <div className="flex items-start gap-2 text-xs mb-2">
              <Trophy className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-muted-foreground font-medium text-foreground">
                {unpromoted.length} notable entr{unpromoted.length === 1 ? "y" : "ies"} ready to promote
              </p>
            </div>
            <div className="space-y-1 pl-5">
              {unpromoted.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate text-foreground">{l.title}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px] gap-1 shrink-0 border-amber-400/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    onClick={() => setPromotingLog(l)}
                  >
                    <Trophy className="h-3 w-3" /> Promote
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* Day-grouped list */}
      {isLoading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : grouped.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No worklog entries for this position yet.
          <div className="mt-2">
            <Link href={`/worklog?new=1&positionId=${positionId}`}>
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5 mr-1" /> Log your first entry
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((g) => (
            <Card key={g.date.toISOString()} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold">{dayLabel(g.date)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {g.logs.length} entr{g.logs.length === 1 ? "y" : "ies"}
                </div>
              </div>
              <div className="space-y-2">
                {g.logs.map((l) => {
                  const meta = CATEGORIES[l.category] ?? CATEGORIES.other;
                  const Icon = meta.icon;
                  const tags = l.tags?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "rounded-md border bg-background/50 p-2.5 hover:bg-accent/40 transition-colors",
                        l.isNotable && "border-amber-300/60 dark:border-amber-700/40"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn("rounded p-1 shrink-0", meta.color)}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium leading-tight">{l.title}</span>
                            {l.isNotable && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                            {l.hours != null && (
                              <Badge variant="secondary" className="h-4 text-[10px] px-1">
                                {l.hours}h
                              </Badge>
                            )}
                            {l.promotedToCareerEventId && (
                              <Badge className="h-4 text-[10px] px-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                <Trophy className="h-2.5 w-2.5 mr-0.5" /> Promoted
                              </Badge>
                            )}
                          </div>
                          {l.content && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">
                              {l.content}
                            </p>
                          )}
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tags.slice(0, 4).map((t) => (
                                <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>
                              ))}
                            </div>
                          )}
                          {l.photos && l.photos.length > 0 && (
                            <div className="flex gap-1 mt-1.5">
                              {l.photos.slice(0, 5).map((p) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={p.id}
                                  src={p.filePath}
                                  alt={p.caption ?? ""}
                                  className="h-10 w-10 rounded object-cover border"
                                />
                              ))}
                              {l.photos.length > 5 && (
                                <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                                  +{l.photos.length - 5}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Promote button — only for notable + un-promoted entries */}
                          {l.isNotable && !l.promotedToCareerEventId && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                              onClick={() => setPromotingLog(l)}
                              title="Promote to career event"
                            >
                              <Trophy className="h-3 w-3" />
                            </Button>
                          )}
                          <Link href={`/worklog?focus=${l.id}`} title="Open in full worklog">
                            <Button size="icon" variant="ghost" className="h-6 w-6">
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </Link>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-rose-500 hover:text-rose-600"
                            onClick={() => {
                              if (confirm("Delete this entry?")) remove.mutate(l.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          {grouped.length > 14 && !showAll && (
            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                Show all {grouped.length} days
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Promotion dialog — shared across all rows */}
      {promotingLog && (
        <PromoteToEventDialog
          open={!!promotingLog}
          onOpenChange={(v) => { if (!v) setPromotingLog(null); }}
          logId={promotingLog.id}
          logTitle={promotingLog.title}
          logDate={promotingLog.date}
          positionId={positionId}
          onPromoted={() => {
            qc.invalidateQueries({ queryKey: ["worklogs", "position", positionId] });
            setPromotingLog(null);
          }}
        />
      )}
    </div>
  );
}
