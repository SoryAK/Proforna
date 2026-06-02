/**
 * extractTagsFromDoc — walk a ProseMirror JSON document and collect the
 * normalized labels of every `tag` node. Used by the parent worklog reader
 * to mirror in-editor tag chips into `WorkLog.tags` so existing filters and
 * search keep working unchanged.
 *
 * One-way sync: editor → tags column. The reverse direction is not auto-
 * applied (so the user can have un-chipped tags from older worklogs).
 */

type PmNode = {
  type: string;
  attrs?: Record<string, unknown> | null;
  content?: PmNode[];
};

export function extractTagsFromDoc(doc: unknown): string[] {
  const out = new Set<string>();
  walk(doc as PmNode | null | undefined, out);
  return Array.from(out);
}

function walk(node: PmNode | null | undefined, out: Set<string>) {
  if (!node || typeof node !== "object") return;
  if (node.type === "tag") {
    const label = node.attrs?.label;
    if (typeof label === "string" && label.length > 0) out.add(label);
    return;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, out);
  }
}

/**
 * Merge editor-derived tags into an existing comma-separated tags string,
 * preserving any user-authored tags that don't appear as chips.
 *
 * Returns null when the result is empty (matches `WorkLog.tags` null convention).
 */
export function mergeEditorTags(existing: string | null, editorTags: string[]): string | null {
  const existingList = (existing ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  // Non-chip tags are anything in `existing` not represented as a chip in a
  // previous save. We keep all existing entries and add new chip-derived ones.
  const merged = new Set<string>(existingList);
  for (const t of editorTags) merged.add(t);
  const result = Array.from(merged).join(", ");
  return result.length > 0 ? result : null;
}
