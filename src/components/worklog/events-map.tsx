/**
 * EventsMap — dedicated Google Maps renderer for /worklog/map.
 *
 * ADR-0027 Day 4 Cycle B (Path B-modest, after ADR-0028 retired Leaflet).
 * Cycle C added the optional place-mode listener used by the FAB +
 * click-to-place flow in worklog-map-view.tsx.
 *
 * Why a fresh map instead of reusing JobMap:
 *   - JobMap is ~13.3k LOC of job-search + work-history + commute plumbing
 *     that work-events doesn't need. Adding a third mode would compound
 *     the god-file problem just flagged by ADR-0028.
 *   - This view is conceptually narrow: render N event pins, fit bounds,
 *     hover for details. No state machine.
 *
 * Visual parity: pink #d946ef camera-emoji pins matching the existing
 * event pins inside job-map-google.tsx (lines 876-902). Same hover-info,
 * same z-index style. If we ever lift the inline event-pin rendering out
 * of job-map-google into a shared helper, this is its natural sibling.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Loader2 } from "lucide-react";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
let optionsSet = false;
function ensureOptions() {
  if (!optionsSet && GOOGLE_KEY) {
    setOptions({ key: GOOGLE_KEY, v: "weekly" });
    optionsSet = true;
  }
}

// Minimal HTML escaper — same shape as job-map-google.tsx::escapeHtml so
// the marker innerHTML stays XSS-safe when titles / locations contain
// special chars. Local copy to avoid cross-importing from job-map-google.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EventsMapItem {
  id: string;
  title: string;
  date: string;
  location: string;
  lat: number;
  lng: number;
  photos?: string[];
  /**
   * Set when the event is anchored to a `WorkHistory` row and its coords
   * are inherited from the parent (see `resolveEventCoords`). Surfaced as
   * an "Anchored to {company}" subtitle in the InfoWindow so that several
   * anchored events sharing one job pin stay disambiguable on hover.
   */
  anchoredTo?: string;
}

interface Props {
  events: EventsMapItem[];
  /**
   * When true, the next single map click is captured and forwarded to
   * `onPickCoords` instead of doing nothing. The listener is one-shot —
   * the parent is expected to flip `placeMode` back to false after the
   * pick (typically by opening the create dialog).
   */
  placeMode?: boolean;
  onPickCoords?: (lat: number, lng: number) => void;
}

const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 39.5, lng: -98.35 }; // CONUS centroid
const DEFAULT_ZOOM = 4;

export default function EventsMap({ events, placeMode = false, onPickCoords }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  // `ready` flips to true once the async map init resolves. We drive a
  // re-render off it so the marker effect (which depends on `ready`) can
  // wait for `mapRef.current` to be populated.
  const [ready, setReady] = useState(false);

  // Initialise the map exactly once on mount.
  useEffect(() => {
    let cancelled = false;
    ensureOptions();
    (async () => {
      const [{ Map, InfoWindow }] = await Promise.all([
        importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
      ]);
      if (cancelled || !containerRef.current) return;
      mapRef.current = new Map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        mapId: "events-map",
        clickableIcons: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
      });
      infoRef.current = new InfoWindow();
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)render the markers any time `events` changes or the map becomes ready.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    // Clear previous markers.
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    if (events.length === 0) {
      // Reset to default view when there's nothing to plot.
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    events.forEach((ev) => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#d946ef;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);font-size:15px;line-height:1;cursor:pointer;transition:transform 0.15s;overflow:visible;" title="${escapeHtml(ev.title)} — ${ev.date}">📸</div>`;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: ev.lat, lng: ev.lng },
        map,
        content: el,
        zIndex: 1200,
      });
      const open = () => {
        const info = infoRef.current;
        if (!info) return;
        const photoHtml =
          ev.photos && ev.photos.length > 0
            ? `<img src='${ev.photos[0]}' style='width:100%;max-width:180px;max-height:80px;object-fit:cover;margin-bottom:4px;border-radius:6px;' />`
            : "";
        const anchoredHtml = ev.anchoredTo
          ? `<div style='color:#6b7280;font-size:10px;margin-top:2px;font-style:italic;'>Anchored to ${escapeHtml(ev.anchoredTo)}</div>`
          : "";
        info.setContent(
          `<div style='font-size:11px;max-width:210px;line-height:1.4;overflow:hidden;'>${photoHtml}<div style='font-weight:700;font-size:12px;color:#d946ef'>${escapeHtml(ev.title)}</div><div style='color:#6b7280;margin-top:1px'>${ev.date}</div><div style='color:#9ca3af;font-size:10px;margin-top:2px;'>${escapeHtml(ev.location)}</div>${anchoredHtml}</div>`,
        );
        info.open({ map, anchor: marker });
      };
      el.addEventListener("mouseenter", open);
      el.addEventListener("click", open);
      el.addEventListener("mouseleave", () => infoRef.current?.close());
      markersRef.current.push(marker);
      bounds.extend({ lat: ev.lat, lng: ev.lng });
    });

    if (events.length === 1) {
      // fitBounds on a single point zooms to max — give it a sensible level.
      map.setCenter({ lat: events[0].lat, lng: events[0].lng });
      map.setZoom(11);
    } else {
      map.fitBounds(bounds, 48);
    }

    return () => {
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];
    };
  }, [events, ready]);

  // Place-mode click capture. One-shot: after the click fires we let the
  // parent decide whether to flip placeMode off (typically by opening
  // the create dialog). Cursor swaps to crosshair while armed so the
  // user knows the next click means something different.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    if (placeMode) {
      map.setOptions({ draggableCursor: "crosshair" });
    } else {
      map.setOptions({ draggableCursor: undefined });
      return;
    }

    const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      // Always restore the cursor on pick, regardless of what the parent does.
      map.setOptions({ draggableCursor: undefined });
      onPickCoords?.(e.latLng.lat(), e.latLng.lng());
    });

    return () => {
      google.maps.event.removeListener(listener);
      map.setOptions({ draggableCursor: undefined });
    };
  }, [placeMode, ready, onPickCoords]);

  if (!GOOGLE_KEY) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Google Maps API key not configured.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading map…
        </div>
      )}
    </div>
  );
}

