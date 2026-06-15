/**
 * WorklogMapView — `/worklog/map` page shell.
 *
 * ADR-0027 Day 4 Cycle B (Path B-modest, after ADR-0028 retired Leaflet).
 * Cycle C added the FAB + click-to-place flow for free-floating events:
 *   FAB → placeMode on → user clicks the map → reverse-geocode for a
 *   default location string → <EventCreateDialog> opens with coords
 *   pre-filled → save → invalidate ["career-events", "all"] → marker
 *   re-renders.
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Plus, X } from "lucide-react";
import { importLibrary } from "@googlemaps/js-api-loader";
import { Button } from "@/components/ui/button";
import { EventCreateDialog } from "./events/event-create-dialog";
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

  // ── Cycle C: FAB / place-mode / create-dialog state ────────────────
  const [placeMode, setPlaceMode] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [defaultLocation, setDefaultLocation] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Esc cancels armed place-mode (don't trap typing in the dialog).
  useEffect(() => {
    if (!placeMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlaceMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placeMode]);

  const handlePickCoords = useCallback(async (lat: number, lng: number) => {
    // Always exit place-mode after a pick — single-shot per FAB press.
    setPlaceMode(false);
    setPickedCoords({ lat, lng });
    // Open the dialog immediately with a coord-string fallback so the
    // user never sees an empty location field, then refine async.
    setDefaultLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setDialogOpen(true);
    // Best-effort reverse-geocode. Failures are silent — the fallback
    // string is already in place.
    try {
      const { Geocoder } = (await importLibrary("geocoding")) as google.maps.GeocodingLibrary;
      const geocoder = new Geocoder();
      const result = await geocoder.geocode({ location: { lat, lng } });
      const address = result.results[0]?.formatted_address;
      if (address) setDefaultLocation(address);
    } catch {
      // Keep the lat/lng fallback we already set.
    }
  }, []);

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
            {!isPending && mappable.length === 0 && !placeMode && !dialogOpen && (
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

      {/* Create dialog (mounted at view root so it survives re-renders). */}
      <EventCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        coords={pickedCoords}
        defaultLocation={defaultLocation}
      />
    </div>
  );
}
