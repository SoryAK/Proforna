// Lightweight runtime validator for ProseMirror documents stored in WorkLog.contentJson.
//
// Phase 1a: keep this dependency-free. We only need:
//   1. Reject obviously-malformed payloads (must be a doc node with an array of children).
//   2. Cap raw serialized size to protect Postgres + downstream consumers.
//
// Deeper schema validation happens client-side via Tiptap. The server is the
// last line of defense, not the canonical schema.

const MAX_CONTENT_JSON_BYTES = 1_000_000; // 1MB serialized — generous for a single worklog entry.

// ADR-0030 — procedure work logs use a custom topNode (`procedureDoc`) in place
// of the default `doc`. Both must be accepted at the API boundary.
const VALID_ROOT_TYPES = ["doc", "procedureDoc"] as const;
type ValidRootType = (typeof VALID_ROOT_TYPES)[number];

export type ProseMirrorDoc = {
  type: ValidRootType;
  content?: unknown[];
  attrs?: Record<string, unknown>;
};

export type ContentJsonValidation =
  | { ok: true; value: ProseMirrorDoc | null }
  | { ok: false; error: string };

export function validateContentJson(input: unknown): ContentJsonValidation {
  if (input === undefined || input === null) {
    return { ok: true, value: null };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "contentJson must be an object" };
  }
  const doc = input as Record<string, unknown>;
  if (doc.type !== "doc" && doc.type !== "procedureDoc") {
    return { ok: false, error: "contentJson root must be a doc or procedureDoc node" };
  }
  if (doc.content !== undefined && !Array.isArray(doc.content)) {
    return { ok: false, error: "contentJson.content must be an array" };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(doc);
  } catch {
    return { ok: false, error: "contentJson is not serializable" };
  }
  if (serialized.length > MAX_CONTENT_JSON_BYTES) {
    return {
      ok: false,
      error: `contentJson exceeds ${MAX_CONTENT_JSON_BYTES} bytes`,
    };
  }

  return { ok: true, value: doc as ProseMirrorDoc };
}
