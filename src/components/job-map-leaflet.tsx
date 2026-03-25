"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ── Salary-coloured SVG marker factory ── */
function svgIcon(color: string, size: number, selected: boolean) {
  const w = selected ? size + 6 : size;
  const h = selected ? Math.round(size * 1.6) + 6 : Math.round(size * 1.6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 38">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 26 12 26s12-17 12-26C24 5.4 18.6 0 12 0z"
          fill="${color}" stroke="${selected ? "#000" : "#fff"}" stroke-width="${selected ? 2 : 1}"/>
    <circle cx="12" cy="12" r="5" fill="#fff" fill-opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 4],
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
  source: "adzuna" | "google";
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
      // trigger if panned > 10 km from original center
      onMoved([c.lat, c.lng], dist > 10_000);
    },
  });
  return null;
}

function formatSalary(n: number) {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
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

  return (
    <MapContainer
      center={center}
      zoom={10}
      className="h-full w-full z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds jobs={jobs} />
      <FitRoute geometry={routeGeometry} />
      <PanDetector searchCenter={searchCenter} onMoved={handleMoved} />

      {/* Commute route path */}
      {routeGeometry && routeGeometry.length > 1 && (
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
      )}

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
      >
        {jobs.map((job) => {
          const color = salaryColor(job.salaryMin, job.salaryMax, meanSalary);
          const isSelected = job.id === selectedId;
          return (
            <Marker
              key={job.id}
              position={[job.lat, job.lng]}
              icon={svgIcon(color, 24, isSelected)}
              eventHandlers={{ click: () => onSelect(job as any) }}
            >
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

      {/* "Search this area" floating button */}
      {hasPanned && onSearchArea && panCenter && (
        <SearchAreaButton
          onClick={() => {
            onSearchArea(panCenter);
            setHasPanned(false);
          }}
        />
      )}
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
          background: "#fff",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "6px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Search this area
      </button>
    </div>
  );
}
