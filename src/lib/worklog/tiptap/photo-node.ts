/**
 * PhotoNode — Tiptap block atom that embeds an inline image inside a worklog
 * note. Distinct from the `WorkLogPhoto` rows surfaced by the Photos
 * disclosure section: those use `source = "panel"`, these use `source = "body"`.
 *
 * Storage strategy:
 *   • Each photo is uploaded immediately to /api/work-logs/photos with
 *     `source=body` and returns a `{id, filePath}`.
 *   • The doc only stores `{photoId, src, alt?, width?, height?, caption?}`.
 *   • Cleanup happens on note save/close via /api/work-logs/photos/reconcile
 *     (current keep-list = walk doc, collect photoIds).
 *
 * Caption is mirrored to `WorkLogPhoto.caption` (Q3 answer: option b) so it
 * stays searchable server-side; the node attr is the live editing source.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { PhotoNodeView } from "@/components/worklog/photo-node-view";

export interface PhotoNodeAttrs {
  photoId: string;
  src: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    photoNode: {
      insertPhotoNode: (attrs: PhotoNodeAttrs) => ReturnType;
    };
  }
}

export const PhotoNode = Node.create({
  name: "photo",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      photoId: { default: "" },
      src: { default: "" },
      alt: { default: null },
      width: { default: null },
      height: { default: null },
      caption: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-photo-node]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const img = el.querySelector("img");
          const figcap = el.querySelector("figcaption");
          return {
            photoId: el.getAttribute("data-photo-id") ?? "",
            src: img?.getAttribute("src") ?? "",
            alt: img?.getAttribute("alt") ?? null,
            width: parseIntOrNull(img?.getAttribute("width")),
            height: parseIntOrNull(img?.getAttribute("height")),
            caption: figcap?.textContent ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { photoId, src, alt, width, height, caption } = node.attrs as PhotoNodeAttrs;
    const imgAttrs: Record<string, string> = { src, alt: alt ?? "" };
    if (width) imgAttrs.width = String(width);
    if (height) imgAttrs.height = String(height);
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-photo-node": "true",
        "data-photo-id": photoId,
        class: "worklog-photo my-2",
      }),
      ["img", imgAttrs],
      ...(caption ? [["figcaption", { class: "text-xs text-muted-foreground mt-1" }, caption]] : []),
    ];
  },

  renderText({ node }) {
    const { caption, alt } = node.attrs as PhotoNodeAttrs;
    return `[Photo: ${caption ?? alt ?? "image"}]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(PhotoNodeView);
  },

  addCommands() {
    return {
      insertPhotoNode:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

function parseIntOrNull(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}
