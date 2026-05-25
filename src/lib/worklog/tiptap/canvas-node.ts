/**
 * CanvasNode — Tiptap block atom that embeds a tldraw whiteboard inside a
 * worklog note.
 *
 * Storage strategy (Phase 1):
 *   The canvas state is a JSON-stringified TLStoreSnapshot stored in the
 *   `snapshot` attribute. It travels inside the Tiptap doc → `contentJson`
 *   → WorkLog row via the existing onSave flow. Offline via Y.js + IndexedDB.
 *
 * Phase 2 upgrade path:
 *   Replace `snapshot` attr with a ydoc.getMap("canvas:<canvasId>") binding
 *   when the network provider lands (same upgrade path as the text collab).
 *   `canvasId` is a stable UUID that becomes the Y.Map key.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CanvasNodeView } from "@/components/worklog/canvas-node-view";

export interface CanvasNodeAttrs {
  /** Stable UUID. Becomes the Y.Map key in Phase 2. */
  canvasId: string;
  /** JSON-stringified TLStoreSnapshot. Empty string = blank canvas. */
  snapshot: string;
  /** Optional caption shown in the toolbar and plain-text projection. */
  title: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    canvasBlock: {
      insertCanvasBlock: (attrs: CanvasNodeAttrs) => ReturnType;
    };
  }
}

export const CanvasNode = Node.create({
  name: "canvasBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      canvasId: { default: "" },
      snapshot: { default: "" },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-canvas-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { title, canvasId } = node.attrs as CanvasNodeAttrs;
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-canvas-block": "true",
        "data-canvas-id": canvasId,
        class: "worklog-canvas my-2 rounded-lg border border-border overflow-hidden",
      }),
      ["figcaption", { class: "text-xs text-muted-foreground px-2 py-1" }, title ?? "Canvas"],
    ];
  },

  renderText({ node }) {
    const { title } = node.attrs as CanvasNodeAttrs;
    return title ? `[Canvas: ${title}]` : "[Canvas]";
  },

  addNodeView() {
    return ReactNodeViewRenderer(CanvasNodeView, {
      // By default Tiptap only passes events through to React for native
      // interactive elements (INPUT, BUTTON, etc.). The canvas preview body
      // is a plain div, so ProseMirror intercepts its mousedown and stops
      // propagation before React sees it.  Returning `true` here tells
      // ProseMirror "don't handle this — let React handle it" for all
      // events except drag/drop (which must reach ProseMirror so the node
      // remains draggable via the existing atom drag behaviour).
      stopEvent: ({ event }) => {
        if (event.type.startsWith("drag") || event.type === "drop") {
          return false; // ProseMirror handles drag/drop
        }
        return true; // React handles everything else
      },
    });
  },

  addCommands() {
    return {
      insertCanvasBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
