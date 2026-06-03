/**
 * View Preset model for the Job Map under-map section.
 *
 * One preset:
 *  - "map": map-only feature toggles
 *
 * Per-preset "tweaks" (e.g. action-bar collapsed state, bottom-frame ratio)
 * are persisted independently.
 */

export type ViewPreset = "map";

export const VIEW_PRESETS: ViewPreset[] = ["map"];

export const PRESET_META: Record<
  ViewPreset,
  { label: string; description: string }
> = {
  map: {
    label: "Map",
    description: "Geographic exploration with overlays and drawing tools.",
  },
};

/**
 * Default ratio for the TOP frame.
 */
export const PRESET_DEFAULT_RATIO: Record<ViewPreset, number> = {
  map: 0.65,
};

export const DEFAULT_VIEW_PRESET: ViewPreset = "map";

export interface PresetTweaks {
  /** Bottom-frame ratio (workMapHeightRatio). */
  ratio?: number;
  /** Whether the action-bar cards are collapsed. */
  collapsed?: boolean;
}

const VIEW_PRESET_KEY = "resumsify:job-map:view-preset";
const PRESET_TWEAKS_KEY = "resumsify:job-map:preset-tweaks";

// ── Persistence helpers ──────────────────────────────────────────────────────

export function loadViewPreset(): ViewPreset {
  if (typeof window === "undefined") return DEFAULT_VIEW_PRESET;
  try {
    const v = localStorage.getItem(VIEW_PRESET_KEY);
    if (v && (VIEW_PRESETS as string[]).includes(v)) return v as ViewPreset;
  } catch {}
  return DEFAULT_VIEW_PRESET;
}

export function saveViewPreset(p: ViewPreset): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(VIEW_PRESET_KEY, p); } catch {}
}

export function loadPresetTweaks(): Record<ViewPreset, PresetTweaks> {
  const empty: Record<ViewPreset, PresetTweaks> = {
    map: {},
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(PRESET_TWEAKS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Record<ViewPreset, PresetTweaks>>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export function savePresetTweaks(
  tweaks: Record<ViewPreset, PresetTweaks>,
): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PRESET_TWEAKS_KEY, JSON.stringify(tweaks)); } catch {}
}

export function resetAllPresets(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(VIEW_PRESET_KEY);
    localStorage.removeItem(PRESET_TWEAKS_KEY);
  } catch {}
}
