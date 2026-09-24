import { useEffect } from "react";
import { divIcon } from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import type { MapPinIcons, MapPinTheme } from "@core/map-settings";
import { pinFill, pinIcon, rolePinHtml } from "./work-map-pin";
import "leaflet/dist/leaflet.css";

const homeIcon = divIcon({
  className: "work-map-home-icon",
  iconSize: [28, 32],
  iconAnchor: [14, 30],
  tooltipAnchor: [0, -28],
  html: `<svg viewBox="0 0 28 32" width="28" height="32" aria-hidden="true">
    <path d="M14 1.5 2.5 11.2V28h8.2v-8.2h6.6V28H25.5V11.2L14 1.5Z" fill="#c27b2b" stroke="#1a1510" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`,
});

export type WorkMapHome = {
  latitude: number;
  longitude: number;
  label: string;
  detail?: string;
};

export function WorkMapCanvas({
  roles,
  home,
  selectedId,
  onSelect,
  onMapClick,
  holdView = false,
  suppressEmpty = false,
  pinTheme,
  pinIcons,
}: {
  roles: WorkMapRole[];
  home?: WorkMapHome | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
  holdView?: boolean;
  suppressEmpty?: boolean;
  pinTheme: MapPinTheme;
  pinIcons: MapPinIcons;
}) {
  const points = roles.flatMap((role) =>
    role.locations.map((location) => ({ role, location })),
  );
  const focusPoints = selectedId
    ? points.filter(({ role }) => role.id === selectedId)
    : [];
  const center: [number, number] = points.length
    ? [points[0].location.latitude, points[0].location.longitude]
    : home
      ? [home.latitude, home.longitude]
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
          hold={holdView}
          allPoints={[
            ...points.map(
              ({ location }) =>
                [location.latitude, location.longitude] as [number, number],
            ),
            ...(home ? [[home.latitude, home.longitude] as [number, number]] : []),
          ]}
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
          const cover = roleCoverPhoto(role.media);
          const pin = rolePinHtml({
            kind: role.kind,
            icon: pinIcon(pinIcons, role.kind),
            fill: pinFill(pinTheme, role.kind),
            current: role.isCurrent,
            focused,
            secondary,
            startDate: role.startDate,
            endDate: role.endDate,
            ring: pinTheme.ring,
            currentRing: pinTheme.currentRing,
          });
          return (
            <Marker
              eventHandlers={{ click: () => onSelect(role.id) }}
              icon={divIcon({
                className: "work-map-pin-icon",
                html: pin.html,
                iconAnchor: [pin.size / 2, pin.size / 2],
                iconSize: [pin.size, pin.size],
              })}
              key={location.id}
              position={[location.latitude, location.longitude]}
            >
              <Tooltip className="work-map-tip" direction="top" offset={[0, -8]}>
                {cover ? <img src={cover.url} alt="" /> : null}
                <strong>{role.organization || role.title}</strong>
                {role.organization && role.title ? <span>{role.title}</span> : null}
                {location.label ? <span>{location.label}</span> : null}
              </Tooltip>
            </Marker>
          );
        })}
        {home ? (
          <Marker
            icon={homeIcon}
            position={[home.latitude, home.longitude]}
            zIndexOffset={400}
          >
            <Tooltip direction="top">
              <strong>{home.label}</strong>
              {home.detail ? (
                <>
                  <br />
                  {home.detail}
                </>
              ) : null}
            </Tooltip>
          </Marker>
        ) : null}
      </MapContainer>
      {points.length === 0 && !suppressEmpty ? (
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
  hold,
}: {
  allPoints: Array<[number, number]>;
  focusPoints: Array<[number, number]>;
  selectedId: string | null;
  hold: boolean;
}) {
  const map = useMap();
  const target = focusPoints.length > 0 ? focusPoints : allPoints;
  const frame = target.map((point) => point.join(",")).join("|");

  useEffect(() => {
    if (hold) return;
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
  }, [map, frame, selectedId, hold]);

  return null;
}
