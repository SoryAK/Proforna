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
 *
 * Unit 7 — paste normalization. `addProseMirrorPlugins` installs a
 * transformPasted handler that runs every Slice through
 * `normalizeProcedurePaste`, ensuring orphan paragraphs / lists land
 * inside a procedureStep instead of being rejected by the doc's content
 * expression.
 */

import { Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment } from "@tiptap/pm/model";
import { normalizeProcedurePaste } from "../procedure-paste";

const procedurePasteKey = new PluginKey("procedurePaste");

export const ProcedureDocNode = Node.create({
  name: "procedureDoc",
  topNode: true,
  content: "procedureTitle procedureTools? procedureStep+",

  addProseMirrorPlugins() {
    const schema = this.editor?.schema;
    return [
      new Plugin({
        key: procedurePasteKey,
        props: {
          transformPasted: (slice) => {
            // No schema yet (mount race) — let default behavior run.
            if (!schema) return slice;

            const stepType = schema.nodes.procedureStep;
            if (!stepType) return slice;

            // Pull the slice's content out as JSON, normalize it through
            // the pure helper, then re-parse via the live schema. This
            // keeps the L3 invariant enforced by the schema itself —
            // any normalize bug shows up as a parse error rather than
            // a corrupt doc.
            const json = slice.toJSON();
            const rawContent = json && typeof json === "object" && "content" in json
              ? (json as { content?: unknown[] }).content ?? []
              : [];

            const normalized = normalizeProcedurePaste(rawContent);
            if (normalized.length === 0) {
              // Empty paste — fall through to default (probably a no-op).
              return slice;
            }

            try {
              const fragment = Fragment.fromJSON(schema, normalized);
              return new Slice(fragment, 0, 0);
            } catch {
              // Schema rejected the normalized paste (heading-with-mark or
              // some other edge we didn't anticipate). Fall back to the
              // safest path: an empty slice. The user sees nothing pasted
              // rather than a broken doc.
              return Slice.empty;
            }
          },
        },
      }),
    ];
  },
});
