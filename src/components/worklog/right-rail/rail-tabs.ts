/**
 * ADR-0023 / ADR-0025 — Worklog reader right-rail tab registry.
 *
 * Single source of truth for the tabs exposed by the right-rail surface.
 * Keep this list in sync with:
 *   • WorklogPreferences.readerRailTab (src/types/worklog.ts)
 *   • ALLOWED_RAIL_TABS validator in /api/work-logs/preferences/reader-rail
 *
 * Each entry owns its icon, label, keyboard shortcut digit, and (later) a
 * badge source.
 *
 * ADR-0025 history:
 *   - Unit 3: `"tags"` tab renamed and broadened to `"properties"` (Tags +
 *     Assets + Tools stacked).
 *   - Unit 4: `"backlinks"` and `"history"` tabs collapsed INTO `"properties"`.
 *     Registry shrinks from 4 → 2 tabs: Properties + Photos.
 *
 * Read-side migration is applied at every boundary via {@link migrateLegacyRailTab}.
 */

import type { ComponentType } from "react";
import { Settings2, Image as ImageIcon } from "lucide-react";

export type RailTabId = "properties" | "photos";

export interface RailTabDef {
  id: RailTabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Digit pressed with ⌘ to activate this tab (⌘1–⌘2). */
  shortcut: 1 | 2;
}

export const RAIL_TABS: readonly RailTabDef[] = [
  { id: "properties", label: "Properties", icon: Settings2, shortcut: 1 },
  { id: "photos",     label: "Photos",     icon: ImageIcon, shortcut: 2 },
] as const;

export const DEFAULT_RAIL_TAB: RailTabId = "properties";

/** Tab ids that were absorbed into the Properties tab and must be aliased. */
const LEGACY_PROPERTIES_ALIASES = new Set(["tags", "backlinks", "history"]);

/**
 * Map any legacy persisted tab id to its current canonical value.
 *
 * ADR-0025: rows persisted before Units 3 / 4 may contain `"tags"`,
 * `"backlinks"`, or `"history"`. We silently surface them as `"properties"`
 * so the user lands on the panel that now hosts those concerns. Removable
 * in a future cleanup once all rows have cycled through a save.
 */
export function migrateLegacyRailTab(value: unknown): unknown {
  if (typeof value === "string" && LEGACY_PROPERTIES_ALIASES.has(value)) {
    return "properties";
  }
  return value;
}

/** Type guard for runtime-derived tab values (server payload, URL, etc.). */
export function isRailTabId(value: unknown): value is RailTabId {
  return (
    typeof value === "string" &&
    RAIL_TABS.some((t) => t.id === value)
  );
}
