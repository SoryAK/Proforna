"use client";

/**
 * WorklogHistoryPanel — read-only timeline of past snapshots for a note
 * (ADR-0017 Phase 8).
 *
 * Sibling to WorklogBacklinksPanel (ADR-0016): mirrors that component's
 * placement and styling — an inline section at the bottom of the
 * full-screen reader, NOT a drawer tab (which the ADR sketch suggested
 * but ADR-0016 in practice did not adopt).
 *
 * Data: fetches GET /api/work-logs/{id}/versions via TanStack Query and
 * groups rows by recency. The list is hidden during initial load to
 * avoid layout flicker, same as the backlinks panel.
 *
 * Mutations:
 *   - Restore   → POST /api/work-logs/{id}/versions/{versionId}/restore
 *     Invalidates the work-logs list and this panel's version query so
 *     the editor picks up the restored content and the panel shows the
 *     fresh "Before restore from …" pinned snapshot.
 *
 * Diff modal trigger lives here ("View diff" button) but the modal
 * itself is rendered by a sibling component (Phase 9).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { groupVersionsByDate, type GroupableVersion } from "@/lib/worklog/version/grouping";
import { WorklogVersionDiffModal } from "@/components/worklog/worklog-version-diff-modal";

interface VersionRow extends GroupableVersion {
  id: string;
  createdAt: string;
  label: string | null;
  isManual: boolean;
  plainTextPreview: string;
  charDelta: number;
}

export interface WorklogHistoryPanelProps {
  /** WorkLog id whose version history to fetch. */
  noteId: string;
  /** Current document's plain-text, used as the "next" side of any diff. */
  currentPlainText: string;
  className?: string;
}

const BUCKET_LABELS: Record<"today" | "yesterday" | "thisWeek" | "older", string> = {
  today:     "Today",
  yesterday: "Yesterday",
  thisWeek:  "Earlier this week",
  older:     "Older",
};

export function WorklogHistoryPanel({
  noteId,
  currentPlainText,
  className,
}: WorklogHistoryPanelProps) {
  const queryClient = useQueryClient();
  const [diffVersion, setDiffVersion] = useState<VersionRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["worklog-versions", noteId] as const,
    queryFn: async () => {
      const res = await fetch(`/api/work-logs/${noteId}/versions`);
      if (!res.ok) throw new Error(`versions fetch failed: ${res.status}`);
      return (await res.json()) as VersionRow[];
    },
    staleTime: 15 * 1000,
    retry: false,
    enabled: Boolean(noteId),
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch(
        `/api/work-logs/${noteId}/versions/${versionId}/restore`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`restore failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      // Refresh editor content + history (pre-restore snapshot is new).
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["worklog-versions", noteId] });
    },
  });

  if (isLoading) return null;
  const versions = data ?? [];
  const groups = groupVersionsByDate({ versions, now: new Date() });
  const isEmpty =
    groups.today.length    === 0 &&
    groups.yesterday.length === 0 &&
    groups.thisWeek.length  === 0 &&
    groups.older.length     === 0;

  const handleRestore = (row: VersionRow) => {
    const when = new Date(row.createdAt).toLocaleString();
    const ok = window.confirm(
      `Restore version from ${when}? Your current draft will be saved as a snapshot first.`,
    );
    if (!ok) return;
    restoreMutation.mutate(row.id);
  };

  return (
    <>
      <section
        className={cn(
          "rounded-md border bg-muted/30 px-3 py-2 text-sm",
          className,
        )}
        aria-label="Version history"
      >
        <header className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          <span>
            History
            {versions.length > 0 && (
              <span className="ml-1 font-normal normal-case tracking-normal">
                ({versions.length})
              </span>
            )}
          </span>
          {restoreMutation.isPending && (
            <span className="font-normal normal-case tracking-normal text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Restoring…
            </span>
          )}
        </header>

        {isEmpty ? (
          <p className="text-xs text-muted-foreground italic">
            No versions yet — snapshots appear as you edit.
          </p>
        ) : (
          <div className="space-y-3">
            {(["today", "yesterday", "thisWeek", "older"] as const).map((bucket) => {
              const rows = groups[bucket];
              if (rows.length === 0) return null;
              return (
                <div key={bucket} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {BUCKET_LABELS[bucket]}
                  </p>
                  <ul className="space-y-1">
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className="rounded px-1.5 py-1.5 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">
                              {row.label ?? (row.isManual ? "Manual snapshot" : "Auto")}
                              <span className="ml-2 font-normal text-muted-foreground">
                                {formatTime(row.createdAt)}
                              </span>
                              {row.charDelta !== 0 && (
                                <span
                                  className={cn(
                                    "ml-2 font-normal",
                                    row.charDelta > 0 ? "text-emerald-600" : "text-red-600",
                                  )}
                                >
                                  {row.charDelta > 0 ? "+" : ""}
                                  {row.charDelta}
                                </span>
                              )}
                            </p>
                            {row.plainTextPreview && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {row.plainTextPreview}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => setDiffVersion(row)}
                            >
                              View diff
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              disabled={restoreMutation.isPending}
                              onClick={() => handleRestore(row)}
                              title="Restore this version"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Restore
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {diffVersion && (
        <WorklogVersionDiffModal
          open={Boolean(diffVersion)}
          noteId={noteId}
          version={diffVersion}
          currentPlainText={currentPlainText}
          onClose={() => setDiffVersion(null)}
        />
      )}
    </>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
