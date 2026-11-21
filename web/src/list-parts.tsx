import { useEffect, useRef, useState } from "react";

/** Small pieces shared by Requests and Access. */

/** "Just now", "20m ago", "3h ago", "Yesterday", then a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "Yesterday";
  return shortDate(iso);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Lines a text box needs for its text, so it grows from `min` up to `max` and then scrolls. */
export function growRows(value: string, min: number, max: number): number {
  const lines = value.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 70)), 0);
  return Math.min(max, Math.max(min, lines));
}

/** Astryx's counter, shown only once a text is close to its limit. */
export function nearLimit(value: string, max: number): number | undefined {
  return value.length >= max * 0.75 ? max : undefined;
}

/** A quoted message cut to three lines, with Show more when it's longer. */
export function Quote({ text, prefix = "" }: { text: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <span className="req-quote">
      <span ref={ref} className={open ? "req-note" : "req-note is-clamped"}>
        {prefix}“{text}”
      </span>
      {long || open ? (
        <button type="button" className="req-more" onClick={() => setOpen((value) => !value)}>
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </span>
  );
}

export function matches(query: string, ...fields: string[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = fields.join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}
