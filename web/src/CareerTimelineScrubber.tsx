import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { CareerFrame, CareerMoment, CareerTimelineRole } from "@core/career-timeline";

const KIND_LABEL: Record<CareerMoment["kind"], string> = {
  started: "Started",
  milestone: "Milestone",
  event: "Event",
  moved: "Moved",
};

export function CareerTimelineScrubber({
  month,
  months,
  playing,
  frame,
  moments,
  onMonth,
  onPlay,
}: {
  month: string;
  months: string[];
  playing: boolean;
  frame: CareerFrame;
  moments: CareerMoment[];
  onMonth: (month: string) => void;
  onPlay: () => void;
}) {
  const holdDelay = useRef<number | null>(null);
  const holdRepeat = useRef<number | null>(null);
  const monthRef = useRef(month);
  const monthsRef = useRef(months);
  monthRef.current = month;
  monthsRef.current = months;
  const index = Math.max(0, months.indexOf(month));
  const leadMoments = frame.lead
    ? moments.filter((item) => item.roleId === frame.lead?.id)
    : [];

  function stopHold() {
    if (holdDelay.current !== null) window.clearTimeout(holdDelay.current);
    if (holdRepeat.current !== null) window.clearInterval(holdRepeat.current);
    holdDelay.current = null;
    holdRepeat.current = null;
  }

  function step(delta: number) {
    const list = monthsRef.current;
    const current = list.indexOf(monthRef.current);
    const next = list[Math.min(list.length - 1, Math.max(0, current + delta))];
    if (!next || next === monthRef.current) return;
    monthRef.current = next;
    onMonth(next);
  }

  function beginHold(delta: number) {
    stopHold();
    step(delta);
    holdDelay.current = window.setTimeout(() => {
      holdRepeat.current = window.setInterval(() => step(delta), 70);
    }, 280);
  }

  useEffect(() => {
    return () => {
      if (holdDelay.current !== null) window.clearTimeout(holdDelay.current);
      if (holdRepeat.current !== null) window.clearInterval(holdRepeat.current);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onMonth(
        months[
          Math.min(
            months.length - 1,
            Math.max(0, index + (event.key === "ArrowRight" ? 1 : -1)),
          )
        ] ?? month,
      );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, month, months, onMonth]);

  return (
    <>
      <DraggableCard>
        <FrameCopy frame={frame} />
        {leadMoments.length > 0 ? (
          <ol>
            {leadMoments.map((item) => (
              <li key={item.id}>
                <button
                  className={item.at === month ? "is-active" : ""}
                  onClick={() => onMonth(item.at)}
                  type="button"
                >
                  <span>{item.at}</span>
                  {KIND_LABEL[item.kind]}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </DraggableCard>
      <div className="career-timeline-float">
        <div className="career-timeline-controls">
          <HoldButton label="Earlier month" onHold={() => beginHold(-1)} onRelease={stopHold}>
            ‹
          </HoldButton>
          <label>
            <span className="career-timeline-sr">Month</span>
            <input
              max={Math.max(0, months.length - 1)}
              min={0}
              onChange={(event) => onMonth(months[Number(event.target.value)] ?? month)}
              type="range"
              value={index}
            />
          </label>
          <HoldButton label="Later month" onHold={() => beginHold(1)} onRelease={stopHold}>
            ›
          </HoldButton>
          <button onClick={onPlay} type="button">
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      </div>
    </>
  );
}

function DraggableCard({ children }: { children: ReactNode }) {
  const cardRef = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number; pointerId: number } | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function start(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
    const card = cardRef.current;
    if (!card) return;
    const box = card.getBoundingClientRect();
    drag.current = {
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      pointerId: event.pointerId,
    };
    card.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const card = cardRef.current;
    const stage = card?.offsetParent;
    const active = drag.current;
    if (!card || !(stage instanceof HTMLElement) || !active || event.pointerId !== active.pointerId) {
      return;
    }
    const stageBox = stage.getBoundingClientRect();
    const left = event.clientX - stageBox.left - active.dx;
    const top = event.clientY - stageBox.top - active.dy;
    setPlace({
      left: clamp(left, 0, stage.clientWidth - card.offsetWidth),
      top: clamp(top, 0, stage.clientHeight - card.offsetHeight),
    });
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return;
    drag.current = null;
    setDragging(false);
  }

  return (
    <article
      className={dragging ? "career-timeline-card is-dragging" : "career-timeline-card"}
      onPointerCancel={end}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      ref={cardRef}
      style={place ?? undefined}
    >
      {children}
    </article>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function HoldButton({
  label,
  onHold,
  onRelease,
  children,
}: {
  label: string;
  onHold: () => void;
  onRelease: () => void;
  children: string;
}) {
  return (
    <button
      aria-label={label}
      onPointerCancel={onRelease}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onHold();
      }}
      onPointerUp={onRelease}
      type="button"
    >
      {children}
    </button>
  );
}

function FrameCopy({ frame }: { frame: CareerFrame }) {
  const lead = frame.lead;
  const home = frame.home;
  if (frame.moment?.kind === "moved" && home) {
    return (
      <>
        <p>
          Moved · {frame.moment.at}
        </p>
        <h2>{home.label}</h2>
        <span>
          {home.address}
          {home.pinned ? "" : " · No pin yet"}
        </span>
        {lead ? <p className="is-also">Underway · {lead.organization}</p> : null}
        {!lead && frame.earlier ? (
          <p className="is-also">Earlier · {frame.earlier.organization}</p>
        ) : null}
        <AlsoOpen roles={frame.alsoOpen} />
      </>
    );
  }
  if (frame.tone === "moment" && frame.moment && lead) {
    return (
      <>
        <p>
          {KIND_LABEL[frame.moment.kind]} · {frame.moment.at}
        </p>
        <h2>{frame.moment.kind === "started" ? lead.organization : frame.moment.title}</h2>
        <strong>{lead.title}</strong>
        <Place lead={lead} />
        <AlsoOpen roles={frame.alsoOpen} />
        <HomeLine home={home} />
      </>
    );
  }
  if (lead) {
    return (
      <>
        <p>Underway · {frame.month}</p>
        <h2>{lead.organization}</h2>
        <strong>{lead.title}</strong>
        <Place lead={lead} />
        <AlsoOpen roles={frame.alsoOpen} />
        <HomeLine home={home} />
      </>
    );
  }
  return (
    <>
      <p>{frame.month}</p>
      <h2>Between roles</h2>
      <strong>{frame.earlier?.organization || "No role this month"}</strong>
      <HomeLine home={home} />
    </>
  );
}

function HomeLine({ home }: { home: CareerFrame["home"] }) {
  if (!home) return null;
  return (
    <p className="is-also">
      Home · {home.label}
      {home.pinned ? "" : " · No pin yet"}
    </p>
  );
}

function Place({ lead }: { lead: CareerTimelineRole }) {
  return (
    <span>
      {[lead.organization, lead.place].filter(Boolean).join(" · ")}
      {lead.pinned ? "" : " · No pin yet"}
    </span>
  );
}

function AlsoOpen({ roles }: { roles: CareerTimelineRole[] }) {
  if (roles.length === 0) return null;
  return <p className="is-also">Also open · {roles.map((role) => role.organization).join(", ")}</p>;
}

