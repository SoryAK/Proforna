/**
 * WorklogRowContextMenu — right-click / long-press menu on note rows.
 *
 * Carry-forward from ADR-0026 Unit 5 (deferred at ship time): merges
 * the row's organize actions (Move / Archive / Delete) into a single
 * affordance instead of right-click routing straight to the Move dialog.
 *
 * Selection contract (Notion-style, β-rule):
 *   • The PARENT decides whether each menu action operates on the
 *     right-clicked row alone or the whole selection. This component
 *     stays presentational — it only emits the three onX callbacks.
 *   • `count` controls label pluralization ("Delete 3 notes" vs "Delete").
 *
 * Mobile: base-ui ContextMenuTrigger handles long-press automatically.
 */

"use client";

import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { Folder, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WorklogRowContextMenuProps {
  /** The row element (an <li>) that should become the right-click target. */
  children: React.ReactElement;
  /** Number of notes the action will affect. Drives label pluralization. */
  count?: number;
  /** When true, the Archive item becomes Unarchive (archived-view affordance). */
  archivedView?: boolean;
  onMove: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

// Match the Tailwind shape used by <DropdownMenuContent> so visual tone
// is identical to every other menu in the app.
const POPUP_CLASS =
  "z-50 min-w-[10rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

const ITEM_CLASS =
  "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const ITEM_DESTRUCTIVE_CLASS =
  "text-destructive focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20 [&_svg]:text-destructive";

export function WorklogRowContextMenu({
  children,
  count = 1,
  archivedView,
  onMove,
  onArchive,
  onDelete,
}: WorklogRowContextMenuProps) {
  const noun = count > 1 ? `${count} notes` : "note";
  const moveLabel = count > 1 ? `Move ${count} notes…` : "Move to folder…";
  const archiveLabel = archivedView ? `Unarchive ${noun}` : `Archive ${noun}`;
  const deleteLabel = count > 1 ? `Delete ${count} notes` : "Delete note";
  const ArchiveIcon = archivedView ? ArchiveRestore : Archive;

  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger render={children} />
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Positioner className="isolate z-[2200] outline-none">
          <ContextMenuPrimitive.Popup className={POPUP_CLASS}>
            <ContextMenuPrimitive.Item className={ITEM_CLASS} onClick={onMove}>
              <Folder />
              {moveLabel}
            </ContextMenuPrimitive.Item>
            <ContextMenuPrimitive.Item className={ITEM_CLASS} onClick={onArchive}>
              <ArchiveIcon />
              {archiveLabel}
            </ContextMenuPrimitive.Item>
            <div className="my-1 h-px bg-border" role="separator" />
            <ContextMenuPrimitive.Item
              className={cn(ITEM_CLASS, ITEM_DESTRUCTIVE_CLASS)}
              onClick={onDelete}
            >
              <Trash2 />
              {deleteLabel}
            </ContextMenuPrimitive.Item>
          </ContextMenuPrimitive.Popup>
        </ContextMenuPrimitive.Positioner>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
