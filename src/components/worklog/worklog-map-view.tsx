/**
 * WorklogMapView — `/worklog/map` page shell.
 *
 * ADR-0027 Day 4 Cycle B (Path B-modest, after ADR-0028 retired Leaflet).
 * Cycle C added the FAB + click-to-place flow for free-floating events.
 * ADR-0034 — the FAB pick now routes to the inline editor at
 * `/worklog/events/new?lat=&lng=&location=` (the EventCreateDialog
 * modal is retired).
 *
 *   FAB → placeMode on → user clicks the map → reverse-geocode for a
 *   default location string → router.push to /worklog/events/new with
 *   coords + location pre-filled → inline editor takes over.
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
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Plus, X } from "lucide-react";
import { importLibrary } from "@googlemaps/js-api-loader";
import { Button } from "@/components/ui/button";
import type { EventsMapItem } from "./events-map";
import {
  resolveEventCoords,
  type JobCoord,
} from "@/lib/worklog/events/resolve-event-coords";

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

// Mirror the subset of `GET /api/work-history` we use to feed the
// anchored-event fallback. Every `WorkHistory` row carries non-null
// lat/lng by schema, so we don't need to defend against undefined here
// — but we still narrow before building the map below.
interface WorkHistoryApiRow {
  id: string;
  company: string;
  lat: number;
  lng: number;
}

export function WorklogMapView() {
  const { data: events = [], isPending, isError, refetch } = useQuery<
    CareerEventApiRow[]
  >({
    queryKey: ["career-events", "all"],
    queryFn: () => fetch("/api/events").then((r) => r.json()),
    staleTime: 30_000,
  });

  // Parallel fetch — used as the fallback coord source for anchored
  // events (which carry no own lat/lng by ADR-0027 Q1=A). Same staleTime
  // as the events query so both refresh roughly together.
  const { data: jobs = [] } = useQuery<WorkHistoryApiRow[]>({
    queryKey: ["work-history", "all"],
    queryFn: () => fetch("/api/work-history").then((r) => r.json()),
    staleTime: 30_000,
  });

  const jobCoordsById = useMemo<Map<string, JobCoord>>(() => {
    const m = new Map<string, JobCoord>();
    for (const j of jobs) {
      if (!Number.isFinite(j.lat) || !Number.isFinite(j.lng)) continue;
      m.set(j.id, { lat: j.lat, lng: j.lng, company: j.company });
    }
    return m;
  }, [jobs]);

  const mappable = useMemo<EventsMapItem[]>(
    () =>
      events
        .map((e) => {
          const coords = resolveEventCoords(e, jobCoordsById);
          if (!coords) return null;
          return {
            id: e.id,
            title: e.title,
            date: e.startDate ?? "",
            location: e.location ?? "",
            lat: coords.lat,
            lng: coords.lng,
            photos: e.photos?.map((p) => p.filePath),
            anchoredTo:
              coords.source === "anchored"
                ? coords.anchoredCompany
                : undefined,
          };
        })
        .filter((m): m is EventsMapItem => m !== null),
    [events, jobCoordsById],
  );

  const total = events.length;
  const withLocation = mappable.length;
  const withoutLocation = total - withLocation;

  // ── Cycle C: FAB / place-mode — navigation handled by handlePickCoords ──
  const [placeMode, setPlaceMode] = useState(false);
  // Deep-link auto-arm (2026-06-16): the worklog-notes "New event" picker
  // routes here as `/worklog/map?place=1` because the validator requires
  // lat+lng+location — there's no map-less event create. Read the param
  // once on mount, flip place-mode on, then strip the param so a refresh
  // doesn't re-arm and a back-nav doesn't loop.
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("place") !== "1") return;
    setPlaceMode(true);
    router.replace("/worklog/map", { scroll: false });
  }, [searchParams, router]);
  // Esc cancels armed place-mode.
  useEffect(() => {
    if (!placeMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlaceMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placeMode]);

  // ADR-0034: pick coords → reverse-geocode (best-effort) → push to the
  // inline editor at `/worklog/events/new?lat=&lng=&location=`. The
  // editor's location section opens with coords already resolved, so
  // the user can save immediately or refine the address.
  const handlePickCoords = useCallback(async (lat: number, lng: number) => {
    setPlaceMode(false);
    let location = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      const { Geocoder } = (await importLibrary(
        "geocoding",
      )) as google.maps.GeocodingLibrary;
      const geocoder = new Geocoder();
      const result = await geocoder.geocode({ location: { lat, lng } });
      const address = result.results[0]?.formatted_address;
      if (address) location = address;
    } catch {
      // Keep the lat/lng fallback string we already set.
    }
    const sp = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      location,
    });
    router.push(`/worklog/events/new?${sp.toString()}`);
  }, [router]);

  return (
    <div className="h-full flex flex-col">
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
        ) : (
          // Always mount the map so the FAB / place-mode flow works even
          // before any events exist. The empty-state nudge sits over it.
          <>
            <EventsMap
              events={mappable}
              placeMode={placeMode}
              onPickCoords={handlePickCoords}
            />

            {/* Empty-state nudge (overlay) — only when truly empty and not loading. */}
            {!isPending && mappable.length === 0 && !placeMode && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
                <div className="pointer-events-auto max-w-sm rounded-lg border border-border/60 bg-background/85 backdrop-blur-sm p-4 text-center text-sm text-muted-foreground space-y-2 shadow-sm">
                  <MapPin className="h-6 w-6 mx-auto text-muted-foreground/60" />
                  <p className="text-foreground font-medium">No events on the map yet</p>
                  <p>
                    Tap{" "}
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-fuchsia-500 text-white align-middle">
                      <Plus className="h-3 w-3" />
                    </span>{" "}
                    to drop one right here, anchor one in{" "}
                    <Link href="/career-map" className="underline">career map</Link>, or browse the{" "}
                    <Link href="/worklog/events" className="underline">events list</Link>.
                  </p>
                </div>
              </div>
            )}

            {/* Place-mode banner */}
            {placeMode && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/95 text-white px-4 py-2 text-xs font-medium shadow-lg">
                <MapPin className="h-3.5 w-3.5" />
                <span>Click on the map to drop your event</span>
                <button
                  type="button"
                  onClick={() => setPlaceMode(false)}
                  className="ml-1 rounded-full hover:bg-white/20 p-0.5"
                  aria-label="Cancel placement"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] opacity-70 ml-1">or press Esc</span>
              </div>
            )}

            {/* FAB — bottom right (offset to clear the global AI Chat button at bottom-6 right-6 z-40). */}
            {!placeMode && (
              <Button
                type="button"
                onClick={() => setPlaceMode(true)}
                className="absolute bottom-5 right-24 z-30 h-12 w-12 rounded-full p-0 shadow-lg bg-fuchsia-500 hover:bg-fuchsia-600 text-white"
                aria-label="Add event"
                title="Add a free-floating event"
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
