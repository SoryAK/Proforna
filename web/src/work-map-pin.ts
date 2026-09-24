import type { MapPinIcons, MapPinTheme } from "@core/map-settings";

export type RolePinInput = {
  kind: string;
  icon: string;
  fill: string;
  current: boolean;
  focused: boolean;
  secondary: boolean;
  startDate: string;
  endDate: string;
  ring: string;
  currentRing: string;
};

export function rolePinPresentation(pin: RolePinInput): {
  size: number;
  fill: string;
  icon: string;
  border: string;
  opacity: number;
  fontSize: number;
} {
  const months = spanMonths(pin.startDate, pin.current ? "" : pin.endDate);
  const base = months >= 60 ? 38 : months >= 24 ? 34 : months >= 12 ? 30 : 26;
  const size = pin.focused ? base + 4 : pin.secondary ? 20 : base;
  const emojiSize = size < 30 ? 14 : size < 36 ? 16 : 18;
  return {
    size,
    fill: pin.fill,
    icon: pin.icon,
    border: pin.current ? `3px solid ${pin.currentRing}` : `2.5px solid ${pin.ring}`,
    opacity: pin.secondary ? 0.45 : 1,
    fontSize: emojiSize,
  };
}

export function rolePinHtml(pin: RolePinInput): { html: string; size: number } {
  const view = rolePinPresentation(pin);
  const html = `<div style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:${view.size}px;height:${view.size}px;border-radius:50%;background:${view.fill};backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:${view.border};box-shadow:0 2px 6px rgba(0,0,0,0.28);font-size:${view.fontSize}px;line-height:1;opacity:${view.opacity}"><span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;line-height:1">${escapeHtml(view.icon)}</span></div>`;
  return { html, size: view.size };
}

export function rolePinUrl(pin: RolePinInput): { url: string; size: number } {
  const view = rolePinPresentation(pin);
  const radius = view.size / 2 - (pin.current ? 2.2 : 1.8);
  const stroke = pin.current ? pin.currentRing : pin.ring;
  const weight = pin.current ? 3 : 2.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${view.size}" height="${view.size}" viewBox="0 0 ${view.size} ${view.size}"><circle cx="${view.size / 2}" cy="${view.size / 2}" r="${radius}" fill="${view.fill}" stroke="${stroke}" stroke-width="${weight}" opacity="${view.opacity}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="central" font-size="${view.fontSize}" opacity="${view.opacity}">${escapeHtml(view.icon)}</text></svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, size: view.size };
}

export function pinFill(theme: MapPinTheme, _kind: string): string {
  return theme.disc;
}

export function pinIcon(icons: MapPinIcons, kind: string): string {
  if (kind === "school") return icons.school;
  if (kind === "internship") return icons.internship;
  return icons.job;
}

function spanMonths(start: string, end: string): number {
  const from = monthParts(start);
  const to = monthParts(end) ?? monthParts(new Date().toISOString().slice(0, 7));
  if (!from || !to) return 0;
  return Math.max(0, (to.year - from.year) * 12 + (to.month - from.month));
}

function monthParts(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
