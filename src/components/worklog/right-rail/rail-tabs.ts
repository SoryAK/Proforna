/**
 * ADR-0023 — Worklog reader right-rail tab registry.
 *
 * Single source of truth for the 4 tabs exposed by the right-rail surface.
 * Keep this list in sync with:
 *   • WorklogPreferences.readerRailTab (src/types/worklog.ts)
 *   • ALLOWED_RAIL_TABS validator in /api/work-logs/preferences/reader-rail
 *
 * Each entry owns its icon, label, keyboard shortcut digit, and (later) a
 * badge source. Badge wiring lives in Unit 3 alongside real tab content.
 */

import type { ComponentType } from "react";
import { Link2, History, Tag, Image as ImageIcon } from "lucide-react";

export type RailTabId = "backlinks" | "history" | "tags" | "photos";

export interface RailTabDef {
  id: RailTabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Digit pressed with ⌘ to activate this tab (⌘1–⌘4). */
  shortcut: 1 | 2 | 3 | 4;
}

export const RAIL_TABS: readonly RailTabDef[] = [
  { id: "backlinks", label: "Backlinks", icon: Link2,     shortcut: 1 },
  { id: "history",   label: "History",   icon: History,   shortcut: 2 },
  { id: "tags",      label: "Tags",      icon: Tag,       shortcut: 3 },
  { id: "photos",    label: "Photos",    icon: ImageIcon, shortcut: 4 },
] as const;

export const DEFAULT_RAIL_TAB: RailTabId = "backlinks";

/** Type guard for runtime-derived tab values (server payload, URL, etc.). */
export function isRailTabId(value: unknown): value is RailTabId {
  return (
    typeof value === "string" &&
    RAIL_TABS.some((t) => t.id === value)
  );
}
