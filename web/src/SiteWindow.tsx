import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { siteOpensInTab, sitePresentation } from "./site-open";
import "./site-window.css";

type Frame = { left: number; top: number; width: number; height: number };

export function SiteWindow({ url, onClose }: { url: string; onClose: () => void }) {
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [frame, setFrame] = useState<Frame>(() => initialFrame());
  const restoreFrame = useRef<Frame | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const title = siteHost(url);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function readFrame(): Frame {
    const rect = windowRef.current?.getBoundingClientRect();
    if (frame) return frame;
    return {
      left: rect?.left ?? 48,
      top: rect?.top ?? 88,
      width: rect?.width ?? 640,
      height: rect?.height ?? 480,
    };
  }

  function dragWindow(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || maximized || minimized) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const origin = readFrame();
    const startX = event.clientX;
    const startY = event.clientY;
    const bar = event.currentTarget;
    try {
      bar.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      setFrame({
        ...origin,
        left: Math.min(Math.max(8, origin.left + next.clientX - startX), window.innerWidth - 48),
        top: Math.min(Math.max(8, origin.top + next.clientY - startY), window.innerHeight - 36),
      });
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
    }
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  }

  function resizeWindow(event: ReactPointerEvent<HTMLElement>, edge: string) {
    if (event.button !== 0 || maximized || minimized) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = readFrame();
    const startX = event.clientX;
    const startY = event.clientY;
    const grip = event.currentTarget;
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;
      let width = origin.width;
      let height = origin.height;
      if (edge.includes("e")) width = origin.width + dx;
      if (edge.includes("s")) height = origin.height + dy;
      if (edge.includes("w")) width = origin.width - dx;
      if (edge.includes("n")) height = origin.height - dy;
      width = Math.min(window.innerWidth - 16, Math.max(320, width));
      height = Math.min(window.innerHeight - 16, Math.max(220, height));
      let left = edge.includes("w") ? origin.left + origin.width - width : origin.left;
      let top = edge.includes("n") ? origin.top + origin.height - height : origin.top;
      left = Math.min(Math.max(8, left), window.innerWidth - 48);
      top = Math.min(Math.max(8, top), window.innerHeight - 36);
      setFrame({ left, top, width, height });
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
    }
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  }

  function toggleMinimize() {
    if (!minimized) {
      if (!maximized) restoreFrame.current = readFrame();
      setMaximized(false);
      setMinimized(true);
      return;
    }
    setMinimized(false);
    if (restoreFrame.current) setFrame(restoreFrame.current);
  }

  function toggleMaximize() {
    const current = readFrame();
    if (!maximized) {
      restoreFrame.current = current;
      setFrame(mapFrame());
      setMaximized(true);
      setMinimized(false);
      return;
    }
    setMaximized(false);
    if (restoreFrame.current) setFrame(restoreFrame.current);
  }

  const geometry = minimized ? { left: frame.left, top: frame.top } : frame;

  return createPortal(
    <div
      className={["site-window", minimized ? "is-minimized" : "", maximized ? "is-maximized" : ""].filter(Boolean).join(" ")}
      ref={windowRef}
      role="dialog"
      aria-label={title}
      style={geometry}
    >
      {minimized
        ? null
        : (["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const).map((edge) => (
            <div key={edge} className={`resize ${edge}`} aria-label="Resize" onPointerDown={(event) => resizeWindow(event, edge)} />
          ))}
      <div
        className="site-window-bar"
        onPointerDown={dragWindow}
        onClick={(event) => {
          if (!minimized || (event.target as HTMLElement).closest("button")) return;
          toggleMinimize();
        }}
      >
        <h2 title={url}>{title}</h2>
        <div className="site-window-actions">
          <button type="button" aria-pressed={minimized} aria-label={minimized ? "Restore" : "Minimize"} onClick={toggleMinimize}>
            {minimized ? <RestoreIcon /> : <MinIcon />}
          </button>
          <button type="button" aria-pressed={maximized} aria-label={maximized ? "Restore size" : "Maximize"} onClick={toggleMaximize}>
            {maximized ? <RestoreIcon /> : <MaxIcon />}
          </button>
          <button type="button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>
      {minimized ? null : (
        <iframe
          className="site-window-frame"
          title={title}
          src={url}
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />
      )}
    </div>,
    document.body,
  );
}

function initialFrame(): Frame {
  const stage = document.querySelector(".work-map-stage")?.getBoundingClientRect();
  if (stage && stage.width > 200 && stage.height > 200) {
    const width = Math.min(40 * 16, Math.max(320, stage.width - 48));
    const height = Math.min(28 * 16, Math.max(220, stage.height - 48));
    return {
      left: Math.max(8, stage.right - width - 16),
      top: stage.top + 16,
      width,
      height,
    };
  }
  return { left: 48, top: 88, width: 640, height: 480 };
}

function mapFrame(): Frame {
  const stage = document.querySelector(".work-map-stage")?.getBoundingClientRect();
  const inset = 8;
  if (stage && stage.width > 80 && stage.height > 80) {
    const column = document.querySelector(".work-map-float")?.getBoundingClientRect();
    let left = stage.left + inset;
    let width = stage.width - inset * 2;
    if (column && column.right > left && column.left < stage.right - 280) {
      left = column.right + inset;
      width = Math.max(280, stage.right - inset - left);
    }
    return {
      left,
      top: stage.top + inset,
      width,
      height: Math.max(180, stage.height - inset * 2),
    };
  }
  const barBottom = document.querySelector(".home-bar")?.getBoundingClientRect().bottom ?? 56;
  const top = Math.ceil(barBottom + 8);
  return {
    left: 8,
    top,
    width: Math.max(280, window.innerWidth - 16),
    height: Math.max(180, window.innerHeight - top - 8),
  };
}

export function useSiteSurface() {
  const [url, setUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ url: string; top: number; left: number } | null>(null);

  function open(next: string, anchor: HTMLElement) {
    if (siteOpensInTab(next)) {
      setUrl(null);
      setNotice(null);
      window.open(next, "_blank", "noopener,noreferrer");
      return;
    }
    const box = anchor.getBoundingClientRect();
    void sitePresentation(next).then((kind) => {
      if (kind === "card") {
        setUrl(null);
        setNotice({ url: next, top: box.bottom + 8, left: box.left });
        return;
      }
      setNotice(null);
      setUrl(next);
    });
  }

  const surface = (
    <>
      {url ? <SiteWindow url={url} onClose={() => setUrl(null)} /> : null}
      {notice ? (
        <SiteNotice
          url={notice.url}
          top={notice.top}
          left={notice.left}
          onClose={() => setNotice(null)}
        />
      ) : null}
    </>
  );
  return { open, surface };
}

function SiteNotice({
  url,
  top,
  left,
  onClose,
}: {
  url: string;
  top: number;
  left: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const host = siteHost(url);
  const width = 256;
  const placedLeft = Math.min(Math.max(8, left), window.innerWidth - width - 8);
  const placedTop = Math.min(Math.max(8, top), window.innerHeight - 140);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && ref.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="site-notice"
      role="dialog"
      aria-label={host}
      style={{ top: placedTop, left: placedLeft, width }}
    >
      <button type="button" aria-label="Close" onClick={onClose}>
        <CloseIcon />
      </button>
      <p>{host} does not allow its pages to be shown inside another window.</p>
      <a href={url} target="_blank" rel="noreferrer">
        Open {host}
      </a>
    </div>,
    document.body,
  );
}

function siteHost(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "") || "Website";
  } catch {
    return "Website";
  }
}

function MinIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.5 8.5h9" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1.6" y="1.6" width="8.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function MaxIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="3.5" y="1.1" width="7.2" height="7.2" fill="#0d0b09" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.2" y="3.4" width="7.2" height="7.2" fill="#0d0b09" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.2 2.2l7.6 7.6M9.8 2.2l-7.6 7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
