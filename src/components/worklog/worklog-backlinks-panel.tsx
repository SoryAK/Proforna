"use client";

/**
 * WorklogBacklinksPanel — read-only list of notes that link to this note
 * via an `@n:` mention (ADR-0016).
 *
 * Fetches `/api/work-logs/{id}/backlinks` via TanStack Query and renders
 * a compact list of clickable rows. Clicking a row pivots the current
 * page to the linked note via `?focus=<linkedNoteId>` (ADR-0015 contract).
 *
 * Empty state: a muted "No backlinks yet." line. Hidden completely while
 * the query is loading to avoid layout flicker.
 */

import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface BacklinkRow {
  id: string;
  label: string;
  date: string;
  positionId: string | null;
}

export interface WorklogBacklinksPanelProps {
  /** WorkLog id whose backlinks to fetch. */
  noteId: string;
  className?: string;
}

export function WorklogBacklinksPanel({ noteId, className }: WorklogBacklinksPanelProps) {
  const router = useRouter();
  const pathname = usePathname();

  const { data, isLoading } = useQuery({
    queryKey: ["worklog-backlinks", noteId] as const,
    queryFn: async () => {
      const res = await fetch(`/api/work-logs/${noteId}/backlinks`);
      if (!res.ok) throw new Error(`backlinks fetch failed: ${res.status}`);
      return (await res.json()) as BacklinkRow[];
    },
    staleTime: 30 * 1000, // 30s — quick refresh after writing a new mention
    retry: false,
    enabled: Boolean(noteId),
  });

  if (isLoading) return null;
  const backlinks = data ?? [];

  return (
    <section
      className={cn(
        "rounded-md border bg-muted/30 px-3 py-2 text-sm",
        className,
      )}
      aria-label="Backlinks"
    >
      <header className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        Backlinks
        {backlinks.length > 0 && (
          <span className="ml-1 font-normal normal-case tracking-normal">
            ({backlinks.length})
          </span>
        )}
      </header>
      {backlinks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No backlinks yet.</p>
      ) : (
        <ul className="space-y-1">
          {backlinks.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  router.replace(`${pathname}?focus=${row.id}`);
                }}
                className={cn(
                  "w-full text-left rounded px-1.5 py-1 truncate",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                title={`Open: ${row.label}`}
              >
                <span className="text-foreground">{row.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {row.date.slice(0, 10)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
