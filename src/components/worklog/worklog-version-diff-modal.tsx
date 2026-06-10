"use client";

/**
 * WorklogVersionDiffModal — ADR-0017 Phase 9.
 *
 * Renders a plain-text diff between a chosen snapshot's plainText and
 * the live document's current plainText. Fetches the FULL snapshot on
 * demand via GET /api/work-logs/{id}/versions/{versionId} so the diff
 * isn't limited to the 200-char preview returned by the list endpoint.
 *
 * Diff strategy: LCS at the word/whitespace/newline-token level via
 * computePlainTextDiff. Phase 9b may swap in a richer
 * prosemirror-changeset-based diff if plain-text proves insufficient.
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computePlainTextDiff } from "@/lib/worklog/version/diff";

interface VersionRow {
  id: string;
  createdAt: string;
  label: string | null;
  isManual: boolean;
}

interface FetchedVersion {
  id: string;
  createdAt: string;
  label: string | null;
  isManual: boolean;
  plainText: string;
}

export interface WorklogVersionDiffModalProps {
  open: boolean;
  /** Parent WorkLog id — needed for the per-version GET path. */
  noteId: string;
  version: VersionRow;
  /** Live document's current plainText — the "next" side of the diff. */
  currentPlainText: string;
  onClose: () => void;
}

export function WorklogVersionDiffModal({
  open,
  noteId,
  version,
  currentPlainText,
  onClose,
}: WorklogVersionDiffModalProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["worklog-version", noteId, version.id] as const,
    queryFn: async () => {
      const res = await fetch(`/api/work-logs/${noteId}/versions/${version.id}`);
      if (!res.ok) throw new Error(`version fetch failed: ${res.status}`);
      return (await res.json()) as FetchedVersion;
    },
    staleTime: 60 * 1000,
    retry: false,
    enabled: open,
  });

  const snapshotText = data?.plainText ?? "";
  const segments = data ? computePlainTextDiff(snapshotText, currentPlainText) : [];
  const when = new Date(version.createdAt).toLocaleString();
  const labelText = version.label ?? (version.isManual ? "Manual snapshot" : "Auto");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {labelText}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{when}</span>
          </DialogTitle>
          <DialogDescription>
            Showing changes from this snapshot to the current document. Green
            additions, red removals.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto rounded border bg-muted/30 p-3 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <p className="text-red-600 text-xs">Failed to load snapshot.</p>
          ) : segments.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No changes — this snapshot matches the current document exactly.
            </p>
          ) : (
            segments.map((seg, i) => (
              <span
                key={i}
                className={cn(
                  seg.type === "add"    && "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
                  seg.type === "remove" && "bg-red-100 text-red-900 line-through dark:bg-red-900/40 dark:text-red-100",
                )}
              >
                {seg.text}
              </span>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
