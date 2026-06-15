/**
 * WorklogEventsView — sibling surface to `/worklog/notes` for CareerEvents
 * (ADR-0027 Day 3 Cycle A skeleton).
 *
 * Cycle A scope: render a minimal placeholder that confirms the route + nav
 * wiring + API plumbing. Pulls from `GET /api/events` (TanStack Query) and
 * shows a single counter — enough for the nav badge to render symmetrically
 * with "All notes" and for the user to click through and confirm they
 * landed somewhere.
 *
 * Cycle B replaces this body with the real list + drawer (filter chips for
 * All · Free-floating · Anchored, row-click → drawer, PATCH/DELETE wiring).
 *
 * NOT a full document-manager — that complexity is intentionally deferred.
 * The page must be cheap to mount because the nav row is one click away
 * from every worklog screen.
 */

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Anchor } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CareerEventRow {
  id: string;
  workHistoryId: string | null;
  title: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  startDate: string | null;
  category: string;
}

export function WorklogEventsView() {
  // Same queryKey shape Cycle B will reuse + the nav sidebar will share.
  // Default GET returns both anchored and free-floating rows.
  const { data: events = [], isPending, isError } = useQuery<CareerEventRow[]>({
    queryKey: ["career-events", "all"],
    queryFn: () => fetch("/api/events").then((r) => r.json()),
    staleTime: 30_000,
  });

  const total = events.length;
  const floating = events.filter((e) => e.workHistoryId === null).length;
  const anchored = total - floating;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <CalendarDays className="h-5 w-5 text-orange-600 dark:text-orange-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground">Events</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Conferences, field days, social moments, news events — anchored to a job or free-floating in your life.
            </p>
          </div>
        </header>

        {/* Stat cards */}
        <section
          aria-label="Event totals"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <StatCard
            label="Total"
            value={total}
            icon={<CalendarDays className="h-4 w-4" />}
            isPending={isPending}
          />
          <StatCard
            label="Anchored"
            value={anchored}
            icon={<Anchor className="h-4 w-4" />}
            isPending={isPending}
            hint="Tied to a work history"
          />
          <StatCard
            label="Free-floating"
            value={floating}
            icon={<MapPin className="h-4 w-4" />}
            isPending={isPending}
            hint="Standalone, requires a location"
          />
        </section>

        {/* Body / placeholder */}
        <section className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
          {isError ? (
            <p className="text-sm text-destructive">
              Couldn&apos;t load events. The API may be unavailable — refresh to retry.
            </p>
          ) : isPending ? (
            <Skeleton className="h-5 w-48 mx-auto" />
          ) : total === 0 ? (
            <EmptyState />
          ) : (
            <PlaceholderList events={events} />
          )}
        </section>

        <p className="text-[11px] text-muted-foreground text-center">
          Full list, filters, and inline editor coming in Cycle B (ADR-0027 Day 3).
        </p>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  isPending: boolean;
  hint?: string;
}

function StatCard({ label, value, icon, isPending, hint }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="text-orange-500">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {isPending ? <Skeleton className="h-7 w-12" /> : value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
          {hint}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">No events yet.</p>
      <p className="text-xs text-muted-foreground">
        Events show up here once you create them from a job&apos;s timeline or from the upcoming &ldquo;Add event&rdquo; entry in Worklog.
      </p>
      <p className="text-[11px] text-muted-foreground pt-2">
        Tip: anchored events live on{" "}
        <Link href="/career-map" className="underline hover:text-foreground">
          the career map
        </Link>{" "}
        per job.
      </p>
    </div>
  );
}

function PlaceholderList({ events }: { events: CareerEventRow[] }) {
  // Tiny preview list (first 6) so the user sees real data through Cycle A.
  const preview = events.slice(0, 6);
  return (
    <ul className="text-left space-y-1.5 max-w-md mx-auto">
      {preview.map((e) => (
        <li
          key={e.id}
          className="flex items-center gap-2 text-sm text-foreground/90"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full flex-shrink-0",
              e.workHistoryId === null ? "bg-orange-500" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          <span className="truncate flex-1">{e.title}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
            {e.location ?? "—"}
          </span>
        </li>
      ))}
      {events.length > preview.length && (
        <li className="text-[11px] text-muted-foreground text-center pt-2">
          +{events.length - preview.length} more — full list lands in Cycle B
        </li>
      )}
    </ul>
  );
}
