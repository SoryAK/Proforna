"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

interface Suggestion {
  placeId: string;
  description: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  onPlaceSelect?: (place: { description: string; placeId: string }) => void;
  /**
   * ADR-0033 — fires AFTER `onPlaceSelect` once the Places Details API
   * resolves geometry for the chosen placeId. Optional and async; the
   * existing sync `onPlaceSelect` API stays unchanged for back-compat
   * with `life-anchors-panel.tsx` and `job-map.tsx`. Caller is
   * responsible for handling the case where this never fires (network
   * failure, missing geometry, etc.).
   */
  onCoordsResolved?: (coords: { lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
  types?: string[];
}

let optionsSet = false;

function ensureOptions() {
  if (!optionsSet && GOOGLE_KEY) {
    setOptions({
      key: GOOGLE_KEY,
      v: "weekly",
    });
    optionsSet = true;
  }
}

export function PlacesAutocomplete({ value, onChange, onSelect, onPlaceSelect, onCoordsResolved, placeholder = "City, State", className, types = ["(cities)"] }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  // PlacesService is the only Google primitive that resolves placeId →
  // {lat, lng}. It needs a HTMLDivElement anchor (used internally for
  // attribution rendering) — we mount one hidden in the tree below.
  const detailsServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const detailsAnchorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Update dropdown position when open
  useEffect(() => {
    if (!open || !containerRef.current) { setDropdownPos(null); return; }
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [open, suggestions]);

  // Load the Google Places library
  useEffect(() => {
    if (!GOOGLE_KEY) return;
    ensureOptions();

    importLibrary("places").then(() => {
      serviceRef.current = new google.maps.places.AutocompleteService();
      // PlacesService needs a DOM anchor; mount lazily once the lib is
      // loaded AND our hidden div has rendered. If the anchor isn't
      // ready yet (StrictMode double-effect), the next render's effect
      // run will catch it. Failing soft is fine — onCoordsResolved is
      // documented as best-effort.
      if (detailsAnchorRef.current) {
        detailsServiceRef.current = new google.maps.places.PlacesService(
          detailsAnchorRef.current,
        );
      }
      setReady(true);
    }).catch(() => {
      // Silently fail — fallback to plain input
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchSuggestions = useCallback(
    (input: string) => {
      if (!serviceRef.current || input.length < 2) {
        setSuggestions([]);
        return;
      }

      serviceRef.current.getPlacePredictions(
        {
          input,
          ...(types && types.length > 0 ? { types } : {}),
        },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setSuggestions(
              predictions.map((p) => ({
                placeId: p.place_id,
                description: p.description,
              }))
            );
            setOpen(true);
          } else {
            setSuggestions([]);
          }
        }
      );
    },
    []
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = (description: string, placeId: string) => {
    onChange(description);
    onSelect?.(description);
    onPlaceSelect?.({ description, placeId });
    setSuggestions([]);
    setOpen(false);

    // ADR-0033 — resolve coords for callers that need them. Fires
    // asynchronously; existing callers that didn't pass
    // onCoordsResolved see no behavior change.
    if (onCoordsResolved && detailsServiceRef.current) {
      detailsServiceRef.current.getDetails(
        { placeId, fields: ["geometry.location"] },
        (place, status) => {
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            place?.geometry?.location
          ) {
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            onCoordsResolved({ lat, lng });
          }
          // No-op on error — caller falls back to address-only.
        },
      );
    }
  };

  // If no Google key, render plain input
  if (!GOOGLE_KEY) {
    return (
      <div className={`relative ${className ?? "sm:w-52"}`}>
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9"
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? "sm:w-52"}`}>
      {/* Hidden anchor for PlacesService (attribution surface). Must
          exist in the DOM before the service is constructed in the
          load effect; sized to zero so it never paints. */}
      <div ref={detailsAnchorRef} aria-hidden="true" className="hidden" />
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        className="pl-9"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && dropdownPos && createPortal(
        <div
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 99999,
          }}
          className="rounded-md border bg-popover shadow-lg overflow-hidden max-h-64 overflow-y-auto"
        >
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s.description, s.placeId); }}
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{s.description}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
