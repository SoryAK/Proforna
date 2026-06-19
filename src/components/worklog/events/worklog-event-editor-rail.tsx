/**
 * WorklogEventEditorRail — desktop right-rail for the inline event
 * editor (ADR-0034). Parallel shell to `WorklogReaderRightRail` —
 * shares no code but mirrors the chrome the user already learned on
 * notes:
 *
 *   • 44px icon strip (one button per tab)
 *   • 320px content panel showing the active tab body
 *   • Edge collapse sash with chevron flip
 *   • ⌘\ keyboard shortcut to toggle collapse
 *
 * Multi-tab API (added when Photos joined Properties — companion to
 * ADR-0034 photo-gallery follow-up): caller passes `tabs[]` with
 * `{ id, label, icon, content }`. Active tab is internal state,
 * defaults to first tab. Clicking an icon while collapsed both
 * switches the tab AND expands the panel. Clicking the active tab
 * collapses (mirrors notes rail).
 *
 * Collapse state is local-only for now (per-component `useState`).
 * When we extend to persist, we'll lift to a `useEventEditorRailState`
 * hook mirroring the notes side.
 */

"use client";

import { useEffect, useState } from "react";
import { ChevronsRight, ChevronsLeft, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STRIP_WIDTH = "w-11"; // 44px
const PANEL_WIDTH = "w-80"; // 320px

export interface RailTab {
  id: string;
  label: string;
  icon: LucideIcon;
  content: React.ReactNode;
  /** Optional small numeric badge — shown both on the icon strip and in the panel header. */
  badge?: number | null;
}

export interface WorklogEventEditorRailProps {
  tabs: RailTab[];
  /** Tab to start on. Defaults to first tab. */
  defaultTabId?: string;
  className?: string;
}

export function WorklogEventEditorRail({
  tabs,
  defaultTabId,
  className,
}: WorklogEventEditorRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState<string>(() => defaultTabId ?? tabs[0]?.id ?? "");

  // Self-heal if the parent removes/reorders tabs and the active id is gone.
  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((t) => t.id === activeId)) {
      setActiveId(tabs[0].id);
    }
  }, [tabs, activeId]);

  // ⌘\ toggles collapse, but only when not focused inside an input/editor.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key !== "\\") return;

      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.closest("[contenteditable='true']")) return;
      }
      event.preventDefault();
      setCollapsed((c) => !c);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <aside
      data-testid="worklog-event-editor-rail"
      aria-label="Event details rail"
      className={cn(
        "hidden xl:flex h-full shrink-0 flex-row border-l border-border/60 bg-background/50 relative",
        className,
      )}
    >
      {/* Edge collapse handle (mirrors the notes rail). */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand rail (⌘\\)" : "Collapse rail (⌘\\)"}
        title={collapsed ? "Expand · ⌘\\" : "Collapse · ⌘\\"}
        className={cn(
          "group absolute top-1/2 -translate-y-1/2 -left-3 z-20",
          "flex items-center justify-center h-12 w-6 rounded-md",
          "border border-border/60 bg-background/95 backdrop-blur-sm",
          "text-muted-foreground transition-all",
          "hover:bg-muted hover:text-foreground hover:border-border",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60",
          "shadow-sm",
        )}
      >
        {collapsed ? (
          <ChevronsLeft className="h-3.5 w-3.5" />
        ) : (
          <ChevronsRight className="h-3.5 w-3.5" />
        )}
      </button>

      {/* 320px content panel — hidden when collapsed. */}
      {!collapsed && active && (
        <div className={cn("flex h-full flex-col border-r border-border/60", PANEL_WIDTH)}>
          <header className="h-12 flex items-center gap-2 border-b border-border/60 px-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {active.label}
            </h2>
            {typeof active.badge === "number" && active.badge > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
                {active.badge}
              </span>
            )}
          </header>
          <div className="flex-1 overflow-y-auto p-3">{active.content}</div>
        </div>
      )}

      {/* 44px icon strip — one button per tab. */}
      <div className={cn("flex h-full flex-col items-center gap-1 py-2", STRIP_WIDTH)}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = !collapsed && tab.id === activeId;
          return (
            <Button
              key={tab.id}
              type="button"
              variant="ghost"
              size="icon"
              aria-pressed={isActive}
              aria-label={tab.label}
              title={tab.label}
              onClick={() => {
                if (collapsed) {
                  setCollapsed(false);
                  setActiveId(tab.id);
                  return;
                }
                if (tab.id === activeId) {
                  setCollapsed(true);
                  return;
                }
                setActiveId(tab.id);
              }}
              className={cn(
                "relative h-8 w-8 rounded-md text-muted-foreground transition-colors",
                "hover:bg-orange-500/10 hover:text-orange-300",
                "focus-visible:ring-1 focus-visible:ring-orange-400/60",
                isActive && "bg-orange-500/15 text-orange-200",
              )}
            >
              <Icon className="h-4 w-4" />
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold text-white"
                >
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </aside>
  );
}
