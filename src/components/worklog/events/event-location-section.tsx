/**
 * EventLocationSection — Properties-rail location/anchor field for the
 * inline event editor (ADR-0034).
 *
 * Three render modes — the editor shell decides which based on whether
 * the event is a brand-new draft, an existing free-floating event, or
 * an existing anchored event.
 *
 *   mode="draft"      Full ADR-0033 UX: job-chip row → autocomplete →
 *                     mini-map preview. Picking a chip vs. typing an
 *                     address chooses the anchored vs. free-floating
 *                     POST endpoint at first save.
 *
 *   mode="floating"   Existing free-floating event. Address autocomplete
 *                     + mini-map only — no chip row, since ADR-0027 Q1=A
 *                     locks `workHistoryId` (delete + recreate to anchor).
 *                     `onAddressTextChange` triggers PATCH on commit;
 *                     `onCoordsResolved` PATCHes lat/lng + location in
 *                     one shot once Places resolves the geocode.
 *
 *   mode="anchored"   Existing anchored event. Read-only "Anchored to:
 *                     [Company]" badge with the immutability hint.
 *
 * Owns no state of its own — the editor shell holds canonical state and
 * receives commit calls from this component.
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor as AnchorIcon,
  Briefcase,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Label } from "@/components/ui/label";
import { PlacesAutocomplete } from "@/components/places-autocomplete";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const CHIP_ROW_LIMIT = 6;

interface WorkHistoryChip {
  id: string;
  type: string;
  company: string;
  title: string | null;
  address: string;
  lat: number;
  lng: number;
  endDate: string | null;
}

export type EventLocationMode = "draft" | "floating" | "anchored";

export interface EventLocationSectionProps {
  mode: EventLocationMode;

  /** Active job chip id when mode === "draft". Null otherwise. */
  selectedJobId?: string | null;
  /** Set the active job chip (clears address state). Draft only. */
  onSelectJob?: (id: string | null) => void;

  /** Address typeahead value. Used in draft + floating modes. */
  addressText: string;
  addressCoords: { lat: number; lng: number } | null;
  coordsLoading: boolean;
  onAddressTextChange: (text: string) => void;
  /** Fires when user picks a Places suggestion — sets coordsLoading. */
  onPlaceSelected: () => void;
  /** Fires when getDetails resolves coords. */
  onCoordsResolved: (coords: { lat: number; lng: number }) => void;
  /** Fires after a coords-bearing change is committed (floating PATCH). */
  onAddressCommit?: () => void;

  /** Anchored-mode metadata for the read-only badge. */
  anchoredJob?: {
    company: string;
    title: string | null;
    location: string | null;
  } | null;

  /** Disabled while a submission/PATCH is in flight. */
  disabled?: boolean;
}

export function EventLocationSection({
  mode,
  selectedJobId,
  onSelectJob,
  addressText,
  addressCoords,
  coordsLoading,
  onAddressTextChange,
  onPlaceSelected,
  onCoordsResolved,
  onAddressCommit,
  anchoredJob,
  disabled,
}: EventLocationSectionProps) {
  // Anchored mode: read-only badge, no Places lookup at all.
  if (mode === "anchored") {
    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-[13px] font-medium">
          <AnchorIcon className="h-3.5 w-3.5 text-fuchsia-500" />
          Anchored
        </Label>
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
          <p className="font-medium text-foreground truncate">
            {anchoredJob?.company ?? "(unknown job)"}
            {anchoredJob?.title ? ` · ${anchoredJob.title}` : ""}
          </p>
          {anchoredJob?.location && (
            <p className="text-[11px] truncate opacity-80">{anchoredJob.location}</p>
          )}
          <p className="text-[10px] text-muted-foreground/80 italic pt-1">
            Anchor is locked. Delete and recreate this event to move it.
          </p>
        </div>
      </div>
    );
  }

  // Draft + floating modes share the autocomplete + mini-map.
  // Only draft mode shows the job chip row.
  return (
    <DraftOrFloatingLocation
      mode={mode}
      selectedJobId={selectedJobId ?? null}
      onSelectJob={onSelectJob}
      addressText={addressText}
      addressCoords={addressCoords}
      coordsLoading={coordsLoading}
      onAddressTextChange={onAddressTextChange}
      onPlaceSelected={onPlaceSelected}
      onCoordsResolved={onCoordsResolved}
      onAddressCommit={onAddressCommit}
      disabled={disabled}
    />
  );
}

// ── Draft + Floating shared body ─────────────────────────────────────

function DraftOrFloatingLocation({
  mode,
  selectedJobId,
  onSelectJob,
  addressText,
  addressCoords,
  coordsLoading,
  onAddressTextChange,
  onPlaceSelected,
  onCoordsResolved,
  onAddressCommit,
  disabled,
}: {
  mode: "draft" | "floating";
  selectedJobId: string | null;
  onSelectJob?: (id: string | null) => void;
  addressText: string;
  addressCoords: { lat: number; lng: number } | null;
  coordsLoading: boolean;
  onAddressTextChange: (text: string) => void;
  onPlaceSelected: () => void;
  onCoordsResolved: (coords: { lat: number; lng: number }) => void;
  onAddressCommit?: () => void;
  disabled?: boolean;
}) {
  // Lazy-load WorkHistory only in draft mode (chip row hidden in floating mode).
  const workHistoryQuery = useQuery<WorkHistoryChip[]>({
    queryKey: ["work-history"],
    queryFn: async () => {
      const r = await fetch("/api/work-history");
      if (!r.ok) throw new Error("Failed to load work history");
      return r.json();
    },
    enabled: mode === "draft",
  });

  const chipJobs = useMemo(() => {
    if (mode !== "draft") return [];
    return (workHistoryQuery.data ?? [])
      .filter((j) => j.type !== "unemployed")
      .sort((a, b) => {
        if (a.endDate === null && b.endDate !== null) return -1;
        if (a.endDate !== null && b.endDate === null) return 1;
        return (b.endDate ?? "").localeCompare(a.endDate ?? "");
      })
      .slice(0, CHIP_ROW_LIMIT);
  }, [mode, workHistoryQuery.data]);

  const selectedJob = selectedJobId
    ? workHistoryQuery.data?.find((j) => j.id === selectedJobId) ?? null
    : null;

  const previewCoords = selectedJob
    ? { lat: selectedJob.lat, lng: selectedJob.lng }
    : addressCoords;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-[13px] font-medium">
          <MapPin className="h-3.5 w-3.5 text-fuchsia-500" />
          Where?
        </Label>
        {mode === "draft" && selectedJobId && (
          <button
            type="button"
            onClick={() => onSelectJob?.(null)}
            disabled={disabled}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Job chip row — draft mode only, hidden when no chips exist. */}
      {mode === "draft" && chipJobs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            At one of your jobs?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {chipJobs.map((j) => {
              const active = j.id === selectedJobId;
              return (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => onSelectJob?.(j.id)}
                  disabled={disabled}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors " +
                    (active
                      ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"
                      : "border-border bg-background text-foreground hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5")
                  }
                >
                  <Briefcase className="h-3 w-3" />
                  <span className="font-medium truncate max-w-[140px]">{j.company}</span>
                  {j.title && (
                    <span className="opacity-60 truncate max-w-[100px]">· {j.title}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Address autocomplete — hidden when a chip is active in draft mode. */}
      <div className="space-y-1.5">
        {mode === "draft" && (
          <p className="text-[11px] text-muted-foreground">
            {selectedJobId
              ? "Using the job's saved location."
              : chipJobs.length > 0
              ? "Or somewhere else:"
              : "Enter an address:"}
          </p>
        )}
        {!(mode === "draft" && selectedJobId) && (
          <PlacesAutocomplete
            value={addressText}
            onChange={onAddressTextChange}
            onPlaceSelect={onPlaceSelected}
            onCoordsResolved={(c) => {
              onCoordsResolved(c);
              // Floating mode commits the geo PATCH the moment Places
              // resolves — that's the user's "I picked a place" signal.
              if (mode === "floating") onAddressCommit?.();
            }}
            placeholder="Start typing an address…"
            className="w-full"
            types={[]}
          />
        )}
      </div>

      {/* Mini-map preview. */}
      {previewCoords && (
        <MiniMapPreview
          coords={previewCoords}
          label={
            selectedJob
              ? `${selectedJob.company}${selectedJob.title ? " · " + selectedJob.title : ""}`
              : addressText
          }
        />
      )}
      {!previewCoords && coordsLoading && (
        <div className="rounded-md border bg-background px-3 py-4 text-center text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto mb-1.5" />
          Looking up location…
        </div>
      )}
    </div>
  );
}

// ── MiniMapPreview ───────────────────────────────────────────────────
// Read-only confirmation map. Shared with the (now-retired) modal — we
// kept the implementation here verbatim because it's the primary user-
// facing chrome the location section must preserve.

let optionsSet = false;

function ensureMapsOptions() {
  if (!optionsSet && GOOGLE_KEY) {
    setOptions({ key: GOOGLE_KEY, v: "weekly" });
    optionsSet = true;
  }
}

function MiniMapPreview({
  coords,
  label,
}: {
  coords: { lat: number; lng: number };
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!GOOGLE_KEY) return;
    ensureMapsOptions();

    let cancelled = false;
    importLibrary("maps").then(() => {
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: coords,
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
        });
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position: coords,
        });
      } else {
        mapRef.current.setCenter(coords);
        markerRef.current?.setPosition(coords);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [coords]);

  if (!GOOGLE_KEY) {
    return (
      <div className="rounded-md border bg-background px-3 py-2 text-[11px] text-muted-foreground">
        <MapPin className="inline h-3 w-3 mr-1" />
        {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} · {label}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className="h-[140px] w-full rounded-md border overflow-hidden"
        aria-label={`Map preview: ${label}`}
      />
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        {label ? ` · ${label}` : ""}
      </p>
    </div>
  );
}
