/**
 * rewriteWorklogMentionLabels — pure ProseMirror doc walker that rewrites
 * the `label` attr on every mention node with `entityType === "worklog"`
 * to the value returned by a caller-provided lookup.
 *
 * Used by `scripts/migrations/2026-06-09-fix-worklog-mention-labels.ts` to
 * fix legacy chips inserted before the bug-fix that prefers WorkLog.title
 * over contentJson first line. Could also be used in the future for any
 * one-off "rename target → backfill chip labels" task.
 *
 * Idempotent: if `lookup(entityId)` returns the same label that's already
 * on the chip (or `null` when the target is missing), the chip is left
 * untouched and `changed` stays false. The original doc reference is
 * preserved (`result.doc === input`) when no rewrite occurs.
 */

interface MentionNode {
  type: "mention";
  attrs: {
    entityType?: string;
    entityId?: string;
    label?: string;
    [key: string]: unknown;
  };
}

interface BlockNode {
  type: string;
  content?: unknown[];
  [key: string]: unknown;
}

export type WorklogLabelLookup = (entityId: string) => string | null;

export interface RewriteResult {
  doc: unknown;
  changed: boolean;
  rewriteCount: number;
}

export function rewriteWorklogMentionLabels(
  doc: unknown,
  lookup: WorklogLabelLookup,
): RewriteResult {
  if (!doc || typeof doc !== "object") {
    return { doc, changed: false, rewriteCount: 0 };
  }

  let rewriteCount = 0;
  const newDoc = walk(doc, lookup, (delta) => {
    rewriteCount += delta;
  });

  return {
    doc: rewriteCount > 0 ? newDoc : doc,
    changed: rewriteCount > 0,
    rewriteCount,
  };
}

function walk(
  node: unknown,
  lookup: WorklogLabelLookup,
  bumpCounter: (n: number) => void,
): unknown {
  if (!node || typeof node !== "object") return node;
  const block = node as BlockNode;

  // Mention node — the only place we ever rewrite.
  if (block.type === "mention") {
    const m = node as MentionNode;
    if (
      m.attrs?.entityType === "worklog" &&
      typeof m.attrs.entityId === "string"
    ) {
      const next = lookup(m.attrs.entityId);
      if (next !== null && next !== m.attrs.label) {
        bumpCounter(1);
        return {
          ...m,
          attrs: { ...m.attrs, label: next },
        };
      }
    }
    return node;
  }

  // Container node — walk children.
  if (Array.isArray(block.content)) {
    let touched = false;
    const newContent = block.content.map((child) => {
      const newChild = walk(child, lookup, bumpCounter);
      if (newChild !== child) touched = true;
      return newChild;
    });
    if (touched) {
      return { ...block, content: newContent };
    }
  }

  return node;
}
