import { useEffect, useRef } from "react";
import { divIcon } from "leaflet";
import { searchRadiusFrame, type SearchRadius } from "@core/job-search";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import type { MapPinIcons, MapPinTheme } from "@core/map-settings";
import { readMapCamera, writeMapCamera } from "./map-camera";
import { anchorPinHtml, pinFill, pinIcon, rolePinHtml, searchPinHtml } from "./work-map-pin";
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

export type MapSearchPin = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  detail: string;
  pay?: string;
  summary?: string;
};

export type MapAnchorPin = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  detail: string;
  icon: string;
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
  overlays = [],
  selectedOverlayId = null,
  onSelectOverlay,
  anchors = [],
  searchRadius = null,
  viewKey,
  fitKey = "",
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
  overlays?: MapSearchPin[];
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string) => void;
  anchors?: MapAnchorPin[];
  searchRadius?: SearchRadius | null;
  viewKey?: string;
  fitKey?: string;
}) {
  const points = roles.flatMap((role) =>
    role.locations.map((location) => ({ role, location })),
  );
  const focusPoints = selectedId
    ? points.filter(({ role }) => role.id === selectedId)
    : [];
  const selectedOverlay =
    overlays.find((pin) => pin.id === selectedOverlayId) ?? null;
  const anchorPoints = anchors.map(
    (anchor) => [anchor.latitude, anchor.longitude] as [number, number],
  );
  const radiusPoints =
    searchRadius && !selectedOverlay
      ? searchRadiusFrame(searchRadius).map(
          (point) => [point.latitude, point.longitude] as [number, number],
        )
      : [];
  const savedCamera = viewKey ? readMapCamera(viewKey) : null;
  const center: [number, number] = savedCamera
    ? [savedCamera.latitude, savedCamera.longitude]
    : points.length
    ? [points[0].location.latitude, points[0].location.longitude]
    : anchors[0]
      ? [anchors[0].latitude, anchors[0].longitude]
      : home
        ? [home.latitude, home.longitude]
        : [39.9526, -75.1652];

  return (
    <div className="work-map-canvas">
      <MapContainer
        center={center}
        zoom={savedCamera?.zoom ?? (points.length ? 8 : 6)}
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RememberCamera viewKey={viewKey} />
        <FitPoints
          fitKey={fitKey}
          hold={holdView}
          viewKey={viewKey}
          allPoints={[
            ...(overlays.length > 0 && !selectedId
              ? overlays.map(
                  (pin) => [pin.latitude, pin.longitude] as [number, number],
                )
              : points.map(
                  ({ location }) =>
                    [location.latitude, location.longitude] as [number, number],
                )),
            ...anchorPoints,
            ...radiusPoints,
            ...(home ? [[home.latitude, home.longitude] as [number, number]] : []),
          ]}
          focusPoints={
            selectedOverlay
              ? [[selectedOverlay.latitude, selectedOverlay.longitude]]
              : focusPoints.map(({ location }) => [
                  location.latitude,
                  location.longitude,
                ])
          }
          selectedId={selectedOverlayId ?? selectedId}
        />
        <MapClickHandler onMapClick={onMapClick} />
        {searchRadius ? (
          <Circle
            center={[searchRadius.latitude, searchRadius.longitude]}
            pathOptions={{
              color: "#c27b2b",
              fillColor: "#c27b2b",
              fillOpacity: 0.06,
              opacity: 0.7,
              weight: 1.5,
            }}
            radius={searchRadius.miles * 1609.34}
          />
        ) : null}
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
        {anchors.map((anchor) => {
          const drawn = anchorPinHtml(anchor.icon);
          return (
            <Marker
              icon={divIcon({
                className: "work-map-pin-icon",
                html: drawn.html,
                iconAnchor: [drawn.size / 2, drawn.size / 2],
                iconSize: [drawn.size, drawn.size],
              })}
              key={anchor.id}
              position={[anchor.latitude, anchor.longitude]}
              zIndexOffset={600}
            >
              <Tooltip className="work-map-tip" direction="top" offset={[0, -8]}>
                <strong>{anchor.label}</strong>
                {anchor.detail ? <span>{anchor.detail}</span> : null}
              </Tooltip>
            </Marker>
          );
        })}
        {overlays.map((pin) => {
          const focused = selectedOverlayId === pin.id;
          const drawn = searchPinHtml(focused);
          return (
            <Marker
              eventHandlers={{ click: () => onSelectOverlay?.(pin.id) }}
              icon={divIcon({
                className: "work-map-pin-icon",
                html: drawn.html,
                iconAnchor: [drawn.size / 2, drawn.size / 2],
                iconSize: [drawn.size, drawn.size],
              })}
              key={pin.id}
              position={[pin.latitude, pin.longitude]}
              zIndexOffset={focused ? 800 : 500}
            >
              <Tooltip className="work-map-tip" direction="top" offset={[0, -8]}>
                <strong>{pin.title}</strong>
                {pin.detail ? <span>{pin.detail}</span> : null}
                {pin.pay ? <span>{pin.pay}</span> : null}
                {pin.summary ? <span>{pin.summary}</span> : null}
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
      {points.length === 0 && overlays.length === 0 && anchors.length === 0 && !suppressEmpty ? (
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

function RememberCamera({ viewKey }: { viewKey?: string }) {
  const map = useMap();
  useEffect(() => {
    if (!viewKey) return;
    const save = () => {
      const center = map.getCenter();
      writeMapCamera(viewKey, {
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
      });
    };
    map.on("moveend", save);
    return () => {
      map.off("moveend", save);
    };
  }, [map, viewKey]);
  return null;
}

function FitPoints({
  allPoints,
  focusPoints,
  selectedId,
  hold,
  viewKey,
  fitKey,
}: {
  allPoints: Array<[number, number]>;
  focusPoints: Array<[number, number]>;
  selectedId: string | null;
  hold: boolean;
  viewKey?: string;
  fitKey: string;
}) {
  const map = useMap();
  const boot = useRef<"pending" | "ready">("pending");
  const seen = useRef<string | null>(null);
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
    const fitChanged = seen.current !== null && fitKey !== seen.current;
    const place = () => {
      if (points.length === 1) {
        map.setView(points[0], selectedId ? 12 : 11);
      } else if (points.length > 1) {
        map.fitBounds(points, {
          padding: [42, 42],
          maxZoom: selectedId ? 13 : 12,
        });
      }
    };
    if (boot.current === "pending") {
      const saved = viewKey ? readMapCamera(viewKey) : null;
      if (saved) {
        map.setView([saved.latitude, saved.longitude], saved.zoom, { animate: false });
        boot.current = "ready";
        seen.current = fitKey;
      } else if (points.length > 0) {
        place();
        boot.current = "ready";
        seen.current = fitKey;
      }
      return;
    }
    if (fitChanged) {
      place();
      seen.current = fitKey;
    }
  }, [map, frame, selectedId, hold, fitKey, viewKey]);

  return null;
}
