/**
 * ADR-0030 Unit 3 — procedureStep (one numbered step in a procedure).
 *
 * Each step is a structural block holding mixed content (paragraphs, lists,
 * images, mentions, code blocks). The step number is positional — computed
 * from sibling index at render time, NEVER stored — so reordering is always
 * consistent (L2).
 *
 * Schema decisions:
 *   - `attrs.title` is OPTIONAL (L2). Renders as "Step N" if null, "Step N
 *     — <title>" if set.
 *   - Content `block+` allows any block child EXCEPT procedureStep itself
 *     (procedureStep is intentionally not in the `block` group — see
 *     procedure-doc-node.ts comment for the L3 enforcement).
 *   - `defining: true` so paste rules into this node land *inside* the step
 *     rather than promoting up to the doc level.
 *   - `isolating: true` keeps cursor navigation contained until the user
 *     explicitly moves out (no accidental merge into the previous step on
 *     Backspace at offset 0).
 *
 * The actual "Step N — title" header is rendered by the Unit 4 NodeView
 * wrapper, NOT by renderHTML. Keeping renderHTML minimal here so the doc
 * round-trips cleanly to/from HTML for paste, copy, and markdown export
 * (Unit 10).
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface ProcedureStepAttrs {
  title: string | null;
}

export const ProcedureStepNode = Node.create({
  name: "procedureStep",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      title: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "section[data-procedure-step]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const titleAttr = el.getAttribute("data-step-title");
          return { title: titleAttr ?? null };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { title } = node.attrs as ProcedureStepAttrs;
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-procedure-step": "true",
        "data-step-title": title ?? "",
        class: "procedure-step my-3",
      }),
      0,
    ];
  },
});
