/**
 * Pure schema spec for ADR-0030 procedure documents.
 *
 * Locked decisions encoded here:
 *   L1. procedureTools is OPTIONAL in the content sequence.
 *   L2. procedureStep has an optional `title` attr; numbering is positional
 *       (computed at render time, not stored).
 *   L3. Steps are a flat list; nested procedureStep is a validation error.
 *
 * The shape (top-level node type aside) intentionally diverges from the
 * notes shape so that `isValidProcedureDoc` can distinguish them at runtime
 * — the editor mount switching in Unit 4 keys off this.
 *
 * Dependency-free by design (mirrors content-json.ts and
 * prosemirror-to-text.ts conventions). No external libraries; the validator
 * is a hand-rolled deterministic walker.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type ProcedureTitle = {
  type: "procedureTitle";
  content?: { type: "text"; text: string }[];
};

export type ProcedureTools = {
  type: "procedureTools";
  content?: unknown[];
};

export type ProcedureStep = {
  type: "procedureStep";
  attrs: { title: string | null };
  content?: unknown[];
};

export type ProcedureDoc = {
  type: "procedureDoc";
  content: (ProcedureTitle | ProcedureTools | ProcedureStep)[];
};

// ── Builders ─────────────────────────────────────────────────────────────

/**
 * Build a fresh procedure document for a brand-new procedure.
 *
 * Shape (per L1 — tools omitted by default):
 *   procedureDoc
 *     └ procedureTitle  ("title")
 *     └ procedureStep   (title=null, single empty paragraph)
 *
 * The empty paragraph gives Tiptap somewhere to land the cursor on first
 * mount. Editor toolbar (Unit 6) provides the "+ Add tools" affordance.
 */
export function buildEmptyProcedure(title: string): ProcedureDoc {
  const titleContent: { type: "text"; text: string }[] =
    title.length > 0 ? [{ type: "text", text: title }] : [];

  return {
    type: "procedureDoc",
    content: [
      { type: "procedureTitle", content: titleContent },
      {
        type: "procedureStep",
        attrs: { title: null },
        content: [{ type: "paragraph" }],
      },
    ],
  };
}

/**
 * Migration helper for Unit 5 — wrap an existing freeform note doc into
 * the new procedure shape.
 *
 * Rules:
 *   1. If the input is already a valid ProcedureDoc, return it unchanged
 *      (idempotency — running migration twice is a no-op).
 *   2. If the input is null/undefined or otherwise unrecognizable, return
 *      buildEmptyProcedure(title) — same shape as a brand-new procedure.
 *   3. Otherwise, treat the input as a notes-shaped doc and wrap its
 *      content array inside a single procedureStep titled "Body".
 *
 * Non-mutating: the original input is never modified. The wrapped step
 * holds a reference to the same content array (deep-clone is the caller's
 * responsibility if they need it).
 */
export function wrapNoteAsProcedure(
  noteContentJson: unknown,
  title: string,
): ProcedureDoc {
  if (isValidProcedureDoc(noteContentJson)) {
    return noteContentJson;
  }

  if (!isNotesDoc(noteContentJson)) {
    return buildEmptyProcedure(title);
  }

  const noteDoc = noteContentJson as { content?: unknown[] };
  const titleContent: { type: "text"; text: string }[] =
    title.length > 0 ? [{ type: "text", text: title }] : [];

  return {
    type: "procedureDoc",
    content: [
      { type: "procedureTitle", content: titleContent },
      {
        type: "procedureStep",
        attrs: { title: "Body" },
        content: noteDoc.content ?? [{ type: "paragraph" }],
      },
    ],
  };
}

// ── Validator ────────────────────────────────────────────────────────────

/**
 * Type-guard validator for the locked procedureDoc shape (L1–L3).
 *
 * Walks only the top-level structural envelope: { procedureDoc -> [ title,
 * tools?, step+ ] } and the depth-1 step body for nested-step rejection.
 * Everything else (paragraphs, mentions, images inside a step body) is
 * pass-through — those primitives are validated by Tiptap's parse pass.
 */
export function isValidProcedureDoc(doc: unknown): doc is ProcedureDoc {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const root = doc as { type?: unknown; content?: unknown };
  if (root.type !== "procedureDoc") return false;
  if (!Array.isArray(root.content)) return false;
  if (root.content.length === 0) return false;

  // Slot 0 must be procedureTitle.
  const first = root.content[0] as { type?: unknown };
  if (!isObjectWithType(first, "procedureTitle")) return false;

  // Optional procedureTools at slot 1.
  let stepStartIndex = 1;
  if (root.content.length > 1) {
    const candidate = root.content[1] as { type?: unknown };
    if (isObjectWithType(candidate, "procedureTools")) {
      stepStartIndex = 2;
    }
  }

  // At least one procedureStep, all remaining nodes must be procedureStep.
  if (stepStartIndex >= root.content.length) return false;
  for (let i = stepStartIndex; i < root.content.length; i++) {
    const node = root.content[i];
    if (!isObjectWithType(node, "procedureStep")) return false;
    // L3: no nested procedureStep inside a step body.
    if (containsNestedStep(node as { content?: unknown })) return false;
  }

  return true;
}

// ── Internals ────────────────────────────────────────────────────────────

function isObjectWithType(
  node: unknown,
  expected: string,
): node is Record<string, unknown> {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  return (node as { type?: unknown }).type === expected;
}

/**
 * Notes shape from ADR-0010 / ADR-0029: top-level `type: "doc"` with an
 * optional content array. Used by wrapNoteAsProcedure to recognize a
 * pre-migration WorkLog body.
 */
function isNotesDoc(input: unknown): input is { type: "doc"; content?: unknown[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const obj = input as { type?: unknown; content?: unknown };
  if (obj.type !== "doc") return false;
  if (obj.content !== undefined && !Array.isArray(obj.content)) return false;
  return true;
}

function containsNestedStep(node: { content?: unknown }): boolean {
  const children = node.content;
  if (!Array.isArray(children)) return false;
  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const c = child as { type?: unknown; content?: unknown };
    if (c.type === "procedureStep") return true;
    // Recurse only into block-shaped children (cheap depth-first scan).
    if (Array.isArray(c.content) && containsNestedStep(c)) return true;
  }
  return false;
}
