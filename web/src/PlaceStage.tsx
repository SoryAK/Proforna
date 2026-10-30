import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "./google-maps";

export function PlaceStage({
  latitude,
  longitude,
  interactive,
  label,
}: {
  latitude: number;
  longitude: number;
  interactive: boolean;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let marker: { setMap: (map: null) => void } | null = null;
    setFailed("");
    void openMap()
      .then((maps) => {
        if (cancelled || !host.current) return;
        const map = new maps.Map(host.current, {
          center: { lat: latitude, lng: longitude },
          zoom: 14,
          disableDefaultUI: !interactive,
          gestureHandling: interactive ? "greedy" : "none",
          keyboardShortcuts: interactive,
          clickableIcons: false,
          draggable: interactive,
          scrollwheel: interactive,
        });
        marker = new maps.Marker({
          map,
          position: { lat: latitude, lng: longitude },
          title: label,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed("This map could not be opened.");
      });
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [latitude, longitude, interactive, label]);

  return (
    <div className={interactive ? "role-canvas-place-stage" : "role-canvas-place-preview"}>
      <div ref={host} />
      {failed ? <p>{failed}</p> : null}
    </div>
  );
}

async function openMap() {
  if (window.google?.maps) return window.google.maps;
  const response = await fetch("/api/maps");
  if (!response.ok) throw new Error("maps");
  const body = (await response.json()) as {
    settings?: { provider?: string; googleMapsApiKey?: string };
  };
  const key = body.settings?.googleMapsApiKey?.trim() ?? "";
  if (body.settings?.provider !== "google" || !key) throw new Error("maps");
  await loadGoogleMaps(key);
  if (!window.google?.maps) throw new Error("maps");
  return window.google.maps;
}
