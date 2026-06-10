/**
 * WorklogSendMenu — shared Download / Share to… dropdown used by the
 * bulk-action bar (selection-driven sends) AND the top-of-page toolbar
 * (current-view export, ADR-0022 addendum 2 — 2026-06-10).
 *
 * One verb, two destinations. Download always works; Share to… routes
 * through Web Share and silently falls back to download + toast on
 * unsupported browsers (handled inside the parent's `onShare` via
 * `shareWorklogs` from src/lib/worklog/share/share-client.ts).
 *
 * `count` drives the .md vs .zip wording so the user knows what they're
 * sending before they pick a destination. `triggerLabel` lets each surface
 * frame the action contextually ("Send" for selection, "Export" for the
 * top-level current-view affordance).
 */

"use client";

import type { ReactNode } from "react";
import { ChevronDown, Download, Send, Share2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface WorklogSendMenuProps {
  /** Number of notes that will be sent. Drives .md vs .zip wording. */
  count: number;
  /**
   * Always-available "save the file to disk" action. Wired to
   * `exportBulkWorklogs(ids)` at the call site.
   */
  onDownload: () => Promise<void> | void;
  /**
   * "Open the system share sheet" action. The handler is responsible for
   * capability detection + downgrading to a download with a toast when
   * Web Share isn't supported. See `shareWorklogs` in
   * `src/lib/worklog/share/share-client.ts`.
   */
  onShare: () => Promise<void> | void;
  /** True while a send is in flight — disables the trigger + items. */
  exporting?: boolean;
  /**
   * True when the broader UI is locked (e.g. another mutation is in
   * flight). Disables the trigger but is independent of `exporting`.
   */
  busy?: boolean;
  /**
   * True when the surface has nothing to send (e.g. empty current view).
   * Renders the trigger as disabled with an explanatory title.
   */
  empty?: boolean;
  /**
   * Optional override for the empty-state tooltip (e.g.
   * "No notes in this view"). Defaults to a generic message.
   */
  emptyHint?: string;
  /**
   * Trigger label prefix. Defaults to "Send". The toolbar uses "Export"
   * so the affordance reads naturally next to Import.
   */
  triggerLabel?: string;
  /** Optional className applied to the trigger button. */
  className?: string;
  /**
   * Alignment of the dropdown panel relative to the trigger. The bulk-bar
   * variant aligns end (right edge of the bar); the toolbar variant
   * aligns end too, but exposed for callers that need otherwise.
   */
  align?: "start" | "center" | "end";
  /**
   * Optional element rendered at the start of the trigger in place of the
   * default Send icon. Lets the toolbar use a different icon (Share2) so
   * the two surfaces aren't visually identical.
   */
  triggerIcon?: ReactNode;
}

export function WorklogSendMenu({
  count,
  onDownload,
  onShare,
  exporting = false,
  busy = false,
  empty = false,
  emptyHint,
  triggerLabel = "Send",
  className,
  align = "end",
  triggerIcon,
}: WorklogSendMenuProps) {
  const disabled = busy || exporting || empty;
  const isZip = count > 1;
  const formatSuffix = isZip ? " as .zip" : " as .md";

  // Title text drives both the trigger tooltip and accessibility hints.
  // Empty wins, then in-flight, then the contextual count message.
  const titleText = empty
    ? (emptyHint ?? "Nothing to send")
    : exporting
      ? "Sending…"
      : count === 1
        ? `${triggerLabel} this note (download or share)`
        : `${triggerLabel} ${count} notes (download as .zip or share)`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs",
          "hover:bg-accent/60 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        title={titleText}
        aria-label={titleText}
      >
        {triggerIcon ?? <Send className="h-3.5 w-3.5" />}
        {exporting ? "Sending…" : `${triggerLabel}${empty ? "" : formatSuffix}`}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuItem onClick={() => void onDownload()} disabled={exporting}>
          <Download className="mr-2 h-3.5 w-3.5" />
          <div className="flex flex-col">
            <span>Download</span>
            <span className="text-[11px] text-muted-foreground">
              Save {isZip ? ".zip to your device" : ".md to your device"}
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void onShare()} disabled={exporting}>
          <Share2 className="mr-2 h-3.5 w-3.5" />
          <div className="flex flex-col">
            <span>Share to…</span>
            <span className="text-[11px] text-muted-foreground">
              Open the system share sheet
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
