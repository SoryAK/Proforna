"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Maximize2, Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FloatingPanelState = { x: number; y: number; w: number; h: number; minimized: boolean };

type Corner = "tl" | "tr" | "bl" | "br";

function loadState(key: string, defaults: FloatingPanelState, min: { w: number; h: number }): FloatingPanelState {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (!raw || typeof raw !== "object") return { ...defaults };
    const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    return {
      x: Math.max(0, n(raw.x, defaults.x)),
      y: Math.max(0, n(raw.y, defaults.y)),
      w: Math.max(min.w, n(raw.w, defaults.w)),
      h: Math.max(min.h, n(raw.h, defaults.h)),
      minimized: !!raw.minimized,
    };
  } catch { return { ...defaults }; }
}

/**
 * Hook to manage a draggable + resizable floating panel's state with localStorage persistence,
 * snap-to-corner, and pointer drag/resize handlers.
 *
 * Returns everything the consumer needs to render a panel chrome consistent with other floating
 * panels in the app (e.g. Tools & Inventory, Gallery).
 */
export function useFloatingPanel(opts: {
  storageKey: string;
  defaults: FloatingPanelState;
  min?: { w: number; h: number };
}) {
  const min = opts.min ?? { w: 360, h: 240 };
  const [state, setState] = useState<FloatingPanelState>(() => loadState(opts.storageKey, opts.defaults, min));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(opts.storageKey, JSON.stringify(state)); } catch { /* noop */ }
  }, [opts.storageKey, state]);

  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; originX: number; originY: number; originW: number; originH: number } | null>(null);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      originX: state.x,
      originY: state.y,
      originW: state.w,
      originH: state.h,
    };
  }, [state]);

  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: "resize",
      startX: e.clientX,
      startY: e.clientY,
      originX: state.x,
      originY: state.y,
      originW: state.w,
      originH: state.h,
    };
  }, [state]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.mode === "move") {
      const maxX = Math.max(0, window.innerWidth - 80);
      const maxY = Math.max(0, window.innerHeight - 60);
      setState((p) => ({
        ...p,
        x: Math.min(maxX, Math.max(0, drag.originX + dx)),
        y: Math.min(maxY, Math.max(0, drag.originY + dy)),
      }));
    } else {
      const maxW = Math.max(min.w, window.innerWidth - drag.originX - 8);
      const maxH = Math.max(min.h, window.innerHeight - drag.originY - 8);
      setState((p) => ({
        ...p,
        w: Math.min(maxW, Math.max(min.w, drag.originW + dx)),
        h: Math.min(maxH, Math.max(min.h, drag.originH + dy)),
      }));
    }
  }, [min.w, min.h]);

  const onDragEnd = useCallback(() => { dragRef.current = null; }, []);

  const snapToCorner = useCallback((corner: Corner) => {
    setState((p) => {
      const margin = 16;
      const w = p.w;
      const h = p.minimized ? 44 : p.h;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const x = corner === "tl" || corner === "bl" ? margin : Math.max(margin, vw - w - margin);
      const y = corner === "tl" || corner === "tr" ? margin : Math.max(margin, vh - h - margin);
      return { ...p, x, y };
    });
  }, []);

  const toggleMinimize = useCallback(() => setState((p) => ({ ...p, minimized: !p.minimized })), []);

  return { state, setState, onDragStart, onResizeStart, onDragMove, onDragEnd, snapToCorner, toggleMinimize };
}

/**
 * Reusable floating panel chrome: draggable title bar, snap-to-corner menu, minimize, close,
 * and resize affordance. Pairs with `useFloatingPanel`.
 *
 * Render the panel content as `children`. The chrome takes care of all positioning + interactions.
 */
export function FloatingPanel({
  open,
  panel,
  title,
  icon,
  accentClassName,
  onClose,
  toolbar,
  footer,
  children,
  zIndex = 2000,
  className,
  bodyClassName,
}: {
  open: boolean;
  panel: ReturnType<typeof useFloatingPanel>;
  title: string;
  /** Icon element, e.g. <Boxes className="h-4 w-4" /> — color via `accentClassName`. */
  icon?: ReactNode;
  /** Tailwind text color class for the icon (e.g. "text-emerald-600"). */
  accentClassName?: string;
  onClose: () => void;
  /** Optional secondary toolbar row rendered below the title bar. */
  toolbar?: ReactNode;
  /** Optional sticky footer strip rendered below the body. */
  footer?: ReactNode;
  children: ReactNode;
  zIndex?: number;
  className?: string;
  bodyClassName?: string;
}) {
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const { state, onDragStart, onResizeStart, onDragMove, onDragEnd, snapToCorner, toggleMinimize } = panel;

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed flex flex-col bg-background border rounded-xl shadow-2xl select-none",
        className,
      )}
      style={{
        left: state.x,
        top: state.y,
        width: state.w,
        height: state.minimized ? undefined : state.h,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100vh - 16px)",
        zIndex,
      }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
    >
      {/* ── Title bar (drag handle) ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b cursor-grab active:cursor-grabbing bg-muted/40 rounded-t-xl"
        onPointerDown={onDragStart}
        onDoubleClick={toggleMinimize}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        {icon && <span className={cn("inline-flex shrink-0", accentClassName)}>{icon}</span>}
        <div className="flex-1 text-sm font-semibold truncate">{title}</div>

        {/* Snap to corner */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowSnapMenu((v) => !v); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
            title="Snap to corner"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          {showSnapMenu && (
            <div
              className="absolute right-0 top-6 grid grid-cols-2 gap-1 p-1.5 rounded-lg border bg-background shadow-xl"
              style={{ zIndex: zIndex + 100 }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {(["tl", "tr", "bl", "br"] as const).map((c) => {
                const tx = c === "tl" || c === "bl" ? "-translate-x-1" : "translate-x-1";
                const ty = c === "tl" || c === "tr" ? "-translate-y-1" : "translate-y-1";
                const titleMap = { tl: "Top-left", tr: "Top-right", bl: "Bottom-left", br: "Bottom-right" } as const;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { snapToCorner(c); setShowSnapMenu(false); }}
                    className="h-7 w-7 rounded border hover:bg-muted flex items-center justify-center"
                    title={titleMap[c]}
                  >
                    <span className={cn("block h-2 w-2 bg-foreground/70 rounded-sm", tx, ty)} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleMinimize(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
          title={state.minimized ? "Restore" : "Minimize"}
        >
          {state.minimized ? <Square className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!state.minimized && (
        <>
          {toolbar && (
            <div className="border-b bg-muted/20 px-2 py-1.5 flex items-center gap-1.5 flex-wrap shrink-0">
              {toolbar}
            </div>
          )}
          <div className={cn("flex-1 overflow-y-auto p-3 scrollbar-thin", bodyClassName)}>
            {children}
          </div>
          {footer && (
            <div className="border-t bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground shrink-0">
              {footer}
            </div>
          )}
          <div
            onPointerDown={onResizeStart}
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
            title="Drag to resize"
            style={{
              background:
                "linear-gradient(135deg, transparent 0%, transparent 50%, hsl(var(--muted-foreground) / 0.5) 50%, hsl(var(--muted-foreground) / 0.5) 60%, transparent 60%, transparent 70%, hsl(var(--muted-foreground) / 0.5) 70%, hsl(var(--muted-foreground) / 0.5) 80%, transparent 80%)",
              borderBottomRightRadius: "0.75rem",
            }}
          />
        </>
      )}
    </div>,
    document.body,
  );
}
