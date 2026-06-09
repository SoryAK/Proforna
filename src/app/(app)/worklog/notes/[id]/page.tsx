/**
 * `/worklog/notes/[id]` — full-screen single-note reader (per ADR-0015).
 *
 * For now this is the canonical "open a note" surface. The half-page reader
 * drawer described in ADR-0015 is deferred; the doc-manager view at
 * `/worklog/notes` routes here when a row is clicked.
 *
 * Layout: max-w-3xl centered column with a back-arrow header. Reuses
 * <WorklogNoteReader> verbatim — same autosave-on-blur and inline-edit
 * semantics as the legacy 2-pane experience.
 *
 * Back-nav contract (ADR-0015 Phase 5/6): the list view forwards its
 * current query string onto this route so the back-button rebuilds the
 * same `/worklog/notes?...` URL the user came from (folder + view filters
 * from ADR-0013). Direct deep-links to `/worklog/notes/[id]` with no
 * query simply fall back to a clean `/worklog/notes`.
 */

"use client";

import { use, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorklogData } from "@/components/worklog/hooks/use-worklog-data";
import { useWorklogMutations } from "@/components/worklog/hooks/use-worklog-mutations";
import { WorklogNoteReader } from "@/components/worklog/worklog-note-reader";

export default function WorklogNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const { logs, loadingLogs, positions, equipment, assets, positionMap } =
    useWorklogData();
  const { saveLog, deleteLog } = useWorklogMutations();

  const log = useMemo(
    () => logs.find((l) => l.id === id) ?? null,
    [logs, id],
  );

  // Tag autocomplete corpus — same derivation as <WorklogPage>.
  const tagSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const l of logs) {
      if (!l.tags) continue;
      for (const t of l.tags.split(",")) {
        const trimmed = t.trim().toLowerCase();
        if (trimmed) seen.add(trimmed);
      }
    }
    return Array.from(seen).sort();
  }, [logs]);

  // Rebuild the list URL the user came from, preserving any forwarded
  // search params (e.g. `?folder=<id>` from the sidebar).
  const backHref = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/worklog/notes?${qs}` : "/worklog/notes";
  }, [searchParams]);

  const goBack = () => router.push(backHref);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-12 px-4 flex items-center gap-2 border-b">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5"
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to notes
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-5xl mx-auto h-full px-4">
          {!loadingLogs && !log ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <p className="text-sm font-medium mb-1">Note not found</p>
              <p className="text-xs text-muted-foreground mb-4">
                The note may have been deleted.
              </p>
              <Button size="sm" onClick={goBack}>
                Back to notes
              </Button>
            </div>
          ) : (
            <WorklogNoteReader
              log={log}
              positions={positions}
              equipment={equipment}
              assets={assets}
              positionMap={positionMap}
              tagSuggestions={tagSuggestions}
              onUpdate={(patch) => saveLog.mutateAsync(patch)}
              onDelete={(deletedId) => {
                deleteLog.mutate(deletedId, {
                  onSuccess: () => router.push(backHref),
                });
              }}
              hasLogs={logs.length > 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}
