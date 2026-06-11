/**
 * WorklogReaderRightRail — Tolaria pattern #1 surface (ADR-0023).
 *
 * Desktop-only right rail for the worklog reader. Two-region layout:
 *   • 44px vertical icon strip — one button per tab + collapse toggle
 *   • 320px content panel    — active tab body (lazy-rendered)
 *
 * Collapsing hides the 320px panel; the icon strip stays visible so the rail
 * is still operable. State (active tab + collapsed flag) is persisted
 * per-user via useReaderRailState → POST /reader-rail (optimistic).
 *
 * Keyboard:
 *   ⌘1–⌘4  switch tabs
 *   ⌘\     toggle collapse
 *
 * Shortcuts are bound at the document level but suppressed when the active
 * element is inside a contenteditable (Tiptap) or form input so they never
 * fight the editor for keystrokes.
 *
 * Unit 2 scope: shell + chrome + state wiring. Tab bodies render placeholder
 * content. Real panel hosting (Backlinks/History/Tags/Photos) lands in Unit 3.
 */

"use client";

import { useEffect, useMemo } from "react";
import { ChevronsRight, ChevronsLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";
import type { JobAsset, AssetPickerPosition } from "@/components/asset-picker";
import type { EquipmentItem } from "@/components/equipment-picker";
import { RAIL_TABS, type RailTabId } from "./rail-tabs";
import { useReaderRailState } from "./use-reader-rail-state";
import { BacklinksTab } from "./tabs/backlinks-tab";
import { HistoryTab } from "./tabs/history-tab";
import { PropertiesTab } from "./tabs/properties-tab";
import { PhotosTab } from "./tabs/photos-tab";

export interface WorklogReaderRightRailProps {
  /**
   * Id of the currently selected note. When null, the rail unmounts entirely
   * (no-selection mode is handled in Unit 4).
   */
  activeNoteId: string | null;
  /** Current document plain-text — needed by the History tab for diffs. */
  currentPlainText: string;
  /**
   * Active note record — needed by the Properties tab (ADR-0025 Unit 3) to
   * bind the autosave fields. Null while the active log is resolving.
   */
  activeLog?: WorkLog | null;
  /**
   * Commit a single-field update for the active note. Required when activeLog
   * is provided so the Properties tab can write back. Same shape as the
   * reader's `onUpdate`.
   */
  onUpdateActiveLog?: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  /** Tag autocomplete corpus passed through to the Properties tab. */
  tagSuggestions?: string[];
  /** Asset corpus for the Properties tab's Assets field. */
  assets?: JobAsset[];
  /** Position dropdown options for the Properties tab's Assets field. */
  positions?: AssetPickerPosition[];
  /** Equipment corpus for the Properties tab's Tools field. */
  equipment?: EquipmentItem[];
  className?: string;
}

const STRIP_WIDTH = "w-11"; // 44px
const PANEL_WIDTH = "w-80"; // 320px

export function WorklogReaderRightRail({
  activeNoteId,
  currentPlainText,
  activeLog,
  onUpdateActiveLog,
  tagSuggestions,
  assets,
  positions,
  equipment,
  className,
}: WorklogReaderRightRailProps) {
  const { tab, collapsed, setTab, toggleCollapsed } = useReaderRailState();

  // ── ⌘1–4 + ⌘\ keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    // No active note means no rail — don't bind shortcuts.
    if (!activeNoteId) return;

    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;

      // Don't hijack keystrokes inside editors or form fields.
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.closest("[contenteditable='true']")) return;
      }

      if (event.key === "\\") {
        event.preventDefault();
        toggleCollapsed();
        return;
      }

      const digit = Number(event.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > RAIL_TABS.length) return;
      const target_tab = RAIL_TABS[digit - 1];
      if (!target_tab) return;
      event.preventDefault();
      setTab(target_tab.id);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeNoteId, setTab, toggleCollapsed]);

  const activeTab = useMemo(
    () => RAIL_TABS.find((t) => t.id === tab) ?? RAIL_TABS[0],
    [tab],
  );

  // Don't render the rail when no note is selected. Unit 4 will introduce a
  // 7px ghost stub for no-selection mode; for now the rail unmounts cleanly.
  if (!activeNoteId) return null;

  return (
    <aside
      data-testid="worklog-reader-right-rail"
      aria-label="Note details rail"
      className={cn(
        "hidden xl:flex h-full shrink-0 flex-row border-l border-border/60 bg-background/50",
        className,
      )}
    >
      {/* ── 320px content panel (hidden when collapsed) ────────────── */}
      {!collapsed && (
        <div
          className={cn(
            "flex h-full flex-col border-r border-border/60",
            PANEL_WIDTH,
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {activeTab.label}
            </h2>
          </header>
          <div className="flex-1 overflow-y-auto">
            {renderTabBody(
              activeTab.id,
              activeNoteId,
              currentPlainText,
              activeLog ?? null,
              onUpdateActiveLog,
              tagSuggestions,
              assets ?? [],
              positions ?? [],
              equipment ?? [],
            )}
          </div>
        </div>
      )}

      {/* ── 44px icon strip (always visible when rail is mounted) ───── */}
      <div
        className={cn(
          "flex h-full flex-col items-center gap-1 py-2",
          STRIP_WIDTH,
        )}
      >
        {RAIL_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = !collapsed && t.id === activeTab.id;
          return (
            <Button
              key={t.id}
              type="button"
              variant="ghost"
              size="icon"
              aria-pressed={isActive}
              aria-label={`${t.label} (⌘${t.shortcut})`}
              title={`${t.label} · ⌘${t.shortcut}`}
              onClick={() => {
                if (collapsed) {
                  // Expanding via an icon click should both un-collapse and
                  // route the user to that tab. setTab handles the tab; flip
                  // collapsed only if needed.
                  toggleCollapsed();
                }
                setTab(t.id);
              }}
              className={cn(
                "h-8 w-8 rounded-md text-muted-foreground transition-colors",
                "hover:bg-orange-500/10 hover:text-orange-300",
                "focus-visible:ring-1 focus-visible:ring-orange-400/60",
                isActive && "bg-orange-500/15 text-orange-200",
              )}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}

        <div className="mt-auto">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand rail (⌘\\)" : "Collapse rail (⌘\\)"}
            title={collapsed ? "Expand · ⌘\\" : "Collapse · ⌘\\"}
            onClick={toggleCollapsed}
            className={cn(
              "h-8 w-8 rounded-md text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:ring-1 focus-visible:ring-orange-400/60",
            )}
          >
            {collapsed ? (
              <ChevronsLeft className="h-4 w-4" />
            ) : (
              <ChevronsRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}

// ── tab dispatch ────────────────────────────────────────────────────────

function renderTabBody(
  tabId: RailTabId,
  noteId: string,
  currentPlainText: string,
  activeLog: WorkLog | null,
  onUpdateActiveLog: ((patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>) | undefined,
  tagSuggestions: string[] | undefined,
  assets: JobAsset[],
  positions: AssetPickerPosition[],
  equipment: EquipmentItem[],
) {
  switch (tabId) {
    case "backlinks":
      return <BacklinksTab noteId={noteId} />;
    case "history":
      return <HistoryTab noteId={noteId} currentPlainText={currentPlainText} />;
    case "properties":
      // onUpdateActiveLog is required for the Properties tab — if a parent
      // forgets to wire it, the tab degrades into a no-op rather than crashing.
      return (
        <PropertiesTab
          log={activeLog}
          onUpdate={onUpdateActiveLog ?? (() => undefined)}
          tagSuggestions={tagSuggestions}
          assets={assets}
          positions={positions}
          equipment={equipment}
        />
      );
    case "photos":
      return <PhotosTab noteId={noteId} />;
    default: {
      // Exhaustiveness guard — if a new tab is added to RAIL_TABS without
      // a case here, TypeScript will catch it via the `never` assignment.
      const _exhaustive: never = tabId;
      return _exhaustive;
    }
  }
}
