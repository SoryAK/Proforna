/// <reference types="@types/google.maps" />
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { estimateTaxes } from "@/lib/taxes";
import { STATE_TAX_BY_NAME, CITY_TAX_MARKERS, COUNTY_PROP_TAX_MARKERS, REF_HOME_VALUE, getTaxZoneColor, formatTaxRate, getTaxTierLabel, getPropTaxColor, formatPropTaxAnnual } from "@/data/state-tax-zones";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/* ── Shared one-time loader ── */
let optionsSet = false;
function ensureOptions() {
  if (!optionsSet && GOOGLE_KEY) {
    setOptions({ key: GOOGLE_KEY, v: "weekly" });
    optionsSet = true;
  }
}

/* ── Types (same as leaflet version) ── */
interface MapJob {
  id: string;
  title: string;
  company: string;
  location: string;
  area: string[];
  lat: number;
  lng: number;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPredicted: boolean;
  contractTime: string | null;
  contractType: string | null;
  created: string;
  category: string;
  description: string;
  source: "adzuna" | "google" | "email" | "usajobs";
  dutyStations?: { location: string; city: string; state: string; lat: number; lng: number }[];
}

interface AnchorRoute {
  anchorId: string;
  geometry: [number, number][];
  color: string;
  label: string;
}

interface AnchorMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  icon: string;
  color: string;
}

interface WorkHistoryMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string | null;
  type?: string; // "job" | "school" | "military" | "volunteer" | "internship" | "self-employed" | "unemployed"
  startDate?: string | null;
  endDate?: string | null;
}

interface WorkHistorySubLocation {
  id: string;
  parentId: string;
  lat: number;
  lng: number;
  label: string;
  type: string;
  address?: string;
  parentLat: number;
  parentLng: number;
  photos?: string[];
}

interface BuildingFootprint {
  coords: { lat: number; lng: number }[];
  color: string;
  opacity?: number;
}

interface SweetSpotZone {
  center: [number, number];
  radiusMeters: number;
}

interface TransitStep {
  mode: "WALKING" | "TRANSIT";
  durationMin: number;
  distanceMi: number;
  geometry?: [number, number][];
  lineColor?: string;
  lineShort?: string;
  lineName?: string;
  vehicleType?: string;
}

interface AmenityPin {
  category: string;
  lat: number;
  lng: number;
  name: string;
  rating?: number;
  color: string;
  emoji: string;
}

interface Props {
  jobs: MapJob[];
  center: [number, number];
  selectedId: string | null;
  onSelect: (job: MapJob) => void;
  meanSalary: number | null;
  searchCenter: [number, number] | null;
  radiusMiles: number;
  onSearchArea?: (center: [number, number]) => void;
  onViewChange?: (center: [number, number], zoom: number) => void;
  routeGeometry: [number, number][] | null;
  transitSteps?: TransitStep[];
  showHeatmap?: boolean;
  heatmapMode?: "density" | "salary" | "take-home";
  showTraffic?: boolean;
  showTransit?: boolean;
  showTaxZones?: boolean;
  showStateTax?: boolean;
  showCityTax?: boolean;
  showCountyPropTax?: boolean;
  tileStyle?: "osm" | "google-roadmap" | "google-satellite" | "google-hybrid";
  resolvedCoords?: [number, number] | null;
  highlightedIds?: string[];
  anchorRoutes?: AnchorRoute[];
  anchorMarkers?: AnchorMarker[];
  sweetSpot?: SweetSpotZone | null;
  officeLocations?: { address: string; lat: number; lng: number; name: string | null }[];
  onSelectOffice?: (office: { address: string; lat: number; lng: number; name: string | null }) => void;
  enabledAnchorIds?: Set<string>;
  onToggleAnchor?: (anchorId: string) => void;
  dimmedIds?: Set<string>;
  onClusterHover?: (jobs: MapJob[], position: { lat: number; lng: number }) => void;
  onClusterHoverEnd?: () => void;
  isochroneRings?: { minutes: number; coordinates: [number, number][][] }[] | null;
  commuteTimesMap?: Map<string, number> | null;
  amenityPins?: AmenityPin[];
  amenityRadius?: { lat: number; lng: number; radiusM: number } | null;
  zoomTarget?: { lat: number; lng: number; zoom: number } | null;
  amenityCategories?: readonly { key: string; emoji: string; label: string; color: string }[];
  activeAmenities?: Set<string>;
  amenityLoading?: Set<string>;
  onToggleAmenity?: (catKey: string) => void;
  workHistoryMarkers?: WorkHistoryMarker[];
  workHistorySubLocations?: WorkHistorySubLocation[];
  showCareerPath?: boolean;
  focusedWorkHistoryId?: string | null;
  concurrentWorkHistoryIds?: Set<string>;
  onSelectWorkHistory?: (marker: WorkHistoryMarker | WorkHistorySubLocation) => void;
  residenceMarker?: { id: string; lat: number; lng: number; label: string; address: string } | null;
  buildingFootprints?: BuildingFootprint[];
  pinDropMode?: boolean;
  onMapClick?: (coords: { lat: number; lng: number; placeId?: string }) => void;
  companyLocationMarkers?: { placeId: string; name: string; address: string; lat: number; lng: number }[];
  onMapReady?: (map: google.maps.Map) => void;
  onCursorMove?: (coords: { lat: number; lng: number } | null) => void;
}

/* ── Helpers ── */
function salaryColor(min: number | null, max: number | null, mean: number | null): string {
  if (!mean || (!min && !max)) return "#3b82f6";
  const salary = max ?? min ?? 0;
  if (salary >= mean * 1.2) return "#22c55e";
  if (salary >= mean * 0.8) return "#eab308";
  return "#ef4444";
}

/** Commute-time → color: green (short) → yellow → red (long). -1 = unreachable → gray */
function commuteColor(minutes: number, maxMinutes: number): string {
  if (minutes < 0) return "#6b7280"; // unreachable → gray
  const progress = Math.min(minutes / Math.max(maxMinutes, 1), 1);
  const h = 120 - progress * 120; // 120=green → 0=red
  return `hsl(${Math.round(h)}, 75%, 45%)`;
}

function formatSalary(n: number) {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ANCHOR_EMOJI: Record<string, string> = {
  home: "🏠", briefcase: "💼", school: "🎓", baby: "👶", dumbbell: "💪",
  heart: "❤️", "map-pin": "📍", church: "⛪", "shopping-cart": "🛒",
  hospital: "🏥", coffee: "☕", anchor: "⚓",
};

const TILE_STYLE_MAP: Record<string, string> = {
  osm: "roadmap",
  "google-roadmap": "roadmap",
  "google-satellite": "satellite",
  "google-hybrid": "hybrid",
};

/* Custom SVG pin for Advanced Markers */
function makePinSvg(color: string, selected: boolean, highlighted: boolean, dimmed: boolean): string {
  const w = selected ? 30 : highlighted ? 28 : 24;
  const h = selected ? 42 : highlighted ? 40 : 38;
  const strokeColor = selected ? "#000" : highlighted ? "#6366f1" : "#fff";
  const strokeW = selected ? 2 : highlighted ? 2 : 1;
  const opacity = dimmed && !selected ? 0.45 : 1;
  const dashAttr = dimmed && !selected ? ' stroke-dasharray="3 2"' : "";
  const glow = highlighted && !selected
    ? `<circle cx="12" cy="12" r="16" fill="none" stroke="#6366f1" stroke-width="2" opacity="0.5"><animate attributeName="r" from="14" to="20" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/></circle>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 8}" height="${h + 8}" viewBox="-4 -4 32 46" opacity="${opacity}">
    ${glow}
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 26 12 26s12-17 12-26C24 5.4 18.6 0 12 0z"
          fill="${color}" stroke="${strokeColor}" stroke-width="${strokeW}"${dashAttr}/>
    <circle cx="12" cy="12" r="5" fill="#fff" fill-opacity="0.9"/>
  </svg>`;
}

function makeClusterSvg(count: number): string {
  const size = count < 10 ? 36 : count < 50 ? 42 : count < 100 ? 48 : 54;
  const bg = count < 10 ? "#22c55e" : count < 50 ? "#3b82f6" : count < 100 ? "#f59e0b" : "#ef4444";
  const fontSize = count < 100 ? 14 : count < 1000 ? 12 : 11;
  return `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;font-weight:700;font-size:${fontSize}px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${count}</div>`;
}

/* ── Component ── */
export default function JobMapGoogle({
  jobs,
  center,
  selectedId,
  onSelect,
  meanSalary,
  searchCenter,
  radiusMiles,
  onSearchArea,
  onViewChange,
  routeGeometry,
  transitSteps,
  showHeatmap = false,
  heatmapMode = "density",
  showTraffic = false,
  showTransit = false,
  showTaxZones = false,
  showStateTax = true,
  showCityTax = true,
  showCountyPropTax = true,
  tileStyle = "google-roadmap",
  resolvedCoords = null,
  highlightedIds = [],
  anchorRoutes = [],
  anchorMarkers = [],
  sweetSpot = null,
  officeLocations = [],
  onSelectOffice,
  enabledAnchorIds,
  onToggleAnchor,
  dimmedIds,
  onClusterHover,
  onClusterHoverEnd,
  isochroneRings = null,
  commuteTimesMap = null,
  amenityPins = [],
  amenityRadius = null,
  zoomTarget = null,
  amenityCategories = [],
  activeAmenities: activeAmenitiesProp,
  amenityLoading: amenityLoadingProp,
  onToggleAmenity,
  workHistoryMarkers = [],
  workHistorySubLocations = [],
  showCareerPath = false,
  focusedWorkHistoryId = null,
  concurrentWorkHistoryIds,
  onSelectWorkHistory,
  residenceMarker = null,
  buildingFootprints = [],
  pinDropMode = false,
  onMapClick,
  companyLocationMarkers = [],
  onMapReady,
  onCursorMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const jobMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const anchorMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const workHistoryMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const whClustererRef = useRef<MarkerClusterer | null>(null);
  const whMarkerElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const concurrentLinesRef = useRef<google.maps.Polyline[]>([]);
  const workHistoryPathRef = useRef<google.maps.Polyline[]>([]);
  const careerYearLabelsRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const residenceMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const subLocationMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const subLocationLinesRef = useRef<google.maps.Polyline[]>([]);
  const buildingPolygonsRef = useRef<google.maps.Polygon[]>([]);
  const officeMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const sweetSpotMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const youAreHereMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const searchRadiusRef = useRef<google.maps.Circle | null>(null);
  const sweetSpotCircleRef = useRef<google.maps.Circle | null>(null);
  const officeCircleRef = useRef<google.maps.Circle | null>(null);
  const amenityMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const companyLocMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const amenityCircleRef = useRef<google.maps.Circle | null>(null);
  const isochronePolysRef = useRef<google.maps.Polygon[]>([]);
  const jobLookupRef = useRef<Map<google.maps.marker.AdvancedMarkerElement, MapJob>>(new Map());
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const transitLayerRef = useRef<google.maps.TransitLayer | null>(null);
  const taxZoneFeaturesRef = useRef<google.maps.Data.Feature[]>([]);
  const taxZoneListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const taxZoneLabelsRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const taxZoneCityMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const taxZoneCountyMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const taxZoneGeoJsonRef = useRef<object | null>(null);
  const taxZoneZoomListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);
  const fitDoneRef = useRef(false);
  const prevJobsKeyRef = useRef("");
  const prevSelectedIdRef = useRef<string | null>(null);
  const prevRouteKeyRef = useRef("");

  // Pan detection
  const [hasPanned, setHasPanned] = useState(false);
  const [panCenter, setPanCenter] = useState<[number, number] | null>(null);
  const userDragRef = useRef(false);

  // Map ready
  const [ready, setReady] = useState(false);

  // Store callbacks in refs so they're fresh in event handlers
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSearchAreaRef = useRef(onSearchArea);
  onSearchAreaRef.current = onSearchArea;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const onSelectOfficeRef = useRef(onSelectOffice);
  const onClusterHoverRef = useRef(onClusterHover);
  onClusterHoverRef.current = onClusterHover;
  const onClusterHoverEndRef = useRef(onClusterHoverEnd);
  onClusterHoverEndRef.current = onClusterHoverEnd;
  onSelectOfficeRef.current = onSelectOffice;
  const onToggleAnchorRef = useRef(onToggleAnchor);
  onToggleAnchorRef.current = onToggleAnchor;
  const onToggleAmenityRef = useRef(onToggleAmenity);
  onToggleAmenityRef.current = onToggleAmenity;
  const onSelectWorkHistoryRef = useRef(onSelectWorkHistory);
  onSelectWorkHistoryRef.current = onSelectWorkHistory;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;
  const pinDropModeRef = useRef(pinDropMode);
  pinDropModeRef.current = pinDropMode;
  const amenityCatsRef = useRef(amenityCategories);
  amenityCatsRef.current = amenityCategories;
  const activeAmenitiesRef = useRef(activeAmenitiesProp);
  activeAmenitiesRef.current = activeAmenitiesProp;
  const amenityLoadingRef = useRef(amenityLoadingProp);
  amenityLoadingRef.current = amenityLoadingProp;

  /* ── Initialize map ── */
  useEffect(() => {
    if (!containerRef.current) return;
    ensureOptions();

    let cancelled = false;

    (async () => {
      const { Map } = await importLibrary("maps") as google.maps.MapsLibrary;
      await importLibrary("marker"); // loads AdvancedMarkerElement

      if (cancelled || !containerRef.current) return;

      const map = new Map(containerRef.current, {
        center: { lat: center[0], lng: center[1] },
        zoom: 10,
        mapId: "resumsify-job-map",
        disableDefaultUI: true,
        gestureHandling: "greedy",
        mapTypeId: TILE_STYLE_MAP[tileStyle] || "roadmap",
      });

      mapRef.current = map;
      infoRef.current = new google.maps.InfoWindow();

      // Drag detection
      map.addListener("dragstart", () => { userDragRef.current = true; });
      map.addListener("idle", () => {
        const c = map.getCenter();
        if (!c) return;
        const newCenter: [number, number] = [c.lat(), c.lng()];
        setPanCenter(newCenter);
        onViewChangeRef.current?.(newCenter, map.getZoom() ?? 10);
        if (userDragRef.current && searchCenter) {
          const dist = haversine(searchCenter, newCenter);
          setHasPanned(dist > 25);
          userDragRef.current = false;
        }
      });

      // Pin-drop / claim mode: click on map → fire onMapClick (with placeId if a POI was clicked)
      map.addListener("click", (e: google.maps.MapMouseEvent & { placeId?: string }) => {
        if (!pinDropModeRef.current || !e.latLng) return;
        onMapClickRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng(), placeId: e.placeId ?? undefined });
        // Prevent default info window for POI clicks
        if (e.placeId) (e as any).stop?.();
      });

      // Cursor coordinate tracking for dev overlay
      map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) onCursorMoveRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
      map.addListener("mouseout", () => { onCursorMoveRef.current?.(null); });

      setReady(true);
      onMapReady?.(map);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Map type switching ── */
  useEffect(() => {
    if (!mapRef.current) return;
    const typeId = TILE_STYLE_MAP[tileStyle] || "roadmap";
    mapRef.current.setMapTypeId(typeId);
  }, [tileStyle]);

  /* ── Traffic layer ── */
  useEffect(() => {
    if (!mapRef.current) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(mapRef.current);
    } else {
      trafficLayerRef.current?.setMap(null);
    }
  }, [showTraffic, ready]);

  /* ── Transit layer ── */
  useEffect(() => {
    if (!mapRef.current) return;
    if (showTransit) {
      if (!transitLayerRef.current) {
        transitLayerRef.current = new google.maps.TransitLayer();
      }
      transitLayerRef.current.setMap(mapRef.current);
    } else {
      transitLayerRef.current?.setMap(null);
    }
  }, [showTransit, ready]);

  /* ── Tax zone overlay ── */
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const info = infoRef.current;
    let cancelled = false;

    if (showTaxZones) {
      (async () => {
        // Fetch real state boundary GeoJSON (cached after first load)
        if (!taxZoneGeoJsonRef.current) {
          try {
            const res = await fetch("/data/us-states.json");
            if (!res.ok) throw new Error("Failed to load state boundaries");
            taxZoneGeoJsonRef.current = await res.json();
          } catch {
            console.warn("Tax zones: could not load state boundary data");
            return;
          }
        }
        if (cancelled || !mapRef.current) return;

        // Inject tax rate data into each feature's properties
        const geoJson = taxZoneGeoJsonRef.current as {
          type: string;
          features: { type: string; properties: Record<string, unknown>; geometry: unknown }[];
        };
        const enriched = {
          ...geoJson,
          features: geoJson.features
            .filter((f) => STATE_TAX_BY_NAME[f.properties.name as string])
            .map((f) => {
              const info = STATE_TAX_BY_NAME[f.properties.name as string];
              return {
                ...f,
                properties: { ...f.properties, abbr: info.abbr, rate: info.rate, propTaxRate: info.propTaxRate },
              };
            }),
        };

        const added = map.data.addGeoJson(enriched);
        taxZoneFeaturesRef.current = added;

        // Style each state by tax rate
        if (showStateTax) {
          map.data.setStyle((feature) => {
            const rate = (feature.getProperty("rate") as number) ?? 0;
            const color = getTaxZoneColor(rate);
            return {
              fillColor: color,
              fillOpacity: 0.22,
              strokeColor: color,
              strokeWeight: 1.5,
              strokeOpacity: 0.6,
            };
          });
        } else {
          map.data.setStyle({ visible: false });
        }

        // Click state → show tax details in InfoWindow
        taxZoneListenerRef.current = map.data.addListener(
          "click",
          (e: google.maps.Data.MouseEvent) => {
            if (!infoRef.current) return;
            const abbr = e.feature.getProperty("abbr") as string;
            const name = e.feature.getProperty("name") as string;
            const rate = (e.feature.getProperty("rate") as number) ?? 0;
            const propRate = (e.feature.getProperty("propTaxRate") as number) ?? 0;
            const tier = getTaxTierLabel(rate);
            const pct = formatTaxRate(rate);
            const color = getTaxZoneColor(rate);
            const propColor = getPropTaxColor(propRate);
            const propAnnual = formatPropTaxAnnual(propRate);

            // Find any local taxes in this state
            const localCities = CITY_TAX_MARKERS.filter((c) => c.state === abbr);
            const localHtml = localCities.length > 0
              ? `<div style="margin-top:6px;padding-top:5px;border-top:1px solid #e5e7eb">` +
                `<div style="font-size:11px;font-weight:600;margin-bottom:3px;color:#7c3aed">Local/City Taxes:</div>` +
                localCities.map((c) =>
                  `<div style="font-size:12px;color:#555;padding:1px 0">` +
                    `${c.city}: ${c.taxes.map((t) => `${t.name} ${(t.rate * 100).toFixed(1)}%`).join(", ")}` +
                  `</div>`
                ).join("") +
                `</div>`
              : "";

            infoRef.current.setContent(
              `<div style="font-family:system-ui,sans-serif;min-width:200px;padding:2px">` +
                `<div style="font-weight:700;font-size:14px;margin-bottom:4px">${name} (${abbr})</div>` +
                `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">` +
                  `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${color}"></span>` +
                  `<span style="font-size:13px">${tier}</span>` +
                `</div>` +
                `<div style="font-size:13px;color:#555">State Income Tax: <strong>${pct}</strong></div>` +
                (rate === 0
                  ? `<div style="font-size:12px;color:#16a34a;margin-top:4px">No state income tax \u2014 100% of salary kept at state level</div>`
                  : `<div style="font-size:12px;color:#666;margin-top:4px">Effective rate at ~$80k income (single filer)</div>`) +
                `<div style="margin-top:6px;padding-top:5px;border-top:1px solid #e5e7eb">` +
                  `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">` +
                    `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${propColor}"></span>` +
                    `<span style="font-size:12px;font-weight:600">\ud83c\udfe0 Property Tax</span>` +
                  `</div>` +
                  `<div style="font-size:13px;color:#555">Median Rate: <strong>${(propRate * 100).toFixed(2)}%</strong></div>` +
                  `<div style="font-size:12px;color:#666">~${propAnnual} on $${(REF_HOME_VALUE / 1000).toFixed(0)}k home</div>` +
                `</div>` +
                localHtml +
              `</div>`
            );
            infoRef.current.setPosition(e.latLng!);
            infoRef.current.open(map);
          }
        );

        // State abbreviation labels at centroids (only at low–mid zoom)
        await importLibrary("marker");
        if (cancelled || !mapRef.current) return;

        const buildStateLabels = () => {
          // Remove old labels
          for (const m of taxZoneLabelsRef.current) m.map = null;
          taxZoneLabelsRef.current = [];

          const zoom = mapRef.current?.getZoom() ?? 5;
          if (zoom > 8 || !showStateTax) return; // hide state labels at high zoom or if toggled off

          for (const feat of taxZoneFeaturesRef.current) {
            const abbr = feat.getProperty("abbr") as string;
            const rate = (feat.getProperty("rate") as number) ?? 0;
            const color = getTaxZoneColor(rate);
            const pct = formatTaxRate(rate);

            // Calculate centroid from geometry bounds
            let lat = 0, lng = 0;
            const geom = feat.getGeometry();
            if (geom) {
              const arr: google.maps.LatLng[] = [];
              geom.forEachLatLng((ll) => arr.push(ll));
              if (arr.length > 0) {
                lat = arr.reduce((s, l) => s + l.lat(), 0) / arr.length;
                lng = arr.reduce((s, l) => s + l.lng(), 0) / arr.length;
              }
            }
            if (lat === 0 && lng === 0) continue;

            const el = document.createElement("div");
            el.style.cssText = `
              font-family:system-ui,sans-serif;font-size:${zoom < 6 ? 10 : 11}px;font-weight:700;
              background:${color};color:#fff;padding:2px 5px;border-radius:4px;
              border:1px solid rgba(255,255,255,0.8);
              text-shadow:0 1px 2px rgba(0,0,0,0.4);white-space:nowrap;
              pointer-events:none;line-height:1.2;
            `;
            el.textContent = `${abbr} ${pct}`;

            const marker = new google.maps.marker.AdvancedMarkerElement({
              map: mapRef.current!,
              position: { lat, lng },
              content: el,
              zIndex: 900,
            });
            taxZoneLabelsRef.current.push(marker);
          }
        };

        // Build city tax markers (only visible at zoom >= 7)
        const buildCityMarkers = () => {
          for (const m of taxZoneCityMarkersRef.current) m.map = null;
          taxZoneCityMarkersRef.current = [];

          const zoom = mapRef.current?.getZoom() ?? 5;
          if (zoom < 7 || !showCityTax) return; // hide city markers at country-level zoom or if toggled off

          for (const city of CITY_TAX_MARKERS) {
            const totalRate = city.taxes.reduce((s, t) => s + t.rate, 0);
            const label = `${city.city}: +${(totalRate * 100).toFixed(1)}%`;

            const el = document.createElement("div");
            el.style.cssText = `
              font-family:system-ui,sans-serif;font-size:10px;font-weight:600;
              background:#7c3aed;color:#fff;padding:2px 6px;border-radius:10px;
              border:1.5px solid rgba(255,255,255,0.9);
              text-shadow:0 1px 1px rgba(0,0,0,0.3);white-space:nowrap;
              cursor:pointer;line-height:1.3;
            `;
            el.textContent = label;

            // Click → show city tax detail
            el.addEventListener("click", () => {
              if (!infoRef.current || !mapRef.current) return;
              const taxLines = city.taxes.map((t) =>
                `<div style="font-size:12px;padding:1px 0">${t.name}: <strong>${(t.rate * 100).toFixed(2)}%</strong></div>`
              ).join("");
              infoRef.current.setContent(
                `<div style="font-family:system-ui,sans-serif;min-width:160px;padding:2px">` +
                  `<div style="font-weight:700;font-size:14px;margin-bottom:2px;color:#7c3aed">${city.city}, ${city.state}</div>` +
                  `<div style="font-size:12px;color:#666;margin-bottom:4px">Local Tax Zone</div>` +
                  taxLines +
                  `<div style="font-size:11px;color:#888;margin-top:4px;border-top:1px solid #e5e7eb;padding-top:4px">` +
                    `These taxes are <em>in addition</em> to state & federal taxes` +
                  `</div>` +
                `</div>`
              );
              infoRef.current.setPosition({ lat: city.lat, lng: city.lng });
              infoRef.current.open(mapRef.current);
            });

            const marker = new google.maps.marker.AdvancedMarkerElement({
              map: mapRef.current!,
              position: { lat: city.lat, lng: city.lng },
              content: el,
              zIndex: 950,
            });
            taxZoneCityMarkersRef.current.push(marker);
          }
        };

        // Build county property tax markers (only visible at zoom >= 9)
        const buildCountyMarkers = () => {
          for (const m of taxZoneCountyMarkersRef.current) m.map = null;
          taxZoneCountyMarkersRef.current = [];

          const zoom = mapRef.current?.getZoom() ?? 5;
          if (zoom < 9 || !showCountyPropTax) return;

          for (const cty of COUNTY_PROP_TAX_MARKERS) {
            const propColor = getPropTaxColor(cty.rate);
            const pctStr = `${(cty.rate * 100).toFixed(2)}%`;
            const annual = Math.round(cty.rate * cty.medianHome);

            const el = document.createElement("div");
            el.style.cssText = `
              font-family:system-ui,sans-serif;font-size:10px;font-weight:600;
              background:#0ea5e9;color:#fff;padding:2px 6px;border-radius:10px;
              border:1.5px solid rgba(255,255,255,0.9);
              text-shadow:0 1px 1px rgba(0,0,0,0.3);white-space:nowrap;
              cursor:pointer;line-height:1.3;
            `;
            el.textContent = `\ud83c\udfe0 ${cty.county}: ${pctStr}`;

            el.addEventListener("click", () => {
              if (!infoRef.current || !mapRef.current) return;
              infoRef.current.setContent(
                `<div style="font-family:system-ui,sans-serif;min-width:180px;padding:2px">` +
                  `<div style="font-weight:700;font-size:14px;margin-bottom:2px;color:#0ea5e9">${cty.county}, ${cty.state}</div>` +
                  `<div style="font-size:12px;color:#666;margin-bottom:4px">County Property Tax</div>` +
                  `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">` +
                    `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${propColor}"></span>` +
                    `<span style="font-size:13px">Effective Rate: <strong>${pctStr}</strong></span>` +
                  `</div>` +
                  `<div style="font-size:12px;color:#555">Median Home: $${cty.medianHome.toLocaleString()}</div>` +
                  `<div style="font-size:12px;color:#555">Est. Annual: <strong>$${annual.toLocaleString()}/yr</strong></div>` +
                  `<div style="font-size:11px;color:#888;margin-top:4px;border-top:1px solid #e5e7eb;padding-top:4px">` +
                    `Based on county median effective rate` +
                  `</div>` +
                `</div>`
              );
              infoRef.current.setPosition({ lat: cty.lat, lng: cty.lng });
              infoRef.current.open(mapRef.current);
            });

            const marker = new google.maps.marker.AdvancedMarkerElement({
              map: mapRef.current!,
              position: { lat: cty.lat, lng: cty.lng },
              content: el,
              zIndex: 940,
            });
            taxZoneCountyMarkersRef.current.push(marker);
          }
        };

        // Initial build
        buildStateLabels();
        buildCityMarkers();
        buildCountyMarkers();

        // Rebuild on zoom change (show/hide labels + cities + counties based on zoom)
        taxZoneZoomListenerRef.current = map.addListener("zoom_changed", () => {
          buildStateLabels();
          buildCityMarkers();
          buildCountyMarkers();
        });
      })();
    } else {
      cancelled = true;
      // Close any open tax info popup
      info?.close();

      // Remove state polygon features
      for (const f of taxZoneFeaturesRef.current) {
        try { map.data.remove(f); } catch { /* already removed */ }
      }
      taxZoneFeaturesRef.current = [];

      // Remove click listener
      taxZoneListenerRef.current?.remove();
      taxZoneListenerRef.current = null;

      // Remove zoom listener
      taxZoneZoomListenerRef.current?.remove();
      taxZoneZoomListenerRef.current = null;

      // Remove state labels
      for (const m of taxZoneLabelsRef.current) m.map = null;
      taxZoneLabelsRef.current = [];

      // Remove city markers
      for (const m of taxZoneCityMarkersRef.current) m.map = null;
      taxZoneCityMarkersRef.current = [];

      // Remove county property tax markers
      for (const m of taxZoneCountyMarkersRef.current) m.map = null;
      taxZoneCountyMarkersRef.current = [];

      // Reset data layer style
      map.data.setStyle({});
    }
  }, [showTaxZones, showStateTax, showCityTax, showCountyPropTax, ready]);

  /* ── Heatmap layer ── */
  useEffect(() => {
    if (!mapRef.current) return;
    if (showHeatmap && jobs.length > 0) {
      (async () => {
        await importLibrary("visualization");
        if (!mapRef.current) return;
        heatmapRef.current?.setMap(null);

        let data: google.maps.visualization.WeightedLocation[] | google.maps.LatLng[];
        let gradient: string[];

        if (heatmapMode === "salary" && meanSalary && meanSalary > 0) {
          // Salary mode: weight each point by salary relative to mean
          data = jobs.map((j) => {
            const sal = j.salaryMax ?? j.salaryMin ?? 0;
            const weight = sal > 0 ? Math.min(sal / (meanSalary * 2), 1) : 0.05;
            return { location: new google.maps.LatLng(j.lat, j.lng), weight };
          });
          gradient = [
            "rgba(0,0,0,0)",
            "rgba(239,68,68,0.6)",   // red — low salary
            "rgba(249,115,22,0.7)",  // orange
            "rgba(234,179,8,0.8)",   // yellow — average
            "rgba(132,204,22,0.9)",  // lime
            "rgba(34,197,94,1)",     // green — high salary
          ];
        } else if (heatmapMode === "take-home" && meanSalary && meanSalary > 0) {
          // Take-home mode: weight by estimated net pay after taxes
          const meanTakeHome = estimateTaxes(meanSalary, "US").takeHomePay;
          data = jobs.map((j) => {
            const sal = j.salaryMax ?? j.salaryMin ?? 0;
            if (sal <= 0) return { location: new google.maps.LatLng(j.lat, j.lng), weight: 0.05 };
            const net = estimateTaxes(sal, j.location).takeHomePay;
            const weight = Math.min(net / (meanTakeHome * 2), 1);
            return { location: new google.maps.LatLng(j.lat, j.lng), weight };
          });
          gradient = [
            "rgba(0,0,0,0)",
            "rgba(239,68,68,0.6)",   // red — low take-home
            "rgba(234,88,12,0.65)",  // dark orange
            "rgba(234,179,8,0.75)",  // yellow
            "rgba(16,185,129,0.85)", // teal
            "rgba(6,95,70,1)",       // dark green — high take-home
          ];
        } else {
          // Density mode (default): uniform weight
          data = jobs.map((j) => new google.maps.LatLng(j.lat, j.lng));
          gradient = [
            "rgba(0,0,0,0)",
            "rgba(59,130,246,0.6)",
            "rgba(6,182,212,0.7)",
            "rgba(34,197,94,0.8)",
            "rgba(234,179,8,0.9)",
            "rgba(239,68,68,1)",
          ];
        }

        heatmapRef.current = new google.maps.visualization.HeatmapLayer({
          data,
          map: mapRef.current,
          radius: 30,
          opacity: 0.6,
          gradient,
        });
      })();
    } else {
      heatmapRef.current?.setMap(null);
      heatmapRef.current = null;
    }
  }, [showHeatmap, heatmapMode, meanSalary, jobs, ready]);

  const jobsKey = useMemo(() => jobs.map((j) => j.id).join(","), [jobs]);

  /* ── Fit bounds when jobs change (stable key prevents spurious re-fits) ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || jobs.length === 0) return;
    if (jobsKey === prevJobsKeyRef.current) return;
    prevJobsKeyRef.current = jobsKey;

    const bounds = new google.maps.LatLngBounds();
    jobs.forEach((j) => bounds.extend({ lat: j.lat, lng: j.lng }));
    map.fitBounds(bounds, 40);
  }, [jobsKey, jobs, ready]);

  /* ── Pan to selected job (once per selection) ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId || selectedId === prevSelectedIdRef.current) return;
    prevSelectedIdRef.current = selectedId;

    const job = jobs.find((j) => j.id === selectedId);
    if (!job) return;

    const pos = resolvedCoords
      ? { lat: resolvedCoords[0], lng: resolvedCoords[1] }
      : { lat: job.lat, lng: job.lng };

    const currentZoom = map.getZoom() ?? 10;
    map.panTo(pos);
    if (currentZoom < 12) map.setZoom(12);
  }, [selectedId, jobs, resolvedCoords, ready]);

  /* Clear selection ref when deselected so re-selecting the same job works */
  useEffect(() => {
    if (!selectedId) prevSelectedIdRef.current = null;
  }, [selectedId]);

  /* ── Route polylines ── */
  useEffect(() => {
    // Clear previous
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    if (!mapRef.current) return;

    const map = mapRef.current;
    const lines: google.maps.Polyline[] = [];

    // Build a key for the primary route so we only fitBounds when geometry actually changes
    const routeKey = transitSteps
      ? `t:${transitSteps.map((s) => s.geometry?.length ?? 0).join(",")}`
      : routeGeometry
      ? `r:${routeGeometry.length}`
      : "";
    const routeChanged = routeKey !== prevRouteKeyRef.current && routeKey !== "";
    prevRouteKeyRef.current = routeKey;

    // Transit steps
    if (transitSteps && transitSteps.some((s) => s.geometry?.length)) {
      transitSteps.forEach((step) => {
        if (!step.geometry || step.geometry.length < 2) return;
        const line = new google.maps.Polyline({
          path: step.geometry.map(([lat, lng]) => ({ lat, lng })),
          strokeColor: step.mode === "WALKING" ? "#9ca3af" : (step.lineColor || "#6366f1"),
          strokeWeight: step.mode === "WALKING" ? 3 : 5,
          strokeOpacity: 0.85,
          map,
        });
        if (step.mode === "WALKING") {
          line.setOptions({
            strokeOpacity: 0,
            icons: [{
              icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85, strokeWeight: 3, scale: 3, strokeColor: "#9ca3af" },
              offset: "0",
              repeat: "12px",
            }],
          });
        }
        lines.push(line);
      });

      // Only fit to transit route when geometry actually changed
      if (routeChanged) {
        const bounds = new google.maps.LatLngBounds();
        transitSteps.forEach((s) => s.geometry?.forEach(([lat, lng]) => bounds.extend({ lat, lng })));
        map.fitBounds(bounds, 60);
      }
    } else if (routeGeometry && routeGeometry.length > 1) {
      const line = new google.maps.Polyline({
        path: routeGeometry.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: "#6366f1",
        strokeWeight: 5,
        strokeOpacity: 0.8,
        map,
      });
      lines.push(line);

      // Only fit to driving route when geometry actually changed
      if (routeChanged) {
        const bounds = new google.maps.LatLngBounds();
        routeGeometry.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
        map.fitBounds(bounds, 60);
      }
    }

    // Anchor routes
    anchorRoutes.forEach((route) => {
      const line = new google.maps.Polyline({
        path: route.geometry.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: route.color,
        strokeWeight: 4,
        strokeOpacity: 0.7,
        map,
        icons: [{
          icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, strokeWeight: 4, scale: 3, strokeColor: route.color },
          offset: "0",
          repeat: "14px",
        }],
      });
      line.setOptions({ strokeOpacity: 0 }); // use dashes only
      lines.push(line);
    });

    polylinesRef.current = lines;
  }, [routeGeometry, transitSteps, anchorRoutes, ready]);

  /* ── Search radius circle ── */
  useEffect(() => {
    searchRadiusRef.current?.setMap(null);
    if (!mapRef.current || !searchCenter) return;
    searchRadiusRef.current = new google.maps.Circle({
      center: { lat: searchCenter[0], lng: searchCenter[1] },
      radius: radiusMiles * 1609.34,
      strokeColor: "#3b82f6",
      strokeWeight: 1.5,
      strokeOpacity: 0.6,
      fillColor: "#3b82f6",
      fillOpacity: 0.05,
      map: mapRef.current,
    });
  }, [searchCenter, radiusMiles, ready]);

  /* ── Isochrone rings (donut polygons — no overlap) ── */
  useEffect(() => {
    // Clear old polygons
    for (const p of isochronePolysRef.current) p.setMap(null);
    isochronePolysRef.current = [];
    if (!mapRef.current || !isochroneRings || isochroneRings.length === 0) return;

    // Sort smallest → largest (innermost first)
    const sorted = [...isochroneRings].sort((a, b) => a.minutes - b.minutes);
    const count = sorted.length;

    sorted.forEach((ring, i) => {
      // Outer boundary of this band
      const outerPaths = ring.coordinates.map((coordRing) =>
        coordRing.map(([lng, lat]) => ({ lat, lng }))
      );

      // For donut: first path = outer boundary, second path = inner hole (reversed winding)
      // Innermost band (i=0) has no hole — it's a solid polygon
      let paths: google.maps.LatLngLiteral[][];
      if (i === 0) {
        paths = outerPaths;
      } else {
        // The inner hole is the outer boundary of the previous (smaller) ring
        const innerCoords = sorted[i - 1].coordinates[0]; // outer boundary of smaller ring
        const holePath = innerCoords.map(([lng, lat]) => ({ lat, lng })).reverse(); // reverse winding = hole
        paths = [outerPaths[0], holePath];
      }

      // Color: innermost (i=0) = green, outermost = red
      const progress = count === 1 ? 0 : i / (count - 1); // 0=innermost, 1=outermost
      const h = 120 - progress * 120; // 120=green → 0=red
      const color = `hsl(${h}, 75%, 45%)`;

      const poly = new google.maps.Polygon({
        paths,
        strokeColor: color,
        strokeWeight: 1,
        strokeOpacity: 0.5,
        fillColor: color,
        fillOpacity: 0.18, // uniform opacity — no stacking so this can be higher
        map: mapRef.current,
        zIndex: 5 + i,
      });
      isochronePolysRef.current.push(poly);
    });
  }, [isochroneRings, ready]);

  /* ── Sweet Spot circle + marker ── */
  useEffect(() => {
    sweetSpotCircleRef.current?.setMap(null);
    sweetSpotMarkerRef.current && (sweetSpotMarkerRef.current.map = null);
    if (!mapRef.current || !sweetSpot) return;

    sweetSpotCircleRef.current = new google.maps.Circle({
      center: { lat: sweetSpot.center[0], lng: sweetSpot.center[1] },
      radius: sweetSpot.radiusMeters,
      strokeColor: "#8b5cf6",
      strokeWeight: 2,
      strokeOpacity: 0.7,
      fillColor: "#8b5cf6",
      fillOpacity: 0.10,
      map: mapRef.current,
    });

    const el = document.createElement("div");
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#8b5cf6;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:12px;cursor:default;" title="Sweet Spot">⭐</div>`;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      position: { lat: sweetSpot.center[0], lng: sweetSpot.center[1] },
      map: mapRef.current,
      content: el,
      zIndex: 100,
    });
    sweetSpotMarkerRef.current = marker;
  }, [sweetSpot, ready]);

  /* ── "You Are Here" marker ── */
  useEffect(() => {
    youAreHereMarkerRef.current && (youAreHereMarkerRef.current.map = null);
    if (!mapRef.current || !searchCenter) return;

    const el = document.createElement("div");
    el.innerHTML = `<div style="position:relative;width:20px;height:20px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:gmPulse 2s infinite;"></div>
      <div style="position:absolute;top:4px;left:4px;width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid #fff;"></div>
    </div>`;
    const marker = new google.maps.marker.AdvancedMarkerElement({
      position: { lat: searchCenter[0], lng: searchCenter[1] },
      map: mapRef.current,
      content: el,
      zIndex: 50,
    });
    youAreHereMarkerRef.current = marker;
  }, [searchCenter, ready]);

  /* ── Job markers with clustering ── */
  const highlightedKey = useMemo(() => highlightedIds.join(","), [highlightedIds]);
  const dimmedKey = useMemo(() => (dimmedIds ? [...dimmedIds].sort().join(",") : ""), [dimmedIds]);
  const commuteTimesKey = useMemo(() => commuteTimesMap ? commuteTimesMap.size.toString() : "", [commuteTimesMap]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear old
    clustererRef.current?.clearMarkers();
    jobMarkersRef.current.forEach((m) => (m.map = null));
    jobMarkersRef.current = [];

    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    const jobLookup = new Map<google.maps.marker.AdvancedMarkerElement, MapJob>();

    // Detect colocated markers (same lat/lng) and apply spiral offset so they fan out at high zoom
    const posCount = new Map<string, number>();
    jobs.forEach((job) => {
      const isSelected = job.id === selectedId;
      const lat = isSelected && resolvedCoords ? resolvedCoords[0] : job.lat;
      const lng = isSelected && resolvedCoords ? resolvedCoords[1] : job.lng;
      const key = `${lat},${lng}`;
      posCount.set(key, (posCount.get(key) ?? 0) + 1);
    });
    const posIndex = new Map<string, number>();

    // Max commute time for color scale (from matrix data)
    const maxCommuteMin = commuteTimesMap
      ? Math.max(60, ...Array.from(commuteTimesMap.values()).filter((v) => v > 0))
      : 60;

    jobs.forEach((job) => {
      // Use commute-time coloring when matrix data available, else salary
      const commuteMin = commuteTimesMap?.get(job.id);
      const color = commuteMin != null
        ? commuteColor(commuteMin, maxCommuteMin)
        : salaryColor(job.salaryMin, job.salaryMax, meanSalary);
      const isSelected = job.id === selectedId;
      const isHighlighted = highlightedIds.includes(job.id);
      const isDimmed = dimmedIds ? dimmedIds.has(job.id) : false;
      const baseLat = isSelected && resolvedCoords ? resolvedCoords[0] : job.lat;
      const baseLng = isSelected && resolvedCoords ? resolvedCoords[1] : job.lng;
      const key = `${baseLat},${baseLng}`;
      const count = posCount.get(key) ?? 1;
      const idx = posIndex.get(key) ?? 0;
      posIndex.set(key, idx + 1);

      let pos: { lat: number; lng: number };
      if (count > 1 && idx > 0) {
        // Spiral offset: ~30m per step at Philadelphia's latitude
        const angle = (idx * 2.39996323) ; // golden angle in radians for even spread
        const r = 0.00025 * Math.sqrt(idx);  // ~25m base radius, grows with sqrt
        pos = { lat: baseLat + r * Math.cos(angle), lng: baseLng + r * Math.sin(angle) };
      } else {
        pos = { lat: baseLat, lng: baseLng };
      }

      const el = document.createElement("div");
      el.style.position = "relative";
      el.style.cursor = "pointer";

      // Pin SVG
      const pinWrapper = document.createElement("div");
      pinWrapper.innerHTML = makePinSvg(color, isSelected, isHighlighted, isDimmed);
      el.appendChild(pinWrapper);

      // Amenity radial ring — only on selected pin
      if (isSelected && amenityCatsRef.current.length > 0) {
        const ring = document.createElement("div");
        ring.className = "amenity-ring";
        Object.assign(ring.style, {
          position: "absolute",
          top: "50%", left: "50%",
          width: "0px", height: "0px",
          opacity: "0",
          transition: "opacity 0.2s ease",
          pointerEvents: "none",
          zIndex: "10",
        });

        const RING_RADIUS = 38;
        const cats = amenityCatsRef.current;
        const angleStep = (2 * Math.PI) / cats.length;

        cats.forEach((cat, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const x = Math.cos(angle) * RING_RADIUS;
          const y = Math.sin(angle) * RING_RADIUS;
          const btn = document.createElement("button");
          const isActive = activeAmenitiesRef.current?.has(cat.key) ?? false;
          const isLoading = amenityLoadingRef.current?.has(cat.key) ?? false;
          Object.assign(btn.style, {
            position: "absolute",
            left: `${x - 15}px`, top: `${y - 15}px`,
            width: "30px", height: "30px", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "15px", cursor: "pointer", pointerEvents: "auto",
            border: isActive ? "2px solid #fff" : "2px solid rgba(255,255,255,0.6)",
            background: isActive ? cat.color : "rgba(30,30,30,0.85)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
            transition: "transform 0.15s ease",
            transform: "scale(0)",
          });
          btn.title = cat.label;
          btn.textContent = isLoading ? "⏳" : cat.emoji;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            onToggleAmenityRef.current?.(cat.key);
          });
          ring.appendChild(btn);
        });

        el.appendChild(ring);

        // Hover: show/hide ring
        el.addEventListener("mouseenter", () => {
          ring.style.opacity = "1";
          ring.style.pointerEvents = "auto";
          const btns = ring.querySelectorAll("button");
          btns.forEach((b, i) => {
            setTimeout(() => { (b as HTMLElement).style.transform = "scale(1)"; }, i * 40);
          });
        });
        el.addEventListener("mouseleave", () => {
          ring.style.opacity = "0";
          ring.style.pointerEvents = "none";
          const btns = ring.querySelectorAll("button");
          btns.forEach((b) => { (b as HTMLElement).style.transform = "scale(0)"; });
        });
      }

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: pos,
        content: el,
        zIndex: isSelected ? 1000 : isHighlighted ? 500 : isDimmed ? -100 : 0,
      });

      jobLookup.set(marker, job);

      // Build InfoWindow content once for this marker
      const salaryStr = (job.salaryMin || job.salaryMax)
        ? `<div style="color:#059669;font-weight:500">${job.salaryMin ? formatSalary(job.salaryMin) : ""}${job.salaryMin && job.salaryMax ? " – " : ""}${job.salaryMax ? formatSalary(job.salaryMax) : ""}</div>`
        : "";
      const commuteStr = commuteMin != null && commuteMin >= 0
        ? `<div style="color:#6366f1;font-weight:500">🚗 ${commuteMin} min commute</div>`
        : commuteMin === -1
        ? `<div style="color:#9ca3af;font-weight:500">🚗 Unreachable</div>`
        : "";
      const infoContent = `<div style="font-size:11px;max-width:200px;line-height:1.4;padding:2px 0">
        <div style="font-weight:700;font-size:12px;color:#111">${escapeHtml(job.title)}</div>
        <div style="color:#6b7280;margin-top:1px">${escapeHtml(job.company)}</div>
        ${salaryStr}${commuteStr}
      </div>`;

      // Hover → show InfoWindow on any pin
      el.addEventListener("mouseenter", () => {
        const info = infoRef.current;
        if (info && mapRef.current) {
          info.setContent(infoContent);
          info.open({ map: mapRef.current, anchor: marker });
        }
      });
      el.addEventListener("mouseleave", () => {
        infoRef.current?.close();
      });

      // Click → select job (InfoWindow already visible via hover)
      marker.addListener("click", () => {
        onSelectRef.current(job);
      });

      markers.push(marker);
    });

    jobMarkersRef.current = markers;
    jobLookupRef.current = jobLookup;

    // Clusterer
    clustererRef.current = new MarkerClusterer({
      map,
      markers,
      algorithm: new SuperClusterAlgorithm({ maxZoom: 14, radius: 80 }),
      // Default onClusterClick zooms into cluster bounds — no override needed
      renderer: {
        render({ count, position, markers: clusterMarkers }) {
          const el = document.createElement("div");
          el.innerHTML = makeClusterSvg(count);
          el.style.cursor = "pointer";

          // Show preview on hover
          el.addEventListener("mouseenter", () => {
            if (onClusterHoverRef.current && clusterMarkers) {
              const clusterJobs: MapJob[] = [];
              for (const m of clusterMarkers) {
                const j = jobLookupRef.current.get(m as google.maps.marker.AdvancedMarkerElement);
                if (j) clusterJobs.push(j);
              }
              if (clusterJobs.length > 0) {
                onClusterHoverRef.current(clusterJobs, { lat: position.lat(), lng: position.lng() });
              }
            }
          });
          el.addEventListener("mouseleave", () => {
            onClusterHoverEndRef.current?.();
          });

          return new google.maps.marker.AdvancedMarkerElement({
            position,
            content: el,
            zIndex: 10,
          });
        },
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsKey, selectedId, meanSalary, resolvedCoords, highlightedKey, dimmedKey, ready, activeAmenitiesProp, amenityLoadingProp, commuteTimesKey]);

  /* ── Anchor markers ── */
  useEffect(() => {
    anchorMarkersRef.current.forEach((m) => (m.map = null));
    anchorMarkersRef.current = [];
    if (!mapRef.current) return;

    anchorMarkers.forEach((a) => {
      const isEnabled = !enabledAnchorIds || enabledAnchorIds.has(a.id);
      const emoji = ANCHOR_EMOJI[a.icon] ?? "📍";
      const el = document.createElement("div");
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${isEnabled ? a.color : '#6b7280'};border:3px solid ${isEnabled ? '#fff' : '#9ca3af'};box-shadow:0 2px 8px rgba(0,0,0,${isEnabled ? '0.4' : '0.15'});font-size:16px;line-height:1;opacity:${isEnabled ? '1' : '0.5'};cursor:context-menu;" title="${a.label}">${emoji}</div>`;

      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        onToggleAnchorRef.current?.(a.id);
      });

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: a.lat, lng: a.lng },
        map: mapRef.current,
        content: el,
        zIndex: 2000,
      });
      anchorMarkersRef.current.push(marker);
    });
  }, [anchorMarkers, enabledAnchorIds, ready]);

  /* ── Work History markers (gray briefcase pins) ── */
  useEffect(() => {
    // Clean up previous clusterer + markers
    whClustererRef.current?.clearMarkers();
    whClustererRef.current?.setMap(null);
    whClustererRef.current = null;
    workHistoryMarkersRef.current.forEach((m) => (m.map = null));
    workHistoryMarkersRef.current = [];
    whMarkerElementsRef.current.clear();
    if (!mapRef.current || workHistoryMarkers.length === 0) return;

    workHistoryMarkers.forEach((w) => {
      const isSchool = w.type === "school";
      const isMilitary = w.type === "military";
      const isVolunteer = w.type === "volunteer";
      const isInternship = w.type === "internship";
      const isSelfEmployed = w.type === "self-employed";
      const isUnemployed = w.type === "unemployed";
      const emoji = isSchool ? "🎓" : isMilitary ? "🎖️" : isVolunteer ? "🤝" : isInternship ? "🏢" : isSelfEmployed ? "🧑‍💻" : isUnemployed ? "🔍" : "💼";
      const bg = isSchool ? "#7c3aed" : isMilitary ? "#047857" : isVolunteer ? "#d97706" : isInternship ? "#0891b2" : isSelfEmployed ? "#92400e" : isUnemployed ? "#dc2626" : "#6b7280";
      const border = isSchool ? "#c4b5fd" : isMilitary ? "#6ee7b7" : isVolunteer ? "#fbbf24" : isInternship ? "#67e8f9" : isSelfEmployed ? "#fbbf24" : isUnemployed ? "#fca5a5" : "#d1d5db";
      const typeLabel = isSchool ? "School" : isMilitary ? "Military" : isVolunteer ? "Volunteer" : isInternship ? "Internship" : isSelfEmployed ? "Self-Employed" : isUnemployed ? "Unemployed" : "Past workplace";
      const el = document.createElement("div");
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${bg};border:2.5px solid ${border};box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:16px;line-height:1;opacity:0.9;cursor:pointer;transition:transform 0.15s;" title="${escapeHtml(w.label)}${w.title ? ' - ' + escapeHtml(w.title) : ''}">${emoji}</div>`;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: w.lat, lng: w.lng },
        map: mapRef.current,
        content: el,
        zIndex: 1800,
      });

      // Hover → InfoWindow with company + title
      const titleStr = w.title ? `<div style="color:#6b7280;margin-top:1px">${escapeHtml(w.title)}</div>` : "";
      const infoContent = `<div style="font-size:11px;max-width:200px;line-height:1.4;padding:2px 0">
        <div style="font-weight:700;font-size:12px;color:#111">${emoji} ${escapeHtml(w.label)}</div>
        ${titleStr}
        <div style="color:#9ca3af;margin-top:2px;font-size:10px">${typeLabel} • Click to focus</div>
      </div>`;

      el.addEventListener("mouseenter", () => {
        const info = infoRef.current;
        if (info && mapRef.current) {
          info.setContent(infoContent);
          info.open({ map: mapRef.current, anchor: marker });
        }
        (el.firstElementChild as HTMLElement).style.transform = "scale(1.2)";
      });
      el.addEventListener("mouseleave", () => {
        infoRef.current?.close();
        (el.firstElementChild as HTMLElement).style.transform = "scale(1)";
      });

      // Click → zoom/pan to marker
      marker.addListener("click", () => {
        const map = mapRef.current;
        if (map) {
          map.panTo({ lat: w.lat, lng: w.lng });
          const z = map.getZoom() ?? 10;
          if (z < 17) map.setZoom(17);
        }
        onSelectWorkHistoryRef.current?.(w);
      });

      workHistoryMarkersRef.current.push(marker);
      whMarkerElementsRef.current.set(w.id, el);
    });

    // Cluster work history markers when zoomed out
    if (workHistoryMarkersRef.current.length >= 4 && mapRef.current) {
      whClustererRef.current = new MarkerClusterer({
        map: mapRef.current,
        markers: workHistoryMarkersRef.current,
        algorithm: new SuperClusterAlgorithm({ radius: 80 }),
        renderer: {
          render: ({ count, position }) => {
            const el = document.createElement("div");
            el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#4b5563;border:2.5px solid #9ca3af;color:#fff;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;">${count}</div>`;
            return new google.maps.marker.AdvancedMarkerElement({ position, content: el, zIndex: 1900 });
          },
        },
      });
    }

    // Draw career path polyline segments connecting markers in order
    workHistoryPathRef.current.forEach((l) => l.setMap(null));
    workHistoryPathRef.current = [];
    careerYearLabelsRef.current.forEach((m) => (m.map = null));
    careerYearLabelsRef.current = [];
    if (showCareerPath && workHistoryMarkers.length >= 2) {
      // Deduplicate consecutive same-company markers & compute tenure months per node
      const nodes: { lat: number; lng: number; label: string; year: string; tenureMonths: number }[] = [];
      let prevLabel = "";
      for (const w of workHistoryMarkers) {
        if (w.label !== prevLabel) {
          let tenureMonths = 12;
          if (w.startDate) {
            const s = new Date(w.startDate + "-01");
            const e = w.endDate ? new Date(w.endDate + "-01") : new Date();
            tenureMonths = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
          }
          const year = w.startDate ? w.startDate.slice(0, 4) : "";
          nodes.push({ lat: w.lat, lng: w.lng, label: w.label, year, tenureMonths });
          prevLabel = w.label;
        }
      }

      // Draw segmented polylines with weight proportional to tenure
      for (let i = 0; i < nodes.length - 1; i++) {
        const from = nodes[i];
        const to = nodes[i + 1];
        // Weight: clamp between 2 and 6 based on tenure at destination
        const weight = Math.min(6, Math.max(2, Math.round(to.tenureMonths / 12) + 1));
        const seg = new google.maps.Polyline({
          path: [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }],
          strokeColor: "#6b7280",
          strokeOpacity: 0.5,
          strokeWeight: weight,
          geodesic: true,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.6, scale: 3 }, offset: "0", repeat: "12px" }],
          map: mapRef.current,
        });
        workHistoryPathRef.current.push(seg);
      }

      // Year labels at each node
      for (const node of nodes) {
        if (!node.year) continue;
        const el = document.createElement("div");
        el.innerHTML = `<span style="font-size:9px;color:#6b7280;background:rgba(255,255,255,0.85);padding:0 3px;border-radius:3px;font-weight:600;pointer-events:none;white-space:nowrap;text-shadow:0 0 2px #fff;">${node.year}</span>`;
        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat: node.lat, lng: node.lng },
          map: mapRef.current,
          content: el,
          zIndex: 1700,
        });
        careerYearLabelsRef.current.push(marker);
      }
    }
  }, [workHistoryMarkers, showCareerPath, ready]);

  /* ── Residence (home) marker ── */
  useEffect(() => {
    if (residenceMarkerRef.current) {
      residenceMarkerRef.current.map = null;
      residenceMarkerRef.current = null;
    }
    if (!mapRef.current || !residenceMarker) return;

    const el = document.createElement("div");
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#2563eb;border:3px solid #93c5fd;box-shadow:0 2px 8px rgba(37,99,235,0.4);font-size:18px;line-height:1;cursor:pointer;transition:transform 0.15s;" title="${escapeHtml(residenceMarker.label)} — ${escapeHtml(residenceMarker.address)}">🏠</div>`;

    const marker = new google.maps.marker.AdvancedMarkerElement({
      position: { lat: residenceMarker.lat, lng: residenceMarker.lng },
      map: mapRef.current,
      content: el,
      zIndex: 2000,
    });

    el.addEventListener("mouseenter", () => {
      const info = infoRef.current;
      if (info && mapRef.current) {
        info.setContent(`<div style="font-size:11px;max-width:200px;line-height:1.4;padding:2px 0">
          <div style="font-weight:700;font-size:12px;color:#111">🏠 ${escapeHtml(residenceMarker.label)}</div>
          <div style="color:#6b7280;margin-top:1px">${escapeHtml(residenceMarker.address)}</div>
          <div style="color:#9ca3af;margin-top:2px;font-size:10px">Residence</div>
        </div>`);
        info.open({ map: mapRef.current, anchor: marker });
      }
      (el.firstElementChild as HTMLElement).style.transform = "scale(1.15)";
    });
    el.addEventListener("mouseleave", () => {
      infoRef.current?.close();
      (el.firstElementChild as HTMLElement).style.transform = "";
    });

    residenceMarkerRef.current = marker;
  }, [residenceMarker, ready]);

  /* ── Concurrent work-history highlight (dim others, glow concurrent, draw dashed lines) ── */
  useEffect(() => {
    // Clean up previous concurrent lines
    concurrentLinesRef.current.forEach((l) => l.setMap(null));
    concurrentLinesRef.current = [];

    // Reset all marker styles to default
    whMarkerElementsRef.current.forEach((el) => {
      const inner = el.firstElementChild as HTMLElement;
      if (inner) { inner.style.opacity = "0.85"; inner.style.filter = ""; inner.style.transform = "scale(1)"; }
    });

    const hasConc = concurrentWorkHistoryIds && concurrentWorkHistoryIds.size > 0;
    if (!focusedWorkHistoryId || !hasConc || !mapRef.current) return;

    // Dim non-concurrent, glow concurrent, brighten focused
    whMarkerElementsRef.current.forEach((el, id) => {
      const inner = el.firstElementChild as HTMLElement;
      if (!inner) return;
      if (id === focusedWorkHistoryId) {
        inner.style.opacity = "1";
        inner.style.transform = "scale(1.15)";
      } else if (concurrentWorkHistoryIds!.has(id)) {
        inner.style.opacity = "1";
        inner.style.filter = "drop-shadow(0 0 6px rgba(6,182,212,0.8))";
        inner.style.transform = "scale(1.1)";
      } else {
        inner.style.opacity = "0.3";
      }
    });

    // Draw dashed lines from focused to each concurrent marker
    const focusedMarker = workHistoryMarkers.find((w) => w.id === focusedWorkHistoryId);
    if (!focusedMarker) return;
    for (const cId of concurrentWorkHistoryIds!) {
      const cMarker = workHistoryMarkers.find((w) => w.id === cId);
      if (!cMarker) continue;
      // Skip line if markers are at the same location (< 0.001 deg ≈ ~100m)
      if (Math.abs(focusedMarker.lat - cMarker.lat) < 0.001 && Math.abs(focusedMarker.lng - cMarker.lng) < 0.001) continue;
      const line = new google.maps.Polyline({
        path: [{ lat: focusedMarker.lat, lng: focusedMarker.lng }, { lat: cMarker.lat, lng: cMarker.lng }],
        strokeColor: "#06b6d4",
        strokeOpacity: 0,
        strokeWeight: 2,
        geodesic: true,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, scale: 3 }, offset: "0", repeat: "10px" }],
        map: mapRef.current,
        zIndex: 1900,
      });
      concurrentLinesRef.current.push(line);
    }
  }, [focusedWorkHistoryId, concurrentWorkHistoryIds, workHistoryMarkers]);

  /* ── Work History sub-location markers (smaller pins + dashed lines to parent) ── */
  useEffect(() => {
    subLocationMarkersRef.current.forEach((m) => (m.map = null));
    subLocationMarkersRef.current = [];
    subLocationLinesRef.current.forEach((l) => l.setMap(null));
    subLocationLinesRef.current = [];
    if (!mapRef.current || workHistorySubLocations.length === 0) return;

    const typeEmoji: Record<string, string> = {
      "daily-workplace": "🏢",
      "main-office": "🏛️",
      "satellite": "📡",
      "remote": "🏠",
      "client-site": "👤",
    };

    workHistorySubLocations.forEach((loc) => {
      const emoji = typeEmoji[loc.type] ?? "📍";
      const photos = loc.photos ?? [];
      const hasPhotos = photos.length > 0;
      const el = document.createElement("div");
      if (hasPhotos) {
        // Photo pin: show first photo as circular marker
        el.innerHTML = `<div style="position:relative;width:30px;height:30px;cursor:pointer;transition:transform 0.15s;" title="${escapeHtml(loc.label)} (${loc.type}) — ${photos.length} photo${photos.length > 1 ? 's' : ''}">
          <img src="${escapeHtml(photos[0])}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid #f59e0b;box-shadow:0 1px 4px rgba(0,0,0,0.25);" />
          <div style="position:absolute;bottom:-2px;right:-2px;background:#f59e0b;color:#fff;border-radius:50%;width:14px;height:14px;font-size:8px;display:flex;align-items:center;justify-content:center;font-weight:700;border:1px solid #fff;">${photos.length}</div>
        </div>`;
      } else {
        el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#9ca3af;border:2px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.15);font-size:11px;line-height:1;opacity:0.8;cursor:pointer;transition:transform 0.15s;" title="${escapeHtml(loc.label)} (${loc.type})">${emoji}</div>`;
      }

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapRef.current,
        content: el,
        zIndex: 1750,
      });

      // Hover → InfoWindow with location info
      const typeLabel = loc.type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const photosHtml = hasPhotos
        ? `<div style="display:flex;gap:3px;margin-top:4px;flex-wrap:wrap">${photos.map((p) => `<img src="${escapeHtml(p)}" style="width:40px;height:40px;border-radius:4px;object-fit:cover;border:1px solid #e5e7eb" />`).join("")}</div>
           <div style="color:#f59e0b;margin-top:2px;font-size:9px">📷 ${photos.length}/5 photos</div>`
        : "";
      const infoContent = `<div style="font-size:11px;max-width:220px;line-height:1.4;padding:2px 0">
        <div style="font-weight:700;font-size:12px;color:#111">${emoji} ${escapeHtml(loc.label)}</div>
        <div style="color:#6b7280;margin-top:1px">${typeLabel}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:2px">
          <span style="color:#9ca3af;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(loc.address ?? "")}</span>
          <button onclick="navigator.clipboard.writeText('${escapeHtml(loc.address ?? "")}')" style="background:none;border:1px solid #d1d5db;border-radius:4px;padding:1px 4px;font-size:9px;color:#6b7280;cursor:pointer;white-space:nowrap" title="Copy address">📋 Copy</button>
        </div>
        ${photosHtml}
        <div style="color:#9ca3af;margin-top:2px;font-size:10px">Sub-location • Click to focus</div>
      </div>`;

      el.addEventListener("mouseenter", () => {
        const info = infoRef.current;
        if (info && mapRef.current) {
          info.setContent(infoContent);
          info.open({ map: mapRef.current, anchor: marker });
        }
        (el.firstElementChild as HTMLElement).style.transform = "scale(1.2)";
      });
      el.addEventListener("mouseleave", () => {
        infoRef.current?.close();
        (el.firstElementChild as HTMLElement).style.transform = "scale(1)";
      });

      // Click → zoom/pan
      marker.addListener("click", () => {
        const map = mapRef.current;
        if (map) {
          map.panTo({ lat: loc.lat, lng: loc.lng });
          const z = map.getZoom() ?? 10;
          if (z < 16) map.setZoom(16);
        }
        onSelectWorkHistoryRef.current?.(loc);
      });

      subLocationMarkersRef.current.push(marker);

      // Dashed line from sub-location to parent job marker
      const line = new google.maps.Polyline({
        path: [
          { lat: loc.parentLat, lng: loc.parentLng },
          { lat: loc.lat, lng: loc.lng },
        ],
        strokeColor: "#9ca3af",
        strokeOpacity: 0,
        strokeWeight: 1,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.4, scale: 2 }, offset: "0", repeat: "8px" }],
        map: mapRef.current,
      });
      subLocationLinesRef.current.push(line);
    });
  }, [workHistorySubLocations, ready]);

  /* ── Building footprint polygons ── */
  useEffect(() => {
    buildingPolygonsRef.current.forEach((p) => p.setMap(null));
    buildingPolygonsRef.current = [];
    if (!mapRef.current || buildingFootprints.length === 0) return;

    const map = mapRef.current;
    buildingFootprints.forEach((fp) => {
      if (fp.coords.length < 3) return;
      const poly = new google.maps.Polygon({
        paths: fp.coords,
        fillColor: fp.color,
        fillOpacity: fp.opacity ?? 0.35,
        strokeColor: fp.color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        map,
        zIndex: 500,
      });
      buildingPolygonsRef.current.push(poly);
    });
  }, [buildingFootprints, ready]);

  /* ── Office location markers ── */
  useEffect(() => {
    officeMarkersRef.current.forEach((m) => (m.map = null));
    officeMarkersRef.current = [];
    officeCircleRef.current?.setMap(null);
    if (!mapRef.current || officeLocations.length <= 1) return;

    const map = mapRef.current;
    const cLat = officeLocations.reduce((s, o) => s + o.lat, 0) / officeLocations.length;
    const cLng = officeLocations.reduce((s, o) => s + o.lng, 0) / officeLocations.length;
    const maxDist = officeLocations.reduce((max, o) => {
      const d = Math.sqrt(Math.pow((o.lat - cLat) * 111_320, 2) + Math.pow((o.lng - cLng) * 111_320 * Math.cos(cLat * Math.PI / 180), 2));
      return Math.max(max, d);
    }, 0);

    officeCircleRef.current = new google.maps.Circle({
      center: { lat: cLat, lng: cLng },
      radius: Math.max(maxDist * 1.3, 500),
      strokeColor: "#8b5cf6",
      fillColor: "#8b5cf6",
      fillOpacity: 0.08,
      strokeWeight: 1.5,
      map,
    });

    officeLocations.forEach((office, idx) => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#8b5cf6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);color:#fff;font-size:10px;font-weight:700;cursor:pointer;">${idx + 1}</div>`;
      el.addEventListener("click", () => onSelectOfficeRef.current?.(office));

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: office.lat, lng: office.lng },
        map,
        content: el,
        zIndex: 1500,
      });
      officeMarkersRef.current.push(marker);
    });
  }, [officeLocations, ready]);

  /* ── Amenity radius circle ── */
  useEffect(() => {
    amenityCircleRef.current?.setMap(null);
    amenityCircleRef.current = null;
    if (!mapRef.current || !amenityRadius) return;
    amenityCircleRef.current = new google.maps.Circle({
      center: { lat: amenityRadius.lat, lng: amenityRadius.lng },
      radius: amenityRadius.radiusM,
      strokeColor: "#06b6d4",
      fillColor: "#06b6d4",
      fillOpacity: 0.06,
      strokeWeight: 1.5,
      strokeOpacity: 0.6,
      map: mapRef.current,
    });
    return () => { amenityCircleRef.current?.setMap(null); amenityCircleRef.current = null; };
  }, [amenityRadius, ready]);

  /* ── Zoom target (commanded from parent) ── */
  useEffect(() => {
    if (!mapRef.current || !zoomTarget) return;
    mapRef.current.panTo({ lat: zoomTarget.lat, lng: zoomTarget.lng });
    mapRef.current.setZoom(zoomTarget.zoom);
  }, [zoomTarget, ready]);

  /* ── Amenity pin markers ── */
  useEffect(() => {
    amenityMarkersRef.current.forEach((m) => (m.map = null));
    amenityMarkersRef.current = [];
    if (!mapRef.current || amenityPins.length === 0) return;

    amenityPins.forEach((pin) => {
      const el = document.createElement("div");
      const wrapper = document.createElement("div");
      Object.assign(wrapper.style, { display: "flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", borderRadius: "50%", background: pin.color, border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", fontSize: "11px", lineHeight: "1", cursor: "default" });
      wrapper.title = `${pin.name}${pin.rating ? ` ★${pin.rating}` : ""}`;
      wrapper.textContent = pin.emoji;
      el.appendChild(wrapper);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: pin.lat, lng: pin.lng },
        map: mapRef.current,
        content: el,
        zIndex: 900,
      });
      amenityMarkersRef.current.push(marker);
    });
    return () => { amenityMarkersRef.current.forEach((m) => (m.map = null)); amenityMarkersRef.current = []; };
  }, [amenityPins, ready]);

  /* ── Company location markers (job search discovery) ── */
  useEffect(() => {
    companyLocMarkersRef.current.forEach((m) => (m.map = null));
    companyLocMarkersRef.current = [];
    if (!mapRef.current || companyLocationMarkers.length === 0) return;

    companyLocationMarkers.forEach((loc) => {
      const el = document.createElement("div");
      const wrapper = document.createElement("div");
      Object.assign(wrapper.style, {
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "22px", height: "22px", borderRadius: "50%",
        background: "#6366f1", border: "2px solid #fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        fontSize: "11px", lineHeight: "1", cursor: "pointer",
      });
      wrapper.title = `${loc.name}\n${loc.address}`;
      wrapper.textContent = "🏢";
      el.appendChild(wrapper);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapRef.current,
        content: el,
        zIndex: 950,
      });

      marker.addListener("gmp-click", () => {
        if (infoRef.current && mapRef.current) {
          infoRef.current.setContent(`<div style="max-width:200px"><strong style="font-size:12px">${loc.name}</strong><p style="font-size:11px;color:#666;margin:2px 0 0">${loc.address}</p></div>`);
          infoRef.current.open({ map: mapRef.current, anchor: marker });
        }
      });

      companyLocMarkersRef.current.push(marker);
    });
    return () => { companyLocMarkersRef.current.forEach((m) => (m.map = null)); companyLocMarkersRef.current = []; };
  }, [companyLocationMarkers, ready]);

  /* ── Reset panned on new search ── */
  useEffect(() => { setHasPanned(false); }, [searchCenter]);

  /* ── Handle "Search this area" ── */
  const handleSearchArea = useCallback(() => {
    if (panCenter && onSearchAreaRef.current) {
      onSearchAreaRef.current(panCenter);
      setHasPanned(false);
    }
  }, [panCenter]);

  /* ── Locate / Snap-back ── */
  const [locating, setLocating] = useState(false);
  const handleLocate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (searchCenter) {
      map.panTo({ lat: searchCenter[0], lng: searchCenter[1] });
      map.setZoom(11);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        map.setZoom(12);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [searchCenter]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" style={pinDropMode ? { cursor: "crosshair" } : undefined} />

      {/* Pulse animation for "you are here" */}
      <style>{`@keyframes gmPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(2.2);opacity:0}}`}</style>

      {/* "Search this area" floating button */}
      {hasPanned && onSearchArea && panCenter && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000]">
          <button
            onClick={handleSearchArea}
            className="flex items-center gap-1.5 bg-[#1e293b] text-[#f8fafc] border border-[#475569] rounded-full px-4 py-2 text-[13px] font-semibold cursor-pointer shadow-lg hover:bg-[#334155] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            Search this area
          </button>
        </div>
      )}

      {/* Zoom + Locate controls (bottom-right) */}
      <div className="absolute bottom-6 right-3 z-[1000] flex flex-col gap-2">
        <div className="rounded-lg overflow-hidden shadow-md border border-gray-300">
          <button
            onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 10) + 1)}
            title="Zoom in"
            className="flex items-center justify-center w-10 h-10 bg-white border-b border-gray-200 cursor-pointer hover:bg-gray-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button
            onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 10) - 1)}
            title="Zoom out"
            className="flex items-center justify-center w-10 h-10 bg-white cursor-pointer hover:bg-gray-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M5 12h14" /></svg>
          </button>
        </div>
        <div className="rounded-lg overflow-hidden shadow-md border border-gray-300">
          <button
            onClick={handleLocate}
            title="Back to my location"
            className="flex items-center justify-center w-10 h-10 bg-white cursor-pointer hover:bg-gray-50"
          >
            {locating ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Haversine distance (km) ── */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
