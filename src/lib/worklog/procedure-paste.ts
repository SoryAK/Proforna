/**
 * Paste normalization for procedure documents (ADR-0030 Unit 7).
 *
 * Tiptap's default paste flow drops a Slice's JSON into the doc as-is.
 * In a procedureDoc, that breaks invariants (paragraphs and bullet lists
 * can't sit at doc-root — only procedureStep / procedureTitle /
 * procedureTools can), so the pasted content needs to be normalized
 * before insertion.
 *
 * Rules (locked by Unit 7 spec, mirrored in procedure-paste.test.ts):
 *   1. procedureStep entries pass through unchanged (paste from another
 *      procedure preserves intent).
 *   2. Consecutive non-step blocks are GROUPED into a single new
 *      procedureStep (multi-paragraph paste = one step, not N steps).
 *   3. procedureTitle / procedureTools entries are STRIPPED — they only
 *      belong at doc-root, never inside a step.
 *   4. Heading entries are DEMOTED to paragraph — procedureStep's content
 *      schema accepts paragraph + bullet list + code block, not heading.
 *      The paragraph keeps the heading's text content.
 *   5. Non-object / null / falsy entries are skipped silently.
 *
 * Pure: never mutates the input array. Returns a new array of nodes
 * suitable for `tr.replaceSelection` under a procedureDoc.
 *
 * Dependency-free, deterministic, L3-safe (never produces nested
 * procedureStep — rule 1 only passes through if the input is already
 * a flat step).
 */

const STRIP_TYPES = new Set<string>(["procedureTitle", "procedureTools"]);

type AnyNode = { type: string; [k: string]: unknown };

function isObjectWithType(value: unknown): value is AnyNode {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * Demote a heading node to a paragraph, preserving inline content.
 * procedureStep's content spec allows paragraph but not heading.
 */
function demoteHeading(node: AnyNode): AnyNode {
  return {
    type: "paragraph",
    ...(Array.isArray(node.content) ? { content: node.content } : {}),
  };
}

/**
 * Map a single block-level node to its step-safe equivalent. Returns
 * null if the node should be stripped entirely.
 */
function adaptForStep(node: AnyNode): AnyNode | null {
  if (STRIP_TYPES.has(node.type)) return null;
  if (node.type === "heading") return demoteHeading(node);
  return node;
}

/**
 * Normalize a Slice's JSON content for pasting into a procedureDoc.
 *
 * @param input - array of node JSON objects (e.g. from `slice.toJSON().content`)
 * @returns a new array of nodes, every entry being a top-level
 *          procedureDoc child (procedureStep). procedureTitle /
 *          procedureTools are stripped (only one of each is allowed at
 *          doc-root and the doc already has them; never re-emit from a
 *          paste).
 */
export function normalizeProcedurePaste(input: unknown[]): unknown[] {
  if (!Array.isArray(input) || input.length === 0) return [];

  const result: AnyNode[] = [];
  let buffer: AnyNode[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    result.push({
      type: "procedureStep",
      attrs: { title: null },
      content: buffer,
    });
    buffer = [];
  };

  for (const entry of input) {
    if (!isObjectWithType(entry)) continue;

    if (entry.type === "procedureStep") {
      // Flush any pending orphans BEFORE the explicit step, so order is
      // preserved exactly as pasted.
      flushBuffer();
      result.push(entry);
      continue;
    }

    if (STRIP_TYPES.has(entry.type)) {
      // Procedure-only nodes never survive a paste.
      continue;
    }

    const adapted = adaptForStep(entry);
    if (adapted) buffer.push(adapted);
  }

  flushBuffer();
  return result;
}
