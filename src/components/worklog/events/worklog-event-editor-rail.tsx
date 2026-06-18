/**
 * WorklogEventEditorRail — desktop right-rail for the inline event
 * editor (ADR-0034). Parallel shell to `WorklogReaderRightRail` —
 * shares no code (note rail is `WorkLog`-shaped) but mirrors the
 * chrome the user already learned on notes:
 *
 *   • 44px icon strip (single Properties icon for now — Photos/Skills
 *     can plug in here later; structure ready)
 *   • 320px content panel
 *   • Edge collapse sash with chevron flip
 *   • ⌘\ keyboard shortcut to toggle collapse
 *
 * Collapse state is local-only for now (per-component `useState`). When
 * we extend to multi-tab + persist, we'll lift to a `useEventEditorRailState`
 * hook mirroring the notes side — kept simple here to ship ADR-0034.
 *
 * Body content is passed as `children` so the editor shell can wire
 * `EventPropertiesFields` + `EventLocationSection` with the right mode
 * (draft/floating/anchored) and commit hooks.
 */

"use client";

import { useEffect, useState } from "react";
import { ChevronsRight, ChevronsLeft, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STRIP_WIDTH = "w-11"; // 44px
const PANEL_WIDTH = "w-80"; // 320px

export interface WorklogEventEditorRailProps {
  /** Tab title shown in the panel header. */
  tabLabel?: string;
  /** Section body (typically the Properties fields + location section). */
  children: React.ReactNode;
  className?: string;
}

export function WorklogEventEditorRail({
  tabLabel = "Properties",
  children,
  className,
}: WorklogEventEditorRailProps) {
  const [collapsed, setCollapsed] = useState(false);

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
      {!collapsed && (
        <div className={cn("flex h-full flex-col border-r border-border/60", PANEL_WIDTH)}>
          <header className="h-12 flex items-center gap-2 border-b border-border/60 px-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {tabLabel}
            </h2>
          </header>
          <div className="flex-1 overflow-y-auto p-3">{children}</div>
        </div>
      )}

      {/* 44px icon strip — single Properties icon for now. */}
      <div className={cn("flex h-full flex-col items-center gap-1 py-2", STRIP_WIDTH)}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={!collapsed}
          aria-label="Properties"
          title="Properties"
          onClick={() => setCollapsed(false)}
          className={cn(
            "h-8 w-8 rounded-md text-muted-foreground transition-colors",
            "hover:bg-orange-500/10 hover:text-orange-300",
            "focus-visible:ring-1 focus-visible:ring-orange-400/60",
            !collapsed && "bg-orange-500/15 text-orange-200",
          )}
        >
          <ListChecks className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
