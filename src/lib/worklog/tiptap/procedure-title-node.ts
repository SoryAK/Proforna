/**
 * ADR-0030 Unit 3 — procedureTitle node.
 *
 * Single-line plain-text container holding the procedure title. Renders as
 * an <h1>; parses both <h1[data-procedure-title]> and the bare semantic
 * shape so paste from other rich-text sources works.
 *
 * Content expression `text*`: only text, no marks, no inline atoms (no
 * mentions / photos in the title). Keeps the title clean and grep-able.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const ProcedureTitleNode = Node.create({
  name: "procedureTitle",
  content: "text*",
  marks: "",
  defining: true,

  parseHTML() {
    return [{ tag: "h1[data-procedure-title]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "h1",
      mergeAttributes(HTMLAttributes, {
        "data-procedure-title": "true",
        class: "procedure-title text-3xl font-semibold tracking-tight mb-3",
      }),
      0,
    ];
  },
});
