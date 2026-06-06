/**
 * WorklogFolderGrid — top 8 folders by recent activity for the worklog home
 * (ADR-0014 G3). Iterate based on real use; the 8 limit is intentional, not
 * sacred.
 *
 * Recent activity = most-recently-updated note that lives in this folder.
 * Folders with no notes drop to the bottom; if the user has fewer than 8
 * folders we show all of them.
 *
 * Each tile click → /worklog/notes?folder=<id>. URL contract from ADR-0013.
 */

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Folder, Sparkles } from "lucide-react";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import type { WorkLog } from "@/types/worklog";

const TOP_N = 8;

export function WorklogFolderGrid() {
  const { folders } = useWorklogFolders();
  const { data: logs = [] } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    queryFn: () => fetch("/api/work-logs").then((r) => r.json()),
    staleTime: 30_000,
  });

  // Last-activity timestamp per folder (max log.date among notes in folder).
  const lastActivity = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of logs) {
      if (!log.folderId || !log.date) continue;
      const prev = map.get(log.folderId);
      if (!prev || log.date > prev) map.set(log.folderId, log.date);
    }
    return map;
  }, [logs]);

  const ranked = useMemo(() => {
    return [...folders]
      .sort((a, b) => {
        const aT = lastActivity.get(a.id) ?? "";
        const bT = lastActivity.get(b.id) ?? "";
        if (aT && bT) return bT.localeCompare(aT);
        if (aT) return -1;
        if (bT) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, TOP_N);
  }, [folders, lastActivity]);

  if (ranked.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic px-1 py-2">
        No folders yet — create one from the sidebar to organize your notes.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {ranked.map((f) => {
        const count = f.noteCount;
        return (
          <Link
            key={f.id}
            href={`/worklog/notes?folder=${f.id}`}
            className="group rounded-lg border bg-card p-3 flex items-center gap-3 hover:border-blue-500/40 hover:bg-blue-500/[0.04] transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 grid place-items-center shrink-0">
              <Folder className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{f.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {count} {count === 1 ? "note" : "notes"}
              </div>
            </div>
          </Link>
        );
      })}

      {/* Templates tile — sibling entry point to keep them discoverable */}
      <Link
        href="/worklog/notes?view=templates"
        className="group rounded-lg border bg-card p-3 flex items-center gap-3 hover:border-purple-500/40 hover:bg-purple-500/[0.04] transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-purple-500/15 grid place-items-center shrink-0">
          <Sparkles className="w-5 h-5 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">Templates</div>
          <div className="text-[10px] text-muted-foreground">Reusable note shapes</div>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}
