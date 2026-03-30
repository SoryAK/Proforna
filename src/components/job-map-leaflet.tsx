"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  Circle,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ── Salary-coloured SVG marker factory ── */
function svgIcon(color: string, size: number, selected: boolean, highlighted: boolean = false, dimmed: boolean = false) {
  const w = selected ? size + 6 : highlighted ? size + 4 : size;
  const h = selected ? Math.round(size * 1.6) + 6 : highlighted ? Math.round(size * 1.6) + 4 : Math.round(size * 1.6);
  const strokeColor = selected ? "#000" : highlighted ? "#6366f1" : "#fff";
  const strokeW = selected ? 2 : highlighted ? 2 : 1;
  const opacity = dimmed && !selected ? 0.45 : 1;
  const dashAttr = dimmed && !selected ? ' stroke-dasharray="3 2"' : "";
  const glow = highlighted && !selected
    ? `<circle cx="12" cy="12" r="16" fill="none" stroke="#6366f1" stroke-width="2" opacity="0.5"><animate attributeName="r" from="14" to="20" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/></circle>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 8}" height="${h + 8}" viewBox="-4 -4 32 46" opacity="${opacity}">
    ${glow}
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 26 12 26s12-17 12-26C24 5.4 18.6 0 12 0z"
          fill="${color}" stroke="${strokeColor}" stroke-width="${strokeW}"${dashAttr}/>
    <circle cx="12" cy="12" r="5" fill="#fff" fill-opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [w + 8, h + 8],
    iconAnchor: [(w + 8) / 2, h + 4],
    popupAnchor: [0, -(h + 4) + 4],
  });
}

/* salary band → colour */
function salaryColor(min: number | null, max: number | null, mean: number | null): string {
  if (!mean || (!min && !max)) return "#3b82f6"; // blue — no data
  const salary = max ?? min ?? 0;
  if (salary >= mean * 1.2) return "#22c55e"; // green — above avg
  if (salary >= mean * 0.8) return "#eab308"; // yellow — near avg
  return "#ef4444"; // red — below avg
}

/* "You are here" pulsing icon */
const youAreHereIcon = L.divIcon({
  html: `<div style="position:relative;width:20px;height:20px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:pulse 2s infinite;"></div>
    <div style="position:absolute;top:4px;left:4px;width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid #fff;"></div>
  </div>
  <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(2.2);opacity:0}}</style>`,
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

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

/* Emoji lookup for anchor icons */
const ANCHOR_EMOJI: Record<string, string> = {
  home: "🏠",
  briefcase: "💼",
  school: "🎓",
  baby: "👶",
  dumbbell: "💪",
  heart: "❤️",
  "map-pin": "📍",
  church: "⛪",
  "shopping-cart": "🛒",
  hospital: "🏥",
  coffee: "☕",
  anchor: "⚓",
};

interface SweetSpotZone {
  center: [number, number];
  radiusMeters: number;
}

/** Transit step for color-coded route rendering */
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

interface Props {
  jobs: MapJob[];
  center: [number, number];
  selectedId: string | null;
  onSelect: (job: MapJob) => void;
  meanSalary: number | null;
  searchCenter: [number, number] | null;
  radiusMiles: number;
  onSearchArea?: (center: [number, number]) => void;
  routeGeometry: [number, number][] | null;
  transitSteps?: TransitStep[];
  showHeatmap?: boolean;
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
}

/* Auto-fit bounds when jobs change */
function FitBounds({ jobs }: { jobs: MapJob[] }) {
  const map = useMap();
  const prevLen = useRef(0);

  useEffect(() => {
    if (jobs.length === 0 || jobs.length === prevLen.current) return;
    prevLen.current = jobs.length;

    const bounds = L.latLngBounds(jobs.map((j) => [j.lat, j.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [jobs, map]);

  return null;
}

/* Focus-fit: zoom to show selected job + all anchor markers */
function FocusFit({ job, anchors }: { job: MapJob; anchors: AnchorMarker[] }) {
  const map = useMap();
  const prevJobId = useRef<string | null>(null);

  useEffect(() => {
    if (job.id === prevJobId.current) return;
    prevJobId.current = job.id;

    const points: [number, number][] = [[job.lat, job.lng]];
    anchors.forEach((a) => points.push([a.lat, a.lng]));

    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true });
    }
  }, [job.id, anchors, map]);

  return null;
}

/* Auto-fit to route when it appears */
function FitRoute({ geometry }: { geometry: [number, number][] | null }) {
  const map = useMap();
  const prevKey = useRef("");

  useEffect(() => {
    if (!geometry || geometry.length < 2) return;
    const key = `${geometry[0][0]},${geometry[0][1]}-${geometry[geometry.length - 1][0]},${geometry[geometry.length - 1][1]}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    const bounds = L.latLngBounds(geometry);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }, [geometry, map]);

  return null;
}

/* Detect pan/zoom away from original search area */
function PanDetector({
  searchCenter,
  onMoved,
}: {
  searchCenter: [number, number] | null;
  onMoved: (center: [number, number], moved: boolean) => void;
}) {
  const map = useMapEvents({
    moveend() {
      if (!searchCenter) return;
      const c = map.getCenter();
      const dist = map.distance(searchCenter, [c.lat, c.lng]);
      // trigger if panned > 500 m from original center
      onMoved([c.lat, c.lng], dist > 500);
    },
  });
  return null;
}

function formatSalary(n: number) {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

/* ── Tile layer configs ── */
const TILE_CONFIGS = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  "google-roadmap": {
    url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attribution: '&copy; Google Maps',
  },
  "google-satellite": {
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: '&copy; Google Maps',
  },
  "google-hybrid": {
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: '&copy; Google Maps',
  },
} as const;

/* ── Heatmap layer (uses leaflet.heat) ── */
function HeatmapLayer({ jobs }: { jobs: MapJob[] }) {
  const map = useMap();
  const heatRef = useRef<any>(null);

  useEffect(() => {
    if (jobs.length === 0) return;

    // Dynamic import of leaflet.heat (side-effect plugin)
    import("leaflet.heat").then(() => {
      // Remove previous layer before adding new one
      if (heatRef.current) {
        map.removeLayer(heatRef.current);
        heatRef.current = null;
      }
      const points: [number, number, number][] = jobs.map((j) => [j.lat, j.lng, 0.6]);
      const heat = (L as any).heatLayer(points, {
        radius: 25,
        blur: 20,
        maxZoom: 14,
        max: 1.0,
        gradient: {
          0.2: "#3b82f6",
          0.4: "#06b6d4",
          0.6: "#22c55e",
          0.8: "#eab308",
          1.0: "#ef4444",
        },
      });
      heat.addTo(map);
      heatRef.current = heat;
    });

    return () => {
      if (heatRef.current) {
        map.removeLayer(heatRef.current);
        heatRef.current = null;
      }
    };
  }, [jobs, map]);

  return null;
}

export default function JobMapLeaflet({
  jobs,
  center,
  selectedId,
  onSelect,
  meanSalary,
  searchCenter,
  radiusMiles,
  onSearchArea,
  routeGeometry,
  transitSteps,
  showHeatmap = false,
  tileStyle = "osm",
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
}: Props) {
  const [panCenter, setPanCenter] = useState<[number, number] | null>(null);
  const [hasPanned, setHasPanned] = useState(false);

  const handleMoved = useCallback(
    (c: [number, number], moved: boolean) => {
      setPanCenter(c);
      setHasPanned(moved);
    },
    []
  );

  // Reset panned state when search center changes
  useEffect(() => {
    setHasPanned(false);
  }, [searchCenter]);

  const radiusMeters = radiusMiles * 1609.34;

  const tileConfig = TILE_CONFIGS[tileStyle] ?? TILE_CONFIGS.osm;

  return (
    <MapContainer
      center={center}
      zoom={10}
      className="h-full w-full z-0"
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer
        key={tileStyle}
        attribution={tileConfig.attribution}
        url={tileConfig.url}
      />
      {jobs.length === 1 && anchorMarkers && anchorMarkers.length > 0
        ? <FocusFit job={jobs[0]} anchors={anchorMarkers} />
        : <FitBounds jobs={jobs} />}
      <FitRoute geometry={routeGeometry} />
      <PanDetector searchCenter={searchCenter} onMoved={handleMoved} />

      {/* Job density heatmap */}
      {showHeatmap && <HeatmapLayer jobs={jobs} />}

      {/* Commute route path */}
      {transitSteps && transitSteps.some((s) => s.geometry?.length) ? (
        /* Transit mode: render each step with its own color */
        <>
          {transitSteps.map((step, i) =>
            step.geometry && step.geometry.length > 1 ? (
              <Polyline
                key={`transit-step-${i}`}
                positions={step.geometry}
                pathOptions={{
                  color: step.mode === "WALKING" ? "#9ca3af" : (step.lineColor || "#6366f1"),
                  weight: step.mode === "WALKING" ? 3 : 5,
                  opacity: 0.85,
                  dashArray: step.mode === "WALKING" ? "6 8" : undefined,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            ) : null,
          )}
        </>
      ) : routeGeometry && routeGeometry.length > 1 ? (
        /* Driving/walking/bicycling: single polyline */
        <Polyline
          positions={routeGeometry}
          pathOptions={{
            color: "#6366f1",
            weight: 5,
            opacity: 0.8,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      ) : null}

      {/* Anchor commute route lines */}
      {anchorRoutes.map((route) => (
        <Polyline
          key={route.anchorId}
          positions={route.geometry}
          pathOptions={{
            color: route.color,
            weight: 4,
            opacity: 0.7,
            lineCap: "round",
            lineJoin: "round",
            dashArray: "8 6",
          }}
        />
      ))}

      {/* Search radius ring */}
      {searchCenter && (
        <Circle
          center={searchCenter}
          radius={radiusMeters}
          pathOptions={{
            color: "#3b82f6",
            fillColor: "#3b82f6",
            fillOpacity: 0.05,
            weight: 1.5,
            dashArray: "6 4",
          }}
        />
      )}

      {/* Sweet Spot zone — weighted centroid of Life Anchors */}
      {sweetSpot && (
        <Circle
          center={sweetSpot.center}
          radius={sweetSpot.radiusMeters}
          pathOptions={{
            color: "#8b5cf6",
            fillColor: "#8b5cf6",
            fillOpacity: 0.10,
            weight: 2,
            dashArray: "4 6",
          }}
        />
      )}
      {sweetSpot && (
        <Marker
          position={sweetSpot.center}
          icon={L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#8b5cf6;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:12px;">⭐</div>`,
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })}
          zIndexOffset={100}
        >
          <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>Sweet Spot</div>
          </Tooltip>
        </Marker>
      )}

      {/* "You are here" marker */}
      {searchCenter && (
        <Marker position={searchCenter} icon={youAreHereIcon}>
          <Popup>
            <p className="text-xs font-semibold">Search center</p>
          </Popup>
        </Marker>
      )}

      {/* Clustered, salary-coloured job markers */}
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={60}
        spiderfyOnMaxZoom
        showCoverageOnHover={false}
        iconCreateFunction={(cluster: { getChildCount: () => number }) => {
          const count = cluster.getChildCount();
          const size = count < 10 ? 36 : count < 50 ? 42 : count < 100 ? 48 : 54;
          const bg = count < 10 ? "#22c55e" : count < 50 ? "#3b82f6" : count < 100 ? "#f59e0b" : "#ef4444";
          const fontSize = count < 100 ? 14 : count < 1000 ? 12 : 11;
          return L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;font-weight:700;font-size:${fontSize}px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${count}</div>`,
            className: "",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
        }}
      >
        {jobs.map((job) => {
          const color = salaryColor(job.salaryMin, job.salaryMax, meanSalary);
          const isSelected = job.id === selectedId;
          const isHighlighted = highlightedIds.includes(job.id);
          const isDimmed = dimmedIds ? dimmedIds.has(job.id) : false;
          const pos: [number, number] = isSelected && resolvedCoords ? resolvedCoords : [job.lat, job.lng];
          return (
            <Marker
              key={job.id}
              position={pos}
              icon={svgIcon(color, 24, isSelected, isHighlighted, isDimmed)}
              zIndexOffset={isSelected ? 1000 : isHighlighted ? 500 : isDimmed ? -100 : 0}
              eventHandlers={{ click: () => onSelect(job as any) }}
            >
              <Tooltip
                direction="top"
                offset={[0, -30]}
                opacity={0.95}
              >
                <div style={{ fontSize: 11, maxWidth: 180, lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 600 }}>{job.title}</div>
                  <div style={{ color: "#6b7280" }}>{job.company}</div>
                  {(job.salaryMin || job.salaryMax) && (
                    <div style={{ color: "#059669", fontWeight: 500 }}>
                      {job.salaryMin ? formatSalary(job.salaryMin) : ""}
                      {job.salaryMin && job.salaryMax ? " – " : ""}
                      {job.salaryMax ? formatSalary(job.salaryMax) : ""}
                    </div>
                  )}
                </div>
              </Tooltip>
              <Popup>
                <div className="text-xs max-w-[200px]">
                  <p className="font-semibold">{job.title}</p>
                  <p className="text-gray-600">{job.company}</p>
                  {(job.salaryMin || job.salaryMax) && (
                    <p className="text-emerald-600 font-medium mt-0.5">
                      {job.salaryMin ? formatSalary(job.salaryMin) : ""}
                      {job.salaryMin && job.salaryMax ? " – " : ""}
                      {job.salaryMax ? formatSalary(job.salaryMax) : ""}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>

      {/* Life Anchor markers — rendered AFTER cluster group so they appear on top */}
      {anchorMarkers.map((a) => {
        const isEnabled = !enabledAnchorIds || enabledAnchorIds.has(a.id);
        return (
        <Marker
          key={a.id}
          position={[a.lat, a.lng]}
          icon={L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${isEnabled ? a.color : '#6b7280'};border:3px solid ${isEnabled ? '#fff' : '#9ca3af'};box-shadow:0 2px 8px rgba(0,0,0,${isEnabled ? '0.4' : '0.15'});font-size:16px;line-height:1;opacity:${isEnabled ? '1' : '0.5'};cursor:context-menu;">${ANCHOR_EMOJI[a.icon] ?? "📍"}</div>`,
            className: "",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          })}
          zIndexOffset={2000}
          eventHandlers={onToggleAnchor ? {
            contextmenu: (e) => { e.originalEvent.preventDefault(); onToggleAnchor(a.id); },
          } : {}}
        >
          <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
            <div style={{ fontSize: 11, fontWeight: 600 }}>
              {a.label}
              <span style={{ fontSize: 9, color: '#888', marginLeft: 4 }}>{isEnabled ? '(right-click to hide)' : '(right-click to show)'}</span>
            </div>
          </Tooltip>
        </Marker>
        );
      })}

      {/* Multiple office locations — shown when company has several nearby offices */}
      {officeLocations.length > 1 && (() => {
        // Compute bounding radius (max distance from centroid) in metres
        const cLat = officeLocations.reduce((s, o) => s + o.lat, 0) / officeLocations.length;
        const cLng = officeLocations.reduce((s, o) => s + o.lng, 0) / officeLocations.length;
        const maxDist = officeLocations.reduce((max, o) => {
          const d = Math.sqrt(Math.pow((o.lat - cLat) * 111_320, 2) + Math.pow((o.lng - cLng) * 111_320 * Math.cos(cLat * Math.PI / 180), 2));
          return Math.max(max, d);
        }, 0);
        const radiusM = Math.max(maxDist * 1.3, 500); // pad 30%, min 500m
        return (
          <>
            <Circle
              center={[cLat, cLng]}
              radius={radiusM}
              pathOptions={{ color: "#8b5cf6", fillColor: "#8b5cf6", fillOpacity: 0.08, weight: 1.5, dashArray: "6 4" }}
            />
            {officeLocations.map((office, idx) => (
              <Marker
                key={`office-${idx}`}
                position={[office.lat, office.lng]}
                icon={L.divIcon({
                  html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#8b5cf6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);color:#fff;font-size:10px;font-weight:700;cursor:pointer;">${idx + 1}</div>`,
                  className: "",
                  iconSize: [22, 22],
                  iconAnchor: [11, 11],
                })}
                zIndexOffset={1500}
                eventHandlers={onSelectOffice ? { click: () => onSelectOffice(office) } : {}}
              >
                <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
                  <div style={{ fontSize: 10, maxWidth: 180 }}>
                    {office.name && <div style={{ fontWeight: 600 }}>{office.name}</div>}
                    <div style={{ color: "#666" }}>{office.address}</div>
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </>
        );
      })()}

      {/* "Search this area" floating button */}
      {hasPanned && onSearchArea && panCenter && (
        <SearchAreaButton
          onClick={() => {
            onSearchArea(panCenter);
            setHasPanned(false);
          }}
        />
      )}

      {/* Zoom + Locate controls (bottom-right, stacked like Google Maps) */}
      <MapControls searchCenter={searchCenter} />
    </MapContainer>
  );
}

/* Floating button rendered as a Leaflet control-style overlay */
function SearchAreaButton({ onClick }: { onClick: () => void }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Prevent map click-through
    L.DomEvent.disableClickPropagation(ref.current);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
      }}
    >
      <button
        onClick={onClick}
        style={{
          background: "#1e293b",
          color: "#f8fafc",
          border: "1px solid #475569",
          borderRadius: 20,
          padding: "8px 18px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          gap: 7,
          letterSpacing: 0.2,
          transition: "background 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#334155";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.45)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#1e293b";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.35)";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Search this area
      </button>
    </div>
  );
}

/* Bottom-right stacked controls: Zoom +/- and Locate (Google Maps style) */
function MapControls({ searchCenter }: { searchCenter: [number, number] | null }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);

  const handleLocate = useCallback(() => {
    if (searchCenter) {
      map.flyTo(searchCenter, 11, { duration: 1 });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 12, { duration: 1 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [map, searchCenter]);

  const btnBase: React.CSSProperties = {
    background: "#fff",
    border: "none",
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: 24,
        right: 12,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Zoom in / out */}
      <div
        style={{
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          border: "1px solid #d1d5db",
        }}
      >
        <button
          onClick={() => map.zoomIn()}
          title="Zoom in"
          style={{ ...btnBase, borderBottom: "1px solid #e5e7eb" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          onClick={() => map.zoomOut()}
          title="Zoom out"
          style={btnBase}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Locate / snap-back */}
      <div
        style={{
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          border: "1px solid #d1d5db",
        }}
      >
        <button
          onClick={handleLocate}
          title="Back to my location"
          style={btnBase}
        >
          {locating ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          )}
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
