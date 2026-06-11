/**
 * ADR-0023 / ADR-0025 — Worklog reader right-rail tab registry.
 *
 * Single source of truth for the 4 tabs exposed by the right-rail surface.
 * Keep this list in sync with:
 *   • WorklogPreferences.readerRailTab (src/types/worklog.ts)
 *   • ALLOWED_RAIL_TABS validator in /api/work-logs/preferences/reader-rail
 *
 * Each entry owns its icon, label, keyboard shortcut digit, and (later) a
 * badge source. Badge wiring lives in Unit 3 alongside real tab content.
 *
 * ADR-0025: the legacy `"tags"` tab was renamed and broadened into
 * `"properties"`. The tab now hosts Tags + Assets + Tools (was Tags only).
 * Read-side migration is applied at every boundary via {@link migrateLegacyRailTab}.
 */

import type { ComponentType } from "react";
import { Link2, History, Settings2, Image as ImageIcon } from "lucide-react";

export type RailTabId = "backlinks" | "history" | "properties" | "photos";

export interface RailTabDef {
  id: RailTabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Digit pressed with ⌘ to activate this tab (⌘1–⌘4). */
  shortcut: 1 | 2 | 3 | 4;
}

export const RAIL_TABS: readonly RailTabDef[] = [
  { id: "backlinks",  label: "Backlinks",  icon: Link2,     shortcut: 1 },
  { id: "history",    label: "History",    icon: History,   shortcut: 2 },
  { id: "properties", label: "Properties", icon: Settings2, shortcut: 3 },
  { id: "photos",     label: "Photos",     icon: ImageIcon, shortcut: 4 },
] as const;

export const DEFAULT_RAIL_TAB: RailTabId = "backlinks";

/**
 * Map any legacy persisted tab id to its current canonical value.
 *
 * ADR-0025: rows persisted before the rename will contain `"tags"`. We
 * silently surface them as `"properties"` so the user lands on the tab they
 * actually configured. Removable in a future cleanup once all rows have
 * cycled through a save.
 */
export function migrateLegacyRailTab(value: unknown): unknown {
  if (value === "tags") return "properties";
  return value;
}

/** Type guard for runtime-derived tab values (server payload, URL, etc.). */
export function isRailTabId(value: unknown): value is RailTabId {
  return (
    typeof value === "string" &&
    RAIL_TABS.some((t) => t.id === value)
  );
}
