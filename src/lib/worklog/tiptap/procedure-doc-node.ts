/**
 * ADR-0030 Unit 3 — top-level procedureDoc node.
 *
 * Replaces Tiptap's default `doc` top-node when the editor is mounted with
 * `kind=procedure`. The content expression encodes the locked structural
 * shape (L1: tools optional, L3: steps flat):
 *
 *   procedureTitle procedureTools? procedureStep+
 *
 * `topNode: true` is the Tiptap signal that this node replaces the default
 * doc when this extension is registered. Mount switching in Unit 4 chooses
 * between the notes schema (default `doc`) and this one based on
 * `WorkLog.kind`.
 *
 * Note: procedureStep is intentionally NOT in any general group (no `block`,
 * no `inline`). The doc's content expression names it explicitly. This
 * prevents accidental nesting through generic `block+` content rules in
 * other nodes — enforces L3 at the schema level.
 */

import { Node } from "@tiptap/core";

export const ProcedureDocNode = Node.create({
  name: "procedureDoc",
  topNode: true,
  content: "procedureTitle procedureTools? procedureStep+",
});
