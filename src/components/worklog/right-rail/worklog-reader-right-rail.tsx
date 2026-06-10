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

import { useEffect, useMemo, type ReactNode } from "react";
import { ChevronsRight, ChevronsLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RAIL_TABS, type RailTabId } from "./rail-tabs";
import { useReaderRailState } from "./use-reader-rail-state";

export interface WorklogReaderRightRailProps {
  /** Optional override for the tab body. Defaults to a placeholder slate per tab. */
  renderTab?: (tabId: RailTabId) => ReactNode;
  className?: string;
}

const STRIP_WIDTH = "w-11"; // 44px
const PANEL_WIDTH = "w-80"; // 320px

export function WorklogReaderRightRail({ renderTab, className }: WorklogReaderRightRailProps) {
  const { tab, collapsed, setTab, toggleCollapsed } = useReaderRailState();

  // ── ⌘1–4 + ⌘\ keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
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
  }, [setTab, toggleCollapsed]);

  const activeTab = useMemo(
    () => RAIL_TABS.find((t) => t.id === tab) ?? RAIL_TABS[0],
    [tab],
  );

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
            {renderTab ? renderTab(activeTab.id) : <PlaceholderTabBody tabId={activeTab.id} />}
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

// ── placeholder bodies (replaced in Unit 3) ─────────────────────────────

function PlaceholderTabBody({ tabId }: { tabId: RailTabId }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center text-xs text-muted-foreground">
      <p className="font-medium uppercase tracking-wider text-muted-foreground/70">
        {tabId}
      </p>
      <p className="mt-2 max-w-[16rem] text-muted-foreground/70">
        Tab content wired in Unit 3.
      </p>
    </div>
  );
}
