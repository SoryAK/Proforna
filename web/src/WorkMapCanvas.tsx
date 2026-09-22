import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { WorkMapRole } from "@core/work-map";
import "leaflet/dist/leaflet.css";

export function WorkMapCanvas({
  roles,
  selectedId,
  onSelect,
  onMapClick,
}: {
  roles: WorkMapRole[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
}) {
  const points = roles.flatMap((role) =>
    role.locations.map((location) => ({ role, location })),
  );
  const focusPoints = selectedId
    ? points.filter(({ role }) => role.id === selectedId)
    : [];
  const center: [number, number] = points.length
    ? [points[0].location.latitude, points[0].location.longitude]
    : [39.9526, -75.1652];

  return (
    <div className="work-map-canvas">
      <MapContainer
        center={center}
        zoom={points.length ? 8 : 6}
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitPoints
          allPoints={points.map(({ location }) => [
            location.latitude,
            location.longitude,
          ])}
          focusPoints={focusPoints.map(({ location }) => [
            location.latitude,
            location.longitude,
          ])}
          selectedId={selectedId}
        />
        <MapClickHandler onMapClick={onMapClick} />
        {points.map(({ role, location }) => {
          const focused = selectedId === role.id;
          const secondary = Boolean(selectedId) && !focused;
          return (
            <CircleMarker
              center={[location.latitude, location.longitude]}
              eventHandlers={{ click: () => onSelect(role.id) }}
              key={location.id}
              pathOptions={{
                color: focused ? "#f2d19b" : "#1a1510",
                fillColor: role.isCurrent ? "#c27b2b" : "#8d6b48",
                fillOpacity: secondary ? 0.28 : 1,
                opacity: secondary ? 0.45 : 1,
                weight: focused ? 4 : 2,
              }}
              radius={focused ? 12 : secondary ? 6 : 8}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <strong>{role.title}</strong>
                <br />
                {role.organization}
                <br />
                {location.label}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {points.length === 0 ? (
        <div className="work-map-unmapped">
          <strong>Your history is ready to map.</strong>
          <span>Select a role and add its first work site.</span>
        </div>
      ) : null}
    </div>
  );
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick?: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      onMapClick?.(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function FitPoints({
  allPoints,
  focusPoints,
  selectedId,
}: {
  allPoints: Array<[number, number]>;
  focusPoints: Array<[number, number]>;
  selectedId: string | null;
}) {
  const map = useMap();
  const target = focusPoints.length > 0 ? focusPoints : allPoints;
  const frame = target.map((point) => point.join(",")).join("|");

  useEffect(() => {
    const points = frame
      ? frame.split("|").map((pair) => {
          const [lat, lng] = pair.split(",").map(Number);
          return [lat, lng] as [number, number];
        })
      : [];
    if (points.length === 1) {
      map.setView(points[0], selectedId ? 12 : 11);
    } else if (points.length > 1) {
      map.fitBounds(points, {
        padding: [42, 42],
        maxZoom: selectedId ? 13 : 12,
      });
    }
  }, [map, frame, selectedId]);

  return null;
}
