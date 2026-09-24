export type MapProvider = "openstreetmap" | "google";

export type MapPinKind = "job" | "internship" | "school";

export type MapThemeId = "kind" | "gold";

export type MapPinIcons = Record<MapPinKind, string>;

export type MapPinTheme = {
  id: MapThemeId;
  label: string;
  disc: string;
  job: string;
  internship: string;
  school: string;
  ring: string;
  currentRing: string;
};

export type MapSettings = {
  provider: MapProvider;
  googleMapsApiKey: string;
  theme: MapThemeId;
  icons: MapPinIcons;
};

export type MapSettingsError =
  | "provider-invalid"
  | "key-required"
  | "theme-invalid"
  | "icon-invalid";

export const MAP_THEMES: Record<MapThemeId, MapPinTheme> = {
  kind: {
    id: "kind",
    label: "Kind",
    disc: "rgba(107, 114, 128, 0.88)",
    job: "#6b7280",
    internship: "#6b7280",
    school: "#6b7280",
    ring: "rgba(255,255,255,0.9)",
    currentRing: "#10b981",
  },
  gold: {
    id: "gold",
    label: "Gold",
    disc: "rgba(68, 58, 48, 0.88)",
    job: "#6b7280",
    internship: "#6b7280",
    school: "#6b7280",
    ring: "rgba(242, 209, 155, 0.85)",
    currentRing: "#f2d19b",
  },
};

export const MAP_ICON_CHOICES: Record<MapPinKind, readonly string[]> = {
  job: ["💼", "🏢", "🛠️", "⚙️"],
  internship: ["🌱", "🏢", "💼", "🧪"],
  school: ["🎓", "📚", "🏫", "✏️"],
};

export const DEFAULT_MAP_ICONS: MapPinIcons = {
  job: "💼",
  internship: "🌱",
  school: "🎓",
};

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  provider: "openstreetmap",
  googleMapsApiKey: "",
  theme: "kind",
  icons: DEFAULT_MAP_ICONS,
};

const PIN_KINDS: MapPinKind[] = ["job", "internship", "school"];

export function prepareMapSettings(
  input: {
    provider?: unknown;
    googleMapsApiKey?: unknown;
    theme?: unknown;
    icons?: unknown;
  },
  current: MapSettings = DEFAULT_MAP_SETTINGS,
):
  | { ok: true; value: MapSettings }
  | { ok: false; error: MapSettingsError } {
  if (input.provider !== "openstreetmap" && input.provider !== "google") {
    return { ok: false, error: "provider-invalid" };
  }
  const googleMapsApiKey =
    typeof input.googleMapsApiKey === "string" ? input.googleMapsApiKey.trim() : "";
  if (input.provider === "google" && !googleMapsApiKey) {
    return { ok: false, error: "key-required" };
  }
  const theme = input.theme === undefined ? current.theme : mapTheme(input.theme);
  if (!theme) return { ok: false, error: "theme-invalid" };
  const icons = input.icons === undefined ? current.icons : mapIcons(input.icons, current.icons);
  if (!icons) return { ok: false, error: "icon-invalid" };
  return {
    ok: true,
    value: { provider: input.provider, googleMapsApiKey, theme, icons },
  };
}

export function parseMapIcons(value: string | null | undefined): MapPinIcons {
  let parsed: unknown = {};
  if (value) {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      parsed = {};
    }
  }
  return mapIcons(parsed, DEFAULT_MAP_ICONS) ?? DEFAULT_MAP_ICONS;
}

function mapTheme(value: unknown): MapThemeId | null {
  return value === "kind" || value === "gold" ? value : null;
}

function mapIcons(value: unknown, fallback: MapPinIcons): MapPinIcons | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const icons = { ...fallback };
  for (const kind of PIN_KINDS) {
    if (record[kind] === undefined) continue;
    const icon = pinIcon(record[kind]);
    if (!icon) return null;
    icons[kind] = icon;
  }
  return icons;
}

function pinIcon(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || [...text].length > 8) return null;
  if (/[\u0000-\u001f<>&]/.test(text)) return null;
  return text;
}
