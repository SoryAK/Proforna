/// <reference types="@types/google.maps" />
"use client";

/**
 * ResumeWorkMap — public-safe, read-only map of a candidate's work history.
 *
 * Designed for the interactive resume (/r/[slug]) — a recruiter-facing
 * counterpart to the editor's WorkHistoryPanel inside job-map.tsx.
 *
 * Features:
 *   • Clustered, tenure-sized markers colored by role type
 *   • KPI strip (total tenure, role count, cities, miles spanned)
 *   • Click marker → popup with company / role / dates / tenure
 *   • Map / List toggle (List view stays accessible & print-friendly)
 *   • Fits bounds to all roles on first load
 *
 * NOT included (intentionally — those belong to the editor):
 *   • Add / edit / delete / pin-drop / cover-image upload
 *   • Salary, commute, residences, life anchors, time-slider, compare
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { differenceInMonths } from "date-fns";
import {
  Map as MapIcon,
  List as ListIcon,
  Briefcase,
  GraduationCap,
  Shield,
  Heart,
  Building2,
  MapPin,
  Calendar,
  Clock,
} from "lucide-react";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

let optionsSet = false;
function ensureOptions() {
  if (!optionsSet && GOOGLE_KEY) {
    setOptions({ key: GOOGLE_KEY, v: "weekly" });
    optionsSet = true;
  }
}

export interface ResumeWorkItem {
  id: string;
  type?: string | null; // "job" | "school" | "military" | "volunteer" | ...
  company: string;
  title: string | null;
  address?: string | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  startDate: string | null; // "YYYY-MM"
  endDate: string | null;   // "YYYY-MM" | null = present
}

interface Props {
  items: ResumeWorkItem[];
  /** Hide map view (e.g. stealth/anonymous resumes). List-only fallback. */
  forceListOnly?: boolean;
  /** Initial view when both are available. "both" shows map then list below. */
  defaultView?: "map" | "list" | "both";
  className?: string;
}

const TYPE_META: Record<string, { emoji: string; bg: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  job:           { emoji: "💼", bg: "#4f46e5", label: "Role",       Icon: Briefcase },
  internship:    { emoji: "🌱", bg: "#10b981", label: "Internship", Icon: Briefcase },
  "self-employed": { emoji: "🚀", bg: "#f59e0b", label: "Self-employed", Icon: Briefcase },
  school:        { emoji: "🎓", bg: "#8b5cf6", label: "Education",  Icon: GraduationCap },
  military:      { emoji: "🎖️", bg: "#dc2626", label: "Military",   Icon: Shield },
  volunteer:     { emoji: "❤️", bg: "#ec4899", label: "Volunteer",  Icon: Heart },
};

function metaFor(type?: string | null) {
  return TYPE_META[type || "job"] ?? TYPE_META.job;
}

function parseYM(s: string | null): Date | null {
  if (!s) return null;
  const [y, m] = s.split("-").map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, 1);
}

function fmtYM(s: string | null): string {
  const d = parseYM(s);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function tenureMonths(start: string | null, end: string | null): number {
  const s = parseYM(start);
  if (!s) return 0;
  const e = end ? parseYM(end) : new Date();
  if (!e) return 0;
  return Math.max(0, differenceInMonths(e, s));
}

function fmtTenure(m: number): string {
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (y > 0 && r > 0) return `${y}y ${r}m`;
  if (y > 0) return `${y}y`;
  return `${r || 1}m`;
}

function markerSize(months: number): number {
  if (months >= 60) return 38;
  if (months >= 24) return 34;
  if (months >= 12) return 30;
  return 26;
}

// Haversine in miles
function distMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

export default function ResumeWorkMap({ items, forceListOnly, defaultView = "map", className }: Props) {
  const geocoded = useMemo(
    () => items.filter((i) => typeof i.lat === "number" && typeof i.lng === "number") as (ResumeWorkItem & { lat: number; lng: number })[],
    [items],
  );

  const canShowMap = !forceListOnly && !!GOOGLE_KEY && geocoded.length > 0;
  const effectiveDefault: "map" | "list" | "both" = !canShowMap
    ? "list"
    : defaultView;
  const showToggle = canShowMap && effectiveDefault !== "both";
  const [view, setView] = useState<"map" | "list">(
    effectiveDefault === "list" ? "list" : "map",
  );

  // KPIs
  const kpis = useMemo(() => {
    const totalMonths = items.reduce((sum, i) => sum + tenureMonths(i.startDate, i.endDate), 0);
    const cities = new Set(
      items
        .map((i) => i.location || i.address || "")
        .filter(Boolean)
        .map((s) => s.split(",").slice(0, 2).join(",").trim()),
    );
    let miles = 0;
    if (geocoded.length >= 2) {
      const lats = geocoded.map((g) => g.lat);
      const lngs = geocoded.map((g) => g.lng);
      const sw = { lat: Math.min(...lats), lng: Math.min(...lngs) };
      const ne = { lat: Math.max(...lats), lng: Math.max(...lngs) };
      miles = Math.round(distMiles(sw, ne));
    }
    return {
      tenure: fmtTenure(totalMonths),
      roles: items.length,
      cities: cities.size,
      miles,
    };
  }, [items, geocoded]);

  return (
    <div className={className}>
      {/* Toggle + KPIs */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {showToggle && (
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setView("map")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === "map"
                  ? "bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" /> Map
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === "list"
                  ? "bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" /> List
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 sm:ml-auto w-full sm:w-auto">
          <KpiPill icon={Clock}     label="Tenure"   value={kpis.tenure} />
          <KpiPill icon={Briefcase} label="Roles"    value={String(kpis.roles)} />
          <KpiPill icon={Building2} label="Cities"   value={String(kpis.cities)} />
          {kpis.miles > 0 && <KpiPill icon={MapPin} label="Span" value={`${kpis.miles} mi`} />}
        </div>
      </div>

      {effectiveDefault === "both" ? (
        <div className="space-y-5">
          <MapView items={geocoded} />
          <ListView items={items} />
        </div>
      ) : view === "map" && canShowMap ? (
        <MapView items={geocoded} />
      ) : (
        <ListView items={items} />
      )}
    </div>
  );
}

function KpiPill({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 dark:bg-gray-800 px-2.5 py-1 text-xs">
      <Icon className="h-3 w-3 text-indigo-500" />
      <span className="font-semibold text-gray-900 dark:text-gray-100">{value}</span>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

/* ── Map view ───────────────────────────────────────────────────── */

function MapView({ items }: { items: (ResumeWorkItem & { lat: number; lng: number })[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);

  // One-time map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      ensureOptions();
      if (!GOOGLE_KEY) return;
      const { Map } = (await importLibrary("maps")) as google.maps.MapsLibrary;
      await importLibrary("marker");
      if (cancelled || !containerRef.current) return;
      mapRef.current = new Map(containerRef.current, {
        center: { lat: items[0]?.lat ?? 39.95, lng: items[0]?.lng ?? -75.16 },
        zoom: 9,
        mapId: "resume_work_map",
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
        clickableIcons: false,
      });
      infoRef.current = new google.maps.InfoWindow({ disableAutoPan: false });
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [items]);

  // Render markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    // Clear existing
    clustererRef.current?.clearMarkers();
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];
    if (items.length === 0) return;

    items.forEach((w) => {
      const meta = metaFor(w.type);
      const months = tenureMonths(w.startDate, w.endDate);
      const size = markerSize(months);
      const ringColor = !w.endDate ? "#10b981" : "rgba(255,255,255,0.85)";
      const ringWidth = !w.endDate ? 3 : 2.5;
      const fontSize = size < 30 ? 13 : 15;

      const el = document.createElement("div");
      el.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:${size}px;height:${size}px;border-radius:50%;
        background:${meta.bg};border:${ringWidth}px solid ${ringColor};
        box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:${fontSize}px;line-height:1;
        cursor:pointer;transition:transform 0.15s;
      `;
      el.textContent = meta.emoji;
      el.title = `${w.company}${w.title ? " · " + w.title : ""}`;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: w.lat, lng: w.lng },
        map: mapRef.current,
        content: el,
      });

      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.15)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });

      marker.addListener("click", () => {
        if (!infoRef.current || !mapRef.current) return;
        const tenureStr = months ? `<span style="color:#6b7280;font-size:10px">${fmtTenure(months)}</span>` : "";
        const dateStr = `${fmtYM(w.startDate)} – ${w.endDate ? fmtYM(w.endDate) : "Present"}`;
        const loc = w.location || w.address || "";
        infoRef.current.setContent(`
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:240px;font-size:12px;line-height:1.45;padding:2px 4px;">
            <div style="font-weight:700;font-size:13px;color:#111;display:flex;align-items:center;gap:6px;">
              <span style="font-size:14px">${meta.emoji}</span>${escapeHtml(w.company)}
            </div>
            ${w.title ? `<div style="color:#4b5563;margin-top:2px">${escapeHtml(w.title)}</div>` : ""}
            <div style="color:#6b7280;margin-top:4px;font-size:11px">${dateStr} ${tenureStr ? "· " + tenureStr.replace(/<[^>]+>/g, "") : ""}</div>
            ${loc ? `<div style="color:#9ca3af;margin-top:2px;font-size:11px">${escapeHtml(loc)}</div>` : ""}
          </div>
        `);
        infoRef.current.open({ map: mapRef.current, anchor: marker });
      });

      markersRef.current.push(marker);
    });

    // Cluster
    if (markersRef.current.length >= 4) {
      clustererRef.current = new MarkerClusterer({
        map: mapRef.current,
        markers: markersRef.current,
        algorithm: new SuperClusterAlgorithm({ radius: 70 }),
      });
    }

    // Fit bounds
    if (items.length === 1) {
      mapRef.current.setCenter({ lat: items[0].lat, lng: items[0].lng });
      mapRef.current.setZoom(13);
    } else {
      const b = new google.maps.LatLngBounds();
      items.forEach((i) => b.extend({ lat: i.lat, lng: i.lng }));
      mapRef.current.fitBounds(b, 60);
    }
  }, [ready, items]);

  if (!GOOGLE_KEY) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
        Map unavailable — Google Maps API key not configured.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-[280px] sm:h-[360px] md:h-[420px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800"
      />
      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur px-2 py-1.5 shadow-sm border border-gray-200 dark:border-gray-700 text-[10px]">
        {Object.entries(TYPE_META)
          .filter(([t]) => items.some((i) => (i.type || "job") === t))
          .map(([t, meta]) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: meta.bg }}
              />
              <span className="text-gray-600 dark:text-gray-300">{meta.label}</span>
            </span>
          ))}
        <span className="inline-flex items-center gap-1 ml-1 pl-2 border-l border-gray-200 dark:border-gray-700">
          <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-emerald-500" />
          <span className="text-gray-600 dark:text-gray-300">Current</span>
        </span>
      </div>
    </div>
  );
}

/* ── List view (also used as fallback) ──────────────────────────── */

function ListView({ items }: { items: ResumeWorkItem[] }) {
  // Sort newest-first by startDate
  const sorted = [...items].sort((a, b) => {
    const da = parseYM(a.startDate)?.getTime() ?? 0;
    const db = parseYM(b.startDate)?.getTime() ?? 0;
    return db - da;
  });
  return (
    <div className="space-y-4">
      {sorted.map((w) => {
        const meta = metaFor(w.type);
        const months = tenureMonths(w.startDate, w.endDate);
        const Icon = meta.Icon;
        return (
          <div key={w.id} className="relative pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Icon className="h-4 w-4 text-indigo-500 -ml-[0.4rem] bg-white dark:bg-gray-900 rounded-full p-0.5" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {w.title || meta.label}
              </h3>
              <span className="text-indigo-600 dark:text-indigo-400">@ {w.company}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {fmtYM(w.startDate)} – {w.endDate ? fmtYM(w.endDate) : "Present"}
                {months > 0 && <span className="ml-1 text-gray-400">· {fmtTenure(months)}</span>}
              </span>
              {(w.location || w.address) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {w.location || w.address}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
