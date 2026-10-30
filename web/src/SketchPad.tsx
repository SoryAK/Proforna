import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasStroke } from "@core/canvas-board";

export function SketchPad({
  strokes,
  onStrokeStart,
  onChange,
}: {
  strokes: CanvasStroke[];
  onStrokeStart?: () => void;
  onChange?: (strokes: CanvasStroke[]) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(strokes);
  const liveRef = useRef<CanvasStroke | null>(null);
  const drawing = useRef(false);
  strokesRef.current = strokes;
  const [live, setLive] = useState<CanvasStroke | null>(null);
  liveRef.current = live;

  useEffect(() => {
    const node = host.current;
    const canvas = surface.current;
    if (!node || !canvas) return;
    const draw = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width < 2 || height < 2) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const pen = canvas.getContext("2d");
      if (!pen) return;
      pen.setTransform(ratio, 0, 0, ratio, 0, 0);
      pen.clearRect(0, 0, width, height);
      pen.lineCap = "round";
      pen.lineJoin = "round";
      pen.strokeStyle = "#1c1814";
      pen.lineWidth = 2.25;
      const marks = liveRef.current ? [...strokesRef.current, liveRef.current] : strokesRef.current;
      for (const stroke of marks) {
        if (!stroke.length) continue;
        pen.beginPath();
        stroke.forEach((point, index) => {
          const x = point.x * width;
          const y = point.y * height;
          if (index === 0) pen.moveTo(x, y);
          else pen.lineTo(x, y);
        });
        if (stroke.length === 1) {
          pen.lineTo(stroke[0].x * width + 0.1, stroke[0].y * height);
        }
        pen.stroke();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(node);
    return () => observer.disconnect();
  }, [strokes, live]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    const y = rect.height ? (event.clientY - rect.top) / rect.height : 0;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!onChange || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onStrokeStart?.();
    drawing.current = true;
    const stroke = [point(event)];
    liveRef.current = stroke;
    setLive(stroke);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer can already be gone */
    }
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!onChange || !drawing.current) return;
    event.preventDefault();
    event.stopPropagation();
    const stroke = liveRef.current;
    if (!stroke) return;
    const mark = point(event);
    const last = stroke[stroke.length - 1];
    if (last && Math.abs(last.x - mark.x) < 0.002 && Math.abs(last.y - mark.y) < 0.002) return;
    const next = [...stroke, mark];
    liveRef.current = next;
    setLive(next);
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!onChange || !drawing.current) return;
    drawing.current = false;
    const stroke = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (stroke?.length) onChange([...strokesRef.current, stroke]);
  }

  return (
    <div className="role-canvas-ink" ref={host}>
      <canvas
        ref={surface}
        aria-label="Drawing"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
    </div>
  );
}
