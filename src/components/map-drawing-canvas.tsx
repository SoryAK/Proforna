"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { MapDrawing as DBDrawing } from "@prisma/client";

/* ── Fabric.js is browser-only; dynamic import ── */
type FabricCanvas = import("fabric").Canvas;
type FabricObject = import("fabric").FabricObject;

export type DrawingTool =
  | "select"
  | "freehand"
  | "line"
  | "polyline"
  | "polygon"
  | "circle"
  | "rectangle"
  | "text"
  | "emoji"
  | "ruler"
  | "eraser";

export interface DrawingSettings {
  tool: DrawingTool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  emoji: string;
  zoneType: "preferred" | "avoid" | "maybe" | null;
}

export interface DrawingCanvasHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  deleteSelected: () => void;
  exportImage: () => string | null;
  getObjects: () => SerializedDrawing[];
  loadObjects: (objs: SerializedDrawing[]) => void;
  setDrawingMode: (active: boolean) => void;
  zoomToFit: () => void;
  finishPoly: () => void;
  isDrawingPoly: () => boolean;
}

export interface SerializedDrawing {
  id?: string;
  dbId?: string;
  type: string;
  fabricJson: Record<string, unknown>;
  anchors: { lat: number; lng: number }[];
  /** Per-vertex geo coords for freehand, polyline, polygon, line */
  vertexAnchors?: { lat: number; lng: number }[];
  color: string;
  zoneType: string | null;
  label: string | null;
  layerId?: string | null;
  scope?: string;
  measurement?: { distance?: number; area?: number; unit?: string };
}

interface Props {
  active: boolean;
  settings: DrawingSettings;
  mapBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
  mapZoom: number;
  mapCenter: { lat: number; lng: number } | null;
  containerWidth: number;
  containerHeight: number;
  savedDrawings?: DBDrawing[];
  activeLayerId?: string | null;
  activeScope?: string;
  hiddenLayerIds?: Set<string>;
  onDrawingComplete?: (drawing: SerializedDrawing) => void;
  onDrawingDelete?: (localId: string) => void;
  onMeasurement?: (m: { distance?: number; area?: number; unit?: string }) => void;
  latLngToPixel: (lat: number, lng: number) => { x: number; y: number } | null;
  pixelToLatLng: (x: number, y: number) => { lat: number; lng: number } | null;
}

/* ── Detect light/white-ish colors so we can add outlines for contrast ── */
function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // perceived brightness > 200 → considered light
  return (r * 299 + g * 587 + b * 114) / 1000 > 200;
}

const ZONE_COLORS: Record<string, string> = {
  preferred: "rgba(34, 197, 94, 0.25)",
  avoid: "rgba(239, 68, 68, 0.25)",
  maybe: "rgba(234, 179, 8, 0.25)",
};
const ZONE_STROKES: Record<string, string> = {
  preferred: "#22c55e",
  avoid: "#ef4444",
  maybe: "#eab308",
};

/* ── Haversine distance (meters) ── */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/* ── Polygon area via Shoelace (sq meters approx) ── */
function polygonArea(pts: { lat: number; lng: number }[]) {
  if (pts.length < 3) return 0;
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area +=
      toRad(pts[j].lng - pts[i].lng) *
      (2 + Math.sin(toRad(pts[i].lat)) + Math.sin(toRad(pts[j].lat)));
  }
  return Math.abs((area * R * R) / 2);
}

function formatDistance(m: number) {
  const ft = m * 3.28084;
  if (m < 1000) return `${Math.round(m)} m (${Math.round(ft)} ft)`;
  const mi = m / 1609.344;
  const km = m / 1000;
  return `${km.toFixed(2)} km / ${mi.toFixed(2)} mi`;
}

function formatArea(sqm: number) {
  const sqFt = sqm * 10.7639;
  const sqYd = sqm * 1.19599;
  const acres = sqm / 4046.856;
  const sqMi = sqm / 2589988.11;
  const hectares = sqm / 10000;
  const sqKm = sqm / 1e6;

  // Build a multi-unit string so user always sees sq ft
  const parts: string[] = [];
  parts.push(`${Math.round(sqFt).toLocaleString()} sq ft`);
  if (sqYd >= 100) parts.push(`${Math.round(sqYd).toLocaleString()} sq yd`);
  if (acres >= 0.1) parts.push(`${acres.toFixed(2)} acres`);
  if (hectares >= 1) parts.push(`${hectares.toFixed(2)} ha`);
  if (sqKm >= 0.01) parts.push(`${sqKm.toFixed(3)} km²`);
  if (sqMi >= 0.01) parts.push(`${sqMi.toFixed(3)} sq mi`);
  return parts.join(" · ");
}

const MapDrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(function MapDrawingCanvas(
  {
    active,
    settings,
    containerWidth,
    containerHeight,
    onDrawingComplete,
    onDrawingDelete,
    onMeasurement,
    latLngToPixel,
    pixelToLatLng,
    savedDrawings,
    mapBounds,
    mapZoom,
    activeLayerId,
    activeScope,
    hiddenLayerIds,
  },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fcRef = useRef<FabricCanvas | null>(null);
  const fabricModRef = useRef<typeof import("fabric") | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const isDrawingShape = useRef(false);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const tempShape = useRef<FabricObject | null>(null);
  const polyPoints = useRef<{ x: number; y: number }[]>([]);
  const polyLines = useRef<FabricObject[]>([]);
  const rulerLine = useRef<FabricObject | null>(null);
  const rulerLabel = useRef<FabricObject | null>(null);
  const [loaded, setLoaded] = useState(false);
  const prevBoundsRef = useRef<string>("");
  const prevZoomRef = useRef<number>(0);
  const drawingMapRef = useRef<Map<string, SerializedDrawing>>(new Map());
  const finishPolyRef = useRef<(() => void) | null>(null);

  /* ── Lazy-load Fabric.js ── */
  useEffect(() => {
    let cancelled = false;
    import("fabric").then((mod) => {
      if (cancelled) return;
      fabricModRef.current = mod;
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  /* ── Init canvas ── */
  useEffect(() => {
    if (!loaded || !wrapperRef.current || !fabricModRef.current) return;
    const wrapper = wrapperRef.current;
    const fabric = fabricModRef.current;

    // Create canvas element imperatively so Fabric.js can freely
    // wrap/reparent it without conflicting with React's DOM management.
    const canvasEl = document.createElement("canvas");
    canvasEl.style.width = "100%";
    canvasEl.style.height = "100%";
    wrapper.appendChild(canvasEl);

    const fc = new fabric.Canvas(canvasEl, {
      width: containerWidth,
      height: containerHeight,
      selection: true,
      preserveObjectStacking: true,
    });
    fcRef.current = fc;
    saveState();

    return () => {
      fc.dispose();
      fcRef.current = null;
      // Clean up any DOM nodes Fabric.js left behind
      while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  /* ── Resize canvas ── */
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;
    fc.setDimensions({ width: containerWidth, height: containerHeight });
    fc.renderAll();
  }, [containerWidth, containerHeight]);

  /* ── Sync geo-anchored drawings when map viewport changes ── */
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc || !mapBounds) return;
    const boundsKey = `${mapBounds.north},${mapBounds.south},${mapBounds.east},${mapBounds.west}`;
    if (boundsKey === prevBoundsRef.current && mapZoom === prevZoomRef.current) return;
    prevBoundsRef.current = boundsKey;
    prevZoomRef.current = mapZoom;
    repositionAllObjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapBounds, mapZoom]);

  /* ── Show/hide objects when layer visibility changes ── */
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc || !hiddenLayerIds) return;
    fc.getObjects().forEach((obj) => {
      const lid = (obj as FabricObject & { _layerId?: string | null })._layerId;
      if (lid) {
        const shouldHide = hiddenLayerIds.has(lid);
        obj.set({ visible: !shouldHide, evented: !shouldHide, selectable: !shouldHide });
      }
    });
    fc.renderAll();
  }, [hiddenLayerIds]);

  /* ── Load saved drawings from DB ── */
  useEffect(() => {
    if (!savedDrawings || !fcRef.current || !fabricModRef.current) return;
    const fc = fcRef.current;
    const existing = new Set<string>();
    drawingMapRef.current.forEach((_v, k) => existing.add(k));

    for (const dbDraw of savedDrawings) {
      const key = `db_${dbDraw.id}`;
      if (existing.has(key)) continue;
      const data = dbDraw.data as unknown as SerializedDrawing;
      data.dbId = dbDraw.id;
      drawingMapRef.current.set(key, data);
      reconstructObject(fc, data, key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedDrawings, loaded]);

  /* ── Configure tool mode ── */
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;

    if (!active) {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.forEachObject((o) => { o.selectable = false; o.evented = false; });
      fc.renderAll();
      return;
    }

    // Reset selectability
    fc.forEachObject((o) => { o.selectable = true; o.evented = true; });
    fc.selection = settings.tool === "select";

    if (settings.tool === "freehand") {
      fc.isDrawingMode = true;
      const brush = fc.freeDrawingBrush;
      if (brush) {
        brush.color = settings.zoneType
          ? (ZONE_STROKES[settings.zoneType] ?? settings.color)
          : settings.color;
        brush.width = settings.strokeWidth;
      }
    } else {
      fc.isDrawingMode = false;
    }

    fc.renderAll();
  }, [active, settings]);

  /* ── Freehand complete: convert path to geo-anchored drawing ── */
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;

    const onPathCreated = (opt: { path: FabricObject }) => {
      const path = opt.path;
      if (!path) return;
      commitObject(path, "freehand");
    };

    fc.on("path:created", onPathCreated as never);
    return () => { fc.off("path:created", onPathCreated as never); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, settings]);

  /* ── Shape drawing mouse handlers ── */
  useEffect(() => {
    const fc = fcRef.current;
    const fabric = fabricModRef.current;
    if (!fc || !fabric || !active) return;

    const tool = settings.tool;
    if (["select", "freehand"].includes(tool)) return;

    const strokeColor = settings.zoneType
      ? (ZONE_STROKES[settings.zoneType] ?? settings.color)
      : settings.color;
    const fillColor = settings.zoneType
      ? (ZONE_COLORS[settings.zoneType] ?? "transparent")
      : (["polygon", "circle", "rectangle"].includes(tool)
        ? `${settings.color}33`
        : "transparent");

    const onMouseDown = (opt: { e: MouseEvent; viewportPoint?: { x: number; y: number } }) => {
      if (!opt.viewportPoint) return;
      const { x, y } = opt.viewportPoint;

      if (tool === "text") {
        const text = new fabric.IText("Type here", {
          left: x,
          top: y,
          fontSize: settings.fontSize,
          fill: strokeColor,
          fontFamily: "Inter, sans-serif",
          // Add dark stroke for light colors so text is always visible
          stroke: isLightColor(strokeColor) ? "#333333" : undefined,
          strokeWidth: isLightColor(strokeColor) ? 0.5 : 0,
        });
        fc.add(text);
        fc.setActiveObject(text);
        text.enterEditing();
        commitObject(text, "text");
        return;
      }

      if (tool === "emoji") {
        const emoji = new fabric.IText(settings.emoji || "⭐", {
          left: x,
          top: y,
          fontSize: 32,
          fontFamily: "Apple Color Emoji, Segoe UI Emoji, sans-serif",
        });
        fc.add(emoji);
        commitObject(emoji, "emoji");
        return;
      }

      if (tool === "polygon" || tool === "polyline") {
        polyPoints.current.push({ x, y });
        if (polyPoints.current.length > 1) {
          const prev = polyPoints.current[polyPoints.current.length - 2];
          const seg = new fabric.Line([prev.x, prev.y, x, y], {
            stroke: strokeColor,
            strokeWidth: settings.strokeWidth,
            selectable: false,
            evented: false,
          });
          fc.add(seg);
          polyLines.current.push(seg);
        }
        fc.renderAll();
        return;
      }

      // Shape start for line, circle, rectangle
      isDrawingShape.current = true;
      shapeStart.current = { x, y };
    };

    const onMouseMove = (opt: { e: MouseEvent; viewportPoint?: { x: number; y: number } }) => {
      if (!isDrawingShape.current || !shapeStart.current || !opt.viewportPoint) return;
      const { x, y } = opt.viewportPoint;
      const sx = shapeStart.current.x;
      const sy = shapeStart.current.y;

      if (tempShape.current) {
        fc.remove(tempShape.current);
        tempShape.current = null;
      }

      let shape: FabricObject | null = null;
      if (tool === "line" || tool === "ruler") {
        shape = new fabric.Line([sx, sy, x, y], {
          stroke: tool === "ruler" ? "#f59e0b" : strokeColor,
          strokeWidth: tool === "ruler" ? 2 : settings.strokeWidth,
          strokeDashArray: tool === "ruler" ? [6, 4] : undefined,
          selectable: false,
          evented: false,
        });
      } else if (tool === "circle") {
        const rx = Math.abs(x - sx) / 2;
        const ry = Math.abs(y - sy) / 2;
        shape = new fabric.Ellipse({
          left: Math.min(sx, x),
          top: Math.min(sy, y),
          rx,
          ry,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: settings.strokeWidth,
          selectable: false,
          evented: false,
        });
      } else if (tool === "rectangle") {
        shape = new fabric.Rect({
          left: Math.min(sx, x),
          top: Math.min(sy, y),
          width: Math.abs(x - sx),
          height: Math.abs(y - sy),
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: settings.strokeWidth,
          selectable: false,
          evented: false,
        });
      }

      if (shape) {
        fc.add(shape);
        tempShape.current = shape;

        // For ruler, show live distance
        if (tool === "ruler") {
          if (rulerLabel.current) fc.remove(rulerLabel.current);
          const ptA = pixelToLatLng(sx, sy);
          const ptB = pixelToLatLng(x, y);
          if (ptA && ptB) {
            const dist = haversine(ptA, ptB);
            const label = new fabric.Text(formatDistance(dist), {
              left: (sx + x) / 2,
              top: (sy + y) / 2 - 16,
              fontSize: 13,
              fill: "#f59e0b",
              fontFamily: "Inter, sans-serif",
              backgroundColor: "rgba(0,0,0,0.7)",
              selectable: false,
              evented: false,
            });
            fc.add(label);
            rulerLabel.current = label;
          }
        }
      }

      fc.renderAll();
    };

    const onMouseUp = (opt: { e: MouseEvent; viewportPoint?: { x: number; y: number } }) => {
      if (!isDrawingShape.current || !shapeStart.current || !opt.viewportPoint) return;
      isDrawingShape.current = false;

      if (tempShape.current) {
        tempShape.current.set({ selectable: true, evented: true });

        if (tool === "ruler") {
          // Ruler is a temporary measurement — remove after committing measurement
          const ptA = pixelToLatLng(shapeStart.current.x, shapeStart.current.y);
          const ptB = pixelToLatLng(opt.viewportPoint.x, opt.viewportPoint.y);
          if (ptA && ptB) {
            const dist = haversine(ptA, ptB);
            onMeasurement?.({ distance: dist, unit: "m" });
          }
          // Keep ruler visual on canvas
          rulerLine.current = tempShape.current;
          tempShape.current = null;
        } else {
          commitObject(tempShape.current, tool);
          tempShape.current = null;
        }
      }
      shapeStart.current = null;
    };

    const finishPoly = () => {
      if ((tool === "polygon" || tool === "polyline") && polyPoints.current.length >= 2) {
        // Remove temp segments
        polyLines.current.forEach((l) => fc.remove(l));
        polyLines.current = [];

        const pts = polyPoints.current.map((p) => new fabric.Point(p.x, p.y));

        if (tool === "polygon" && pts.length >= 3) {
          const poly = new fabric.Polygon(pts, {
            fill: fillColor,
            stroke: strokeColor,
            strokeWidth: settings.strokeWidth,
          });
          fc.add(poly);
          commitObject(poly, "polygon");

          // Calculate area
          const geoPoints = polyPoints.current.map((p) => pixelToLatLng(p.x, p.y)).filter(Boolean) as { lat: number; lng: number }[];
          if (geoPoints.length >= 3) {
            const area = polygonArea(geoPoints);
            onMeasurement?.({ area, unit: "sqm" });
          }
        } else {
          const polyline = new fabric.Polyline(pts, {
            fill: "transparent",
            stroke: strokeColor,
            strokeWidth: settings.strokeWidth,
          });
          fc.add(polyline);
          commitObject(polyline, "polyline");
        }

        polyPoints.current = [];
        fc.renderAll();
      }
    };

    finishPolyRef.current = finishPoly;

    const onDblClick = () => finishPoly();

    // Escape key finishes polyline/polygon too
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        finishPoly();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    fc.on("mouse:down", onMouseDown as never);
    fc.on("mouse:move", onMouseMove as never);
    fc.on("mouse:up", onMouseUp as never);
    fc.on("mouse:dblclick", onDblClick as never);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      finishPolyRef.current = null;
      fc.off("mouse:down", onMouseDown as never);
      fc.off("mouse:move", onMouseMove as never);
      fc.off("mouse:up", onMouseUp as never);
      fc.off("mouse:dblclick", onDblClick as never);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings, loaded]);

  /* ── Eraser: click to delete object ── */
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc || !active || settings.tool !== "eraser") return;

    const onSelect = () => {
      const sel = fc.getActiveObject();
      if (sel) {
        const localId = (sel as FabricObject & { _localId?: string })._localId;
        fc.remove(sel);
        if (localId) {
          drawingMapRef.current.delete(localId);
          onDrawingDelete?.(localId);
        }
        fc.discardActiveObject();
        fc.renderAll();
        saveState();
      }
    };

    fc.on("selection:created", onSelect as never);
    return () => { fc.off("selection:created", onSelect as never); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings.tool, loaded]);

  /* ── Helpers ── */

  function saveState() {
    const fc = fcRef.current;
    if (!fc) return;
    undoStack.current.push(JSON.stringify(fc.toJSON()));
    redoStack.current = [];
  }

  function commitObject(obj: FabricObject, type: string) {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    (obj as FabricObject & { _localId?: string })._localId = localId;
    (obj as FabricObject & { _layerId?: string | null })._layerId = activeLayerId ?? null;

    // Extract geo anchors from corner pixels (bounding-box fallback)
    const bound = obj.getBoundingRect();
    const corners = [
      { x: bound.left, y: bound.top },
      { x: bound.left + bound.width, y: bound.top },
      { x: bound.left + bound.width, y: bound.top + bound.height },
      { x: bound.left, y: bound.top + bound.height },
    ];
    const anchors = corners.map((c) => pixelToLatLng(c.x, c.y)).filter(Boolean) as {
      lat: number;
      lng: number;
    }[];

    // For vertex-based shapes, extract per-vertex geo-coordinates
    let vertexAnchors: { lat: number; lng: number }[] | undefined;
    const VERTEX_TYPES = ["freehand", "polyline", "polygon", "line"];
    if (VERTEX_TYPES.includes(type)) {
      vertexAnchors = extractVertexAnchors(obj, type);
    }

    const serialized: SerializedDrawing = {
      id: localId,
      type,
      fabricJson: obj.toObject() as Record<string, unknown>,
      anchors,
      vertexAnchors,
      color: settings.color,
      zoneType: settings.zoneType,
      label: null,
      layerId: activeLayerId ?? null,
      scope: activeScope ?? "global",
    };

    drawingMapRef.current.set(localId, serialized);
    saveState();
    onDrawingComplete?.(serialized);
  }

  /** Extract every vertex of a path/polyline/polygon/line as lat/lng */
  function extractVertexAnchors(
    obj: FabricObject,
    type: string,
  ): { lat: number; lng: number }[] {
    const results: { lat: number; lng: number }[] = [];

    if (type === "line") {
      const line = obj as FabricObject & { x1: number; y1: number; x2: number; y2: number; left: number; top: number };
      const p1 = pixelToLatLng(line.left + line.x1, line.top + line.y1);
      const p2 = pixelToLatLng(line.left + line.x2, line.top + line.y2);
      if (p1) results.push(p1);
      if (p2) results.push(p2);
      return results;
    }

    if (type === "polyline" || type === "polygon") {
      const poly = obj as FabricObject & { points?: { x: number; y: number }[]; left: number; top: number };
      if (poly.points) {
        for (const pt of poly.points) {
          const geo = pixelToLatLng(pt.x, pt.y);
          if (geo) results.push(geo);
        }
      }
      return results;
    }

    if (type === "freehand") {
      // Fabric.js Path stores path commands as an array
      const pathObj = obj as FabricObject & { path?: unknown[][]; left: number; top: number; pathOffset?: { x: number; y: number } };
      if (pathObj.path) {
        const offsetX = pathObj.left ?? 0;
        const offsetY = pathObj.top ?? 0;
        const po = pathObj.pathOffset ?? { x: 0, y: 0 };
        for (const cmd of pathObj.path) {
          // Commands: M x y, L x y, Q cx cy x y, C ... etc
          // Extract the endpoint (last 2 numbers)
          if (cmd.length >= 3) {
            const px = (cmd[cmd.length - 2] as number) + offsetX - po.x;
            const py = (cmd[cmd.length - 1] as number) + offsetY - po.y;
            const geo = pixelToLatLng(px, py);
            if (geo) results.push(geo);
          }
        }
      }
      return results;
    }

    return results;
  }

  function reconstructObject(fc: FabricCanvas, data: SerializedDrawing, key: string) {
    const fabric = fabricModRef.current;
    if (!fabric || !data.anchors?.length) return;

    // Convert bounding-box geo anchors to pixel positions
    const corners = data.anchors.map((a) => latLngToPixel(a.lat, a.lng)).filter(Boolean) as { x: number; y: number }[];
    if (corners.length < 2) return;

    const minX = Math.min(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxX = Math.max(...corners.map((c) => c.x));
    const maxY = Math.max(...corners.map((c) => c.y));

    const strokeColor = data.zoneType ? (ZONE_STROKES[data.zoneType] ?? data.color) : data.color;
    const fillColor = data.zoneType ? (ZONE_COLORS[data.zoneType] ?? "transparent") : `${data.color}33`;
    const sw = (data.fabricJson?.strokeWidth as number) ?? 2;

    let obj: FabricObject | null = null;

    switch (data.type) {
      case "rectangle":
        obj = new fabric.Rect({
          left: minX, top: minY,
          width: maxX - minX, height: maxY - minY,
          fill: fillColor, stroke: strokeColor, strokeWidth: sw,
        });
        break;
      case "circle":
        obj = new fabric.Ellipse({
          left: minX, top: minY,
          rx: (maxX - minX) / 2, ry: (maxY - minY) / 2,
          fill: fillColor, stroke: strokeColor, strokeWidth: sw,
        });
        break;
      case "text":
        obj = new fabric.IText(
          (data.fabricJson?.text as string) ?? data.label ?? "Text",
          {
            left: minX, top: minY,
            fontSize: (data.fabricJson?.fontSize as number) ?? 16,
            fill: strokeColor, fontFamily: "Inter, sans-serif",
            stroke: isLightColor(strokeColor) ? "#333333" : undefined,
            strokeWidth: isLightColor(strokeColor) ? 0.5 : 0,
          },
        );
        break;
      case "emoji":
        obj = new fabric.IText(
          (data.fabricJson?.text as string) ?? "⭐",
          {
            left: minX, top: minY,
            fontSize: 32,
            fontFamily: "Apple Color Emoji, Segoe UI Emoji, sans-serif",
          },
        );
        break;

      case "line": {
        if (data.vertexAnchors && data.vertexAnchors.length >= 2) {
          const p1 = latLngToPixel(data.vertexAnchors[0].lat, data.vertexAnchors[0].lng);
          const p2 = latLngToPixel(data.vertexAnchors[1].lat, data.vertexAnchors[1].lng);
          if (p1 && p2) {
            obj = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
              stroke: strokeColor, strokeWidth: sw,
            });
          }
        }
        break;
      }

      case "polyline": {
        if (data.vertexAnchors && data.vertexAnchors.length >= 2) {
          const pts = data.vertexAnchors
            .map((a) => latLngToPixel(a.lat, a.lng))
            .filter(Boolean) as { x: number; y: number }[];
          if (pts.length >= 2) {
            obj = new fabric.Polyline(
              pts.map((p) => new fabric.Point(p.x, p.y)),
              { fill: "transparent", stroke: strokeColor, strokeWidth: sw },
            );
          }
        }
        break;
      }

      case "polygon": {
        if (data.vertexAnchors && data.vertexAnchors.length >= 3) {
          const pts = data.vertexAnchors
            .map((a) => latLngToPixel(a.lat, a.lng))
            .filter(Boolean) as { x: number; y: number }[];
          if (pts.length >= 3) {
            obj = new fabric.Polygon(
              pts.map((p) => new fabric.Point(p.x, p.y)),
              { fill: fillColor, stroke: strokeColor, strokeWidth: sw },
            );
          }
        }
        break;
      }

      case "freehand": {
        if (data.vertexAnchors && data.vertexAnchors.length >= 2) {
          const pts = data.vertexAnchors
            .map((a) => latLngToPixel(a.lat, a.lng))
            .filter(Boolean) as { x: number; y: number }[];
          if (pts.length >= 2) {
            // Rebuild as a smooth SVG path using quadratic curves
            let d = `M ${pts[0].x} ${pts[0].y}`;
            for (let i = 1; i < pts.length - 1; i++) {
              const mx = (pts[i].x + pts[i + 1].x) / 2;
              const my = (pts[i].y + pts[i + 1].y) / 2;
              d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
            }
            const last = pts[pts.length - 1];
            d += ` L ${last.x} ${last.y}`;
            obj = new fabric.Path(d, {
              fill: "transparent", stroke: strokeColor, strokeWidth: sw,
              strokeLineCap: "round", strokeLineJoin: "round",
            });
          }
        }
        break;
      }

      default:
        // Unknown type fallback — dashed bounding-box
        obj = new fabric.Rect({
          left: minX, top: minY,
          width: maxX - minX, height: maxY - minY,
          fill: fillColor, stroke: strokeColor, strokeWidth: sw,
          strokeDashArray: [4, 4],
        });
    }

    if (obj) {
      (obj as FabricObject & { _localId?: string })._localId = key;
      (obj as FabricObject & { _layerId?: string | null })._layerId = data.layerId ?? null;
      if (data.layerId && hiddenLayerIds?.has(data.layerId)) {
        obj.set({ visible: false, evented: false, selectable: false });
      }
      fc.add(obj);
      fc.renderAll();
    }
  }

  function repositionAllObjects() {
    const fc = fcRef.current;
    if (!fc) return;

    const VERTEX_TYPES = new Set(["freehand", "polyline", "polygon", "line"]);

    drawingMapRef.current.forEach((data, key) => {
      if (!data.anchors?.length) return;
      // Find the fabric object with this key
      const obj = fc.getObjects().find(
        (o) => (o as FabricObject & { _localId?: string })._localId === key,
      );
      if (!obj) return;

      /* ── Vertex-based shapes: remove + recreate from vertex anchors ── */
      if (VERTEX_TYPES.has(data.type) && data.vertexAnchors?.length) {
        // Preserve visibility / selectability flags
        const wasVisible = obj.visible;
        const wasEvented = obj.evented;
        const wasSelectable = obj.selectable;
        fc.remove(obj);
        reconstructObject(fc, data, key);
        // Re-apply visibility state to the newly created object
        const newObj = fc.getObjects().find(
          (o) => (o as FabricObject & { _localId?: string })._localId === key,
        );
        if (newObj) {
          newObj.set({ visible: wasVisible, evented: wasEvented, selectable: wasSelectable });
        }
        return;
      }

      /* ── Bounding-box shapes: reposition in place ── */
      const corners = data.anchors
        .map((a) => latLngToPixel(a.lat, a.lng))
        .filter(Boolean) as { x: number; y: number }[];
      if (corners.length < 2) return;

      const minX = Math.min(...corners.map((c) => c.x));
      const minY = Math.min(...corners.map((c) => c.y));
      const maxX = Math.max(...corners.map((c) => c.x));
      const maxY = Math.max(...corners.map((c) => c.y));

      const w = maxX - minX;
      const h = maxY - minY;
      obj.set({ left: minX, top: minY });

      const shapeType = data.type;
      if (shapeType === "circle") {
        (obj as FabricObject & { rx: number; ry: number }).rx = w / 2;
        (obj as FabricObject & { rx: number; ry: number }).ry = h / 2;
      }
      if (shapeType === "rectangle" || shapeType === "circle") {
        obj.set({ width: w, height: h });
      }
      obj.setCoords();
    });

    fc.renderAll();
  }

  /* ── Imperative handle ── */
  useImperativeHandle(ref, () => ({
    undo: () => {
      const fc = fcRef.current;
      if (!fc || undoStack.current.length <= 1) return;
      const state = undoStack.current.pop()!;
      redoStack.current.push(state);
      const prev = undoStack.current[undoStack.current.length - 1];
      if (prev) fc.loadFromJSON(prev).then(() => fc.renderAll());
    },
    redo: () => {
      const fc = fcRef.current;
      if (!fc || redoStack.current.length === 0) return;
      const state = redoStack.current.pop()!;
      undoStack.current.push(state);
      fc.loadFromJSON(state).then(() => fc.renderAll());
    },
    clear: () => {
      const fc = fcRef.current;
      if (!fc) return;
      fc.clear();
      drawingMapRef.current.clear();
      saveState();
    },
    deleteSelected: () => {
      const fc = fcRef.current;
      if (!fc) return;
      const active = fc.getActiveObjects();
      active.forEach((o) => {
        const localId = (o as FabricObject & { _localId?: string })._localId;
        fc.remove(o);
        if (localId) {
          drawingMapRef.current.delete(localId);
          onDrawingDelete?.(localId);
        }
      });
      fc.discardActiveObject();
      fc.renderAll();
      saveState();
    },
    exportImage: () => {
      const fc = fcRef.current;
      if (!fc) return null;
      return fc.toDataURL({ format: "png", multiplier: 2 });
    },
    getObjects: () => Array.from(drawingMapRef.current.values()),
    loadObjects: (objs: SerializedDrawing[]) => {
      const fc = fcRef.current;
      if (!fc) return;
      objs.forEach((o) => {
        const key = o.id ?? `load_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        drawingMapRef.current.set(key, o);
        reconstructObject(fc, o, key);
      });
    },
    setDrawingMode: (active: boolean) => {
      const fc = fcRef.current;
      if (!fc) return;
      fc.isDrawingMode = active;
    },
    zoomToFit: () => {
      const fc = fcRef.current;
      if (!fc) return;
      fc.renderAll();
    },
    finishPoly: () => {
      finishPolyRef.current?.();
    },
    isDrawingPoly: () => {
      return polyPoints.current.length > 0;
    },
  }), [loaded]);

  /* ── Cursor style ── */
  const getCursor = useCallback(() => {
    if (!active) return "default";
    switch (settings.tool) {
      case "select": return "default";
      case "eraser": return "crosshair";
      case "text": return "text";
      case "ruler": return "crosshair";
      case "freehand": return "crosshair";
      default: return "crosshair";
    }
  }, [active, settings.tool]);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 z-[1100]"
      style={{
        pointerEvents: active ? "auto" : "none",
        cursor: getCursor(),
        width: containerWidth,
        height: containerHeight,
      }}
    />
  );
});

export default MapDrawingCanvas;
