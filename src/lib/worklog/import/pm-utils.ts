/**
 * Shared utilities for worklog note importers.
 *
 * Both Markdown and HTML pipelines produce Tiptap-shaped ProseMirror JSON,
 * so they share the same projection / extraction logic.
 */

import type { ProseMirrorDoc, ProseMirrorNode } from "./types";

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
]);

/**
 * Plain-text projection of a ProseMirror doc. Mirrors the convention used
 * by `WorkLog.content` for search and exports: visible text only, block-
 * level children separated by newlines, inline children concatenated.
 */
export function projectPlaintext(doc: ProseMirrorDoc): string {
  const parts: string[] = [];
  for (const child of doc.content ?? []) {
    const text = collectTextOf(child);
    if (text) parts.push(text);
  }
  return parts.join("\n");
}

/** Recursive text collector. Block-aware so paragraphs join with \n. */
export function collectTextOf(node: ProseMirrorNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (!node.content) return "";
  const inner = node.content.map(collectTextOf).filter(Boolean);
  if (node.content.some((n) => BLOCK_TYPES.has(n.type))) {
    return inner.join("\n");
  }
  return inner.join("");
}

/** First-H1 text extractor for title fallback. */
export function extractFirstH1Text(doc: ProseMirrorDoc): string | null {
  for (const child of doc.content ?? []) {
    if (child.type === "heading" && child.attrs?.level === 1) {
      const text = collectTextOf(child).trim();
      if (text) return text;
    }
  }
  return null;
}

/** Strip file extension; return null for empty/undefined. */
export function filenameToTitle(filename: string | undefined): string | null {
  if (!filename) return null;
  const stripped = filename.replace(/\.[^.]+$/, "").trim();
  return stripped || null;
}
