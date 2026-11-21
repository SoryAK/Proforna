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

/** Colors for initials: dark enough for white text, distinct from each other. */
const AVATAR_COLORS = ["#7c5cd6", "#2e8b7a", "#c0603a", "#3a6fc0", "#a04a7a", "#5f7f2e", "#b8742a", "#4f5bd5", "#2f7f9e", "#8a5a44"];

/** The same name always gets the same color. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed.trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** A person's photo when Docier has one, otherwise their initials in their color. */
export function PersonAvatar({ name, photoUrl, size = 32 }: { name: string; photoUrl?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [photoUrl]);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (photoUrl && !broken) {
    return <img className="person-avatar" src={photoUrl} alt="" style={style} onError={() => setBroken(true)} />;
  }
  return (
    <span className="person-avatar" aria-hidden="true" style={{ ...style, background: avatarColor(name) }}>
      {initials(name)}
    </span>
  );
}
