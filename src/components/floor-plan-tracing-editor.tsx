"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { detectBuildingShell } from "@/lib/detect-building-shell";
import type { ShellDetectionResult } from "@/lib/detect-building-shell";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

type FabricCanvas = import("fabric").Canvas;
type FabricObject = import("fabric").FabricObject;

export interface TracedRoom {
  id: string;
  label: string;
  type: RoomType;
  /** Pixel-coordinate polygon vertices [[x,y], …] */
  polygon: [number, number][];
  /** Optional fields for future 3D / digital twin */
  wallHeight?: number;
  floor?: number;
  notes?: string;
  color?: string;
}

export type RoomType =
  | "production"
  | "utility"
  | "storage"
  | "shipping"
  | "office"
  | "exterior"
  | "hallway"
  | "mechanical"
  | "electrical";

const ROOM_TYPE_COLORS: Record<RoomType, string> = {
  production:  "#3b82f6",
  utility:     "#eab308",
  storage:     "#8b5cf6",
  shipping:    "#f97316",
  office:      "#06b6d4",
  exterior:    "#ef4444",
  hallway:     "#6b7280",
  mechanical:  "#10b981",
  electrical:  "#f43f5e",
};

export type EditorTool = "select" | "polygon" | "rectangle" | "pan" | "wall" | "opening" | "text" | "line" | "circle";

export interface WallSegment {
  id: string;
  start: [number, number];
  end: [number, number];
  thickness: number;
}

export interface WallOpening {
  id: string;
  wallId: string;
  /** 0–1 fraction along the wall where the opening starts */
  position: number;
  /** Width in image pixels */
  width: number;
  type: "door" | "window" | "opening";
}

export interface FloorSymbol {
  id: string;
  type: string;
  category: string;
  position: [number, number];
  rotation: number;
  scale: number;
  label?: string;
}

export interface TextAnnotation {
  id: string;
  text: string;
  position: [number, number];
  fontSize: number;
  color: string;
}

/* ── Symbol library definitions ──────────────────────────────── */
interface SymbolDef {
  id: string;
  label: string;
  category: string;
  /** SVG path(s) drawn in a 40x40 viewport */
  path: string;
  width: number;
  height: number;
}

const SYMBOL_CATEGORIES = ["Doors & Windows", "Furniture", "Warehouse", "Fixtures"] as const;

const SYMBOL_LIBRARY: SymbolDef[] = [
  // Doors & Windows
  { id: "door-single", label: "Single Door", category: "Doors & Windows", path: "M2 38 L2 2 A36 36 0 0 1 38 38 Z", width: 80, height: 80 },
  { id: "door-double", label: "Double Door", category: "Doors & Windows", path: "M2 20 L2 2 A18 18 0 0 1 20 20 Z M38 20 L38 2 A18 18 0 0 0 20 20 Z", width: 80, height: 80 },
  { id: "window-single", label: "Window", category: "Doors & Windows", path: "M4 16 L36 16 M4 24 L36 24 M4 14 L4 26 M36 14 L36 26", width: 60, height: 10 },
  { id: "sliding-door", label: "Sliding Door", category: "Doors & Windows", path: "M2 18 L20 18 M20 22 L38 22 M2 16 L2 24 M20 16 L20 24 M38 16 L38 24", width: 80, height: 10 },
  // Furniture
  { id: "desk-rect", label: "Desk", category: "Furniture", path: "M2 2 L38 2 L38 22 L2 22 Z M8 22 L8 38 M32 22 L32 38", width: 120, height: 60 },
  { id: "chair", label: "Chair", category: "Furniture", path: "M10 12 L30 12 L30 30 L10 30 Z M12 30 L12 38 M28 30 L28 38 M8 4 L8 14 L32 14 L32 4", width: 50, height: 50 },
  { id: "table-round", label: "Round Table", category: "Furniture", path: "M20 4 A16 16 0 1 1 19.99 4 Z", width: 80, height: 80 },
  { id: "table-rect", label: "Rect Table", category: "Furniture", path: "M4 8 L36 8 L36 32 L4 32 Z", width: 120, height: 60 },
  // Warehouse
  { id: "pallet-rack", label: "Pallet Rack", category: "Warehouse", path: "M2 2 L38 2 L38 38 L2 38 Z M2 14 L38 14 M2 26 L38 26", width: 120, height: 40 },
  { id: "conveyor", label: "Conveyor", category: "Warehouse", path: "M2 12 L38 12 L38 28 L2 28 Z M6 12 L6 28 M12 12 L12 28 M18 12 L18 28 M24 12 L24 28 M30 12 L30 28 M36 12 L36 28", width: 200, height: 40 },
  { id: "forklift", label: "Forklift", category: "Warehouse", path: "M8 6 L32 6 L32 34 L8 34 Z M12 2 L12 6 M28 2 L28 6", width: 40, height: 60 },
  // Fixtures
  { id: "sink", label: "Sink", category: "Fixtures", path: "M6 4 L34 4 L34 28 Q34 36 20 36 Q6 36 6 28 Z M14 16 A6 6 0 1 1 26 16 A6 6 0 1 1 14 16", width: 50, height: 50 },
  { id: "toilet", label: "Toilet", category: "Fixtures", path: "M12 4 L28 4 L28 16 L12 16 Z M8 16 Q8 38 20 38 Q32 38 32 16 Z", width: 40, height: 60 },
  { id: "stairs", label: "Stairs", category: "Fixtures", path: "M2 2 L38 2 L38 38 L2 38 Z M2 8 L38 8 M2 14 L38 14 M2 20 L38 20 M2 26 L38 26 M2 32 L38 32", width: 80, height: 120 },
];

export interface TracingEditorHandle {
  exportSVG: () => string;
  exportRooms: () => TracedRoom[];
  importRooms: (rooms: TracedRoom[]) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 10;

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

interface Props {
  /** URL of the floor-plan raster image */
  imageUrl: string;
  /** Image pixel width */
  imageWidth: number;
  /** Image pixel height */
  imageHeight: number;
  className?: string;
}

const FloorPlanTracingEditor = forwardRef<TracingEditorHandle, Props>(
  function FloorPlanTracingEditor({ imageUrl, imageWidth, imageHeight, className }, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const fcRef = useRef<FabricCanvas | null>(null);
    const fabricRef = useRef<typeof import("fabric") | null>(null);

    const [loaded, setLoaded] = useState(false);
    const [tool, setTool] = useState<EditorTool>("select");
    const [roomType, setRoomType] = useState<RoomType>("production");
    const [rooms, setRooms] = useState<TracedRoom[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editType, setEditType] = useState<RoomType>("production");
    const [editNotes, setEditNotes] = useState("");
    const [editHeight, setEditHeight] = useState<number>(3);
    const [editFloor, setEditFloor] = useState<number>(1);
    const [showSvgModal, setShowSvgModal] = useState(false);
    const [svgOutput, setSvgOutput] = useState("");
    const [opacity, setOpacity] = useState(0.3);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [showRoomTypes, setShowRoomTypes] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [detectError, setDetectError] = useState<string | null>(null);

    // grid / snap / scale
    const [showGrid, setShowGrid] = useState(true);
    const [gridSpacingM, setGridSpacingM] = useState(1);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [pxPerMeter, setPxPerMeter] = useState(100);

    // walls
    const [walls, setWalls] = useState<WallSegment[]>([]);
    const [wallThickness, setWallThickness] = useState(8);
    const wallIdCounter = useRef(1);
    const [bgReady, setBgReady] = useState(false);

    // wall openings
    const [openings, setOpenings] = useState<WallOpening[]>([]);
    const openingIdCounter = useRef(1);

    // symbols
    const [symbols, setSymbols] = useState<FloorSymbol[]>([]);
    const symbolIdCounter = useRef(1);
    const [symbolsExpanded, setSymbolsExpanded] = useState<string | null>(null);
    const [selectedSymbolDef, setSelectedSymbolDef] = useState<string | null>(null);

    // text annotations
    const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
    const annotationIdCounter = useRef(1);

    // selected wall for editing / openings
    const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

    // status bar
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [selectedInfo, setSelectedInfo] = useState<string>("");
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

    // polygon drawing state
    const polyPoints = useRef<{ x: number; y: number }[]>([]);
    const polyPreviewLines = useRef<FabricObject[]>([]);
    const polyDots = useRef<FabricObject[]>([]);

    // wall drawing state
    const wallStart = useRef<{ x: number; y: number } | null>(null);
    const wallPreviewLine = useRef<FabricObject | null>(null);
    const gridLinesRef = useRef<FabricObject[]>([]);

    // pan state
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });

    // undo/redo
    const undoStack = useRef<TracedRoom[][]>([]);
    const redoStack = useRef<TracedRoom[][]>([]);

    // room ID counter
    const idCounter = useRef(1);

    // floating panel drag position
    const [panelPos, setPanelPos] = useState({ x: 12, y: 12 });
    const panelDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

    /* ── Lazy-load Fabric.js ────────────────────────────────── */
    useEffect(() => {
      let cancelled = false;
      import("fabric").then((mod) => {
        if (cancelled) return;
        fabricRef.current = mod;
        setLoaded(true);
      });
      return () => { cancelled = true; };
    }, []);

    /* ── Init canvas ────────────────────────────────────────── */
    useEffect(() => {
      if (!loaded || !wrapperRef.current || !fabricRef.current) return;
      const wrapper = wrapperRef.current;
      const fabric = fabricRef.current;

      const canvasEl = document.createElement("canvas");
      wrapper.appendChild(canvasEl);

      const fc = new fabric.Canvas(canvasEl, {
        width: wrapper.clientWidth,
        height: wrapper.clientHeight,
        selection: false,
        preserveObjectStacking: true,
        backgroundColor: "#1a1a1a",
      });

      // load floor plan as background
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const fabricImg = new fabric.FabricImage(img);
        // Scale image to fit canvas
        const scaleX = fc.width! / imageWidth;
        const scaleY = fc.height! / imageHeight;
        const scale = Math.min(scaleX, scaleY);
        fabricImg.set({
          scaleX: scale,
          scaleY: scale,
          left: (fc.width! - imageWidth * scale) / 2,
          top: (fc.height! - imageHeight * scale) / 2,
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
          lockMovementX: true,
          lockMovementY: true,
        });
        // Store as custom property for coordinate transforms
        (fc as unknown as Record<string, unknown>)._bgImg = fabricImg;
        (fc as unknown as Record<string, unknown>)._bgScale = scale;
        (fc as unknown as Record<string, unknown>)._bgOffsetX = (fc.width! - imageWidth * scale) / 2;
        (fc as unknown as Record<string, unknown>)._bgOffsetY = (fc.height! - imageHeight * scale) / 2;
        fc.add(fabricImg);
        fc.sendObjectToBack(fabricImg);
        fc.renderAll();
        setBgReady(true);
      };
      img.src = imageUrl;

      fcRef.current = fc;

      // Handle resize
      const observer = new ResizeObserver(() => {
        if (!wrapper || !fc) return;
        fc.setDimensions({ width: wrapper.clientWidth, height: wrapper.clientHeight });
        fc.renderAll();
      });
      observer.observe(wrapper);

      return () => {
        observer.disconnect();
        fc.dispose();
        fcRef.current = null;
        while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, imageUrl]);

    /* ── Zoom / Pan via mouse wheel and middle-click ────────── */
    useEffect(() => {
      const fc = fcRef.current;
      if (!fc || !loaded) return;

      const onWheel = (opt: { e: WheelEvent }) => {
        const e = opt.e;
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY;
        let newZoom = fc.getZoom() * (1 - delta / 400);
        newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));

        // Zoom to cursor position
        const fabric = fabricRef.current!;
        const point = new fabric.Point(e.offsetX, e.offsetY);
        fc.zoomToPoint(point, newZoom);
        setZoomLevel(newZoom);
        fc.renderAll();
      };

      fc.on("mouse:wheel", onWheel as never);
      return () => { fc.off("mouse:wheel", onWheel as never); };
    }, [loaded]);

    /* ── Pan via middle-click drag or Alt+drag or pan tool ──── */
    useEffect(() => {
      const fc = fcRef.current;
      if (!fc || !loaded) return;

      const onDown = (opt: { e: MouseEvent; viewportPoint?: { x: number; y: number } }) => {
        const e = opt.e;
        // Middle-click, Alt+click, or pan tool
        if (e.button === 1 || (e.altKey && e.button === 0) || (tool === "pan" && e.button === 0)) {
          isPanning.current = true;
          panStart.current = { x: e.clientX, y: e.clientY };
          fc.selection = false;
          e.preventDefault();
        }
      };

      const onMove = (opt: { e: MouseEvent }) => {
        if (!isPanning.current) return;
        const e = opt.e;
        const vpt = fc.viewportTransform!;
        vpt[4] += e.clientX - panStart.current.x;
        vpt[5] += e.clientY - panStart.current.y;
        panStart.current = { x: e.clientX, y: e.clientY };
        fc.setViewportTransform(vpt);
        fc.renderAll();
      };

      const onUp = () => {
        isPanning.current = false;
      };

      fc.on("mouse:down", onDown as never);
      fc.on("mouse:move", onMove as never);
      fc.on("mouse:up", onUp as never);

      return () => {
        fc.off("mouse:down", onDown as never);
        fc.off("mouse:move", onMove as never);
        fc.off("mouse:up", onUp as never);
      };
    }, [loaded, tool]);

    /* ── Zoom helpers ────────────────────────────────────────── */
    const zoomIn = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      let z = fc.getZoom() * 1.3;
      z = Math.min(MAX_ZOOM, z);
      const fabric = fabricRef.current!;
      const center = new fabric.Point(fc.width! / 2, fc.height! / 2);
      fc.zoomToPoint(center, z);
      setZoomLevel(z);
      fc.renderAll();
    }, []);

    const zoomOut = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      let z = fc.getZoom() / 1.3;
      z = Math.max(MIN_ZOOM, z);
      const fabric = fabricRef.current!;
      const center = new fabric.Point(fc.width! / 2, fc.height! / 2);
      fc.zoomToPoint(center, z);
      setZoomLevel(z);
      fc.renderAll();
    }, []);

    const zoomFit = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      fc.setViewportTransform([1, 0, 0, 1, 0, 0]);
      setZoomLevel(1);
      fc.renderAll();
    }, []);

    /* ── Coordinate helpers ──────────────────────────────────── */
    /** Screen pixel → canvas-space (undo viewport transform) */
    const screenToCanvas = useCallback((sx: number, sy: number): { x: number; y: number } => {
      const fc = fcRef.current;
      if (!fc) return { x: sx, y: sy };
      const vt = fc.viewportTransform!;
      return {
        x: (sx - vt[4]) / vt[0],
        y: (sy - vt[5]) / vt[3],
      };
    }, []);

    /** Canvas-space pixel → image pixel */
    const canvasToImage = useCallback((cx: number, cy: number): [number, number] => {
      const fc = fcRef.current;
      if (!fc) return [cx, cy];
      const scale = (fc as unknown as Record<string, unknown>)._bgScale as number || 1;
      const offX = (fc as unknown as Record<string, unknown>)._bgOffsetX as number || 0;
      const offY = (fc as unknown as Record<string, unknown>)._bgOffsetY as number || 0;
      return [
        Math.round((cx - offX) / scale),
        Math.round((cy - offY) / scale),
      ];
    }, []);

    /** Image pixel → canvas-space pixel */
    const imageToCanvas = useCallback((ix: number, iy: number): { x: number; y: number } => {
      const fc = fcRef.current;
      if (!fc) return { x: ix, y: iy };
      const scale = (fc as unknown as Record<string, unknown>)._bgScale as number || 1;
      const offX = (fc as unknown as Record<string, unknown>)._bgOffsetX as number || 0;
      const offY = (fc as unknown as Record<string, unknown>)._bgOffsetY as number || 0;
      return { x: ix * scale + offX, y: iy * scale + offY };
    }, []);

    /** Snap a canvas-space point to the nearest grid intersection */
    const snapPoint = useCallback((cx: number, cy: number): { x: number; y: number } => {
      if (!snapEnabled) return { x: cx, y: cy };
      const gridSizePx = gridSpacingM * pxPerMeter;
      if (gridSizePx < 5) return { x: cx, y: cy };
      const [ix, iy] = canvasToImage(cx, cy);
      const snappedIx = Math.round(ix / gridSizePx) * gridSizePx;
      const snappedIy = Math.round(iy / gridSizePx) * gridSizePx;
      return imageToCanvas(snappedIx, snappedIy);
    }, [snapEnabled, gridSpacingM, pxPerMeter, canvasToImage, imageToCanvas]);

    /** Image-pixel distance → meters */
    const pxToMeters = useCallback((px: number): number => {
      return px / pxPerMeter;
    }, [pxPerMeter]);

    /* ── Push undo state ─────────────────────────────────────── */
    const pushUndo = useCallback((prev: TracedRoom[]) => {
      undoStack.current.push(JSON.parse(JSON.stringify(prev)));
      redoStack.current = [];
    }, []);

    /* ── Draw room polygons onto Fabric canvas ───────────────── */
    const renderRoomsOnCanvas = useCallback((roomList: TracedRoom[]) => {
      const fc = fcRef.current;
      const fabric = fabricRef.current;
      if (!fc || !fabric) return;

      // Remove all room polygons (keep background image)
      const toRemove = fc.getObjects().filter((o) =>
        (o as FabricObject & { _roomId?: string })._roomId,
      );
      toRemove.forEach((o) => fc.remove(o));

      for (const room of roomList) {
        const color = room.color || ROOM_TYPE_COLORS[room.type] || "#3b82f6";
        const canvasPoints = room.polygon.map(([ix, iy]) => imageToCanvas(ix, iy));

        const poly = new fabric.Polygon(
          canvasPoints.map((p) => ({ x: p.x, y: p.y })),
          {
            fill: color + Math.round(opacity * 255).toString(16).padStart(2, "0"),
            stroke: color,
            strokeWidth: 2,
            selectable: tool === "select",
            evented: true,
            hasControls: false,
            hasBorders: true,
            lockMovementX: true,
            lockMovementY: true,
          },
        );
        (poly as FabricObject & { _roomId?: string })._roomId = room.id;

        fc.add(poly);

        // center label
        const bounds = poly.getBoundingRect();
        const label = new fabric.Text(room.label || "…", {
          left: bounds.left + bounds.width / 2,
          top: bounds.top + bounds.height / 2,
          fontSize: 11,
          fill: "#fff",
          fontFamily: "Inter, sans-serif",
          textAlign: "center",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.8)", blur: 4, offsetX: 0, offsetY: 1 }),
        });
        (label as FabricObject & { _roomId?: string; _isLabel?: boolean })._roomId = room.id;
        (label as FabricObject & { _isLabel?: boolean })._isLabel = true;
        fc.add(label);
      }

      fc.renderAll();
    }, [imageToCanvas, tool, opacity]);

    /* ── Re-render when rooms/opacity/tool change ────────────── */
    useEffect(() => {
      renderRoomsOnCanvas(rooms);
    }, [rooms, renderRoomsOnCanvas]);

    /* ── Grid overlay ────────────────────────────────────────── */
    useEffect(() => {
      const fc = fcRef.current;
      const fabric = fabricRef.current;
      if (!fc || !fabric || !loaded || !bgReady) return;

      gridLinesRef.current.forEach((l) => fc.remove(l));
      gridLinesRef.current = [];

      if (!showGrid) { fc.renderAll(); return; }

      const bgScale = (fc as unknown as Record<string, unknown>)._bgScale as number;
      const bgOffX = (fc as unknown as Record<string, unknown>)._bgOffsetX as number || 0;
      const bgOffY = (fc as unknown as Record<string, unknown>)._bgOffsetY as number || 0;
      if (!bgScale) return;

      const gridSizePx = gridSpacingM * pxPerMeter;
      if (gridSizePx < 5) return;

      const lines: FabricObject[] = [];
      const gridProps = {
        stroke: "rgba(100,149,237,0.2)",
        strokeWidth: 1,
        selectable: false,
        evented: false,
      };

      for (let ix = 0; ix <= imageWidth; ix += gridSizePx) {
        const cx = ix * bgScale + bgOffX;
        const l = new fabric.Line([cx, bgOffY, cx, imageHeight * bgScale + bgOffY], gridProps);
        (l as FabricObject & { _isGrid?: boolean })._isGrid = true;
        lines.push(l);
      }

      for (let iy = 0; iy <= imageHeight; iy += gridSizePx) {
        const cy = iy * bgScale + bgOffY;
        const l = new fabric.Line([bgOffX, cy, imageWidth * bgScale + bgOffX, cy], gridProps);
        (l as FabricObject & { _isGrid?: boolean })._isGrid = true;
        lines.push(l);
      }

      lines.forEach((l) => fc.add(l));
      gridLinesRef.current = lines;
      fc.renderAll();
    }, [showGrid, gridSpacingM, pxPerMeter, loaded, bgReady, imageWidth, imageHeight]);

    /* ── Render walls + dimension labels ──────────────────────── */
    const renderWallsOnCanvas = useCallback((wallList: WallSegment[]) => {
      const fc = fcRef.current;
      const fabric = fabricRef.current;
      if (!fc || !fabric) return;

      fc.getObjects().filter((o) =>
        (o as FabricObject & { _wallId?: string })._wallId,
      ).forEach((o) => fc.remove(o));

      const bgScale = (fc as unknown as Record<string, unknown>)._bgScale as number || 1;

      for (const wall of wallList) {
        const s = imageToCanvas(wall.start[0], wall.start[1]);
        const e = imageToCanvas(wall.end[0], wall.end[1]);
        const line = new fabric.Line([s.x, s.y, e.x, e.y], {
          stroke: "#1e293b",
          strokeWidth: Math.max(wall.thickness * bgScale, 2),
          strokeLineCap: "round",
          selectable: tool === "select",
          evented: true,
          hasControls: false,
          lockMovementX: true,
          lockMovementY: true,
        });
        (line as FabricObject & { _wallId?: string })._wallId = wall.id;
        fc.add(line);

        // Dimension label at midpoint
        const dx = wall.end[0] - wall.start[0];
        const dy = wall.end[1] - wall.start[1];
        const lengthM = pxToMeters(Math.sqrt(dx * dx + dy * dy));
        if (lengthM >= 0.1) {
          const mx = (s.x + e.x) / 2;
          const my = (s.y + e.y) / 2;
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const labelAngle = angle > 90 || angle < -90 ? angle + 180 : angle;
          const label = new fabric.Text(`${lengthM.toFixed(1)}m`, {
            left: mx,
            top: my - 6 * bgScale,
            fontSize: 10,
            fill: "#475569",
            fontFamily: "Inter, monospace",
            originX: "center",
            originY: "bottom",
            angle: labelAngle,
            selectable: false,
            evented: false,
            shadow: new fabric.Shadow({ color: "rgba(255,255,255,0.95)", blur: 3, offsetX: 0, offsetY: 0 }),
          });
          (label as FabricObject & { _wallId?: string })._wallId = wall.id;
          fc.add(label);
        }
      }
      fc.renderAll();
    }, [imageToCanvas, tool, pxToMeters]);

    useEffect(() => {
      renderWallsOnCanvas(walls);
    }, [walls, renderWallsOnCanvas]);

    /* ── Render wall openings ──────────────────────────────── */
    useEffect(() => {
      const fc = fcRef.current;
      const fabric = fabricRef.current;
      if (!fc || !fabric) return;

      // Remove old opening objects
      fc.getObjects().filter((o) =>
        (o as FabricObject & { _openingId?: string })._openingId,
      ).forEach((o) => fc.remove(o));

      const bgScale = (fc as unknown as Record<string, unknown>)._bgScale as number || 1;

      for (const op of openings) {
        const wall = walls.find((w) => w.id === op.wallId);
        if (!wall) continue;
        const s = imageToCanvas(wall.start[0], wall.start[1]);
        const e = imageToCanvas(wall.end[0], wall.end[1]);
        const mx = s.x + (e.x - s.x) * op.position;
        const my = s.y + (e.y - s.y) * op.position;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const wLen = Math.hypot(dx, dy);
        const nx = dx / (wLen || 1);
        const ny = dy / (wLen || 1);
        const halfW = (op.width * bgScale) / 2;

        // White gap to "cut" the wall
        const gap = new fabric.Line(
          [mx - nx * halfW, my - ny * halfW, mx + nx * halfW, my + ny * halfW],
          { stroke: "#ffffff", strokeWidth: Math.max(wall.thickness * bgScale + 2, 4), selectable: false, evented: false },
        );
        (gap as FabricObject & { _openingId?: string })._openingId = op.id;
        fc.add(gap);

        if (op.type === "door") {
          // Door arc (quarter circle swing)
          const arcRadius = halfW;
          const angle = Math.atan2(ny, nx);
          const arcPath = `M ${mx - nx * halfW} ${my - ny * halfW}
            A ${arcRadius} ${arcRadius} 0 0 1 ${mx - nx * halfW + arcRadius * Math.cos(angle + Math.PI / 2)} ${my - ny * halfW + arcRadius * Math.sin(angle + Math.PI / 2)}`;
          const arc = new fabric.Path(arcPath, {
            stroke: "#1e293b", strokeWidth: 1.5, fill: "transparent",
            selectable: false, evented: false,
          });
          (arc as FabricObject & { _openingId?: string })._openingId = op.id;
          fc.add(arc);
        } else if (op.type === "window") {
          // Window marks (two short perpendicular lines)
          const perpX = -ny;
          const perpY = nx;
          const markLen = 4 * bgScale;
          for (const sign of [-1, 1]) {
            const px = mx + sign * nx * halfW * 0.5;
            const py = my + sign * ny * halfW * 0.5;
            const wMark = new fabric.Line(
              [px - perpX * markLen, py - perpY * markLen, px + perpX * markLen, py + perpY * markLen],
              { stroke: "#3b82f6", strokeWidth: 2, selectable: false, evented: false },
            );
            (wMark as FabricObject & { _openingId?: string })._openingId = op.id;
            fc.add(wMark);
          }
        }
      }
      fc.renderAll();
    }, [openings, walls, imageToCanvas]);

    /* ── Render symbols on canvas ──────────────────────────── */
    useEffect(() => {
      const fc = fcRef.current;
      const fabric = fabricRef.current;
      if (!fc || !fabric) return;

      fc.getObjects().filter((o) =>
        (o as FabricObject & { _symbolId?: string })._symbolId,
      ).forEach((o) => fc.remove(o));

      const bgScale = (fc as unknown as Record<string, unknown>)._bgScale as number || 1;

      for (const sym of symbols) {
        const def = SYMBOL_LIBRARY.find((d) => d.id === sym.type);
        if (!def) continue;
        const pos = imageToCanvas(sym.position[0], sym.position[1]);
        const scale = sym.scale * bgScale * 0.8;
        const path = new fabric.Path(def.path, {
          left: pos.x,
          top: pos.y,
          originX: "center",
          originY: "center",
          scaleX: scale,
          scaleY: scale,
          angle: sym.rotation,
          fill: "#1e293b",
          stroke: "#1e293b",
          strokeWidth: 0.5,
          selectable: tool === "select",
          evented: true,
          hasControls: false,
        });
        (path as FabricObject & { _symbolId?: string })._symbolId = sym.id;
        fc.add(path);

        // Label below symbol
        if (sym.label) {
          const lbl = new fabric.Text(sym.label, {
            left: pos.x, top: pos.y + 20 * scale,
            fontSize: 9, fill: "#64748b", fontFamily: "Inter, sans-serif",
            originX: "center", originY: "top",
            selectable: false, evented: false,
          });
          (lbl as FabricObject & { _symbolId?: string })._symbolId = sym.id;
          fc.add(lbl);
        }
      }
      fc.renderAll();
    }, [symbols, imageToCanvas, tool]);

    /* ── Render text annotations on canvas ─────────────────── */
    useEffect(() => {
      const fc = fcRef.current;
      const fabric = fabricRef.current;
      if (!fc || !fabric) return;

      fc.getObjects().filter((o) =>
        (o as FabricObject & { _annotId?: string })._annotId,
      ).forEach((o) => fc.remove(o));

      for (const ann of annotations) {
        const pos = imageToCanvas(ann.position[0], ann.position[1]);
        const txt = new fabric.Text(ann.text, {
          left: pos.x, top: pos.y,
          fontSize: ann.fontSize, fill: ann.color,
          fontFamily: "Inter, sans-serif",
          selectable: tool === "select",
          evented: true,
          hasControls: false,
        });
        (txt as FabricObject & { _annotId?: string })._annotId = ann.id;
        fc.add(txt);
      }
      fc.renderAll();
    }, [annotations, imageToCanvas, tool]);

    /* ── Object selection → select room ──────────────────────── */
    useEffect(() => {
      const fc = fcRef.current;
      if (!fc) return;

      const onSelect = () => {
        const active = fc.getActiveObject();
        if (!active) return;
        const roomId = (active as FabricObject & { _roomId?: string })._roomId;
        if (roomId) {
          setSelectedRoomId(roomId);
          const room = rooms.find((r) => r.id === roomId);
          if (room) {
            setEditLabel(room.label);
            setEditType(room.type);
            setEditNotes(room.notes || "");
            setEditHeight(room.wallHeight ?? 3);
            setEditFloor(room.floor ?? 1);
          }
        }
      };

      const onDeselect = () => {
        if (tool === "select") setSelectedRoomId(null);
      };

      fc.on("selection:created", onSelect as never);
      fc.on("selection:updated", onSelect as never);
      fc.on("selection:cleared", onDeselect as never);

      return () => {
        fc.off("selection:created", onSelect as never);
        fc.off("selection:updated", onSelect as never);
        fc.off("selection:cleared", onDeselect as never);
      };
    }, [loaded, rooms, tool]);

    /* ── Clear polygon drawing state ─────────────────────────── */
    const clearPolyState = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      polyPreviewLines.current.forEach((l) => fc.remove(l));
      polyDots.current.forEach((d) => fc.remove(d));
      polyPreviewLines.current = [];
      polyDots.current = [];
      polyPoints.current = [];
      fc.renderAll();
    }, []);

    const clearWallState = useCallback(() => {
      const fc = fcRef.current;
      if (!fc) return;
      wallStart.current = null;
      if (wallPreviewLine.current) {
        fc.remove(wallPreviewLine.current);
        wallPreviewLine.current = null;
      }
      fc.renderAll();
    }, []);

    /* ── Finish polygon → create room ────────────────────────── */
    const finishPolygon = useCallback(() => {
      const pts = polyPoints.current;
      if (pts.length < 3) {
        clearPolyState();
        return;
      }

      const imgPts: [number, number][] = pts.map((p) => canvasToImage(p.x, p.y));
      const newId = `room-${idCounter.current++}`;
      const color = ROOM_TYPE_COLORS[roomType];

      const newRoom: TracedRoom = {
        id: newId,
        label: `Room ${idCounter.current - 1}`,
        type: roomType,
        polygon: imgPts,
        wallHeight: 3,
        floor: 1,
        color,
      };

      pushUndo(rooms);
      setRooms((prev) => [...prev, newRoom]);
      setSelectedRoomId(newId);
      setEditLabel(newRoom.label);
      setEditType(newRoom.type);
      setEditNotes("");
      setEditHeight(3);
      setEditFloor(1);
      clearPolyState();
    }, [canvasToImage, clearPolyState, pushUndo, roomType, rooms]);

    /* ── Mouse handlers for polygon / rectangle drawing ───────── */
    useEffect(() => {
      const fc = fcRef.current;
      const fabric = fabricRef.current;
      if (!fc || !fabric || !loaded) return;

      if (tool === "select" || tool === "pan") return;

      const color = ROOM_TYPE_COLORS[roomType];

      // Rectangle drawing state
      let rectStart: { x: number; y: number } | null = null;
      let tempRect: FabricObject | null = null;

      const onMouseDown = (opt: { e: MouseEvent; viewportPoint?: { x: number; y: number } }) => {
        // Skip if alt-panning
        if (opt.e.altKey || opt.e.button === 1) return;
        if (!opt.viewportPoint) return;
        // Convert screen point → canvas-space point (accounts for zoom/pan)
        let { x, y } = screenToCanvas(opt.viewportPoint.x, opt.viewportPoint.y);
        // Snap to grid
        const snapped = snapPoint(x, y);
        x = snapped.x; y = snapped.y;

        if (tool === "polygon") {
          polyPoints.current.push({ x, y });

          // draw dot
          const dot = new fabric.Circle({
            left: x - 4,
            top: y - 4,
            radius: 4,
            fill: color,
            stroke: "#fff",
            strokeWidth: 1,
            selectable: false,
            evented: false,
          });
          fc.add(dot);
          polyDots.current.push(dot);

          // draw line from previous point
          if (polyPoints.current.length > 1) {
            const prev = polyPoints.current[polyPoints.current.length - 2];
            const line = new fabric.Line([prev.x, prev.y, x, y], {
              stroke: color,
              strokeWidth: 2,
              strokeDashArray: [6, 3],
              selectable: false,
              evented: false,
            });
            fc.add(line);
            polyPreviewLines.current.push(line);
          }
          fc.renderAll();
        } else if (tool === "rectangle") {
          rectStart = { x, y };
        } else if (tool === "wall") {
          if (!wallStart.current) {
            wallStart.current = { x, y };
          } else {
            const newWall: WallSegment = {
              id: `wall-${wallIdCounter.current++}`,
              start: canvasToImage(wallStart.current.x, wallStart.current.y),
              end: canvasToImage(x, y),
              thickness: wallThickness,
            };
            setWalls((prev) => [...prev, newWall]);
            wallStart.current = { x, y };
            if (wallPreviewLine.current) {
              fc.remove(wallPreviewLine.current);
              wallPreviewLine.current = null;
            }
          }
        } else if (tool === "opening") {
          // Find the closest wall and add an opening at the click position
          const [imgX, imgY] = canvasToImage(x, y);
          let closestWallId: string | null = null;
          let closestDist = Infinity;
          let closestT = 0.5;
          for (const w of walls) {
            const dx = w.end[0] - w.start[0];
            const dy = w.end[1] - w.start[1];
            const len2 = dx * dx + dy * dy;
            if (len2 === 0) continue;
            const t = Math.max(0, Math.min(1, ((imgX - w.start[0]) * dx + (imgY - w.start[1]) * dy) / len2));
            const px = w.start[0] + t * dx;
            const py = w.start[1] + t * dy;
            const dist = Math.hypot(imgX - px, imgY - py);
            if (dist < closestDist) {
              closestDist = dist;
              closestWallId = w.id;
              closestT = t;
            }
          }
          if (closestWallId && closestDist < 50) {
            const newOpening: WallOpening = {
              id: `opening-${openingIdCounter.current++}`,
              wallId: closestWallId,
              position: closestT,
              width: pxPerMeter * 0.9, // ~0.9m default door width
              type: "door",
            };
            setOpenings((prev) => [...prev, newOpening]);
          }
        } else if (tool === "text") {
          const text = prompt("Enter text:");
          if (text) {
            const [imgX, imgY] = canvasToImage(x, y);
            const newAnnotation: TextAnnotation = {
              id: `text-${annotationIdCounter.current++}`,
              text,
              position: [imgX, imgY],
              fontSize: 14,
              color: "#1e293b",
            };
            setAnnotations((prev) => [...prev, newAnnotation]);
          }
        } else if (tool === "circle" || tool === "line") {
          // handled in mouseUp for drag-based tools
          rectStart = { x, y };
        } else if (selectedSymbolDef) {
          // Place symbol at click position
          const [imgX, imgY] = canvasToImage(x, y);
          const def = SYMBOL_LIBRARY.find((s) => s.id === selectedSymbolDef);
          if (def) {
            const newSymbol: FloorSymbol = {
              id: `sym-${symbolIdCounter.current++}`,
              type: def.id,
              category: def.category,
              position: [imgX, imgY],
              rotation: 0,
              scale: 1,
              label: def.label,
            };
            setSymbols((prev) => [...prev, newSymbol]);
          }
        }
      };

      const onMouseMove = (opt: { e: MouseEvent; viewportPoint?: { x: number; y: number } }) => {
        if (!opt.viewportPoint) return;
        // Track cursor position for status bar
        const cp = screenToCanvas(opt.viewportPoint.x, opt.viewportPoint.y);
        const [curImgX, curImgY] = canvasToImage(cp.x, cp.y);
        setCursorPos({ x: +(curImgX / pxPerMeter).toFixed(2), y: +(curImgY / pxPerMeter).toFixed(2) });

        // Wall preview
        if (tool === "wall" && wallStart.current) {
          let { x, y } = screenToCanvas(opt.viewportPoint.x, opt.viewportPoint.y);
          const ws = snapPoint(x, y);
          x = ws.x; y = ws.y;
          if (wallPreviewLine.current) fc.remove(wallPreviewLine.current);
          wallPreviewLine.current = new fabric.Line(
            [wallStart.current.x, wallStart.current.y, x, y],
            { stroke: "#1e293b", strokeWidth: 3, strokeDashArray: [8, 4], selectable: false, evented: false },
          );
          fc.add(wallPreviewLine.current);
          fc.renderAll();
          return;
        }

        // Line / circle preview
        if ((tool === "line" || tool === "circle") && rectStart) {
          const { x, y } = screenToCanvas(opt.viewportPoint.x, opt.viewportPoint.y);
          if (tempRect) { fc.remove(tempRect); tempRect = null; }
          if (tool === "line") {
            tempRect = new fabric.Line(
              [rectStart.x, rectStart.y, x, y],
              { stroke: "#475569", strokeWidth: 2, strokeDashArray: [6, 3], selectable: false, evented: false },
            ) as unknown as FabricObject;
          } else {
            const cx = (rectStart.x + x) / 2;
            const cy = (rectStart.y + y) / 2;
            const rx = Math.abs(x - rectStart.x) / 2;
            const ry = Math.abs(y - rectStart.y) / 2;
            tempRect = new fabric.Ellipse({
              left: cx - rx, top: cy - ry, rx, ry,
              fill: color + "4d", stroke: color, strokeWidth: 2,
              strokeDashArray: [6, 3], selectable: false, evented: false,
            }) as unknown as FabricObject;
          }
          fc.add(tempRect);
          fc.renderAll();
          return;
        }

        if (tool !== "rectangle" || !rectStart) return;
        const { x, y } = screenToCanvas(opt.viewportPoint.x, opt.viewportPoint.y);

        if (tempRect) fc.remove(tempRect);
        tempRect = new fabric.Rect({
          left: Math.min(rectStart.x, x),
          top: Math.min(rectStart.y, y),
          width: Math.abs(x - rectStart.x),
          height: Math.abs(y - rectStart.y),
          fill: color + "4d",
          stroke: color,
          strokeWidth: 2,
          strokeDashArray: [6, 3],
          selectable: false,
          evented: false,
        });
        fc.add(tempRect);
        fc.renderAll();
      };

      const onMouseUp = (opt: { e: MouseEvent; viewportPoint?: { x: number; y: number } }) => {
        if (!opt.viewportPoint) return;

        // Line tool – commit the drawn line as a wall (thickness 2, aesthetic)
        if (tool === "line" && rectStart) {
          let { x, y } = screenToCanvas(opt.viewportPoint.x, opt.viewportPoint.y);
          const sn = snapPoint(x, y); x = sn.x; y = sn.y;
          if (tempRect) fc.remove(tempRect);
          tempRect = null;
          const dist = Math.hypot(x - rectStart.x, y - rectStart.y);
          if (dist >= 10) {
            const newWall: WallSegment = {
              id: `wall-${wallIdCounter.current++}`,
              start: canvasToImage(rectStart.x, rectStart.y),
              end: canvasToImage(x, y),
              thickness: 2,
            };
            setWalls((prev) => [...prev, newWall]);
          }
          rectStart = null;
          return;
        }

        // Circle tool – commit as a room-like polygon (circular approximation)
        if (tool === "circle" && rectStart) {
          let { x, y } = screenToCanvas(opt.viewportPoint.x, opt.viewportPoint.y);
          const sn = snapPoint(x, y); x = sn.x; y = sn.y;
          if (tempRect) fc.remove(tempRect);
          tempRect = null;
          const cx = (rectStart.x + x) / 2;
          const cy = (rectStart.y + y) / 2;
          const rx = Math.abs(x - rectStart.x) / 2;
          const ry = Math.abs(y - rectStart.y) / 2;
          if (rx < 5 || ry < 5) { rectStart = null; return; }
          const segs = 24;
          const pts: [number, number][] = [];
          for (let i = 0; i < segs; i++) {
            const a = (2 * Math.PI * i) / segs;
            pts.push(canvasToImage(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
          }
          const newId = `room-${idCounter.current++}`;
          pushUndo(rooms);
          setRooms((prev) => [...prev, {
            id: newId, label: `Room ${idCounter.current - 1}`, type: roomType,
            polygon: pts, wallHeight: 3, floor: 1, color,
          }]);
          setSelectedRoomId(newId);
          rectStart = null;
          return;
        }

        if (tool !== "rectangle" || !rectStart) return;
        let { x, y } = screenToCanvas(opt.viewportPoint.x, opt.viewportPoint.y);
        const sn = snapPoint(x, y); x = sn.x; y = sn.y;
        if (tempRect) fc.remove(tempRect);
        tempRect = null;

        const w = Math.abs(x - rectStart.x);
        const h = Math.abs(y - rectStart.y);
        if (w < 10 || h < 10) { rectStart = null; return; }

        const l = Math.min(rectStart.x, x);
        const t = Math.min(rectStart.y, y);
        const pts: { x: number; y: number }[] = [
          { x: l, y: t },
          { x: l + w, y: t },
          { x: l + w, y: t + h },
          { x: l, y: t + h },
        ];
        const imgPts: [number, number][] = pts.map((p) => canvasToImage(p.x, p.y));

        const newId = `room-${idCounter.current++}`;
        const newRoom: TracedRoom = {
          id: newId,
          label: `Room ${idCounter.current - 1}`,
          type: roomType,
          polygon: imgPts,
          wallHeight: 3,
          floor: 1,
          color,
        };

        pushUndo(rooms);
        setRooms((prev) => [...prev, newRoom]);
        setSelectedRoomId(newId);
        setEditLabel(newRoom.label);
        setEditType(newRoom.type);
        setEditNotes("");
        setEditHeight(3);
        setEditFloor(1);
        rectStart = null;
      };

      // Double-click to finish polygon or end wall chain
      const onDblClick = () => {
        if (tool === "polygon" && polyPoints.current.length >= 3) {
          finishPolygon();
        }
        if (tool === "wall") {
          wallStart.current = null;
          if (wallPreviewLine.current) {
            fc.remove(wallPreviewLine.current);
            wallPreviewLine.current = null;
          }
          fc.renderAll();
        }
      };

      fc.on("mouse:down", onMouseDown as never);
      fc.on("mouse:move", onMouseMove as never);
      fc.on("mouse:up", onMouseUp as never);
      fc.on("mouse:dblclick", onDblClick as never);

      return () => {
        fc.off("mouse:down", onMouseDown as never);
        fc.off("mouse:move", onMouseMove as never);
        fc.off("mouse:up", onMouseUp as never);
        fc.off("mouse:dblclick", onDblClick as never);
      };
    }, [loaded, tool, roomType, rooms, walls, canvasToImage, screenToCanvas, finishPolygon, clearPolyState, pushUndo, snapPoint, wallThickness, pxPerMeter, selectedSymbolDef]);

    /* ── Keyboard shortcuts ──────────────────────────────────── */
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          clearPolyState();
          clearWallState();
          setTool("select");
        }
        if (e.key === "Enter" && tool === "polygon" && polyPoints.current.length >= 3) {
          finishPolygon();
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          if (selectedRoomId && tool === "select" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            pushUndo(rooms);
            setRooms((prev) => prev.filter((r) => r.id !== selectedRoomId));
            setSelectedRoomId(null);
          }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
          e.preventDefault();
          if (undoStack.current.length > 0) {
            redoStack.current.push(JSON.parse(JSON.stringify(rooms)));
            setRooms(undoStack.current.pop()!);
          }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "y") {
          e.preventDefault();
          if (redoStack.current.length > 0) {
            undoStack.current.push(JSON.parse(JSON.stringify(rooms)));
            setRooms(redoStack.current.pop()!);
          }
        }
        // Zoom shortcuts
        if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
          e.preventDefault();
          zoomIn();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "-") {
          e.preventDefault();
          zoomOut();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "0") {
          e.preventDefault();
          zoomFit();
        }
      };

      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [tool, selectedRoomId, rooms, finishPolygon, clearPolyState, clearWallState, pushUndo, zoomIn, zoomOut, zoomFit]);

    /* ── Update room metadata ────────────────────────────────── */
    const updateSelectedRoom = useCallback(() => {
      if (!selectedRoomId) return;
      pushUndo(rooms);
      setRooms((prev) =>
        prev.map((r) =>
          r.id === selectedRoomId
            ? {
                ...r,
                label: editLabel,
                type: editType,
                notes: editNotes,
                wallHeight: editHeight,
                floor: editFloor,
                color: ROOM_TYPE_COLORS[editType],
              }
            : r,
        ),
      );
    }, [selectedRoomId, editLabel, editType, editNotes, editHeight, editFloor, pushUndo, rooms]);

    /* ── Export SVG ───────────────────────────────────────────── */
    const exportSVG = useCallback((): string => {
      const svgParts: string[] = [];
      svgParts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${imageWidth} ${imageHeight}" width="${imageWidth}" height="${imageHeight}">`,
      );
      svgParts.push(`  <defs>
    <style>
      .room-zone { cursor: pointer; transition: opacity 0.2s; }
      .room-zone:hover { opacity: 0.8; }
      .room-label { font-family: Inter, Arial, sans-serif; font-size: 14px; fill: #fff; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
    </style>
  </defs>`);

      svgParts.push(`  <image href="${imageUrl}" width="${imageWidth}" height="${imageHeight}" opacity="0.3" />`);

      for (const room of rooms) {
        const color = room.color || ROOM_TYPE_COLORS[room.type];
        const points = room.polygon.map(([x, y]) => `${x},${y}`).join(" ");

        const cx = room.polygon.reduce((s, [x]) => s + x, 0) / room.polygon.length;
        const cy = room.polygon.reduce((s, [, y]) => s + y, 0) / room.polygon.length;

        svgParts.push(`  <g id="${room.id}" data-type="${room.type}" data-floor="${room.floor ?? 1}" data-height="${room.wallHeight ?? 3}">`);
        svgParts.push(`    <polygon class="room-zone" points="${points}" fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="2" />`);
        svgParts.push(`    <text class="room-label" x="${Math.round(cx)}" y="${Math.round(cy)}">${escapeXml(room.label)}</text>`);
        if (room.notes) {
          svgParts.push(`    <!-- notes: ${escapeXml(room.notes)} -->`);
        }
        svgParts.push(`  </g>`);
      }

      svgParts.push(`</svg>`);
      return svgParts.join("\n");
    }, [rooms, imageWidth, imageHeight, imageUrl]);

    /* ── Export rooms as JSON ─────────────────────────────────── */
    const exportRooms = useCallback((): TracedRoom[] => {
      return JSON.parse(JSON.stringify(rooms));
    }, [rooms]);

    /* ── Import rooms ─────────────────────────────────────────── */
    const importRooms = useCallback((imported: TracedRoom[]) => {
      pushUndo(rooms);
      setRooms(imported);
      idCounter.current = Math.max(
        ...imported.map((r) => {
          const m = r.id.match(/room-(\d+)/);
          return m ? parseInt(m[1], 10) + 1 : 0;
        }),
        idCounter.current,
      );
    }, [pushUndo, rooms]);

    /* ── Expose handle ────────────────────────────────────────── */
    useImperativeHandle(ref, () => ({
      exportSVG,
      exportRooms,
      importRooms,
      clear: () => { pushUndo(rooms); setRooms([]); setSelectedRoomId(null); },
      undo: () => {
        if (undoStack.current.length > 0) {
          redoStack.current.push(JSON.parse(JSON.stringify(rooms)));
          setRooms(undoStack.current.pop()!);
        }
      },
      redo: () => {
        if (redoStack.current.length > 0) {
          undoStack.current.push(JSON.parse(JSON.stringify(rooms)));
          setRooms(redoStack.current.pop()!);
        }
      },
    }), [exportSVG, exportRooms, importRooms, pushUndo, rooms]);

    /* ── Delete selected room ─────────────────────────────────── */
    const deleteSelected = () => {
      if (!selectedRoomId) return;
      pushUndo(rooms);
      setRooms((prev) => prev.filter((r) => r.id !== selectedRoomId));
      setSelectedRoomId(null);
    };

    /* ── SVG export modal ─────────────────────────────────────── */
    const handleExportSVG = () => {
      const svg = exportSVG();
      setSvgOutput(svg);
      setShowSvgModal(true);
    };

    const handleDownloadSVG = () => {
      const svg = exportSVG();
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "floor-plan-traced.svg";
      a.click();
      URL.revokeObjectURL(url);
    };

    const handleExportJSON = () => {
      const json = JSON.stringify(exportRooms(), null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "floor-plan-rooms.json";
      a.click();
      URL.revokeObjectURL(url);
    };

    const handleImportJSON = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const text = await file.text();
        try {
          const imported = JSON.parse(text) as TracedRoom[];
          if (Array.isArray(imported)) importRooms(imported);
        } catch { /* ignore parse errors */ }
      };
      input.click();
    };

    /* ── Detect building shell via OpenCV ──────────────────────── */
    const handleDetectShell = async () => {
      setDetecting(true);
      setDetectError(null);
      try {
        const result: ShellDetectionResult = await detectBuildingShell(
          imageUrl, imageWidth, imageHeight,
        );

        if (result.polygon.length < 3) {
          setDetectError("Detection returned too few vertices.");
          return;
        }

        const newId = `room-${idCounter.current++}`;
        const newRoom: TracedRoom = {
          id: newId,
          label: "Building Shell",
          type: "exterior",
          polygon: result.polygon,
          wallHeight: 10,
          floor: 1,
          color: ROOM_TYPE_COLORS.exterior,
          notes: `Auto-detected: ${result.polygon.length} vertices (simplified from ${result.rawVertices}), area: ${Math.round(result.area).toLocaleString()}px²`,
        };

        pushUndo(rooms);
        setRooms((prev) => [...prev, newRoom]);
        setSelectedRoomId(newId);
        setEditLabel(newRoom.label);
        setEditType(newRoom.type);
        setEditNotes(newRoom.notes || "");
        setEditHeight(10);
        setEditFloor(1);
      } catch (err) {
        setDetectError(err instanceof Error ? err.message : "Detection failed");
      } finally {
        setDetecting(false);
      }
    };

    /* ── Panel drag helpers ───────────────────────────────────── */
    const onPanelDragStart = useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      panelDragRef.current = { startX: e.clientX, startY: e.clientY, originX: panelPos.x, originY: panelPos.y };
    }, [panelPos]);

    const onPanelDragMove = useCallback((e: React.PointerEvent) => {
      if (!panelDragRef.current) return;
      setPanelPos({
        x: panelDragRef.current.originX + (e.clientX - panelDragRef.current.startX),
        y: panelDragRef.current.originY + (e.clientY - panelDragRef.current.startY),
      });
    }, []);

    const onPanelDragEnd = useCallback(() => { panelDragRef.current = null; }, []);

    /* ── Cursor style ─────────────────────────────────────────── */
    const cursor = tool === "polygon" || tool === "rectangle" || tool === "wall" ? "crosshair" : tool === "pan" ? (isPanning.current ? "grabbing" : "grab") : "default";

    return (
      <div className={`flex h-full ${className ?? ""}`}>
        {/* ── Canvas area ───────────────────────────────────── */}
        <div className="flex-1 relative min-w-0 min-h-0" style={{ cursor }}>
          <div ref={wrapperRef} className="absolute inset-0" />

          {/* ── Floating tool panel (matches map-drawing-panel style) ── */}
          <div
            className="absolute z-20 flex flex-col gap-2 select-none"
            style={{ left: panelPos.x, top: panelPos.y }}
            onPointerMove={onPanelDragMove}
            onPointerUp={onPanelDragEnd}
          >
            <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 flex flex-col w-[260px] max-h-[85vh] overflow-hidden">
              {/* Header with drag handle */}
              <div
                className="flex items-center justify-between px-3 py-2 border-b border-gray-100 cursor-grab active:cursor-grabbing flex-shrink-0"
                onPointerDown={onPanelDragStart}
              >
                <span className="text-[10px] text-gray-400 mr-1">⠿</span>
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex-1">Floor Plan Editor</span>
                <span className="text-[10px] text-gray-400">{rooms.length} rm · {walls.length} w</span>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5">

                {/* ── TOOLS ─────────────────────────────────────── */}
                <div className="grid grid-cols-5 gap-0.5 px-0.5">
                  {([
                    { id: "select" as const, label: "Select", icon: "↖" },
                    { id: "wall" as const, label: "Wall", icon: "╱" },
                    { id: "opening" as const, label: "Opening", icon: "🚪" },
                    { id: "polygon" as const, label: "Polygon", icon: "⬠" },
                    { id: "rectangle" as const, label: "Rect", icon: "▭" },
                    { id: "line" as const, label: "Line", icon: "╲" },
                    { id: "circle" as const, label: "Circle", icon: "◯" },
                    { id: "text" as const, label: "Text", icon: "T" },
                    { id: "pan" as const, label: "Pan", icon: "✋" },
                  ]).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setTool(t.id); clearPolyState(); clearWallState(); }}
                      title={t.label}
                      className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[9px] font-medium cursor-pointer transition-colors ${
                        tool === t.id
                          ? "bg-blue-100 text-blue-700"
                          : "hover:bg-gray-100 text-gray-600"
                      }`}
                    >
                      <span className="text-base leading-none">{t.icon}</span>
                      <span className="leading-none">{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* Finish polygon button */}
                {tool === "polygon" && polyPoints.current.length >= 3 && (
                  <button
                    onClick={finishPolygon}
                    className="w-full py-1.5 rounded-lg bg-green-100 text-green-700 text-[11px] font-semibold cursor-pointer hover:bg-green-200 transition-colors flex items-center justify-center gap-1"
                    title="Finish polygon (Enter / double-click)"
                  >
                    ✓ Finish Polygon
                  </button>
                )}

                {/* ── DRAWING SECTION ───────────────────────────── */}
                <button
                  onClick={() => setCollapsedSections((s) => ({ ...s, drawing: !s.drawing }))}
                  className="w-full flex items-center gap-1.5 px-2 py-1 mt-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:bg-gray-50 rounded"
                >
                  <span className="text-[8px]">{collapsedSections.drawing ? "▸" : "▾"}</span>
                  Drawing
                </button>
                {!collapsedSections.drawing && (
                  <div className="space-y-1 px-1">
                    {/* Room type + opacity in a row */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowRoomTypes(!showRoomTypes)}
                        className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 rounded-lg cursor-pointer flex-1 min-w-0"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0"
                          style={{ backgroundColor: ROOM_TYPE_COLORS[roomType] }}
                        />
                        <span className="text-[10px] text-gray-600 capitalize truncate">{roomType}</span>
                        <span className="ml-auto text-gray-400 text-[9px]">{showRoomTypes ? "▲" : "▼"}</span>
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[9px] text-gray-400">Op</span>
                        <input
                          type="range" min={0.1} max={0.7} step={0.05}
                          value={opacity}
                          onChange={(e) => setOpacity(parseFloat(e.target.value))}
                          className="w-12 h-1 accent-blue-500"
                        />
                      </div>
                    </div>

                    {showRoomTypes && (
                      <div className="grid grid-cols-2 gap-0.5 px-1">
                        {(Object.entries(ROOM_TYPE_COLORS) as [RoomType, string][]).map(([key, color]) => (
                          <button
                            key={key}
                            onClick={() => { setRoomType(key); setShowRoomTypes(false); }}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                              roomType === key ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-gray-100 text-gray-600"
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="capitalize truncate">{key}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── GRID & SCALE SECTION ──────────────────────── */}
                <button
                  onClick={() => setCollapsedSections((s) => ({ ...s, grid: !s.grid }))}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:bg-gray-50 rounded"
                >
                  <span className="text-[8px]">{collapsedSections.grid ? "▸" : "▾"}</span>
                  Grid &amp; Scale
                </button>
                {!collapsedSections.grid && (
                  <div className="px-2 space-y-1">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="w-3 h-3 accent-blue-500" />
                        <span className="text-[10px] text-gray-600">Grid</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} className="w-3 h-3 accent-blue-500" />
                        <span className="text-[10px] text-gray-600">Snap</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-gray-500 w-7">Grid</span>
                        <input
                          type="number" min={0.1} max={50} step={0.5}
                          value={gridSpacingM}
                          onChange={(e) => setGridSpacingM(Math.max(0.1, parseFloat(e.target.value) || 1))}
                          className="flex-1 text-[10px] px-1 py-0.5 rounded border border-gray-300 w-10"
                        />
                        <span className="text-[9px] text-gray-400">m</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-gray-500 w-7">Scale</span>
                        <input
                          type="number" min={1} max={1000} step={10}
                          value={pxPerMeter}
                          onChange={(e) => setPxPerMeter(Math.max(1, parseInt(e.target.value) || 100))}
                          className="flex-1 text-[10px] px-1 py-0.5 rounded border border-gray-300 w-10"
                        />
                        <span className="text-[9px] text-gray-400">px/m</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-gray-500 w-14">Wall Thick</span>
                      <input
                        type="range" min={2} max={24} step={1}
                        value={wallThickness}
                        onChange={(e) => setWallThickness(parseInt(e.target.value))}
                        className="flex-1 h-1 accent-blue-500"
                      />
                      <span className="text-[9px] text-gray-400 w-8 text-right">{wallThickness}px</span>
                    </div>
                  </div>
                )}

                {/* ── ACTIONS SECTION ───────────────────────────── */}
                <button
                  onClick={() => setCollapsedSections((s) => ({ ...s, actions: !s.actions }))}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:bg-gray-50 rounded"
                >
                  <span className="text-[8px]">{collapsedSections.actions ? "▸" : "▾"}</span>
                  Actions
                </button>
                {!collapsedSections.actions && (
                  <div className="space-y-1 px-1">
                    {/* Zoom */}
                    <div className="flex items-center gap-1">
                      <button onClick={zoomOut} title="Zoom Out" className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded cursor-pointer text-gray-500 text-sm font-bold">−</button>
                      <span className="text-[10px] text-gray-500 w-9 text-center font-mono">{Math.round(zoomLevel * 100)}%</span>
                      <button onClick={zoomIn} title="Zoom In" className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded cursor-pointer text-gray-500 text-sm font-bold">+</button>
                      <button onClick={zoomFit} title="Reset Zoom" className="px-2 h-7 flex items-center justify-center hover:bg-gray-100 rounded cursor-pointer text-[10px] text-gray-500">Fit</button>
                      <div className="flex-1" />
                      {/* Undo / Redo / Delete */}
                      <button
                        onClick={() => { if (undoStack.current.length > 0) { redoStack.current.push(JSON.parse(JSON.stringify(rooms))); setRooms(undoStack.current.pop()!); } }}
                        title="Undo (Ctrl+Z)"
                        className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded cursor-pointer text-[11px] text-gray-500"
                      >↶</button>
                      <button
                        onClick={() => { if (redoStack.current.length > 0) { undoStack.current.push(JSON.parse(JSON.stringify(rooms))); setRooms(redoStack.current.pop()!); } }}
                        title="Redo (Ctrl+Y)"
                        className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded cursor-pointer text-[11px] text-gray-500"
                      >↷</button>
                      <button
                        onClick={deleteSelected}
                        title="Delete selected (Del)"
                        className="w-7 h-7 flex items-center justify-center hover:bg-red-50 rounded cursor-pointer text-[11px] text-gray-500 hover:text-red-500"
                      >🗑</button>
                    </div>

                    {/* Export */}
                    <div className="flex gap-0.5">
                      <button onClick={handleExportSVG} title="Export SVG" className="flex-1 text-[10px] py-1 hover:bg-gray-100 rounded cursor-pointer text-gray-500">SVG</button>
                      <button onClick={handleDownloadSVG} title="Download SVG" className="flex-1 text-[10px] py-1 hover:bg-gray-100 rounded cursor-pointer text-gray-500">↓SVG</button>
                      <button onClick={handleExportJSON} title="Download JSON" className="flex-1 text-[10px] py-1 hover:bg-gray-100 rounded cursor-pointer text-gray-500">↓JSON</button>
                      <button onClick={handleImportJSON} title="Import JSON" className="flex-1 text-[10px] py-1 hover:bg-gray-100 rounded cursor-pointer text-gray-500">↑Import</button>
                    </div>

                    {/* Auto-detect */}
                    <button
                      onClick={handleDetectShell}
                      disabled={detecting}
                      title="Auto-detect building outline"
                      className={`w-full py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                        detecting
                          ? "bg-amber-50 text-amber-500 cursor-wait"
                          : "bg-violet-100 text-violet-700 hover:bg-violet-200"
                      }`}
                    >
                      {detecting ? (
                        <>
                          <span className="animate-spin text-sm">⟳</span>
                          Detecting…
                        </>
                      ) : (
                        <>🔍 Detect Shell</>
                      )}
                    </button>
                    {detectError && (
                      <p className="text-[10px] text-red-500 mt-0.5 px-1">{detectError}</p>
                    )}
                  </div>
                )}

              </div>{/* end scrollable body */}
            </div>
          </div>

          {/* Hint overlay */}
          {tool === "polygon" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/90 text-xs text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 backdrop-blur pointer-events-none">
              Click to add vertices · <strong>Double-click</strong> or <strong>Enter</strong> to close · <strong>Esc</strong> cancel · <strong>Alt+drag</strong> pan
            </div>
          )}
          {tool === "rectangle" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/90 text-xs text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 backdrop-blur pointer-events-none">
              Click and drag to draw rectangle · <strong>Alt+drag</strong> pan · <strong>Scroll</strong> zoom
            </div>
          )}
          {tool === "pan" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/90 text-xs text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 backdrop-blur pointer-events-none">
              Drag to pan · <strong>Scroll</strong> zoom
            </div>
          )}
          {tool === "wall" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/90 text-xs text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 backdrop-blur pointer-events-none">
              Click to start wall · Click again to place · <strong>Double-click</strong> end chain · <strong>Esc</strong> cancel
            </div>
          )}
          {tool === "opening" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/90 text-xs text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 backdrop-blur pointer-events-none">
              Click on a wall to add a door opening · <strong>Esc</strong> cancel
            </div>
          )}
          {tool === "text" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/90 text-xs text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 backdrop-blur pointer-events-none">
              Click to place text annotation · <strong>Esc</strong> cancel
            </div>
          )}
          {tool === "line" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/90 text-xs text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 backdrop-blur pointer-events-none">
              Click and drag to draw a line · <strong>Esc</strong> cancel
            </div>
          )}
          {tool === "circle" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/90 text-xs text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 backdrop-blur pointer-events-none">
              Click and drag to draw an ellipse room · <strong>Esc</strong> cancel
            </div>
          )}
          {selectedSymbolDef && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-blue-900/90 text-xs text-blue-200 px-3 py-1.5 rounded-lg border border-blue-700 backdrop-blur pointer-events-none">
              Click to place <strong>{SYMBOL_LIBRARY.find((s) => s.id === selectedSymbolDef)?.label}</strong> · Click symbol again to deselect
            </div>
          )}

          {/* Status bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-zinc-900/95 border-t border-zinc-700 px-3 py-1 flex items-center gap-4 text-[10px] text-zinc-400 backdrop-blur">
            <span>Layer-1</span>
            {cursorPos && (
              <span>X: {cursorPos.x}m · Y: {cursorPos.y}m</span>
            )}
            <span className="ml-auto">{rooms.length} rooms · {walls.length} walls · {symbols.length} symbols · {openings.length} openings</span>
          </div>
        </div>

        {/* ── Properties panel (right side) ──────────────────── */}
        <div className="w-72 bg-zinc-900 border-l border-zinc-700 overflow-y-auto p-3 space-y-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300">Rooms ({rooms.length})</h3>
            {walls.length > 0 && (
              <button onClick={() => setWalls([])} className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors" title="Clear all walls">
                Walls ({walls.length}) ×
              </button>
            )}
          </div>

          {/* Room list */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRoomId(r.id);
                  setEditLabel(r.label);
                  setEditType(r.type);
                  setEditNotes(r.notes || "");
                  setEditHeight(r.wallHeight ?? 3);
                  setEditFloor(r.floor ?? 1);
                }}
                className={`flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                  selectedRoomId === r.id
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: r.color || ROOM_TYPE_COLORS[r.type] }}
                />
                <span className="truncate">{r.label}</span>
                <span className="ml-auto text-zinc-600 capitalize text-[10px]">{r.type}</span>
              </button>
            ))}
            {rooms.length === 0 && (
              <p className="text-xs text-zinc-600 italic py-4 text-center">
                No rooms traced yet. Use Polygon or Rectangle tool to trace rooms.
              </p>
            )}
          </div>

          {/* Edit selected room */}
          {selectedRoomId && (
            <div className="border-t border-zinc-700 pt-3 space-y-3">
              <h4 className="text-xs font-semibold text-zinc-400">Edit Room</h4>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Label</label>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={updateSelectedRoom}
                  className="w-full text-xs px-2 py-1.5 rounded border border-zinc-600 bg-zinc-800 text-white mt-0.5"
                  placeholder="Room name"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Type</label>
                <select
                  value={editType}
                  onChange={(e) => { setEditType(e.target.value as RoomType); }}
                  onBlur={updateSelectedRoom}
                  className="w-full text-xs px-2 py-1.5 rounded border border-zinc-600 bg-zinc-800 text-white mt-0.5"
                >
                  {Object.keys(ROOM_TYPE_COLORS).map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Wall Height (m)</label>
                  <input
                    type="number" min={1} max={50} step={0.5}
                    value={editHeight}
                    onChange={(e) => setEditHeight(parseFloat(e.target.value) || 3)}
                    onBlur={updateSelectedRoom}
                    className="w-full text-xs px-2 py-1.5 rounded border border-zinc-600 bg-zinc-800 text-white mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Floor #</label>
                  <input
                    type="number" min={0} max={99}
                    value={editFloor}
                    onChange={(e) => setEditFloor(parseInt(e.target.value) || 1)}
                    onBlur={updateSelectedRoom}
                    className="w-full text-xs px-2 py-1.5 rounded border border-zinc-600 bg-zinc-800 text-white mt-0.5"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={updateSelectedRoom}
                  rows={2}
                  className="w-full text-xs px-2 py-1.5 rounded border border-zinc-600 bg-zinc-800 text-white mt-0.5 resize-none"
                  placeholder="Optional notes…"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  Vertices: {rooms.find((r) => r.id === selectedRoomId)?.polygon.length ?? 0}
                </label>
              </div>

              <button
                onClick={deleteSelected}
                className="w-full text-xs px-2 py-1.5 rounded border border-red-600/50 text-red-400 hover:bg-red-600/20 transition-colors"
              >
                Delete Room
              </button>
            </div>
          )}

          {/* Keyboard shortcuts */}
          <div className="border-t border-zinc-700 pt-3">
            <h4 className="text-xs font-semibold text-zinc-400 mb-2">Shortcuts</h4>
            <div className="space-y-1 text-[10px] text-zinc-500">
              <div><kbd className="px-1 bg-zinc-800 rounded">Esc</kbd> Cancel / Select mode</div>
              <div><kbd className="px-1 bg-zinc-800 rounded">Enter</kbd> Finish polygon</div>
              <div><kbd className="px-1 bg-zinc-800 rounded">Del</kbd> Delete selected room</div>
              <div><kbd className="px-1 bg-zinc-800 rounded">Ctrl+Z</kbd> Undo</div>
              <div><kbd className="px-1 bg-zinc-800 rounded">Ctrl+Y</kbd> Redo</div>
              <div><kbd className="px-1 bg-zinc-800 rounded">Scroll</kbd> Zoom in/out</div>
              <div><kbd className="px-1 bg-zinc-800 rounded">Alt+drag</kbd> Pan</div>
              <div><kbd className="px-1 bg-zinc-800 rounded">Ctrl+0</kbd> Reset zoom</div>
            </div>
          </div>

          {/* ── Dimensions & Area ──────────────────────────────── */}
          {rooms.length > 0 && (
            <div className="border-t border-zinc-700 pt-3">
              <h4 className="text-xs font-semibold text-zinc-400 mb-2">Dimensions &amp; Area</h4>
              <div className="space-y-1.5">
                {rooms.map((r) => {
                  // Shoelace formula for polygon area
                  const pts = r.polygon;
                  let area = 0;
                  for (let i = 0; i < pts.length; i++) {
                    const j = (i + 1) % pts.length;
                    area += pts[i][0] * pts[j][1];
                    area -= pts[j][0] * pts[i][1];
                  }
                  area = Math.abs(area) / 2;
                  const areaM2 = area / (pxPerMeter * pxPerMeter);
                  // Perimeter
                  let perim = 0;
                  for (let i = 0; i < pts.length; i++) {
                    const j = (i + 1) % pts.length;
                    perim += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
                  }
                  const perimM = perim / pxPerMeter;
                  return (
                    <div key={r.id} className="flex items-center justify-between text-[10px]">
                      <span className="text-zinc-400 truncate max-w-[80px]">{r.label}</span>
                      <span className="text-zinc-500">{areaM2.toFixed(1)} m² · {perimM.toFixed(1)} m</span>
                    </div>
                  );
                })}
                <div className="border-t border-zinc-800 pt-1 flex items-center justify-between text-[10px] font-semibold">
                  <span className="text-zinc-300">Total</span>
                  <span className="text-zinc-300">
                    {rooms.reduce((sum, r) => {
                      const pts = r.polygon;
                      let a = 0;
                      for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
                      return sum + Math.abs(a) / 2;
                    }, 0) / (pxPerMeter * pxPerMeter) |0} m²
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Symbol Library ──────────────────────────────── */}
          <div className="border-t border-zinc-700 pt-3">
            <h4 className="text-xs font-semibold text-zinc-400 mb-2">Symbols</h4>
            <p className="text-[10px] text-zinc-600 mb-2">Click a symbol, then click on canvas to place it.</p>
            {SYMBOL_CATEGORIES.map((cat) => (
              <div key={cat} className="mb-1">
                <button
                  onClick={() => setSymbolsExpanded(symbolsExpanded === cat ? null : cat)}
                  className="w-full flex items-center justify-between px-1.5 py-1 text-[10px] text-zinc-400 hover:bg-zinc-800 rounded"
                >
                  <span>{cat}</span>
                  <span>{symbolsExpanded === cat ? "▲" : "▼"}</span>
                </button>
                {symbolsExpanded === cat && (
                  <div className="grid grid-cols-3 gap-1 p-1">
                    {SYMBOL_LIBRARY.filter((s) => s.category === cat).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedSymbolDef(selectedSymbolDef === s.id ? null : s.id); setTool("select"); }}
                        title={s.label}
                        className={`flex flex-col items-center gap-0.5 p-1.5 rounded text-[9px] transition-colors ${
                          selectedSymbolDef === s.id
                            ? "bg-blue-600/30 text-blue-300 ring-1 ring-blue-500"
                            : "text-zinc-500 hover:bg-zinc-800"
                        }`}
                      >
                        <svg viewBox="0 0 40 40" className="w-6 h-6 fill-current">
                          <path d={s.path} />
                        </svg>
                        <span className="truncate w-full text-center">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {symbols.length > 0 && (
              <button
                onClick={() => setSymbols([])}
                className="text-[10px] text-zinc-500 hover:text-red-400 mt-1 transition-colors"
              >
                Clear all symbols ({symbols.length}) ×
              </button>
            )}
            {openings.length > 0 && (
              <button
                onClick={() => setOpenings([])}
                className="text-[10px] text-zinc-500 hover:text-red-400 mt-1 ml-2 transition-colors"
              >
                Clear openings ({openings.length}) ×
              </button>
            )}
            {annotations.length > 0 && (
              <button
                onClick={() => setAnnotations([])}
                className="text-[10px] text-zinc-500 hover:text-red-400 mt-1 ml-2 transition-colors"
              >
                Clear text ({annotations.length}) ×
              </button>
            )}
          </div>
        </div>

        {/* ── SVG Preview Modal ──────────────────────────────── */}
        {showSvgModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-8" onClick={() => setShowSvgModal(false)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">SVG Export Preview</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(svgOutput); }}
                    className="text-xs px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                  >
                    Copy to Clipboard
                  </button>
                  <button onClick={() => setShowSvgModal(false)} className="text-zinc-400 hover:text-white text-lg">×</button>
                </div>
              </div>
              <div
                className="bg-zinc-950 rounded-lg p-4 mb-4 overflow-auto border border-zinc-800"
                dangerouslySetInnerHTML={{ __html: svgOutput }}
              />
              <pre className="text-xs text-zinc-400 bg-zinc-950 rounded-lg p-4 overflow-auto max-h-60 border border-zinc-800">
                {svgOutput}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default FloorPlanTracingEditor;

/* ── Utility ──────────────────────────────────────────────────── */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
