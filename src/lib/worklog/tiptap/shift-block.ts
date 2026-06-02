/**
 * shiftBlock — Tiptap atom inline node that embeds a reference to a WorkShift
 * inside the rich text. Renders as a small chip; serializes to ProseMirror
 * JSON; projects to plain text as "[Shift: <label> <hh:mm>–<hh:mm>]".
 *
 * Pure node definition — UI insertion is handled by the editor toolbar.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface ShiftBlockAttrs {
  shiftId: string;
  label: string;
  /** Minutes since 00:00 local. */
  startMinute: number | null;
  endMinute: number | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    shiftBlock: {
      insertShiftBlock: (attrs: ShiftBlockAttrs) => ReturnType;
    };
  }
}

export const ShiftBlock = Node.create({
  name: "shiftBlock",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      shiftId: { default: "" },
      label: { default: "" },
      startMinute: { default: null },
      endMinute: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-shift-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { label, startMinute, endMinute } = node.attrs as ShiftBlockAttrs;
    const window = formatShiftWindow(startMinute, endMinute);
    const text = window ? `${label} · ${window}` : label;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-shift-block": "true",
        "data-shift-id": node.attrs.shiftId,
        class:
          "inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md " +
          "bg-indigo-100 text-indigo-700 text-xs font-medium " +
          "dark:bg-indigo-900/40 dark:text-indigo-300 align-baseline",
      }),
      `🕐 ${text}`,
    ];
  },

  renderText({ node }) {
    const { label, startMinute, endMinute } = node.attrs as ShiftBlockAttrs;
    const window = formatShiftWindow(startMinute, endMinute);
    return window ? `[Shift: ${label} ${window}]` : `[Shift: ${label}]`;
  },

  addCommands() {
    return {
      insertShiftBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

function formatShiftWindow(start: number | null, end: number | null): string {
  if (start == null || end == null) return "";
  return `${formatMinute(start)}–${formatMinute(end)}`;
}

function formatMinute(m: number): string {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${mm} ${period}`;
}
