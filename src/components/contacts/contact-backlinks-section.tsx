"use client";

/**
 * ContactBacklinksSection — read-only list of worklog notes that mention this
 * contact via an `@p:` mention (ADR-0028).
 *
 * Slotted into the contact edit Dialog on `/contacts`. Mirrors
 * `WorklogBacklinksPanel`'s shape (TanStack Query + clickable rows) but
 * navigates **across routes**: clicking a row routes to
 * `/worklog/notes?focus=<workLogId>` so the worklog drawer opens with the
 * referenced note (ADR-0015 contract). `router.push` (not `replace`) — the
 * user came from /contacts and back-button should return there.
 *
 * Empty state intentionally surfaces a discoverability hint per the
 * parked-ideas item ("most users won't discover `@p:` exists").
 */

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface BacklinkRow {
  id: string;
  label: string;
  date: string;
  positionId: string | null;
}

export interface ContactBacklinksSectionProps {
  /** Contact id whose backlinks to fetch. */
  contactId: string;
  className?: string;
}

export function ContactBacklinksSection({ contactId, className }: ContactBacklinksSectionProps) {
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["contact-backlinks", contactId] as const,
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${contactId}/backlinks`);
      if (!res.ok) throw new Error(`backlinks fetch failed: ${res.status}`);
      return (await res.json()) as BacklinkRow[];
    },
    staleTime: 30 * 1000, // 30s — quick refresh when reopening the dialog
    retry: false,
    enabled: Boolean(contactId),
  });

  if (isLoading) {
    return (
      <section
        className={cn("rounded-md border bg-muted/30 px-3 py-2 text-sm", className)}
        aria-label="Notes mentioning this contact"
      >
        <header className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notes mentioning this contact
        </header>
        <p className="mt-1.5 text-xs text-muted-foreground italic">Loading…</p>
      </section>
    );
  }

  const backlinks = isError ? [] : data ?? [];

  return (
    <section
      className={cn("rounded-md border bg-muted/30 px-3 py-2 text-sm", className)}
      aria-label="Notes mentioning this contact"
    >
      <header className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        Notes mentioning this contact
        {backlinks.length > 0 && (
          <span className="ml-1 font-normal normal-case tracking-normal">
            ({backlinks.length})
          </span>
        )}
      </header>

      {backlinks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No notes mention this contact yet. Type{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px] not-italic">@p:</code>{" "}
          in any worklog note to mention them.
        </p>
      ) : (
        <ul className="space-y-1">
          {backlinks.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  router.push(`/worklog/notes?focus=${row.id}`);
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
