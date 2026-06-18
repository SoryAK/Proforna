/**
 * EventCreateDialog — CareerEvent creation surface.
 *
 * ADR-0033 (current): the dialog is the front door. Users open it
 * directly from the rail "+ Event" affordance (sidebar/Events accordion)
 * and from the legacy /worklog/map FAB. The map detour is no longer
 * required — location becomes a field with three flavors of input:
 *
 *   1. **Job-location chip row** — pick a saved WorkHistory entry. We
 *      send `POST /api/work-history/:id/events` so the validator's
 *      anchored branch runs (lat/lng/location optional; the job's geo
 *      is the source of truth). For "happened at the office".
 *   2. **Address autocomplete** — Google Places typeahead. On select
 *      we fire a Places `getDetails` call to resolve {lat, lng}, then
 *      preview them in a 240×140 read-only mini-map. We send
 *      `POST /api/events` (free-floating; validator demands lat+lng+
 *      location).
 *   3. **Pre-filled coords** (legacy map FAB path) — caller passes
 *      `coords` + `defaultLocation`; the dialog opens in address mode
 *      with the pin already confirmed.
 *
 * Backwards compat: the `coords` and `defaultLocation` props are now
 * optional. The map FAB still works exactly as it did under
 * ADR-0027 — the dialog just has more fields.
 *
 * Supersedes ADR-0027 Day 4 Cycle C (free-floating only, map detour
 * required) and lives alongside ADR-0032 (rail "+" affordances).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Briefcase,
  CalendarDays,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { CAREER_EVENT_CATEGORY_SUGGESTIONS } from "@/lib/career-event/event-schema";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

interface EventCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional pre-resolved coords (legacy /worklog/map FAB path).
   * When set, the dialog opens in address mode with the pin already
   * confirmed. ADR-0033 made this optional — the rail "+" entry path
   * starts with no coords and lets the user pick from chips or
   * autocomplete.
   */
  coords?: { lat: number; lng: number } | null;
  /** Reverse-geocoded address from the map FAB path. Best-effort. */
  defaultLocation?: string;
  onCreated?: () => void;
}

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

/** Max number of job chips to render in the chip row. */
const CHIP_ROW_LIMIT = 6;

export function EventCreateDialog({
  open,
  onOpenChange,
  coords: initialCoords,
  defaultLocation,
  onCreated,
}: EventCreateDialogProps) {
  const qc = useQueryClient();

  // Form fields
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("company_event");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => todayLocalDateInput());
  const [endDate, setEndDate] = useState("");
  const [metrics, setMetrics] = useState("");

  // "Where?" state — one of three resolutions:
  //   • selectedJobId set:                      anchored mode.
  //   • addressText + addressCoords both set:   free-floating mode.
  //   • neither:                                submit blocked.
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [addressText, setAddressText] = useState("");
  const [addressCoords, setAddressCoords] = useState<
    { lat: number; lng: number } | null
  >(null);
  const [coordsLoading, setCoordsLoading] = useState(false);

  // Lazy-load WorkHistory for the chip row only when the dialog
  // actually opens. Shares the global ["work-history"] cache that
  // sidebar/job-map already populate, so this is usually free.
  const workHistoryQuery = useQuery<WorkHistoryChip[]>({
    queryKey: ["work-history"],
    queryFn: async () => {
      const r = await fetch("/api/work-history");
      if (!r.ok) throw new Error("Failed to load work history");
      return r.json();
    },
    enabled: open,
  });

  // Reset form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setCategory("company_event");
    setDescription("");
    setStartDate(todayLocalDateInput());
    setEndDate("");
    setMetrics("");
    setSelectedJobId(null);
    setCoordsLoading(false);

    // Map FAB path: pre-fill address mode with the picked pin.
    if (initialCoords) {
      setAddressCoords(initialCoords);
      setAddressText(
        defaultLocation?.trim() ||
          `${initialCoords.lat.toFixed(5)}, ${initialCoords.lng.toFixed(5)}`,
      );
    } else {
      setAddressCoords(null);
      setAddressText("");
    }
  }, [open, initialCoords, defaultLocation]);

  // Picking a job chip clears address state — the two paths are
  // mutually exclusive on the wire.
  const pickJob = (id: string) => {
    setSelectedJobId(id);
    setAddressText("");
    setAddressCoords(null);
    setCoordsLoading(false);
  };

  const clearJob = () => setSelectedJobId(null);

  // Typing in the address input clears any active job selection so the
  // user can override "default to office" without a separate button.
  const handleAddressChange = (next: string) => {
    if (selectedJobId !== null) setSelectedJobId(null);
    setAddressText(next);
    // Coords must come from a Places selection — reset stale ones the
    // moment the text diverges from the last resolved address.
    if (addressCoords) setAddressCoords(null);
  };

  const handlePlaceSelected = () => {
    setCoordsLoading(true);
  };

  const handleCoordsResolved = (next: { lat: number; lng: number }) => {
    setAddressCoords(next);
    setCoordsLoading(false);
  };

  const selectedJob = selectedJobId
    ? workHistoryQuery.data?.find((j) => j.id === selectedJobId) ?? null
    : null;

  // Mini-map renders any time we have coords from EITHER path.
  const previewCoords = selectedJob
    ? { lat: selectedJob.lat, lng: selectedJob.lng }
    : addressCoords;

  const create = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("Title is required");

      const basePayload = {
        title: trimmedTitle,
        category: category.trim() || "other",
        description: description.trim() ? description.trim() : null,
        startDate: dateInputToIso(startDate),
        endDate: dateInputToIso(endDate),
        metrics: metrics.trim() ? metrics.trim() : null,
      };

      // Anchored path — server reads `:id` from URL and overrides any
      // caller-supplied workHistoryId. Validator's anchored branch
      // exempts lat/lng/location.
      if (selectedJobId) {
        const res = await fetch(
          `/api/work-history/${encodeURIComponent(selectedJobId)}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(basePayload),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `POST failed (${res.status})`);
        }
        return res.json();
      }

      // Free-floating path — validator demands lat/lng/location.
      const trimmedAddress = addressText.trim();
      if (!trimmedAddress) {
        throw new Error("Pick a job or enter a location");
      }
      if (!addressCoords) {
        throw new Error(
          coordsLoading
            ? "Looking up location coordinates — try again in a moment."
            : "Pick an address from the suggestions so we can map it.",
        );
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basePayload,
          location: trimmedAddress,
          lat: addressCoords.lat,
          lng: addressCoords.lng,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `POST failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Event added");
      qc.invalidateQueries({ queryKey: ["career-events", "all"] });
      qc.invalidateQueries({ queryKey: ["career-growth"] });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not create event"),
  });

  const hasWhere =
    selectedJobId !== null ||
    (addressText.trim().length > 0 && addressCoords !== null);

  const canSubmit =
    title.trim().length > 0 && hasWhere && !create.isPending;

  // Bring relevant chips to the front: currently-active jobs first
  // (endDate null), then most-recently-ended.
  const chipJobs = (workHistoryQuery.data ?? [])
    .filter((j) => j.type !== "unemployed")
    .sort((a, b) => {
      if (a.endDate === null && b.endDate !== null) return -1;
      if (a.endDate !== null && b.endDate === null) return 1;
      return (b.endDate ?? "").localeCompare(a.endDate ?? "");
    })
    .slice(0, CHIP_ROW_LIMIT);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-fuchsia-500" />
            New event
          </DialogTitle>
          <DialogDescription>
            Capture a moment — a conference, field day, news event, or
            something that happened at one of your jobs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-new-title">Title</Label>
            <Input
              id="ev-new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Conference, field day, news event…"
              disabled={create.isPending}
              autoFocus
            />
          </div>

          {/* What happened — placed before "Where?" so the user
              captures the gist before fiddling with location, per the
              ADR-0033 narrative ("note pops up first"). */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-new-description">
              What happened?{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="ev-new-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="A few sentences of context."
              disabled={create.isPending}
            />
          </div>

          {/* Category + dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-new-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v ?? "company_event")}
                disabled={create.isPending}
              >
                <SelectTrigger id="ev-new-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAREER_EVENT_CATEGORY_SUGGESTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {formatCategoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-new-start" className="text-[11px]">
                  Start
                </Label>
                <Input
                  id="ev-new-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={create.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-new-end" className="text-[11px]">
                  End{" "}
                  <span className="text-muted-foreground font-normal">
                    (opt)
                  </span>
                </Label>
                <Input
                  id="ev-new-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={create.isPending}
                />
              </div>
            </div>
          </div>

          {/* ─── Where? section ──────────────────────────────────── */}
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-[13px] font-medium">
                <MapPin className="h-3.5 w-3.5 text-fuchsia-500" />
                Where?
              </Label>
              {selectedJobId && (
                <button
                  type="button"
                  onClick={clearJob}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  disabled={create.isPending}
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>

            {/* Job chip row — only render when chips exist. New users
                go straight to the autocomplete with no awkward empty
                row. */}
            {chipJobs.length > 0 && (
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
                        onClick={() => pickJob(j.id)}
                        disabled={create.isPending}
                        className={
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors " +
                          (active
                            ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"
                            : "border-border bg-background text-foreground hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5")
                        }
                      >
                        <Briefcase className="h-3 w-3" />
                        <span className="font-medium truncate max-w-[140px]">
                          {j.company}
                        </span>
                        {j.title && (
                          <span className="opacity-60 truncate max-w-[100px]">
                            · {j.title}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Address autocomplete — hidden when a job chip is
                active; the job's geo is authoritative. User can click
                "Clear" to switch back to address mode. */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                {selectedJobId
                  ? "Using the job's saved location."
                  : chipJobs.length > 0
                  ? "Or somewhere else:"
                  : "Enter an address:"}
              </p>
              {!selectedJobId && (
                <PlacesAutocomplete
                  value={addressText}
                  onChange={handleAddressChange}
                  onPlaceSelect={handlePlaceSelected}
                  onCoordsResolved={handleCoordsResolved}
                  placeholder="Start typing an address…"
                  className="w-full"
                  types={[]}
                />
              )}
            </div>

            {/* Mini-map preview — lazy-mounted only when there's
                something to preview, to avoid spinning up a Google Map
                instance for every dialog open. */}
            {previewCoords && (
              <MiniMapPreview
                coords={previewCoords}
                label={
                  selectedJob
                    ? `${selectedJob.company}${
                        selectedJob.title ? " · " + selectedJob.title : ""
                      }`
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

          {/* Metrics */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-new-metrics">
              Metrics{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="ev-new-metrics"
              value={metrics}
              onChange={(e) => setMetrics(e.target.value)}
              maxLength={500}
              placeholder="e.g. 1.2k attendees · 3 talks"
              disabled={create.isPending}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => create.mutate()}
            disabled={!canSubmit}
          >
            {create.isPending && (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            )}
            Add event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MiniMapPreview ──────────────────────────────────────────────────
// Read-only confirmation map. Spins up a fresh Google Map per mount;
// cheap relative to typing speed and only mounts after the user has
// actually picked a location.

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
    // Graceful no-key fallback — the form still works, the user just
    // doesn't get the visual confirmation.
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

// ─── Helpers (mirrored from event-edit-dialog.tsx) ───────────────────

function todayLocalDateInput(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatCategoryLabel(raw: string): string {
  return raw
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
