"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface IndoorPOI {
  id: string;
  label: string;
  category: POICategory;
  markerType: "start" | "staging" | "endpoint";
  x: number;
  y: number;
  building: "A" | "B" | "exterior";
  notes?: string;
}

export type POICategory =
  | "food-nonfood"
  | "grinding-room"
  | "waste-oil"
  | "municipal"
  | "cardboard"
  | "chemical"
  | "scrap-metal"
  | "bottle-can"
  | "bean-room";

/** Interactive SVG room / zone */
export interface RoomZone {
  id: string;
  label: string;
  building: "A" | "B" | "exterior";
  /** Room type for color‑coding */
  type: "production" | "utility" | "storage" | "shipping" | "office" | "exterior" | "hallway";
  /** Pixel‑coordinate polygon: [[x,y], …] */
  polygon: [number, number][];
  /** Waste categories generated in this room */
  wasteCategories?: POICategory[];
  notes?: string;
}

/* ================================================================== */
/*  Category metadata                                                  */
/* ================================================================== */

const CATEGORIES: Record<
  POICategory,
  { label: string; color: string }
> = {
  "food-nonfood":  { label: "Food & Nonfood",        color: "#2d8a4e" },
  "grinding-room": { label: "Grinding Room Waste",   color: "#b5651d" },
  "waste-oil":     { label: "Waste Oil",              color: "#1a3a5c" },
  "municipal":     { label: "Municipal Waste",        color: "#8b0000" },
  "cardboard":     { label: "Cardboard",              color: "#cd5c5c" },
  "chemical":      { label: "Chemical Disposal",      color: "#daa520" },
  "scrap-metal":   { label: "Scrap Metal",            color: "#708090" },
  "bottle-can":    { label: "Bottle / Can Recycling", color: "#c71585" },
  "bean-room":     { label: "Bean Room Waste",        color: "#5c1a1a" },
};

/** Room‑type → fill color */
const ZONE_COLORS: Record<RoomZone["type"], string> = {
  production: "#3b82f6",  // blue
  utility:    "#eab308",  // yellow
  storage:    "#8b5cf6",  // purple
  shipping:   "#f97316",  // orange
  office:     "#06b6d4",  // cyan
  exterior:   "#ef4444",  // red
  hallway:    "#6b7280",  // gray
};

/* ================================================================== */
/*  Floor plan dimensions                                              */
/* ================================================================== */

const IMG_W = 4000;
const IMG_H = 2252;

/* ================================================================== */
/*  Room zones (polygon coords traced from floor plan)                 */
/* ================================================================== */

const ROOM_ZONES: RoomZone[] = [
  // ── Building A — North Wing / Production ──────────────────────
  {
    id: "a-production-nw",
    label: "NW Production Hall",
    building: "A",
    type: "production",
    polygon: [[420, 300], [1100, 300], [1100, 600], [420, 600]],
    wasteCategories: ["grinding-room"],
    notes: "Grinding & initial processing area",
  },
  {
    id: "a-production-center",
    label: "Central Production",
    building: "A",
    type: "production",
    polygon: [[1100, 360], [1950, 360], [1950, 700], [1100, 700]],
    wasteCategories: ["food-nonfood"],
    notes: "Main production floor — Building A",
  },
  {
    id: "a-4th-floor-line",
    label: "4th Floor Line / Enrober",
    building: "A",
    type: "production",
    polygon: [[1500, 700], [1950, 700], [1950, 880], [1500, 880]],
    wasteCategories: ["food-nonfood"],
  },
  {
    id: "a-pump-room",
    label: "Pump Room",
    building: "A",
    type: "utility",
    polygon: [[2450, 470], [2650, 470], [2650, 620], [2450, 620]],
    notes: "Hydraulic & process pumps",
  },
  {
    id: "a-smith",
    label: "Smith / Workshop",
    building: "A",
    type: "utility",
    polygon: [[2700, 500], [2900, 500], [2900, 660], [2700, 660]],
    wasteCategories: ["scrap-metal"],
  },
  {
    id: "a-packaging",
    label: "Packaging",
    building: "A",
    type: "production",
    polygon: [[2300, 620], [2680, 620], [2680, 800], [2300, 800]],
    wasteCategories: ["food-nonfood", "cardboard"],
    notes: "Packaging & palletizing",
  },
  {
    id: "a-pressing",
    label: "Pressing",
    building: "A",
    type: "production",
    polygon: [[2680, 700], [2950, 700], [2950, 900], [2680, 900]],
    wasteCategories: ["food-nonfood", "grinding-room"],
    notes: "Cocoa pressing operations",
  },
  {
    id: "a-trolley",
    label: "Trolley / Transport",
    building: "A",
    type: "hallway",
    polygon: [[2950, 600], [3150, 600], [3150, 780], [2950, 780]],
  },
  {
    id: "a-roasting",
    label: "Roasting",
    building: "A",
    type: "production",
    polygon: [[2950, 780], [3250, 780], [3250, 1000], [2950, 1000]],
    wasteCategories: ["bean-room", "grinding-room"],
    notes: "Bean roasting & winnowing",
  },
  {
    id: "a-ne-production",
    label: "NE Production Wing",
    building: "A",
    type: "production",
    polygon: [[2000, 300], [2450, 300], [2450, 520], [2000, 520]],
    wasteCategories: ["food-nonfood"],
  },
  {
    id: "a-far-ne",
    label: "Far NE Production",
    building: "A",
    type: "production",
    polygon: [[2900, 300], [3400, 300], [3400, 550], [2900, 550]],
    wasteCategories: ["food-nonfood"],
  },

  // ── Building A — Maintenance ──────────────────────────────────
  {
    id: "a-maintenance",
    label: "Maintenance",
    building: "A",
    type: "utility",
    polygon: [[1300, 700], [1500, 700], [1500, 880], [1300, 880]],
    wasteCategories: ["waste-oil", "scrap-metal"],
    notes: "Equipment maintenance shop",
  },

  // ── Building B — South ────────────────────────────────────────
  {
    id: "b-grinding",
    label: "Grinding / West Wing",
    building: "B",
    type: "production",
    polygon: [[200, 700], [650, 700], [650, 1100], [200, 1100]],
    wasteCategories: ["grinding-room", "scrap-metal"],
  },
  {
    id: "b-storage-west",
    label: "West Storage",
    building: "B",
    type: "storage",
    polygon: [[200, 1100], [650, 1100], [650, 1350], [200, 1350]],
  },
  {
    id: "b-central-hall",
    label: "Building B Central Hall",
    building: "B",
    type: "production",
    polygon: [[650, 800], [1650, 800], [1650, 1150], [650, 1150]],
    wasteCategories: ["food-nonfood", "waste-oil"],
    notes: "Primary B production space",
  },
  {
    id: "b-storage-south",
    label: "South Storage / Staging",
    building: "B",
    type: "storage",
    polygon: [[650, 1150], [1650, 1150], [1650, 1380], [650, 1380]],
    notes: "Buffer storage & staging area",
  },
  {
    id: "b-shipping",
    label: "Shipping Dock",
    building: "B",
    type: "shipping",
    polygon: [[650, 1380], [1650, 1380], [1650, 1480], [650, 1480]],
    notes: "Truck loading bays",
  },
  {
    id: "b-boiler-room",
    label: "Boiler Room",
    building: "B",
    type: "utility",
    polygon: [[2500, 1050], [2750, 1050], [2750, 1220], [2500, 1220]],
    wasteCategories: ["chemical"],
    notes: "Steam boilers & hot water",
  },
  {
    id: "b-electrical",
    label: "Electrical Room",
    building: "B",
    type: "utility",
    polygon: [[2750, 1020], [3000, 1020], [3000, 1150], [2750, 1150]],
    notes: "Main switchgear & panels",
  },
  {
    id: "b-south-central",
    label: "South Central Processing",
    building: "B",
    type: "production",
    polygon: [[1800, 1050], [2500, 1050], [2500, 1350], [1800, 1350]],
    wasteCategories: ["chemical", "food-nonfood"],
  },

  // ── Exterior zones ────────────────────────────────────────────
  {
    id: "ext-scrap-dumpster",
    label: "Scrap Metal 40 YD Dumpster",
    building: "exterior",
    type: "exterior",
    polygon: [[3380, 210], [3560, 210], [3560, 300], [3380, 300]],
    wasteCategories: ["scrap-metal"],
  },
  {
    id: "ext-municipal-dumpster",
    label: "Municipal Waste Area",
    building: "exterior",
    type: "exterior",
    polygon: [[3250, 300], [3430, 300], [3430, 400], [3250, 400]],
    wasteCategories: ["municipal"],
  },
  {
    id: "ext-waste-oil-pickup",
    label: "Waste Oil Pickup",
    building: "exterior",
    type: "exterior",
    polygon: [[120, 600], [300, 600], [300, 730], [120, 730]],
    wasteCategories: ["waste-oil"],
  },
  {
    id: "ext-8yd-dumpster",
    label: "Closed Top 8YD Dumpster",
    building: "exterior",
    type: "exterior",
    polygon: [[120, 1150], [330, 1150], [330, 1250], [120, 1250]],
    wasteCategories: ["municipal"],
  },
  {
    id: "ext-bottle-can",
    label: "Bottle/Can Pickup",
    building: "exterior",
    type: "exterior",
    polygon: [[2200, 1250], [2400, 1250], [2400, 1350], [2200, 1350]],
    wasteCategories: ["bottle-can"],
  },
  {
    id: "ext-30yd-dumpster",
    label: "Open Top 30YD Dumpsters",
    building: "exterior",
    type: "exterior",
    polygon: [[3550, 1020], [3800, 1020], [3800, 1160], [3550, 1160]],
    wasteCategories: ["scrap-metal"],
  },
  {
    id: "ext-weighing-bridge",
    label: "Weighing Bridge",
    building: "exterior",
    type: "exterior",
    polygon: [[2950, 1380], [3200, 1380], [3200, 1460], [2950, 1460]],
    notes: "Vehicle weigh station",
  },
];

/* ================================================================== */
/*  POI data (same as before)                                          */
/* ================================================================== */

const DEFAULT_POIS: IndoorPOI[] = [
  { id: "fn-1",  label: "Food & Nonfood – NE Production",    category: "food-nonfood", markerType: "start", x: 2550, y: 520,  building: "A" },
  { id: "fn-2",  label: "Food & Nonfood – N Production",     category: "food-nonfood", markerType: "start", x: 2750, y: 520,  building: "A" },
  { id: "fn-3",  label: "Food & Nonfood – NE Corner",        category: "food-nonfood", markerType: "start", x: 2950, y: 520,  building: "A" },
  { id: "fn-4",  label: "Food & Nonfood – E Production",     category: "food-nonfood", markerType: "start", x: 3100, y: 600,  building: "A" },
  { id: "fn-5",  label: "Food & Nonfood – Center Hall",      category: "food-nonfood", markerType: "start", x: 1700, y: 900,  building: "B" },
  { id: "fn-6",  label: "Food & Nonfood – Center South",     category: "food-nonfood", markerType: "start", x: 1900, y: 900,  building: "B" },
  { id: "gr-1",  label: "Grinding Room Waste – West Wing",   category: "grinding-room", markerType: "start", x: 680,  y: 550,  building: "A" },
  { id: "gr-2",  label: "Grinding Room Waste – Roasting",    category: "grinding-room", markerType: "start", x: 2900, y: 880,  building: "A" },
  { id: "gr-3",  label: "Grinding Room Waste – E Production",category: "grinding-room", markerType: "start", x: 3150, y: 880,  building: "A" },
  { id: "wo-1",  label: "Waste Oil – Central Maintenance",   category: "waste-oil", markerType: "start", x: 1650, y: 850,  building: "B" },
  { id: "wo-2",  label: "Waste Oil Pickup",                  category: "waste-oil", markerType: "endpoint", x: 200,  y: 680,  building: "exterior", notes: "External pickup point – west side" },
  { id: "mw-1",  label: "Municipal Waste – NE Dumpster",     category: "municipal", markerType: "endpoint", x: 3350, y: 360,  building: "exterior", notes: "Municipal waste dumpster area" },
  { id: "mw-2",  label: "Municipal Waste – Pressing",        category: "municipal", markerType: "staging", x: 2800, y: 820,  building: "A" },
  { id: "cb-1",  label: "Cardboard – Packaging",             category: "cardboard", markerType: "start", x: 2650, y: 700,  building: "A" },
  { id: "cb-2",  label: "Cardboard – East Production",       category: "cardboard", markerType: "start", x: 3200, y: 700,  building: "A" },
  { id: "ch-1",  label: "Chemical Disposal – South Central", category: "chemical", markerType: "start", x: 2200, y: 1150, building: "B" },
  { id: "ch-2",  label: "Chemical Disposal – Boiler Area",   category: "chemical", markerType: "start", x: 2400, y: 1150, building: "B" },
  { id: "ch-3",  label: "Chemical Disposal – SE",            category: "chemical", markerType: "start", x: 2600, y: 1150, building: "B" },
  { id: "sm-1",  label: "Scrap Metal – West Storage",        category: "scrap-metal", markerType: "start", x: 580,  y: 850,  building: "B" },
  { id: "sm-2",  label: "Scrap Metal 40 YD Dumpster",        category: "scrap-metal", markerType: "endpoint", x: 3500, y: 280,  building: "exterior", notes: "40 yard dumpster – NE corner" },
  { id: "bc-1",  label: "Bottle/Can Pickup",                 category: "bottle-can", markerType: "endpoint", x: 2300, y: 1280, building: "exterior", notes: "External pickup point – south side" },
  { id: "bc-2",  label: "Bottle/Can – East Wing",            category: "bottle-can", markerType: "start", x: 3350, y: 1000, building: "A" },
  { id: "br-1",  label: "Bean Room Waste – Roasting",        category: "bean-room", markerType: "start", x: 2950, y: 950,  building: "A" },
  { id: "br-2",  label: "Bean Room Waste – East",            category: "bean-room", markerType: "start", x: 3200, y: 950,  building: "A" },
  { id: "ep-1",  label: "Closed Top 8YD Dumpster",           category: "municipal", markerType: "endpoint", x: 250,  y: 1200, building: "exterior", notes: "Southwest corner" },
  { id: "ep-2",  label: "Open Top 30YD Dumpsters",           category: "scrap-metal", markerType: "endpoint", x: 3700, y: 1100, building: "exterior", notes: "Southeast corner – open top 30 yard" },
];

/* ================================================================== */
/*  Marker icon builder                                                */
/* ================================================================== */

function makeDivIcon(cat: POICategory, type: IndoorPOI["markerType"]) {
  const { color } = CATEGORIES[cat];
  const shape = type === "start" ? "★" : type === "staging" ? "●" : "■";
  const size = type === "start" ? 22 : 18;
  return L.divIcon({
    className: "indoor-poi-marker",
    html: `<span style="color:${color};font-size:${size}px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));cursor:pointer;user-select:none;">${shape}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

interface IndoorMapProps {
  floorPlanUrl?: string;
  pois?: IndoorPOI[];
  zones?: RoomZone[];
  className?: string;
}

export default function IndoorMap({
  floorPlanUrl = "/uploads/floorplans/barry-callebaut.jpg",
  pois = DEFAULT_POIS,
  zones = ROOM_ZONES,
  className,
}: IndoorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const zonesRef = useRef<L.LayerGroup | null>(null);
  const zoneLabelRef = useRef<L.LayerGroup | null>(null);

  const [activeCategories, setActiveCategories] = useState<Set<POICategory>>(
    () => new Set(Object.keys(CATEGORIES) as POICategory[]),
  );
  const [selectedPOI, setSelectedPOI] = useState<IndoorPOI | null>(null);
  const [selectedZone, setSelectedZone] = useState<RoomZone | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [showZoneLabels, setShowZoneLabels] = useState(true);
  const [zoneOpacity, setZoneOpacity] = useState(0.25);

  /* ---- pixel → Leaflet CRS.Simple coords (y‑inverted) ----------- */
  const toLatLng = useCallback(
    (px: number, py: number): L.LatLngExpression => [IMG_H - py, px],
    [],
  );

  /** Convert polygon pixel coords → Leaflet LatLng array */
  const polyToLatLngs = useCallback(
    (poly: [number, number][]): L.LatLngExpression[] =>
      poly.map(([x, y]) => toLatLng(x, y)),
    [toLatLng],
  );

  /* ---- Initialize map -------------------------------------------- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const bounds: L.LatLngBoundsExpression = [[0, 0], [IMG_H, IMG_W]];

    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      maxBounds: [[-200, -200], [IMG_H + 200, IMG_W + 200]],
    });

    L.imageOverlay(floorPlanUrl, bounds).addTo(map);
    map.fitBounds(bounds);

    zonesRef.current = L.layerGroup().addTo(map);
    zoneLabelRef.current = L.layerGroup().addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorPlanUrl]);

  /* ---- Sync SVG zones -------------------------------------------- */
  useEffect(() => {
    const group = zonesRef.current;
    const labelGroup = zoneLabelRef.current;
    if (!group || !labelGroup) return;
    group.clearLayers();
    labelGroup.clearLayers();

    if (!showZones) return;

    for (const zone of zones) {
      const color = ZONE_COLORS[zone.type];
      const poly = L.polygon(polyToLatLngs(zone.polygon) as L.LatLngExpression[], {
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: zoneOpacity,
        className: "indoor-zone-poly",
      });

      // hover highlight
      poly.on("mouseover", () => {
        poly.setStyle({ fillOpacity: Math.min(zoneOpacity + 0.25, 0.7), weight: 3 });
      });
      poly.on("mouseout", () => {
        if (selectedZone?.id !== zone.id) {
          poly.setStyle({ fillOpacity: zoneOpacity, weight: 2 });
        }
      });

      // click → select zone
      poly.on("click", () => {
        setSelectedZone(zone);
        setSelectedPOI(null);
      });

      // popup
      const wasteHtml = zone.wasteCategories?.length
        ? `<br/><small>Waste: ${zone.wasteCategories.map((c) => `<span style="color:${CATEGORIES[c].color}">${CATEGORIES[c].label}</span>`).join(", ")}</small>`
        : "";
      poly.bindPopup(
        `<div style="min-width:140px"><strong>${zone.label}</strong><br/><small>Building ${zone.building === "exterior" ? "Exterior" : zone.building} · ${zone.type}</small>${wasteHtml}${zone.notes ? `<br/><em style="color:#888">${zone.notes}</em>` : ""}</div>`,
        { maxWidth: 280 },
      );

      poly.addTo(group);

      // zone label (centered)
      if (showZoneLabels) {
        const center = poly.getBounds().getCenter();
        const tooltip = L.tooltip({
          permanent: true,
          direction: "center",
          className: "indoor-zone-label",
          offset: [0, 0],
        })
          .setLatLng(center)
          .setContent(`<span style="color:${color};font-weight:600;font-size:11px;text-shadow:0 1px 3px rgba(0,0,0,0.8)">${zone.label}</span>`);
        labelGroup.addLayer(tooltip);
      }
    }
  }, [zones, showZones, showZoneLabels, zoneOpacity, polyToLatLngs, selectedZone]);

  /* ---- Sync POI markers ------------------------------------------ */
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();

    const visible = pois.filter((p) => activeCategories.has(p.category));

    for (const poi of visible) {
      const marker = L.marker(toLatLng(poi.x, poi.y) as L.LatLngExpression, {
        icon: makeDivIcon(poi.category, poi.markerType),
      });

      const catMeta = CATEGORIES[poi.category];
      marker.bindPopup(
        `<div style="min-width:160px">
          <strong>${poi.label}</strong><br/>
          <span style="color:${catMeta.color}">● ${catMeta.label}</span><br/>
          <small>Type: ${poi.markerType} · Building ${poi.building === "exterior" ? "Exterior" : poi.building}</small>
          ${poi.notes ? `<br/><em style="color:#666">${poi.notes}</em>` : ""}
        </div>`,
        { closeButton: true, maxWidth: 260 },
      );

      marker.on("click", () => {
        setSelectedPOI(poi);
        setSelectedZone(null);
      });

      if (showLabels) {
        marker.bindTooltip(poi.label, {
          permanent: true,
          direction: "top",
          offset: [0, -12],
          className: "indoor-label-tooltip",
        });
      }

      marker.addTo(group);
    }
  }, [pois, activeCategories, showLabels, toLatLng]);

  /* ---- Toggle helpers -------------------------------------------- */
  const toggleCategory = (cat: POICategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  const allOn = activeCategories.size === Object.keys(CATEGORIES).length;

  /* ── Count POIs per zone for the detail panel ──────────────────── */
  const poisInZone = selectedZone
    ? pois.filter((p) => {
        // Check if the POI pixel coords fall within the zone polygon bounds
        const xs = selectedZone.polygon.map(([x]) => x);
        const ys = selectedZone.polygon.map(([, y]) => y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      })
    : [];

  return (
    <div className={`flex flex-col h-full ${className ?? ""}`}>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-700 flex-wrap">
        <span className="text-sm font-semibold text-zinc-300 mr-2">Filters:</span>

        {/* zone toggle */}
        <button
          onClick={() => setShowZones((v) => !v)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showZones ? "bg-indigo-600 border-indigo-500 text-white" : "bg-zinc-800 border-zinc-600 text-zinc-400"
          }`}
        >
          {showZones ? "Hide Zones" : "Show Zones"}
        </button>

        {showZones && (
          <>
            <button
              onClick={() => setShowZoneLabels((v) => !v)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                showZoneLabels ? "bg-indigo-500/60 border-indigo-400 text-white" : "bg-zinc-800 border-zinc-600 text-zinc-400"
              }`}
            >
              {showZoneLabels ? "Zone Labels On" : "Zone Labels Off"}
            </button>

            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Opacity:</span>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.05}
                value={zoneOpacity}
                onChange={(e) => setZoneOpacity(parseFloat(e.target.value))}
                className="w-20 accent-indigo-500"
              />
              <span className="w-6 text-right">{Math.round(zoneOpacity * 100)}%</span>
            </div>
          </>
        )}

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* POI category toggle‑all */}
        <button
          onClick={() =>
            setActiveCategories(allOn ? new Set() : new Set(Object.keys(CATEGORIES) as POICategory[]))
          }
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            allOn ? "bg-orange-600 border-orange-500 text-white" : "bg-zinc-800 border-zinc-600 text-zinc-400"
          }`}
        >
          {allOn ? "Hide POIs" : "Show POIs"}
        </button>

        {(Object.entries(CATEGORIES) as [POICategory, (typeof CATEGORIES)[POICategory]][]).map(
          ([key, meta]) => {
            const active = activeCategories.has(key);
            const count = pois.filter((p) => p.category === key).length;
            return (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                  active ? "border-current bg-zinc-800 text-white" : "border-zinc-700 bg-zinc-900 text-zinc-500 line-through"
                }`}
                style={active ? { borderColor: meta.color, color: meta.color } : undefined}
              >
                <span style={{ color: active ? meta.color : "#555" }} className="text-sm">★</span>
                {meta.label}
                <span className="text-zinc-500 ml-0.5">({count})</span>
              </button>
            );
          },
        )}

        {/* label toggle */}
        <button
          onClick={() => setShowLabels((v) => !v)}
          className={`ml-auto text-xs px-2 py-1 rounded border transition-colors ${
            showLabels ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-800 border-zinc-600 text-zinc-400"
          }`}
        >
          {showLabels ? "POI Labels On" : "POI Labels Off"}
        </button>
      </div>

      {/* ── Map container ───────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />

        {/* ── Info panel — POI ──────────────────────────────── */}
        {selectedPOI && !selectedZone && (
          <div className="absolute top-3 right-3 z-[1000] bg-zinc-900/95 border border-zinc-700 rounded-lg p-4 w-72 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm text-white">{selectedPOI.label}</h3>
                <p className="text-xs mt-1" style={{ color: CATEGORIES[selectedPOI.category].color }}>
                  {CATEGORIES[selectedPOI.category].label}
                </p>
              </div>
              <button onClick={() => setSelectedPOI(null)} className="text-zinc-400 hover:text-white text-lg leading-none">×</button>
            </div>
            <div className="mt-3 space-y-1 text-xs text-zinc-400">
              <p><span className="text-zinc-500">Type:</span> {selectedPOI.markerType === "start" ? "Waste Stream Start ★" : selectedPOI.markerType === "staging" ? "Staging Point ●" : "End Point ■"}</p>
              <p><span className="text-zinc-500">Building:</span> {selectedPOI.building === "exterior" ? "Exterior" : `Building ${selectedPOI.building}`}</p>
              <p><span className="text-zinc-500">Coords:</span> ({selectedPOI.x}, {selectedPOI.y})</p>
              {selectedPOI.notes && <p className="mt-2 text-zinc-300 italic">{selectedPOI.notes}</p>}
            </div>
          </div>
        )}

        {/* ── Info panel — Zone ─────────────────────────────── */}
        {selectedZone && (
          <div className="absolute top-3 right-3 z-[1000] bg-zinc-900/95 border border-zinc-700 rounded-lg p-4 w-80 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm text-white">{selectedZone.label}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ background: ZONE_COLORS[selectedZone.type] }}
                  />
                  <span className="text-xs text-zinc-400 capitalize">{selectedZone.type}</span>
                  <span className="text-xs text-zinc-500">· Building {selectedZone.building === "exterior" ? "Ext." : selectedZone.building}</span>
                </div>
              </div>
              <button onClick={() => setSelectedZone(null)} className="text-zinc-400 hover:text-white text-lg leading-none">×</button>
            </div>

            {selectedZone.notes && (
              <p className="mt-2 text-xs text-zinc-300 italic">{selectedZone.notes}</p>
            )}

            {/* Waste streams in this zone */}
            {selectedZone.wasteCategories && selectedZone.wasteCategories.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-zinc-400 mb-1">Waste Streams:</p>
                <div className="flex flex-wrap gap-1">
                  {selectedZone.wasteCategories.map((cat) => (
                    <span
                      key={cat}
                      className="text-xs px-2 py-0.5 rounded-full border"
                      style={{ borderColor: CATEGORIES[cat].color, color: CATEGORIES[cat].color }}
                    >
                      ★ {CATEGORIES[cat].label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* POIs in this zone */}
            {poisInZone.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-zinc-400 mb-1">POIs in zone ({poisInZone.length}):</p>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {poisInZone.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPOI(p); setSelectedZone(null); }}
                      className="flex items-center gap-1.5 text-xs text-left w-full px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                    >
                      <span style={{ color: CATEGORIES[p.category].color }}>
                        {p.markerType === "start" ? "★" : p.markerType === "staging" ? "●" : "■"}
                      </span>
                      <span className="text-zinc-300 truncate">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Legend ─────────────────────────────────────────── */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-zinc-900/90 border border-zinc-700 rounded-lg p-3 backdrop-blur max-w-xs">
          <p className="text-xs font-semibold text-zinc-300 mb-2">Legend</p>

          {/* POI symbols */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 mb-2">
            <div className="flex items-center gap-1 text-xs text-zinc-400"><span className="text-sm">★</span> Start</div>
            <div className="flex items-center gap-1 text-xs text-zinc-400"><span className="text-sm">●</span> Staging</div>
            <div className="flex items-center gap-1 text-xs text-zinc-400"><span className="text-sm">■</span> Endpoint</div>
          </div>

          {/* Zone types */}
          {showZones && (
            <>
              <div className="border-t border-zinc-700 pt-2 mt-1">
                <p className="text-xs text-zinc-500 mb-1">Zone Types:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {(Object.entries(ZONE_COLORS) as [RoomZone["type"], string][]).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color, opacity: 0.7 }} />
                      <span className="capitalize">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
