export const LIFE_ANCHOR_ICONS = [
  "home",
  "work",
  "school",
  "family",
  "gym",
  "worship",
  "other",
] as const;

export type LifeAnchorIcon = (typeof LIFE_ANCHOR_ICONS)[number];

export type LifeAnchor = {
  id: string;
  occupantId: string;
  label: string;
  icon: LifeAnchorIcon;
  address: string;
  latitude: number;
  longitude: number;
  weight: number;
};

export type LifeAnchorError =
  | "label-required"
  | "address-required"
  | "icon-invalid"
  | "place-not-found";

export function prepareLifeAnchor(
  input: {
    label?: unknown;
    icon?: unknown;
    address?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    weight?: unknown;
  },
  id: string,
  occupantId: string,
): { ok: true; value: LifeAnchor } | { ok: false; error: LifeAnchorError } {
  const label = text(input.label);
  const address = text(input.address);
  if (!label) return { ok: false, error: "label-required" };
  if (!address) return { ok: false, error: "address-required" };
  const icon = text(input.icon) || "home";
  if (!isIcon(icon)) return { ok: false, error: "icon-invalid" };
  const latitude = coordinate(input.latitude, 90);
  const longitude = coordinate(input.longitude, 180);
  if (latitude == null || longitude == null) return { ok: false, error: "place-not-found" };
  return {
    ok: true,
    value: {
      id,
      occupantId,
      label,
      icon,
      address,
      latitude,
      longitude,
      weight: weight(input.weight),
    },
  };
}

export function lifeScore(
  place: { latitude: number; longitude: number },
  anchors: Array<{ latitude: number; longitude: number; weight: number }>,
): number | null {
  const total = anchors.reduce((sum, anchor) => sum + anchor.weight, 0);
  if (total <= 0) return null;
  const scored = anchors.reduce((sum, anchor) => {
    const miles = distanceMiles(place, anchor);
    const nearness = 100 * Math.exp(-miles / 20);
    return sum + nearness * (anchor.weight / total);
  }, 0);
  return Math.round(scored);
}

function distanceMiles(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earth = 3958.8;
  const lat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const lng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const hav =
    Math.sin(lat / 2) ** 2 +
    Math.cos((from.latitude * Math.PI) / 180) *
      Math.cos((to.latitude * Math.PI) / 180) *
      Math.sin(lng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

function weight(value: unknown): number {
  const number = typeof value === "number" ? value : Number(text(value) || "3");
  if (!Number.isFinite(number)) return 3;
  return Math.min(5, Math.max(1, Math.round(number)));
}

function coordinate(value: unknown, limit: 90 | 180): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(text(value));
  if (!Number.isFinite(number) || number < -limit || number > limit) return null;
  return number;
}

function isIcon(value: string): value is LifeAnchorIcon {
  return (LIFE_ANCHOR_ICONS as readonly string[]).includes(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
