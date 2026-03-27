"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  placeholder?: string;
  className?: string;
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

export function PlacesAutocomplete({ value, onChange, placeholder = "City, State", className }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load the Google Places library
  useEffect(() => {
    if (!GOOGLE_KEY) return;
    ensureOptions();

    importLibrary("places").then(() => {
      serviceRef.current = new google.maps.places.AutocompleteService();
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
          types: ["(cities)"],
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

  const handleSelect = (description: string) => {
    onChange(description);
    setSuggestions([]);
    setOpen(false);
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
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        className="pl-9"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-md overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => handleSelect(s.description)}
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
