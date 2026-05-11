"use client";

import * as React from "react";

/**
 * Shared structural shell for the Immersive Resume (IR) and Work Mapping
 * surfaces. This component owns *only* the outer layout chrome — flex
 * container, sidebar widths, borders, and backdrop — so both surfaces stay
 * visually in sync. Stateful content (bio card, work-history list, map,
 * insights, etc.) is supplied by the consumer via slot props.
 *
 * Visual tokens are kept in sync with `resume-immersive-map.tsx`:
 *   - SIDEBAR_CARD_CHROME → card chrome inside the aside
 *   - aside widths        → w-[min(26rem,calc(100vw-24px))] lg:w-[32rem] xl:w-[36rem]
 *   - tools rail widths   → w-14 lg:w-16
 *   - outer container     → relative flex h-screen bg-gray-950 (fullscreen=true)
 *
 * Order matches IR: tools rail (order-1) → aside (order-1) → center (order-2).
 */

export const SIDEBAR_CARD_CHROME =
  "bg-background/95 backdrop-blur-md border rounded-xl shadow-xl p-3";

export interface ImmersiveLayoutProps {
  /** Optional thin tools rail rendered at the far left. */
  toolsRail?: React.ReactNode;
  /** Left aside content (bio card, work-history list, KPI tiles, etc.). */
  aside?: React.ReactNode;
  /** Center column content (map, resize handle, insights, etc.). */
  center: React.ReactNode;
  /** When true, occupy the full viewport (`h-screen`). When false, fill the parent (`h-full`). */
  fullscreen?: boolean;
  /** When true, hide the aside (keeps tools rail visible). */
  asideCollapsed?: boolean;
  /** Optional ref attached to the center column (used by IR for resize calculations). */
  centerRef?: React.Ref<HTMLDivElement>;
  /** Extra className on the outer container. */
  className?: string;
}

export function ImmersiveLayout({
  toolsRail,
  aside,
  center,
  fullscreen = true,
  asideCollapsed = false,
  centerRef,
  className,
}: ImmersiveLayoutProps) {
  const outer = [
    "relative flex",
    fullscreen ? "h-screen bg-gray-950" : "h-full",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={outer}>
      {toolsRail && (
        <div className="order-1 w-14 lg:w-16 shrink-0 border-r border-white/10 bg-background/70 backdrop-blur-md p-2 lg:p-3">
          {toolsRail}
        </div>
      )}
      {aside && !asideCollapsed && (
        <aside className="order-1 w-[min(26rem,calc(100vw-24px))] lg:w-[32rem] xl:w-[36rem] shrink-0 border-r border-white/10 bg-background/70 backdrop-blur-md overflow-y-auto">
          <div className="flex min-h-full flex-col gap-2.5 p-3">{aside}</div>
        </aside>
      )}
      <div
        ref={centerRef}
        className="relative order-2 flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        {center}
      </div>
    </div>
  );
}

export default ImmersiveLayout;
