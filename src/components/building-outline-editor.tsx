"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importLibrary } from "@googlemaps/js-api-loader";
import { Pencil, MapPin, Plus, X, Save, Loader2, MousePointerClick, Pentagon, Trash2 } from "lucide-react";

type LatLng = { lat: number; lng: number };
type NearbyBuilding = {
  wayId: number;
  ring: LatLng[];
  name: string | null;
  operator: string | null;
  brand: string | null;
  addr: string | null;
  distanceM: number;
};

interface BuildingOutlineEditorProps {
  workHistoryId: string;
  lat: number;
  lng: number;
  /** Current persisted explicit way IDs (primary first). Empty = auto mode. */
  osmWayIds: number[];
  /** Current persisted user-drawn rings. */
  footprintCustom: LatLng[][];
  /** Auto-resolved primary way ID (back-compat). Used as initial seed when osmWayIds is empty. */
  osmWayId: number | null;
  /** The Google Map instance to attach picker / drawing UI to. */
  map: google.maps.Map;
  onClose: () => void;
  onSaved: () => void;
}

const ACCENT = "#10b981"; // emerald-500
const PICK_COLOR = "#3b82f6"; // blue-500
const SELECTED_COLOR = "#f59e0b"; // amber-500

export default function BuildingOutlineEditor({
  workHistoryId,
  lat,
  lng,
  osmWayIds,
  footprintCustom,
  osmWayId,
  map,
  onClose,
  onSaved,
}: BuildingOutlineEditorProps) {
  // Local working copy. Seed from props; if both are empty but the auto-resolved
  // singular wayId exists, expose it so the user sees the current state.
  const initialWayIds = useMemo(() => {
    if (osmWayIds.length > 0) return osmWayIds;
    return osmWayId ? [osmWayId] : [];
  }, [osmWayIds, osmWayId]);

  const [draftWayIds, setDraftWayIds] = useState<number[]>(initialWayIds);
  const [draftCustom, setDraftCustom] = useState<LatLng[][]>(footprintCustom ?? []);
  const [mode, setMode] = useState<"list" | "pick" | "draw">("list");
  const [nearby, setNearby] = useState<NearbyBuilding[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Index of the custom ring currently being reshaped on the map (null = none). */
  const [editingCustomIdx, setEditingCustomIdx] = useState<number | null>(null);

  const dirty =
    JSON.stringify(draftWayIds) !== JSON.stringify(initialWayIds) ||
    JSON.stringify(draftCustom) !== JSON.stringify(footprintCustom ?? []);

  /* ── Picker mode: draw all nearby buildings, click to toggle ── */
  const pickPolysRef = useRef<Map<number, google.maps.Polygon>>(new Map());

  const teardownPicker = useCallback(() => {
    pickPolysRef.current.forEach((p) => {
      google.maps.event.clearInstanceListeners(p);
      p.setMap(null);
    });
    pickPolysRef.current.clear();
  }, []);

  const renderPickerStyle = useCallback(
    (poly: google.maps.Polygon, wayId: number, hover: boolean) => {
      const selected = draftWayIds.includes(wayId);
      poly.setOptions({
        strokeColor: selected ? SELECTED_COLOR : PICK_COLOR,
        strokeWeight: hover ? 3 : selected ? 3 : 1.5,
        strokeOpacity: 0.95,
        fillColor: selected ? SELECTED_COLOR : PICK_COLOR,
        fillOpacity: selected ? 0.3 : hover ? 0.18 : 0.08,
        zIndex: selected ? 10001 : 10000,
      });
    },
    [draftWayIds],
  );

  // Re-style when selection changes.
  useEffect(() => {
    pickPolysRef.current.forEach((poly, wayId) => renderPickerStyle(poly, wayId, false));
  }, [draftWayIds, renderPickerStyle]);

  const enterPickMode = useCallback(async () => {
    setMode("pick");
    if (nearby.length === 0) {
      setLoadingNearby(true);
      try {
        const res = await fetch(
          `/api/building-footprints/nearby?lat=${lat}&lng=${lng}&radiusM=180`,
        );
        if (res.ok) {
          const data: { buildings?: NearbyBuilding[] } = await res.json();
          setNearby(data.buildings ?? []);
        }
      } catch {
        // ignore
      } finally {
        setLoadingNearby(false);
      }
    }
  }, [lat, lng, nearby.length]);

  // Render picker polygons whenever nearby + mode change.
  useEffect(() => {
    if (mode !== "pick") {
      teardownPicker();
      return;
    }
    teardownPicker();
    nearby.forEach((b) => {
      const poly = new google.maps.Polygon({
        paths: b.ring,
        map,
        clickable: true,
        zIndex: 10000,
      });
      renderPickerStyle(poly, b.wayId, false);
      poly.addListener("mouseover", () => renderPickerStyle(poly, b.wayId, true));
      poly.addListener("mouseout", () => renderPickerStyle(poly, b.wayId, false));
      poly.addListener("click", () => {
        setDraftWayIds((prev) =>
          prev.includes(b.wayId) ? prev.filter((id) => id !== b.wayId) : [...prev, b.wayId],
        );
      });
      pickPolysRef.current.set(b.wayId, poly);
    });
    return () => {
      teardownPicker();
    };
    // renderPickerStyle changes with draftWayIds; we redraw on selection via the
    // effect above instead of recreating polygons every toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nearby, map]);

  /* ── Draw mode: Google DrawingManager polygon tool ── */
  const drawingMgrRef = useRef<google.maps.drawing.DrawingManager | null>(null);

  const teardownDrawing = useCallback(() => {
    if (drawingMgrRef.current) {
      google.maps.event.clearInstanceListeners(drawingMgrRef.current);
      drawingMgrRef.current.setMap(null);
      drawingMgrRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (mode !== "draw") {
      teardownDrawing();
      return;
    }
    let cancelled = false;
    (async () => {
      await importLibrary("drawing");
      if (cancelled) return;
      const mgr = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        polygonOptions: {
          strokeColor: ACCENT,
          strokeWeight: 3,
          fillColor: ACCENT,
          fillOpacity: 0.25,
          editable: false,
          zIndex: 10002,
        },
      });
      mgr.setMap(map);
      drawingMgrRef.current = mgr;

      mgr.addListener("polygoncomplete", (poly: google.maps.Polygon) => {
        const path = poly.getPath();
        const ring: LatLng[] = [];
        for (let i = 0; i < path.getLength(); i++) {
          const ll = path.getAt(i);
          ring.push({ lat: ll.lat(), lng: ll.lng() });
        }
        // Tear down the throwaway polygon — the persisted outline will be
        // re-rendered by the focused-footprint effect after save.
        poly.setMap(null);
        if (ring.length >= 3) {
          setDraftCustom((prev) => [...prev, ring]);
        }
        // Auto-exit drawing mode after a single polygon — most users want one at a time.
        setMode("list");
      });
    })();
    return () => {
      cancelled = true;
      teardownDrawing();
    };
  }, [mode, map, teardownDrawing]);

  /* ── Edit mode: reshape an existing custom polygon on the map ── */
  const editPolyRef = useRef<google.maps.Polygon | null>(null);

  const teardownEdit = useCallback(() => {
    if (editPolyRef.current) {
      google.maps.event.clearInstanceListeners(editPolyRef.current);
      const path = editPolyRef.current.getPath();
      google.maps.event.clearInstanceListeners(path);
      editPolyRef.current.setMap(null);
      editPolyRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (editingCustomIdx == null) {
      teardownEdit();
      return;
    }
    const ring = draftCustom[editingCustomIdx];
    if (!ring || ring.length < 3) {
      setEditingCustomIdx(null);
      return;
    }
    teardownEdit();
    const poly = new google.maps.Polygon({
      paths: ring,
      map,
      editable: true,
      draggable: false,
      strokeColor: ACCENT,
      strokeWeight: 3,
      strokeOpacity: 1,
      fillColor: ACCENT,
      fillOpacity: 0.25,
      zIndex: 10003,
    });
    editPolyRef.current = poly;

    const sync = () => {
      const path = poly.getPath();
      const next: LatLng[] = [];
      for (let i = 0; i < path.getLength(); i++) {
        const ll = path.getAt(i);
        next.push({ lat: ll.lat(), lng: ll.lng() });
      }
      setDraftCustom((prev) => {
        const copy = [...prev];
        copy[editingCustomIdx] = next;
        return copy;
      });
    };
    const path = poly.getPath();
    path.addListener("set_at", sync);
    path.addListener("insert_at", sync);
    path.addListener("remove_at", sync);
    return () => { teardownEdit(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCustomIdx, map]);

  // Exit edit mode whenever user switches tabs.
  useEffect(() => {
    if (mode !== "list") setEditingCustomIdx(null);
  }, [mode]);

  // Cleanup any overlays on unmount.
  useEffect(() => () => { teardownPicker(); teardownDrawing(); teardownEdit(); }, [teardownPicker, teardownDrawing, teardownEdit]);

  /* ── Persist ── */
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        osmWayIds: draftWayIds,
        footprintCustom: draftCustom.length > 0 ? draftCustom : null,
        // Always mirror primary into the back-compat osmWayId column.
        // When the user cleared all way IDs, set it to null so the auto-detect
        // fast-path stops resurrecting the removed building.
        osmWayId: draftWayIds.length > 0 ? draftWayIds[0] : null,
      };
      const res = await fetch(`/api/work-history/${workHistoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSaved();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }, [workHistoryId, draftWayIds, draftCustom, onSaved, onClose]);

  /* ── Draggable panel ── */
  // Position is null until the user first drags; until then we use the default
  // top-center anchor via Tailwind classes. After drag start we switch to
  // absolute pixel positioning (relative to the map container).
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    pointerId: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const onDragPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore drags that start on interactive elements inside the header.
    if ((e.target as HTMLElement).closest("button")) return;
    const node = panelRef.current;
    if (!node) return;
    const parent = node.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const rect = node.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left - parentRect.left,
      originY: rect.top - parentRect.top,
      pointerId: e.pointerId,
    };
    // Lock current pixel position before the user moves so the first delta is smooth.
    setPanelPos({ x: rect.left - parentRect.left, y: rect.top - parentRect.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onDragPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setPanelPos({
      x: d.originX + (e.clientX - d.startX),
      y: d.originY + (e.clientY - d.startY),
    });
  }, []);

  const onDragPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
  }, []);

  /* ── List entries ── */
  type Entry = {
    key: string;
    label: string;
    sub: string;
    remove: () => void;
    /** When set, an Edit (Pencil) button is shown that triggers this handler. */
    edit?: () => void;
    /** Whether this entry is the one currently being edited (for visual highlight). */
    editing?: boolean;
  };
  const wayEntries: Entry[] = draftWayIds.map((id, idx) => {
    const meta = nearby.find((b) => b.wayId === id);
    return {
      key: `way:${id}`,
      label:
        meta?.name ||
        meta?.operator ||
        meta?.brand ||
        meta?.addr ||
        `OSM building ${id}`,
      sub: idx === 0 ? "Primary" : `Sibling ${idx}`,
      remove: () => setDraftWayIds((prev) => prev.filter((x) => x !== id)),
      // OSM ways can't be reshaped; "edit" jumps to Pick mode so the user can swap selection.
      edit: () => { setEditingCustomIdx(null); enterPickMode(); },
    };
  });
  const customEntries: Entry[] = draftCustom.map((_ring, idx) => ({
    key: `custom:${idx}`,
    label: `Custom polygon #${idx + 1}`,
    sub: "Hand-drawn",
    remove: () => {
      if (editingCustomIdx === idx) setEditingCustomIdx(null);
      setDraftCustom((prev) => prev.filter((_, i) => i !== idx));
    },
    edit: () => {
      // Make sure we're on the list tab so the editable polygon stays mounted.
      setMode("list");
      setEditingCustomIdx((cur) => (cur === idx ? null : idx));
    },
    editing: editingCustomIdx === idx,
  }));
  const entries: Entry[] = [...wayEntries, ...customEntries];

  return (
    <div
      ref={panelRef}
      style={panelPos ? { left: panelPos.x, top: panelPos.y, right: "auto" } : undefined}
      className={
        panelPos
          ? "absolute z-[60] w-80 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
          : "absolute top-4 left-1/2 -translate-x-1/2 z-[60] w-80 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
      }
    >
      {/* Header (also drag handle) */}
      <div
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
        className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 cursor-move select-none touch-none"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Pentagon className="h-4 w-4 text-emerald-500" />
          Building outlines
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
          title="Close editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setMode("list")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded ${
            mode === "list"
              ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <MapPin className="h-3.5 w-3.5" />
          List
        </button>
        <button
          onClick={enterPickMode}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded ${
            mode === "pick"
              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <MousePointerClick className="h-3.5 w-3.5" />
          Pick
        </button>
        <button
          onClick={() => setMode("draw")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded ${
            mode === "draw"
              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <Pencil className="h-3.5 w-3.5" />
          Draw
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2 max-h-72 overflow-y-auto">
        {mode === "pick" && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
            {loadingNearby
              ? "Loading nearby buildings…"
              : nearby.length === 0
                ? "No OSM buildings within 180m of this address."
                : "Click any blue building on the map to add or remove it. Selected outlines turn amber."}
          </p>
        )}
        {mode === "draw" && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
            Click on the map to place vertices. Double-click or close the polygon to finish. The
            shape will be saved as a custom outline.
          </p>
        )}

        {entries.length === 0 ? (
          <div className="py-3 text-center text-xs text-gray-500 dark:text-gray-400">
            No outlines yet. Use <span className="font-medium">Pick</span> or{" "}
            <span className="font-medium">Draw</span> to add some.
          </div>
        ) : (
          <ul className="space-y-1">
            {entries.map((e) => (
              <li
                key={e.key}
                className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs ${
                  e.editing
                    ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20"
                    : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-gray-900 dark:text-gray-100">{e.label}</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">
                    {e.sub}{e.editing ? " · drag vertices to reshape" : ""}
                  </div>
                </div>
                {e.edit && (
                  <button
                    onClick={e.edit}
                    className={`cursor-pointer ${
                      e.editing
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                    }`}
                    title={e.editing ? "Finish editing" : "Edit shape"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={e.remove}
                  className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {mode === "pick" && nearby.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              Nearby buildings
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {nearby.map((b) => {
                const selected = draftWayIds.includes(b.wayId);
                const label = b.name || b.operator || b.brand || b.addr || `OSM #${b.wayId}`;
                return (
                  <li key={b.wayId}>
                    <button
                      onClick={() =>
                        setDraftWayIds((prev) =>
                          prev.includes(b.wayId)
                            ? prev.filter((x) => x !== b.wayId)
                            : [...prev, b.wayId],
                        )
                      }
                      className={`w-full flex items-center justify-between gap-2 rounded px-2 py-1 text-xs cursor-pointer ${
                        selected
                          ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {b.distanceM}m
                        {selected ? "" : <Plus className="inline h-3 w-3 ml-1" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 cursor-pointer"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
    </div>
  );
}
