import { useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { ExtractedSite } from "@core/resume-extract";
import type { MapSettings } from "@core/map-settings";
import { loadGoogleMaps } from "./google-maps";
import "leaflet/dist/leaflet.css";

const FALLBACK: [number, number] = [39.8283, -98.5795];

export function OnboardingSiteMap({
  site,
  onMove,
}: {
  site: ExtractedSite | null;
  onMove: (latitude: number, longitude: number) => void;
}) {
  const [settings, setSettings] = useState<MapSettings | null>(null);

  useEffect(() => {
    void fetch("/api/maps")
      .then(async (response) => {
        const body = (await response.json()) as { settings?: MapSettings };
        if (body.settings) setSettings(body.settings);
      })
      .catch(() => setSettings(null));
  }, []);

  if (settings?.provider === "google" && settings.googleMapsApiKey) {
    return (
      <GoogleSiteMap apiKey={settings.googleMapsApiKey} site={site} onMove={onMove} />
    );
  }

  const center: [number, number] = site ? [site.latitude, site.longitude] : FALLBACK;
  return (
    <div className="onboarding-site-map">
      <MapContainer center={center} zoom={site ? 11 : 4} scrollWheelZoom attributionControl>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={center} zoom={site ? 11 : 4} />
        <MapClickHandler onMove={onMove} />
        {site ? (
          <CircleMarker
            center={[site.latitude, site.longitude]}
            pathOptions={{
              color: "#f2d19b",
              fillColor: "#c27b2b",
              fillOpacity: 1,
              weight: 3,
            }}
            radius={10}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {site.label}
            </Tooltip>
          </CircleMarker>
        ) : null}
      </MapContainer>
    </div>
  );
}

function GoogleSiteMap({
  apiKey,
  site,
  onMove,
}: {
  apiKey: string;
  site: ExtractedSite | null;
  onMove: (latitude: number, longitude: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleSiteMapHandle | null>(null);
  const markerRef = useRef<{ setMap: (map: null) => void } | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = node.current;
    if (!host) return;
    let cancelled = false;
    let listener: { remove: () => void } | null = null;
    void loadGoogleMaps(apiKey)
      .then(() => {
        const maps = (
          window as Window & {
            google?: {
              maps: {
                Map: new (node: HTMLElement, options: object) => GoogleSiteMapHandle;
                Marker: new (options: object) => { setMap: (map: null) => void };
                SymbolPath: { CIRCLE: number };
              };
            };
          }
        ).google?.maps;
        if (cancelled || !maps || !node.current) return;
        const center = site
          ? { lat: site.latitude, lng: site.longitude }
          : { lat: FALLBACK[0], lng: FALLBACK[1] };
        const map =
          mapRef.current ??
          new maps.Map(node.current, {
            center,
            zoom: site ? 11 : 4,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        mapRef.current = map;
        listener = map.addListener(
          "click",
          (event: { latLng?: { lat: () => number; lng: () => number } }) => {
            const latLng = event.latLng;
            if (!latLng) return;
            onMoveRef.current(latLng.lat(), latLng.lng());
          },
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = (
      window as Window & {
        google?: {
          maps: {
            Map: new (node: HTMLElement, options: object) => GoogleSiteMapHandle;
            Marker: new (options: object) => { setMap: (map: null) => void };
            SymbolPath: { CIRCLE: number };
          };
        };
      }
    ).google?.maps;
    if (!map || !maps) return;
    markerRef.current?.setMap(null);
    markerRef.current = null;
    if (!site) return;
    const position = { lat: site.latitude, lng: site.longitude };
    map.panTo(position);
    map.setZoom(11);
    markerRef.current = new maps.Marker({
      map,
      position,
      title: site.label,
      icon: {
        path: maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#c27b2b",
        fillOpacity: 1,
        strokeColor: "#f2d19b",
        strokeWeight: 3,
      },
    });
  }, [site?.latitude, site?.longitude, site?.label, failed]);

  return (
    <div className="onboarding-site-map">
      <div className="onboarding-google-map" ref={node} />
      {failed ? <p className="onboarding-field-hint">Google Maps did not load.</p> : null}
    </div>
  );
}

type GoogleSiteMapHandle = {
  panTo: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  addListener: (
    name: string,
    handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void,
  ) => { remove: () => void };
};

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center[0], center[1], zoom]);
  return null;
}

function MapClickHandler({
  onMove,
}: {
  onMove: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      onMove(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}
