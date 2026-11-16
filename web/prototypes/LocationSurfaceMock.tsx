// Throwaway. Two career-history map surfaces on #/prototype/location-surface?variant=
// pin: cards stay on a live map; a location icon opens a place node; focus zooms the ground.
// atmosphere: the ground only hints at geography; the place node is the map.
// compare: both, side by side.
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import "./location-surface-mock.css";

type Variant = "compare" | "pin" | "atmosphere";
type Mode = "pin" | "atmosphere";

type Job = {
  id: string;
  organization: string;
  title: string;
  address: string;
  x: number;
  y: number;
};

const JOBS: Job[] = [
  { id: "giants", organization: "Giants Direct", title: "Mechatronics and Robotics Technician", address: "Lancaster, PA", x: 58, y: 42 },
  { id: "sharp", organization: "Sharp Packaging", title: "Systems and Automation Technician", address: "Allentown, PA", x: 70, y: 28 },
  { id: "waters", organization: "Waters Corp.", title: "Manufacturing Engineering Technician", address: "New Castle, DE", x: 46, y: 68 },
  { id: "temple", organization: "Temple University", title: "Researcher", address: "Philadelphia, PA", x: 64, y: 56 },
];

const VARIANTS: Variant[] = ["compare", "pin", "atmosphere"];

const COPY: Record<Variant, string> = {
  compare: "Side by side",
  pin: "Location icon",
  atmosphere: "Quiet ground",
};

function readVariant(): Variant {
  const hash = window.location.hash;
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const value = new URLSearchParams(query).get("variant");
  return value === "pin" || value === "atmosphere" || value === "compare" ? value : "compare";
}

function writeVariant(next: Variant) {
  const base = window.location.href.split("#")[0];
  window.history.replaceState(null, "", `${base}#/prototype/location-surface?variant=${next}`);
}

export function LocationSurfaceMock() {
  const [variant, setVariant] = useState(readVariant);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable='true']")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setVariant((current) => {
        const index = VARIANTS.indexOf(current);
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length];
        writeVariant(next);
        return next;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function choose(next: Variant) {
    writeVariant(next);
    setVariant(next);
  }

  return (
    <div className="lsm">
      <p className="lsm-banner">Prototype. Not the career history page.</p>
      <div className={variant === "compare" ? "lsm-stage is-split" : "lsm-stage"}>
        {variant === "pin" ? <Surface mode="pin" /> : null}
        {variant === "atmosphere" ? <Surface mode="atmosphere" /> : null}
        {variant === "compare" ? (
          <>
            <Surface mode="pin" />
            <Surface mode="atmosphere" />
          </>
        ) : null}
      </div>
      <div className="lsm-switcher" role="toolbar" aria-label="Prototype variant">
        <button type="button" aria-label="Previous layout" onClick={() => choose(VARIANTS[(VARIANTS.indexOf(variant) + VARIANTS.length - 1) % VARIANTS.length])}>
          ←
        </button>
        <span>
          {variant} ({COPY[variant]})
        </span>
        <button type="button" aria-label="Next layout" onClick={() => choose(VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length])}>
          →
        </button>
      </div>
    </div>
  );
}

function Surface({ mode }: { mode: Mode }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const focus = JOBS.find((job) => job.id === focusId) ?? null;
  const place = JOBS.find((job) => job.id === placeId) ?? null;

  function focusJob(job: Job) {
    setFocusId(job.id);
    if (mode === "pin") {
      setZoom(1.85);
      setPan({ x: 50 - job.x, y: 46 - job.y });
      return;
    }
    setPlaceId(job.id);
  }

  function clearFocus() {
    setFocusId(null);
    if (mode === "pin") {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (mode !== "pin") return;
    event.preventDefault();
    const next = Math.min(2.4, Math.max(1, zoom + (event.deltaY < 0 ? 0.12 : -0.12)));
    setZoom(Number(next.toFixed(2)));
  }

  function onGroundDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "pin") return;
    if ((event.target as HTMLElement).closest("button, article")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = pan;
    function move(next: PointerEvent) {
      setPan({
        x: origin.x + (next.clientX - startX) / 8,
        y: origin.y + (next.clientY - startY) / 8,
      });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const state = `${mode} · focus ${focus?.organization ?? "none"} · location node ${place ? "open" : "closed"} · zoom ${mode === "pin" ? zoom.toFixed(2) : "ground still"}`;

  return (
    <section className={`lsm-frame is-${mode}`} aria-label={mode === "pin" ? "Location icon layout" : "Quiet ground layout"}>
      <header className="lsm-frame-title">
        <strong>{mode === "pin" ? "Location icon" : "Quiet ground"}</strong>
        <span>{mode === "pin" ? "The ground stays a map. The icon opens a place." : "The ground is only a hint. The place node is the map."}</span>
      </header>
      <div className="lsm-world" onWheel={onWheel} onPointerDown={onGroundDown}>
        <div
          className={mode === "pin" ? "lsm-ground is-map" : "lsm-ground is-air"}
          style={mode === "pin" ? { transform: `scale(${zoom}) translate(${pan.x}%, ${pan.y}%)` } : undefined}
        >
          {mode === "pin"
            ? JOBS.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className={focusId === job.id ? "lsm-pin is-focus" : "lsm-pin"}
                  style={{ left: `${job.x}%`, top: `${job.y}%` }}
                  onClick={() => focusJob(job)}
                >
                  {job.address}
                </button>
              ))
            : null}
        </div>
        <article className="lsm-card lsm-bio">
          <p className="lsm-kicker">Career history</p>
          <h2>Sory Kaba</h2>
          <p>Overview of the work, not a street.</p>
        </article>
        <article className="lsm-card lsm-overview">
          <p className="lsm-kicker">Overview</p>
          <h2>13 boards</h2>
        </article>
        <article className="lsm-card lsm-history">
          <div className="lsm-history-head">
            <p className="lsm-kicker">{focus ? `${focus.organization} | ${focus.title}` : "Career history"}</p>
            {focus ? (
              <button type="button" onClick={clearFocus}>
                All jobs
              </button>
            ) : null}
          </div>
          <ul>
            {JOBS.map((job) => (
              <li key={job.id} className={focusId === job.id ? "is-focus" : ""}>
                <button type="button" className="lsm-job" onClick={() => focusJob(job)}>
                  <strong>{job.organization}</strong>
                  <span>{job.title}</span>
                </button>
                <button
                  type="button"
                  className="lsm-loc"
                  aria-label={`Show location for ${job.organization}`}
                  onClick={() => setPlaceId(job.id)}
                >
                  <PinIcon />
                </button>
              </li>
            ))}
          </ul>
        </article>
        <article className="lsm-card lsm-board">
          <p className="lsm-kicker">Canvas</p>
          <h2>Demo</h2>
          <p>North, Clip, Still, and the place node live on the board.</p>
        </article>
        {place ? (
          <article className={mode === "atmosphere" ? "lsm-node is-primary" : "lsm-node"} aria-label={`${place.organization} location`}>
            <header>
              <p className="lsm-kicker">Location</p>
              <button type="button" onClick={() => setPlaceId(null)} aria-label="Close location">
                Close
              </button>
            </header>
            <h3>{place.organization}</h3>
            <p>{place.address}</p>
            <PlacePeek job={place} interactive={mode === "atmosphere"} />
          </article>
        ) : null}
      </div>
      <p className="lsm-state">{state}</p>
    </section>
  );
}

function PlacePeek({ job, interactive }: { job: Job; interactive: boolean }) {
  const [shift, setShift] = useState({ x: 0, y: 0 });

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = shift;
    function move(next: PointerEvent) {
      setShift({ x: origin.x + next.clientX - startX, y: origin.y + next.clientY - startY });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className={interactive ? "lsm-peek is-live" : "lsm-peek"} onPointerDown={drag}>
      <span style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>{job.address}</span>
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5a4.2 4.2 0 0 0-4.2 4.2c0 3.2 4.2 8.8 4.2 8.8s4.2-5.6 4.2-8.8A4.2 4.2 0 0 0 8 1.5Zm0 5.6a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Z" />
    </svg>
  );
}
