/**
 * WorklogMapView — `/worklog/map` page shell.
 *
 * ADR-0027 Day 4 Cycle B (Path B-modest, after ADR-0028 retired Leaflet).
 *
 * Renders the dedicated <EventsMap> for career events that have lat/lng.
 * Top toolbar = Back to list + (modest) link out to the full job-search
 * map. No overlay with jobs — by design; see ADR-0027 Day 4 plan.
 *
 * Shares queryKey ["career-events", "all"] with WorklogEventsView and the
 * sidebar Events badge, so cache stays in sync.
 */

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { EventsMapItem } from "./events-map";

// EventsMap touches `window.google` and must not SSR.
const EventsMap = dynamic(() => import("./events-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading map…
    </div>
  ),
});

// Mirror the shape returned by GET /api/events. Kept local — when a third
// view needs it, lift to types/worklog.ts.
interface CareerEventApiRow {
  id: string;
  workHistoryId: string | null;
  title: string;
  description: string | null;
  category: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  metrics: string | null;
  createdAt: string;
  updatedAt: string;
  photos?: { filePath: string }[];
}

function hasLatLng(
  e: CareerEventApiRow,
): e is CareerEventApiRow & { lat: number; lng: number } {
  return (
    typeof e.lat === "number" &&
    typeof e.lng === "number" &&
    !Number.isNaN(e.lat) &&
    !Number.isNaN(e.lng)
  );
}

export function WorklogMapView() {
  const { data: events = [], isPending, isError, refetch } = useQuery<
    CareerEventApiRow[]
  >({
    queryKey: ["career-events", "all"],
    queryFn: () => fetch("/api/events").then((r) => r.json()),
    staleTime: 30_000,
  });

  const mappable = useMemo<EventsMapItem[]>(
    () =>
      events.filter(hasLatLng).map((e) => ({
        id: e.id,
        title: e.title,
        date: e.startDate ?? "",
        location: e.location ?? "",
        lat: e.lat,
        lng: e.lng,
        photos: e.photos?.map((p) => p.filePath),
      })),
    [events],
  );

  const total = events.length;
  const withLocation = mappable.length;
  const withoutLocation = total - withLocation;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Toolbar */}
      <header className="flex items-center gap-3 border-b border-border/60 px-4 md:px-6 py-2.5 flex-shrink-0">
        <Link
          href="/worklog/events"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to events
        </Link>

        <div className="h-4 w-px bg-border/60" aria-hidden />

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-fuchsia-500" />
          <span className="tabular-nums">
            {isPending
              ? "Loading…"
              : `${withLocation} on map${
                  withoutLocation > 0 ? ` · ${withoutLocation} need a location` : ""
                }`}
          </span>
        </div>

        <Link
          href="/job-search"
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View jobs on full map →
        </Link>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {isError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Couldn&apos;t load events.{" "}
              <button
                type="button"
                onClick={() => refetch()}
                className="underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !isPending && mappable.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-sm text-center text-sm text-muted-foreground space-y-2">
              <MapPin className="h-6 w-6 mx-auto text-muted-foreground/60" />
              <p className="text-foreground font-medium">No events on the map yet</p>
              <p>
                Events show up here once they have a location. Anchor an event
                to a job (in <Link href="/career-map" className="underline">career map</Link>) or
                add a free-floating event with coordinates from the{" "}
                <Link href="/worklog/events" className="underline">events list</Link>.
              </p>
            </div>
          </div>
        ) : (
          <EventsMap events={mappable} />
        )}
      </div>
    </div>
  );
}
