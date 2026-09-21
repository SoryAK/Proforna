import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { ExtractedSite } from "@core/resume-extract";
import "leaflet/dist/leaflet.css";

const FALLBACK: [number, number] = [39.8283, -98.5795];

export function OnboardingSiteMap({
  site,
  onMove,
}: {
  site: ExtractedSite | null;
  onMove: (latitude: number, longitude: number) => void;
}) {
  const center: [number, number] = site
    ? [site.latitude, site.longitude]
    : FALLBACK;

  return (
    <div className="onboarding-site-map">
      <MapContainer
        center={center}
        zoom={site ? 11 : 4}
        scrollWheelZoom
        attributionControl
      >
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

function Recenter({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
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
