"use client";
/**
 * AnnotationOverlay — read-only SVG overlay rendering MediaAnnotation shapes
 * over an image. Used in both the editor (with editing controls layered on top)
 * and the public viewer.
 *
 * Coords are normalized 0..1 relative to the rendered image.
 */
import { useMemo } from "react";
import type React from "react";

export type AnnotationKind = "pin" | "rect" | "circle" | "arrow" | "line" | "freehand" | "text" | "ruler" | "scale";

export type Annotation = {
  id: string;
  kind: AnnotationKind;
  geometry: unknown; // parsed JSON shape
  title: string | null;
  body: string | null;
  color: string;
  sortOrder: number | null;
  isPrivate: boolean;
  tags?: string[] | null;
};

type Props = {
  annotations: Annotation[];
  width: number; // rendered image width in px
  height: number; // rendered image height in px
  selectedId?: string | null;
  hoveredId?: string | null;
  highlightedId?: string | null; // tour highlight
  onSelect?: (id: string | null) => void;
  onHover?: (id: string | null) => void;
  showLabels?: boolean;
  /**
   * Optional explicit label per annotation id (e.g. "1", "A").
   * When provided, overrides the sortOrder-based numbering so callers can show
   * stable references regardless of tour membership.
   */
  labelLookup?: Map<string, string | number>;
  /**
   * When true, pins close together (in pixel space) merge into a "+N" cluster bubble.
   * Auto-enabled at small overlay widths (≤ 360px) when not specified.
   */
  clusterPins?: boolean;
  className?: string;
};

function parseGeo(a: Annotation): Record<string, number> | { points: Array<{ x: number; y: number }> } | null {
  try {
    return typeof a.geometry === "string" ? JSON.parse(a.geometry) : (a.geometry as never);
  } catch {
    return null;
  }
}

function fontSizeFor(strokeWidth: number): number {
  return Math.max(11, Math.min(20, 10 + strokeWidth));
}

export function AnnotationOverlay({
  annotations,
  width,
  height,
  selectedId,
  hoveredId,
  highlightedId,
  onSelect,
  onHover,
  showLabels = true,
  labelLookup,
  clusterPins,
  className,
}: Props) {
  const sorted = useMemo(
    () =>
      [...annotations].sort(
        (a, b) =>
          (a.sortOrder ?? Number.POSITIVE_INFINITY) - (b.sortOrder ?? Number.POSITIVE_INFINITY) ||
          a.id.localeCompare(b.id)
      ),
    [annotations]
  );

  // Auto-enable clustering on small overlays unless caller said otherwise.
  const doCluster = clusterPins ?? (width > 0 && width <= 360);

  /** If the user has dropped a "scale" calibration annotation on the photo,
   *  compute pixels-per-unit so ruler annotations can render real-world distances. */
  const scale = useMemo(() => {
    for (const a of annotations) {
      if (a.kind !== "scale") continue;
      const g = (() => { try { return typeof a.geometry === "string" ? JSON.parse(a.geometry) : (a.geometry as Record<string, unknown>); } catch { return null; } })();
      if (!g) continue;
      const { x1, y1, x2, y2, realWorld, unit } = g as { x1: number; y1: number; x2: number; y2: number; realWorld: number; unit: string };
      if ([x1, y1, x2, y2, realWorld].some((n) => typeof n !== "number" || !Number.isFinite(n))) continue;
      if (typeof unit !== "string" || realWorld <= 0) continue;
      const px = Math.hypot((x2 - x1) * width, (y2 - y1) * height);
      if (px <= 0) continue;
      return { pxPerUnit: px / realWorld, unit };
    }
    return null;
  }, [annotations, width, height]);

  const formatDistance = (px: number) => {
    if (scale) {
      const v = px / scale.pxPerUnit;
      return v >= 100 ? `${v.toFixed(0)} ${scale.unit}` : `${v.toFixed(1)} ${scale.unit}`;
    }
    return `${Math.round(px)} px`;
  };

  /** Pixel-space clusters of pin annotations. id list per cluster, plus a flat
   *  Set of ids that should be rendered as a cluster instead of individually. */
  const { clusters, clusteredIds } = useMemo(() => {
    const clusters: Array<{ ids: string[]; cx: number; cy: number; color: string }> = [];
    const clusteredIds = new Set<string>();
    if (!doCluster) return { clusters, clusteredIds };
    const threshold = 28; // px
    type Pt = { id: string; x: number; y: number; color: string };
    const pins: Pt[] = [];
    for (const a of sorted) {
      if (a.kind !== "pin") continue;
      const g = parseGeo(a) as { x?: number; y?: number } | null;
      if (!g || typeof g.x !== "number" || typeof g.y !== "number") continue;
      pins.push({ id: a.id, x: g.x * width, y: g.y * height, color: a.color || "#ef4444" });
    }
    const used = new Set<string>();
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      if (used.has(p.id)) continue;
      const group = [p];
      for (let j = i + 1; j < pins.length; j++) {
        const q = pins[j];
        if (used.has(q.id)) continue;
        if (Math.hypot(p.x - q.x, p.y - q.y) <= threshold) group.push(q);
      }
      if (group.length >= 2) {
        let sx = 0; let sy = 0;
        for (const m of group) { sx += m.x; sy += m.y; used.add(m.id); clusteredIds.add(m.id); }
        clusters.push({
          ids: group.map((m) => m.id),
          cx: sx / group.length,
          cy: sy / group.length,
          color: group[0].color,
        });
      }
    }
    return { clusters, clusteredIds };
  }, [sorted, doCluster, width, height]);

  if (width <= 0 || height <= 0) return null;

  return (
    <svg
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
    >
      {sorted.map((a) => {
        const g = parseGeo(a);
        if (!g) return null;
        // Pins that are part of a cluster are rendered separately below.
        if (a.kind === "pin" && clusteredIds.has(a.id)) return null;
        // Calibration scale annotations are invisible — used only as a metric source for ruler labels.
        if (a.kind === "scale") return null;
        const isActive = a.id === selectedId || a.id === hoveredId || a.id === highlightedId;
        const stroke = a.color || "#ef4444";
        const customSW = (g as { strokeWidth?: number }).strokeWidth;
        const baseSW = typeof customSW === "number" && Number.isFinite(customSW) ? customSW : 2;
        const strokeWidth = baseSW + (isActive ? 1 : 0);
        const fillOpacity = isActive ? 0.18 : 0.08;
        const explicitLabel = labelLookup?.get(a.id);
        const tourLabel = a.sortOrder != null ? String(a.sortOrder + 1) : null;
        const label = explicitLabel != null ? String(explicitLabel) : tourLabel;
        const handlers = onSelect
          ? {
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                onSelect(a.id);
              },
              onMouseEnter: () => onHover?.(a.id),
              onMouseLeave: () => onHover?.(null),
              style: { pointerEvents: "auto" as const, cursor: "pointer" as const },
            }
          : {};

        const numberBadge = (cx: number, cy: number) =>
          label != null && showLabels ? (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={cx} cy={cy} r={11} fill={stroke} stroke="white" strokeWidth={2} />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={11}
                fontWeight={700}
              >
                {label}
              </text>
            </g>
          ) : null;

        switch (a.kind) {
          case "pin": {
            const p = g as { x: number; y: number };
            const cx = p.x * width;
            const cy = p.y * height;
            return (
              <g key={a.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 10 : 8}
                  fill={stroke}
                  fillOpacity={0.9}
                  stroke="white"
                  strokeWidth={2}
                  {...handlers}
                />
                {label != null && showLabels && (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={10}
                    fontWeight={700}
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          }
          case "rect": {
            const r = g as { x: number; y: number; w: number; h: number };
            const x = r.x * width;
            const y = r.y * height;
            const w = r.w * width;
            const h = r.h * height;
            return (
              <g key={a.id}>
                <rect
                  x={x}
                  y={y}
                  width={Math.max(2, w)}
                  height={Math.max(2, h)}
                  fill={stroke}
                  fillOpacity={fillOpacity}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  {...handlers}
                />
                {numberBadge(x + Math.min(14, w / 2), y + Math.min(14, h / 2))}
              </g>
            );
          }
          case "circle": {
            const c = g as { cx: number; cy: number; r: number };
            const cx = c.cx * width;
            const cy = c.cy * height;
            const rad = c.r * Math.min(width, height);
            return (
              <g key={a.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={Math.max(2, rad)}
                  fill={stroke}
                  fillOpacity={fillOpacity}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  {...handlers}
                />
                {numberBadge(cx, cy)}
              </g>
            );
          }
          case "arrow": {
            const ar = g as { x1: number; y1: number; x2: number; y2: number };
            const x1 = ar.x1 * width;
            const y1 = ar.y1 * height;
            const x2 = ar.x2 * width;
            const y2 = ar.y2 * height;
            const headId = `arrowhead-${a.id}`;
            return (
              <g key={a.id}>
                <defs>
                  <marker
                    id={headId}
                    markerWidth="10"
                    markerHeight="10"
                    refX="6"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L6,3 z" fill={stroke} />
                  </marker>
                </defs>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth={strokeWidth + 1}
                  markerEnd={`url(#${headId})`}
                  {...handlers}
                />
                {numberBadge(x1, y1)}
              </g>
            );
          }
          case "freehand": {
            const f = g as { points: Array<{ x: number; y: number }> };
            const d =
              f.points.length === 0
                ? ""
                : f.points
                    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x * width},${p.y * height}`)
                    .join(" ");
            return (
              <g key={a.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth + 1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  {...handlers}
                />
                {numberBadge(f.points[0].x * width, f.points[0].y * height)}
              </g>
            );
          }
          case "line": {
            const ln = g as { x1: number; y1: number; x2: number; y2: number };
            const x1 = ln.x1 * width;
            const y1 = ln.y1 * height;
            const x2 = ln.x2 * width;
            const y2 = ln.y2 * height;
            return (
              <g key={a.id}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={stroke}
                  strokeWidth={strokeWidth + 1}
                  strokeLinecap="round"
                  {...handlers}
                />
                {numberBadge(x1, y1)}
              </g>
            );
          }
          case "text": {
            const t = g as { x: number; y: number; text: string; fontSize?: number };
            const cx = t.x * width;
            const cy = t.y * height;
            const fs = Math.max(8, Math.min(200, t.fontSize ?? 16));
            return (
              <g key={a.id} {...handlers}>
                {/* Invisible hit area for selection */}
                <text
                  x={cx} y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={fs}
                  fontWeight={600}
                  stroke="white"
                  strokeWidth={Math.max(2, fs / 6)}
                  paintOrder="stroke"
                  fill={stroke}
                  style={{ pointerEvents: "auto", cursor: "pointer", userSelect: "none" }}
                >
                  {t.text}
                </text>
                {numberBadge(cx, cy - fs)}
              </g>
            );
          }
          case "ruler": {
            const r = g as { x1: number; y1: number; x2: number; y2: number };
            const x1 = r.x1 * width;
            const y1 = r.y1 * height;
            const x2 = r.x2 * width;
            const y2 = r.y2 * height;
            const px = Math.hypot(x2 - x1, y2 - y1);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            // Tick marks perpendicular to the line at each end
            const tickLen = 6;
            const nx = Math.sin(angle) * tickLen;
            const ny = -Math.cos(angle) * tickLen;
            const label = formatDistance(px);
            const labelW = label.length * (fontSizeFor(strokeWidth) * 0.6) + 10;
            const labelH = fontSizeFor(strokeWidth) + 6;
            return (
              <g key={a.id}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={stroke}
                  strokeWidth={strokeWidth + 1}
                  {...handlers}
                />
                <line x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} stroke={stroke} strokeWidth={strokeWidth + 1} />
                <line x1={x2 - nx} y1={y2 - ny} x2={x2 + nx} y2={y2 + ny} stroke={stroke} strokeWidth={strokeWidth + 1} />
                <g transform={`translate(${mx}, ${my})`}>
                  <rect
                    x={-labelW / 2} y={-labelH / 2}
                    width={labelW} height={labelH} rx={3}
                    fill="white" stroke={stroke} strokeWidth={1}
                  />
                  <text
                    x={0} y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSizeFor(strokeWidth)}
                    fontWeight={600}
                    fill={stroke}
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                </g>
              </g>
            );
          }
          default:
            return null;
        }
      })}
      {clusters.map((c, i) => {
        const isActive = c.ids.some((id) => id === selectedId || id === hoveredId || id === highlightedId);
        return (
          <g key={`cluster-${i}-${c.ids[0]}`}>
            <circle cx={c.cx} cy={c.cy} r={isActive ? 16 : 14} fill={c.color} fillOpacity={0.95} stroke="white" strokeWidth={2}
              onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(c.ids[0]); } : undefined}
              onMouseEnter={() => onHover?.(c.ids[0])}
              onMouseLeave={() => onHover?.(null)}
              style={onSelect ? { pointerEvents: "auto", cursor: "pointer" } : undefined}
            >
              <title>{`${c.ids.length} pins clustered`}</title>
            </circle>
            <text x={c.cx} y={c.cy} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={11} fontWeight={700} pointerEvents="none">
              +{c.ids.length}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
