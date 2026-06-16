/**
 * Pure ProseMirror transform helpers for procedure docs (ADR-0030 Unit 6).
 *
 * These helpers operate on plain JSON documents (the same shape produced by
 * `editor.getJSON()`) and return a new document — never mutate input. They
 * power the Tiptap commands wired into the procedure node specs, but live
 * here so they can be unit-tested without instantiating Tiptap.
 *
 * Conventions mirror procedure-schema.ts:
 *   - dependency-free, deterministic walkers
 *   - non-mutating (every helper returns a new top-level object)
 *   - L3-safe (never produces a nested procedureStep)
 */

import type { ProcedureDoc } from "./procedure-schema";

/** Empty paragraph — the canonical "fresh body" for a new step. */
const EMPTY_PARAGRAPH = { type: "paragraph" } as const;

/**
 * Append a new empty procedureStep to the end of the doc.
 *
 * Returns the doc unchanged if `doc` is not a procedureDoc.
 */
export function appendStep(doc: unknown, title: string | null = null): unknown {
  if (!isProcedureDoc(doc)) return doc;
  return {
    ...doc,
    content: [
      ...doc.content,
      {
        type: "procedureStep",
        attrs: { title },
        content: [EMPTY_PARAGRAPH],
      },
    ],
  };
}

/**
 * Toggle the optional procedureTools block (L1).
 *
 * If absent, insert it immediately after procedureTitle. If present, remove
 * it. Returns the doc unchanged if `doc` is not a procedureDoc.
 */
export function toggleTools(doc: unknown): unknown {
  if (!isProcedureDoc(doc)) return doc;
  const idx = doc.content.findIndex((c) => isObjectWithType(c, "procedureTools"));
  if (idx >= 0) {
    return {
      ...doc,
      content: [...doc.content.slice(0, idx), ...doc.content.slice(idx + 1)],
    };
  }
  // Insert at slot 1 (right after procedureTitle).
  return {
    ...doc,
    content: [
      doc.content[0],
      { type: "procedureTools", content: [EMPTY_PARAGRAPH] },
      ...doc.content.slice(1),
    ],
  };
}

/**
 * Swap the procedureStep at `stepIndex` with the one above it. `stepIndex`
 * is the index *among steps* (0-based), NOT the doc-content index.
 *
 * No-op if there's no step above (or if the doc isn't a procedureDoc).
 */
export function moveStepUp(doc: unknown, stepIndex: number): unknown {
  if (!isProcedureDoc(doc)) return doc;
  const docIndices = collectStepDocIndices(doc);
  if (stepIndex <= 0 || stepIndex >= docIndices.length) return doc;
  return swapDocChildren(doc, docIndices[stepIndex - 1], docIndices[stepIndex]);
}

/**
 * Swap the procedureStep at `stepIndex` with the one below it. `stepIndex`
 * is the index *among steps* (0-based).
 *
 * No-op if there's no step below.
 */
export function moveStepDown(doc: unknown, stepIndex: number): unknown {
  if (!isProcedureDoc(doc)) return doc;
  const docIndices = collectStepDocIndices(doc);
  if (stepIndex < 0 || stepIndex >= docIndices.length - 1) return doc;
  return swapDocChildren(doc, docIndices[stepIndex], docIndices[stepIndex + 1]);
}

/**
 * Set (or clear) the `title` attr on the procedureStep at `stepIndex`.
 * Pass `null` or empty string to clear.
 */
export function setStepTitle(
  doc: unknown,
  stepIndex: number,
  title: string | null,
): unknown {
  if (!isProcedureDoc(doc)) return doc;
  const docIndices = collectStepDocIndices(doc);
  if (stepIndex < 0 || stepIndex >= docIndices.length) return doc;
  const idx = docIndices[stepIndex];
  const step = doc.content[idx] as { attrs?: { title?: string | null } };
  const trimmed = title?.trim() ?? "";
  const nextTitle = trimmed.length === 0 ? null : trimmed;
  const newStep = { ...step, attrs: { ...step.attrs, title: nextTitle } };
  return {
    ...doc,
    content: [
      ...doc.content.slice(0, idx),
      newStep,
      ...doc.content.slice(idx + 1),
    ],
  };
}

/**
 * Extract the procedureTitle's plain text — used by the editor save path
 * to mirror the title back into `WorkLog.title`. Returns "" when the doc
 * is not a procedureDoc, the title is empty, or its content is malformed.
 */
export function extractProcedureTitleText(doc: unknown): string {
  if (!isProcedureDoc(doc)) return "";
  const titleNode = doc.content[0] as { content?: unknown } | undefined;
  if (!titleNode || !Array.isArray(titleNode.content)) return "";
  let out = "";
  for (const child of titleNode.content) {
    if (child && typeof child === "object" && (child as { type?: string }).type === "text") {
      const text = (child as { text?: unknown }).text;
      if (typeof text === "string") out += text;
    }
  }
  return out.trim();
}

// ── Internals ────────────────────────────────────────────────────────────

function isProcedureDoc(doc: unknown): doc is ProcedureDoc {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const root = doc as { type?: unknown; content?: unknown };
  return root.type === "procedureDoc" && Array.isArray(root.content);
}

function isObjectWithType(node: unknown, expected: string): boolean {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  return (node as { type?: unknown }).type === expected;
}

function collectStepDocIndices(doc: ProcedureDoc): number[] {
  const out: number[] = [];
  for (let i = 0; i < doc.content.length; i++) {
    if (isObjectWithType(doc.content[i], "procedureStep")) out.push(i);
  }
  return out;
}

function swapDocChildren(
  doc: ProcedureDoc,
  i: number,
  j: number,
): ProcedureDoc {
  const next = doc.content.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return { ...doc, content: next };
}
