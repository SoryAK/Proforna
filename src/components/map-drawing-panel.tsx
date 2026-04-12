"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { DrawingTool, DrawingSettings, DrawingCanvasHandle, SerializedDrawing } from "./map-drawing-canvas";
import {
  Pencil,
  MousePointer2,
  Minus,
  Circle,
  Square,
  Type,
  Smile,
  Ruler,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Layers,
  Eye,
  EyeOff,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Pentagon,
  Spline,
  GripVertical,
  Check,
  Globe,
  Briefcase,
  Focus,
} from "lucide-react";

const TOOLS: { id: DrawingTool; label: string; icon: React.ReactNode; group: string }[] = [
  { id: "select", label: "Select", icon: <MousePointer2 className="h-4 w-4" />, group: "core" },
  { id: "freehand", label: "Pen", icon: <Pencil className="h-4 w-4" />, group: "core" },
  { id: "line", label: "Line", icon: <Minus className="h-4 w-4" />, group: "core" },
  { id: "polyline", label: "Polyline", icon: <Spline className="h-4 w-4" />, group: "core" },
  { id: "polygon", label: "Polygon", icon: <Pentagon className="h-4 w-4" />, group: "core" },
  { id: "circle", label: "Circle", icon: <Circle className="h-4 w-4" />, group: "core" },
  { id: "rectangle", label: "Rectangle", icon: <Square className="h-4 w-4" />, group: "core" },
  { id: "text", label: "Text", icon: <Type className="h-4 w-4" />, group: "annotate" },
  { id: "emoji", label: "Emoji", icon: <Smile className="h-4 w-4" />, group: "annotate" },
  { id: "ruler", label: "Ruler", icon: <Ruler className="h-4 w-4" />, group: "measure" },
  { id: "eraser", label: "Eraser", icon: <Eraser className="h-4 w-4" />, group: "util" },
];

const COLORS = [
  "#3B82F6", "#EF4444", "#22C55E", "#EAB308", "#8B5CF6",
  "#EC4899", "#F97316", "#06B6D4", "#FFFFFF", "#000000",
];

const ZONE_TYPES: { id: string; label: string; color: string }[] = [
  { id: "preferred", label: "Preferred", color: "#22C55E" },
  { id: "avoid", label: "Avoid", color: "#EF4444" },
  { id: "maybe", label: "Maybe", color: "#EAB308" },
];

const EMOJIS = ["⭐", "⚠️", "🏠", "❤️", "🚗", "🚇", "🍔", "☕", "🏋️", "🌳", "❌", "✅"];

interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  drawingCount: number;
}

interface Props {
  canvasRef: React.RefObject<DrawingCanvasHandle | null>;
  settings: DrawingSettings;
  onSettingsChange: (s: DrawingSettings) => void;
  layers: LayerInfo[];
  activeLayerId: string | null;
  onActiveLayerChange: (id: string | null) => void;
  onCreateLayer: (name: string) => void;
  onDeleteLayer: (id: string) => void;
  onToggleLayerVisibility: (id: string) => void;
  measurement: { distance?: number; area?: number; unit?: string } | null;
  /** Current scope being applied to new drawings */
  activeScope?: string;
  /** Human-readable label for the active scope */
  activeScopeLabel?: string;
  onClose: () => void;
}

export default function MapDrawingPanel({
  canvasRef,
  settings,
  onSettingsChange,
  layers,
  activeLayerId,
  onActiveLayerChange,
  onCreateLayer,
  onDeleteLayer,
  onToggleLayerVisibility,
  measurement,
  activeScope,
  activeScopeLabel,
  onClose,
}: Props) {
  const [showLayers, setShowLayers] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [newLayerName, setNewLayerName] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  /* ── Drag state ── */
  const [pos, setPos] = useState({ x: 12, y: 12 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const onDragEnd = useCallback(() => { dragRef.current = null; }, []);

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const setTool = useCallback(
    (tool: DrawingTool) => {
      onSettingsChange({ ...settings, tool });
      if (tool === "emoji") setShowEmoji(true);
    },
    [settings, onSettingsChange],
  );

  const handleExport = useCallback(() => {
    const dataUrl = canvasRef.current?.exportImage();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `map-drawing-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, [canvasRef]);

  const handleCreateLayer = useCallback(() => {
    const name = newLayerName.trim();
    if (!name) return;
    onCreateLayer(name);
    setNewLayerName("");
  }, [newLayerName, onCreateLayer]);

  return (
    <div
      className="absolute z-[1200] flex flex-col gap-2 select-none"
      style={{ left: pos.x, top: pos.y }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
    >
      {/* ── Main toolbar ── */}
      <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 p-1.5 flex flex-col gap-1">
        {/* Header with drag handle + close */}
        <div
          className="flex items-center justify-between px-2 pb-1 border-b border-gray-100 mb-0.5 cursor-grab active:cursor-grabbing"
          onPointerDown={onDragStart}
        >
          <GripVertical className="h-3.5 w-3.5 text-gray-400 mr-1" />
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex-1">Draw</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer" title="Close drawing mode">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Tool buttons */}
        <div className="grid grid-cols-2 gap-0.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                settings.tool === t.id
                  ? "bg-blue-100 text-blue-700"
                  : "hover:bg-gray-100 text-gray-600"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Finish polyline/polygon button */}
        {(settings.tool === "polyline" || settings.tool === "polygon") && (
          <button
            onClick={() => canvasRef.current?.finishPoly()}
            className="mx-1 py-1.5 rounded-lg bg-green-100 text-green-700 text-[11px] font-semibold cursor-pointer hover:bg-green-200 transition-colors flex items-center justify-center gap-1"
            title="Finish drawing (or press Escape / double-click)"
          >
            <Check className="h-3.5 w-3.5" />
            Finish {settings.tool === "polygon" ? "Polygon" : "Polyline"}
          </button>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 my-0.5" />

        {/* Zone type selector */}
        <div className="flex gap-0.5 px-1">
          <button
            onClick={() => onSettingsChange({ ...settings, zoneType: null })}
            className={`flex-1 text-[10px] py-1 rounded text-center cursor-pointer transition-colors ${
              !settings.zoneType ? "bg-gray-200 font-semibold" : "hover:bg-gray-100"
            }`}
          >
            None
          </button>
          {ZONE_TYPES.map((z) => (
            <button
              key={z.id}
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  zoneType: settings.zoneType === z.id ? null : (z.id as "preferred" | "avoid" | "maybe"),
                })
              }
              className={`flex-1 text-[10px] py-1 rounded text-center cursor-pointer transition-colors ${
                settings.zoneType === z.id ? "font-semibold" : "hover:bg-gray-100"
              }`}
              style={{
                backgroundColor: settings.zoneType === z.id ? `${z.color}30` : undefined,
                color: settings.zoneType === z.id ? z.color : undefined,
              }}
            >
              {z.label}
            </button>
          ))}
        </div>

        {/* Scope badge — shows which map context new drawings are attached to */}
        {activeScope && activeScope !== "global" && (
          <div className="flex items-center gap-1.5 px-2 py-1 mx-1 rounded-lg bg-indigo-50 border border-indigo-200">
            {activeScope.startsWith("work-history") ? (
              <Briefcase className="h-3 w-3 text-indigo-500 flex-shrink-0" />
            ) : activeScope.startsWith("job:") ? (
              <Focus className="h-3 w-3 text-indigo-500 flex-shrink-0" />
            ) : (
              <Globe className="h-3 w-3 text-indigo-500 flex-shrink-0" />
            )}
            <span className="text-[10px] text-indigo-700 font-medium truncate">
              {activeScopeLabel ?? activeScope}
            </span>
          </div>
        )}

        {/* Color picker toggle */}
        <button
          onClick={() => setShowColors(!showColors)}
          className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 rounded-lg cursor-pointer"
        >
          <div
            className="w-4 h-4 rounded-full border-2 border-gray-300"
            style={{ backgroundColor: settings.color, boxShadow: settings.color === "#FFFFFF" ? "inset 0 0 0 1px #9ca3af" : undefined }}
          />
          <span className="text-[11px] text-gray-600">Color</span>
          {showColors ? <ChevronUp className="h-3 w-3 ml-auto text-gray-400" /> : <ChevronDown className="h-3 w-3 ml-auto text-gray-400" />}
        </button>

        {showColors && (
          <div className="grid grid-cols-5 gap-1 px-1 pb-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onSettingsChange({ ...settings, color: c })}
                className={`w-6 h-6 rounded-full cursor-pointer border-2 transition-transform hover:scale-110 ${
                  settings.color === c ? "border-blue-500 scale-110" : c === "#FFFFFF" ? "border-gray-400" : "border-gray-200"
                }`}
                style={{ backgroundColor: c, boxShadow: c === "#FFFFFF" ? "inset 0 0 0 1px #d1d5db" : undefined }}
              />
            ))}
          </div>
        )}

        {/* Stroke width */}
        <div className="flex items-center gap-2 px-2">
          <span className="text-[10px] text-gray-500 w-12">Stroke</span>
          <input
            type="range"
            min={1}
            max={10}
            value={settings.strokeWidth}
            onChange={(e) =>
              onSettingsChange({ ...settings, strokeWidth: Number(e.target.value) })
            }
            className="flex-1 h-1 accent-blue-500"
          />
          <span className="text-[10px] text-gray-500 w-4 text-right">{settings.strokeWidth}</span>
        </div>

        {/* Emoji picker */}
        {showEmoji && (
          <div ref={emojiRef} className="grid grid-cols-6 gap-1 px-1 pb-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  onSettingsChange({ ...settings, emoji: e, tool: "emoji" });
                  setShowEmoji(false);
                }}
                className={`text-lg text-center rounded cursor-pointer hover:bg-gray-100 ${
                  settings.emoji === e ? "bg-blue-100" : ""
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 my-0.5" />

        {/* Utility buttons */}
        <div className="flex gap-0.5 px-1">
          <button
            onClick={() => canvasRef.current?.undo()}
            title="Undo"
            className="flex-1 flex items-center justify-center py-1.5 hover:bg-gray-100 rounded cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5 text-gray-500" />
          </button>
          <button
            onClick={() => canvasRef.current?.redo()}
            title="Redo"
            className="flex-1 flex items-center justify-center py-1.5 hover:bg-gray-100 rounded cursor-pointer"
          >
            <Redo2 className="h-3.5 w-3.5 text-gray-500" />
          </button>
          <button
            onClick={() => canvasRef.current?.deleteSelected()}
            title="Delete selected"
            className="flex-1 flex items-center justify-center py-1.5 hover:bg-gray-100 rounded cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 text-gray-500" />
          </button>
          <button
            onClick={handleExport}
            title="Export as image"
            className="flex-1 flex items-center justify-center py-1.5 hover:bg-gray-100 rounded cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-gray-500" />
          </button>
        </div>

        {/* Layers toggle */}
        <button
          onClick={() => setShowLayers(!showLayers)}
          className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 rounded-lg cursor-pointer"
        >
          <Layers className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-[11px] text-gray-600">Layers ({layers.length})</span>
          {showLayers ? <ChevronUp className="h-3 w-3 ml-auto text-gray-400" /> : <ChevronDown className="h-3 w-3 ml-auto text-gray-400" />}
        </button>
      </div>

      {/* ── Layers panel ── */}
      {showLayers && (
        <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 p-2 max-w-[200px]">
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {/* "All" / no-layer option */}
            <button
              onClick={() => onActiveLayerChange(null)}
              className={`w-full text-left text-[11px] px-2 py-1 rounded cursor-pointer ${
                activeLayerId === null ? "bg-blue-100 text-blue-700 font-medium" : "hover:bg-gray-100 text-gray-600"
              }`}
            >
              All drawings
            </button>

            {layers.map((l) => (
              <div key={l.id} className="flex items-center gap-1">
                <button
                  onClick={() => onActiveLayerChange(l.id)}
                  className={`flex-1 text-left text-[11px] px-2 py-1 rounded truncate cursor-pointer ${
                    activeLayerId === l.id ? "bg-blue-100 text-blue-700 font-medium" : "hover:bg-gray-100 text-gray-600"
                  }`}
                >
                  {l.name}
                  <span className="text-[9px] text-gray-400 ml-1">({l.drawingCount})</span>
                </button>
                <button
                  onClick={() => onToggleLayerVisibility(l.id)}
                  className="p-0.5 hover:bg-gray-100 rounded cursor-pointer"
                  title={l.visible ? "Hide layer" : "Show layer"}
                >
                  {l.visible ? (
                    <Eye className="h-3 w-3 text-gray-400" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-gray-300" />
                  )}
                </button>
                <button
                  onClick={() => onDeleteLayer(l.id)}
                  className="p-0.5 hover:bg-red-50 rounded cursor-pointer"
                  title="Delete layer"
                >
                  <X className="h-3 w-3 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>

          {/* New layer */}
          <div className="flex gap-1 mt-2 pt-2 border-t border-gray-100">
            <input
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateLayer()}
              placeholder="New layer..."
              className="flex-1 text-[11px] px-2 py-1 border border-gray-200 rounded bg-transparent outline-none focus:border-blue-400"
            />
            <button
              onClick={handleCreateLayer}
              className="p-1 hover:bg-blue-100 rounded cursor-pointer"
              title="Add layer"
            >
              <Plus className="h-3.5 w-3.5 text-blue-500" />
            </button>
          </div>
        </div>
      )}

      {/* ── Measurement display ── */}
      {measurement && (measurement.distance || measurement.area) && (
        <div className="bg-amber-50/95 backdrop-blur rounded-lg shadow border border-amber-200 px-3 py-2 max-w-[260px]">
          {measurement.distance != null && (
            <div className="text-[11px] text-amber-800">
              <span className="font-semibold">Distance:</span>{" "}
              {(() => {
                const m = measurement.distance;
                const ft = m * 3.28084;
                if (m < 1000) return `${Math.round(m)} m (${Math.round(ft)} ft)`;
                const mi = m / 1609.344;
                const km = m / 1000;
                return `${km.toFixed(2)} km / ${mi.toFixed(2)} mi (${Math.round(ft).toLocaleString()} ft)`;
              })()}
            </div>
          )}
          {measurement.area != null && (
            <div className="text-[11px] text-amber-800 mt-0.5 space-y-0.5">
              <div><span className="font-semibold">Area:</span></div>
              <div>{Math.round(measurement.area * 10.7639).toLocaleString()} sq ft</div>
              {measurement.area * 1.19599 >= 100 && (
                <div>{Math.round(measurement.area * 1.19599).toLocaleString()} sq yd</div>
              )}
              {measurement.area / 4046.856 >= 0.1 && (
                <div>{(measurement.area / 4046.856).toFixed(2)} acres</div>
              )}
              {measurement.area / 10000 >= 1 && (
                <div>{(measurement.area / 10000).toFixed(2)} hectares</div>
              )}
              {measurement.area / 1e6 >= 0.01 && (
                <div>{(measurement.area / 1e6).toFixed(3)} km²</div>
              )}
              {measurement.area / 2589988.11 >= 0.01 && (
                <div>{(measurement.area / 2589988.11).toFixed(3)} sq mi</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
