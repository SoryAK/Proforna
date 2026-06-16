/**
 * ADR-0030 Unit 3 — procedureTools (optional Tools & Equipment block).
 *
 * Container that holds paragraphs with `@a:` asset mentions, inline images,
 * and freeform short text. Visually a chip-cloud + body — NOT a list.
 *
 * Content expression `block+` accepts paragraphs, lists, photos, code
 * blocks — i.e. anything that's a block in the procedure schema. By NOT
 * including `procedureStep` in the `block` group, we ensure tools cannot
 * accidentally hold steps.
 *
 * L1 (locked): this block is OPTIONAL in procedureDoc's content expression.
 * Toolbar in Unit 6 provides the "+ Add tools" affordance.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const ProcedureToolsNode = Node.create({
  name: "procedureTools",
  content: "block+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "section[data-procedure-tools]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-procedure-tools": "true",
        class:
          "procedure-tools rounded-md border bg-muted/40 px-3 py-2 my-2 " +
          "text-sm",
      }),
      0,
    ];
  },
});
