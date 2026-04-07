/// <reference types="@types/google.maps" />
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { estimateTaxes } from "@/lib/taxes";

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
  source: "adzuna" | "google" | "email";
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const jobMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const anchorMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const officeMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const sweetSpotMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const youAreHereMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const searchRadiusRef = useRef<google.maps.Circle | null>(null);
  const sweetSpotCircleRef = useRef<google.maps.Circle | null>(null);
  const officeCircleRef = useRef<google.maps.Circle | null>(null);
  const amenityMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const amenityCircleRef = useRef<google.maps.Circle | null>(null);
  const isochronePolysRef = useRef<google.maps.Polygon[]>([]);
  const jobLookupRef = useRef<Map<google.maps.marker.AdvancedMarkerElement, MapJob>>(new Map());
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const transitLayerRef = useRef<google.maps.TransitLayer | null>(null);
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);
  const fitDoneRef = useRef(false);
  const prevJobsLenRef = useRef(0);

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

      setReady(true);
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

  /* ── Fit bounds when jobs change ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || jobs.length === 0) return;
    if (jobs.length === prevJobsLenRef.current) return;
    prevJobsLenRef.current = jobs.length;

    if (jobs.length === 1 && anchorMarkers.length > 0) {
      // Focus-fit: show selected job + anchors
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: jobs[0].lat, lng: jobs[0].lng });
      anchorMarkers.forEach((a) => bounds.extend({ lat: a.lat, lng: a.lng }));
      map.fitBounds(bounds, 60);
    } else {
      const bounds = new google.maps.LatLngBounds();
      jobs.forEach((j) => bounds.extend({ lat: j.lat, lng: j.lng }));
      map.fitBounds(bounds, 40);
    }
  }, [jobs, anchorMarkers, ready]);

  /* ── Route polylines ── */
  useEffect(() => {
    // Clear previous
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    if (!mapRef.current) return;

    const map = mapRef.current;
    const lines: google.maps.Polyline[] = [];

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

      // Fit to transit route
      const bounds = new google.maps.LatLngBounds();
      transitSteps.forEach((s) => s.geometry?.forEach(([lat, lng]) => bounds.extend({ lat, lng })));
      map.fitBounds(bounds, 60);
    } else if (routeGeometry && routeGeometry.length > 1) {
      const line = new google.maps.Polyline({
        path: routeGeometry.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: "#6366f1",
        strokeWeight: 5,
        strokeOpacity: 0.8,
        map,
      });
      lines.push(line);

      const bounds = new google.maps.LatLngBounds();
      routeGeometry.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      map.fitBounds(bounds, 60);
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
  const jobsKey = useMemo(() => jobs.map((j) => j.id).join(","), [jobs]);
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
      <div ref={containerRef} className="h-full w-full" />

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
