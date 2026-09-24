import { useEffect, useRef, useState } from "react";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import type { MapPinIcons, MapPinTheme } from "@core/map-settings";
import { pinFill, pinIcon, rolePinHtml } from "./work-map-pin";
import type { WorkMapHome } from "./WorkMapCanvas";
import { loadGoogleMaps } from "./google-maps";

type MapPoint = {
  role: WorkMapRole;
  latitude: number;
  longitude: number;
  label: string;
};

export function GoogleWorkMap({
  apiKey,
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
  apiKey: string;
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
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapHandle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const points = roles.flatMap((role) =>
    role.locations.map((location) => ({
      role,
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.label,
    })),
  );

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  onSelectRef.current = onSelect;
  onMapClickRef.current = onMapClick;
  const layout = JSON.stringify({
    holdView,
    selectedId,
    home: home ? [home.latitude, home.longitude, home.label, home.detail ?? ""] : null,
    points: points.map((point) => [
      point.role.id,
      point.latitude,
      point.longitude,
      point.label,
      point.role.isCurrent,
      point.role.organization,
      point.role.title,
      point.role.kind,
      point.role.startDate,
      point.role.endDate,
      roleCoverPhoto(point.role.media)?.url ?? "",
    ]),
    pins: {
      theme: pinTheme,
      icons: pinIcons,
    },
  });

  useEffect(() => {
    const host = node.current;
    const maps = window.google?.maps;
    if (status !== "ready" || !host || !maps) return;
    const center = points[0] ?? home ?? { latitude: 39.9526, longitude: -75.1652 };
    const map =
      mapRef.current ??
      new maps.Map(host, {
        center: { lat: center.latitude, lng: center.longitude },
        zoom: points.length ? 8 : 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
    mapRef.current = map;
    const drawn = drawMarkers(
      map,
      maps,
      points,
      home ?? null,
      selectedId,
      pinTheme,
      pinIcons,
      (id) => onSelectRef.current(id),
    );
    const click = onMapClickRef.current
      ? map.addListener("click", (event: { latLng?: { lat: () => number; lng: () => number } }) => {
          const latLng = event.latLng;
          const place = onMapClickRef.current;
          if (!latLng || !place) return;
          place(latLng.lat(), latLng.lng());
        })
      : null;
    if (!holdView) fitMap(map, maps, points, home ?? null, selectedId);
    return () => {
      click?.remove();
      drawn.hideTip();
      for (const marker of drawn.markers) marker.setMap(null);
    };
  }, [status, layout]);

  return (
    <div className="work-map-canvas">
      <div className="work-map-google" ref={node} />
      {status === "error" ? (
        <div className="work-map-unmapped">
          <strong>Google Maps did not load.</strong>
          <span>Check the key in Settings. The Maps JavaScript API has to be enabled.</span>
        </div>
      ) : null}
      {status === "ready" && points.length === 0 && !suppressEmpty ? (
        <div className="work-map-unmapped">
          <strong>Your history is ready to map.</strong>
          <span>Select a role and add its first work site.</span>
        </div>
      ) : null}
    </div>
  );
}

type GoogleMapHandle = {
  fitBounds: (bounds: object, padding?: number) => void;
  panTo: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  addListener: (
    name: string,
    handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void,
  ) => { remove: () => void };
};

type GoogleMarker = {
  setMap: (map: GoogleMapHandle | null) => void;
  addListener: (name: string, handler: () => void) => void;
};

type GoogleMapsApi = {
  Map: new (node: HTMLElement, options: object) => GoogleMapHandle;
  Marker: new (options: object) => GoogleMarker;
  InfoWindow: new (options: object) => {
    setContent: (html: string) => void;
    open: (options: { map: GoogleMapHandle; anchor: GoogleMarker }) => void;
    close: () => void;
  };
  OverlayView: new () => GoogleOverlay;
  LatLngBounds: new () => { extend: (position: { lat: number; lng: number }) => void };
  Size: new (width: number, height: number) => object;
  Point: new (x: number, y: number) => object;
  SymbolPath: { CIRCLE: number };
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
  }
}

type GoogleOverlay = {
  setMap: (map: GoogleMapHandle | null) => void;
  getPanes: () => {
    floatPane: HTMLElement;
    overlayMouseTarget: HTMLElement;
  } | null;
  getProjection: () => {
    fromLatLngToDivPixel: (position: { lat: number; lng: number }) => { x: number; y: number } | null;
  } | null;
  onAdd: () => void;
  draw: () => void;
  onRemove: () => void;
};

function drawMarkers(
  map: GoogleMapHandle,
  maps: GoogleMapsApi,
  points: MapPoint[],
  home: WorkMapHome | null,
  selectedId: string | null,
  pinTheme: MapPinTheme,
  pinIcons: MapPinIcons,
  onSelect: (id: string) => void,
) {
  const markers: GoogleMarker[] = [];
  const tip = mountTip(map, maps);
  const pins = mountRolePins(map, maps, points, selectedId, pinTheme, pinIcons, onSelect, tip);
  if (home) {
    const marker = new maps.Marker({
      map,
      position: { lat: home.latitude, lng: home.longitude },
      title: home.label,
      zIndex: 400,
      icon: {
        url: homeIconUrl(),
        scaledSize: new maps.Size(28, 32),
        anchor: new maps.Point(14, 30),
      },
    });
    const html = homeTip(home);
    marker.addListener("mouseover", () =>
      tip.show({ lat: home.latitude, lng: home.longitude }, html),
    );
    marker.addListener("mouseout", () => tip.hide());
    markers.push(marker);
  }
  return { markers, hideTip: () => { tip.destroy(); pins.destroy(); } };
}

function fitMap(
  map: GoogleMapHandle,
  maps: GoogleMapsApi,
  points: MapPoint[],
  home: WorkMapHome | null,
  selectedId: string | null,
) {
  const focus = selectedId ? points.filter((point) => point.role.id === selectedId) : [];
  const shown = focus.length ? focus : points;
  const positions = [
    ...shown.map((point) => ({ lat: point.latitude, lng: point.longitude })),
    ...(home && !selectedId ? [{ lat: home.latitude, lng: home.longitude }] : []),
  ];
  if (positions.length === 0) return;
  if (positions.length === 1) {
    map.panTo(positions[0]);
    map.setZoom(12);
    return;
  }
  const bounds = new maps.LatLngBounds();
  for (const position of positions) bounds.extend(position);
  map.fitBounds(bounds, 48);
}

function tipHtml(point: MapPoint, coverUrl?: string) {
  const title = point.role.organization && point.role.title ? point.role.title : "";
  return `${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="" />` : ""}
    <strong>${escapeHtml(point.role.organization || point.role.title)}</strong>
    ${title ? `<span>${escapeHtml(title)}</span>` : ""}
    ${point.label ? `<span>${escapeHtml(point.label)}</span>` : ""}`;
}

function homeTip(home: WorkMapHome) {
  return `<strong>${escapeHtml(home.label)}</strong>${
    home.detail ? `<span>${escapeHtml(home.detail)}</span>` : ""
  }`;
}

function mountTip(map: GoogleMapHandle, maps: GoogleMapsApi) {
  const overlay = new maps.OverlayView();
  const node = document.createElement("div");
  node.className = "work-map-tip work-map-google-tip";
  node.hidden = true;
  node.style.pointerEvents = "none";
  let position = { lat: 0, lng: 0 };
  overlay.onAdd = () => {
    const pane = overlay.getPanes()?.floatPane;
    if (!pane) return;
    pane.style.pointerEvents = "none";
    pane.appendChild(node);
  };
  overlay.draw = () => {
    const point = overlay.getProjection()?.fromLatLngToDivPixel(position);
    if (!point) return;
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
  };
  overlay.onRemove = () => node.remove();
  overlay.setMap(map);
  return {
    show(next: { lat: number; lng: number }, html: string) {
      position = next;
      node.innerHTML = html;
      node.hidden = false;
      overlay.draw();
    },
    hide() {
      node.hidden = true;
    },
    destroy() {
      overlay.setMap(null);
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mountRolePins(
  map: GoogleMapHandle,
  maps: GoogleMapsApi,
  points: MapPoint[],
  selectedId: string | null,
  pinTheme: MapPinTheme,
  pinIcons: MapPinIcons,
  onSelect: (id: string) => void,
  tip: { show: (position: { lat: number; lng: number }, html: string) => void; hide: () => void },
) {
  const overlay = new maps.OverlayView();
  const nodes = points.map((point) => {
    const focused = selectedId === point.role.id;
    const secondary = Boolean(selectedId) && !focused;
    const pin = rolePinHtml({
      kind: point.role.kind,
      icon: pinIcon(pinIcons, point.role.kind),
      fill: pinFill(pinTheme, point.role.kind),
      current: point.role.isCurrent,
      focused,
      secondary,
      startDate: point.role.startDate,
      endDate: point.role.endDate,
      ring: pinTheme.ring,
      currentRing: pinTheme.currentRing,
    });
    const node = document.createElement("div");
    node.style.position = "absolute";
    node.style.width = `${pin.size}px`;
    node.style.height = `${pin.size}px`;
    node.style.transform = "translate(-50%, -50%)";
    node.style.zIndex = focused ? "3" : "1";
    node.style.cursor = "pointer";
    node.title = point.role.organization || point.role.title;
    node.innerHTML = pin.html;
    const cover = roleCoverPhoto(point.role.media);
    const html = tipHtml(point, cover?.url);
    node.addEventListener("mouseenter", () =>
      tip.show({ lat: point.latitude, lng: point.longitude }, html),
    );
    node.addEventListener("mouseleave", () => tip.hide());
    node.addEventListener("click", () => onSelect(point.role.id));
    return { node, point };
  });
  overlay.onAdd = () => {
    const pane = overlay.getPanes()?.overlayMouseTarget;
    if (!pane) return;
    for (const item of nodes) pane.appendChild(item.node);
  };
  overlay.draw = () => {
    const projection = overlay.getProjection();
    if (!projection) return;
    for (const item of nodes) {
      const pixel = projection.fromLatLngToDivPixel({
        lat: item.point.latitude,
        lng: item.point.longitude,
      });
      if (!pixel) continue;
      item.node.style.left = `${pixel.x}px`;
      item.node.style.top = `${pixel.y}px`;
    }
  };
  overlay.onRemove = () => {
    for (const item of nodes) item.node.remove();
  };
  overlay.setMap(map);
  return { destroy: () => overlay.setMap(null) };
}

function homeIconUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 32" width="28" height="32"><path d="M14 1.5 2.5 11.2V28h8.2v-8.2h6.6V28H25.5V11.2L14 1.5Z" fill="#c27b2b" stroke="#1a1510" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
