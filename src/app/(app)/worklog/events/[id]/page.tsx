/**
 * `/worklog/events/[id]` — inline editor for an existing CareerEvent
 * (ADR-0034, supersedes the EventEditDialog modal).
 *
 * Data flow:
 *   1. Read `["career-events", "all"]` cache (warm path: navigated
 *      from the events list). On cold cache, the query refetches the
 *      full `/api/events` list — same key + URL the list view uses,
 *      so cache parity is automatic.
 *   2. Filter by id. Missing id → empty-state with a back link
 *      (the row was likely deleted from another tab).
 *   3. If the event is anchored, look up the parent job from
 *      `["work-history"]` to render the read-only "Anchored to: …"
 *      badge in the Properties rail.
 */

"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
import { WorklogEventEditor } from "@/components/worklog/events/worklog-event-editor";
import type { EventEditorData } from "@/components/worklog/events/worklog-event-editor";

interface CareerEventApiRow extends EventEditorData {
  createdAt: string;
  updatedAt: string;
}

interface WorkHistoryRow {
  id: string;
  type: string;
  company: string;
  title: string | null;
  address: string;
  lat: number;
  lng: number;
  endDate: string | null;
}

export default function WorklogEventByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const eventsQuery = useQuery<CareerEventApiRow[]>({
    queryKey: ["career-events", "all"],
    queryFn: () => fetch("/api/events").then((r) => r.json()),
    staleTime: 30_000,
  });

  const event = eventsQuery.data?.find((e) => e.id === id) ?? null;

  // Only fetch work-history when we know the event is anchored — saves a
  // round-trip for free-floating events.
  const workHistoryQuery = useQuery<WorkHistoryRow[]>({
    queryKey: ["work-history"],
    queryFn: () => fetch("/api/work-history").then((r) => r.json()),
    enabled: event?.workHistoryId != null,
    staleTime: 60_000,
  });

  if (eventsQuery.isPending) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading event…
      </div>
    );
  }

  if (!event) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Event not found</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            It may have been deleted, or the URL is stale.
          </p>
        </div>
        <Link
          href="/worklog/events"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-foreground/80 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to events
        </Link>
      </div>
    );
  }

  const anchoredJob =
    event.workHistoryId != null
      ? workHistoryQuery.data?.find((j) => j.id === event.workHistoryId) ?? null
      : null;

  return (
    <WorklogEventEditor
      mode="existing"
      event={event}
      anchoredJob={
        anchoredJob
          ? {
              company: anchoredJob.company,
              title: anchoredJob.title,
              location: anchoredJob.address,
            }
          : null
      }
    />
  );
}
