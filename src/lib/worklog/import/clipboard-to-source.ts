/**
 * clipboardToSource — turn a browser `DataTransfer` (from a paste event's
 * `clipboardData`) into the same payload shape /api/work-logs/import expects.
 *
 * Pure helper. No DOM access beyond DataTransfer. No network. No size cap
 * (server is authoritative; the dialog mirrors the cap for fast UX).
 *
 * Discrimination strategy (Sprint 5 Q1=A):
 *   - If both text/html and text/plain are present, prefer text/html for
 *     structure preservation — UNLESS the html is just a meta/wrapper bundle
 *     AND the plain text looks like real markdown. Then prefer markdown.
 *   - html-only       → "html"
 *   - plain-only      → "markdown" (raw text is closest)
 *   - text/markdown   → "markdown"
 *   - else            → null
 *
 * Image clipboard items are intentionally ignored — paste of an actual `File`
 * is handled by the dialog's existing `ingestFiles` path. See
 * `.copilot/memories/parked-ideas.md` (image paste support) for the deferred
 * design.
 *
 * Filename: synthetic `Pasted note — YYYY-MM-DD HH:mm.<ext>`, which the
 * import endpoint's `filenameToTitle` fallback turns into a readable title.
 */

import type { ImportSourceType } from "./build-import-record";

export type ClipboardToSourceResult = {
  sourceType: ImportSourceType;
  source: string;
  sourceFilename: string;
};

export type ClipboardToSourceOptions = {
  /** Deterministic clock for the synthetic filename. Defaults to `new Date()`. */
  now?: Date;
};

const MD_MARKER_RE =
  /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.*\|)/;

/**
 * Heuristic: does this text look like real markdown structure, not just
 * a paragraph of plain text?
 *
 * Returns true if any of: ATX heading, bullet, ordered list, blockquote,
 * fenced code, or a likely table row.
 */
function looksLikeMarkdown(text: string): boolean {
  return MD_MARKER_RE.test(text);
}

/**
 * Heuristic: is this html payload just a meta/wrapper bundle that contains
 * no real content nodes? Tracks the common shape from web-clipper apps
 * (Notion, Bear, Obsidian) where the rich source lives in text/plain.
 */
function isMetaOnlyHtml(html: string): boolean {
  // Strip whitespace + leading meta tags + scripts; if nothing real is left,
  // it's a wrapper bundle.
  const stripped = html
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  // If anything left looks like a real block-level tag with text content,
  // it's not meta-only.
  return !/<(?:p|h[1-6]|ul|ol|li|table|blockquote|pre|div|article|section)\b/i.test(
    stripped,
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatStamp(d: Date): string {
  // Local time on purpose — the user reads this in their own timezone.
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function synthesizeFilename(stamp: string, sourceType: ImportSourceType): string {
  const ext = sourceType === "markdown" ? "md" : "html";
  return `Pasted note — ${stamp}.${ext}`;
}

export function clipboardToSource(
  clipboardData: DataTransfer | null,
  options: ClipboardToSourceOptions = {},
): ClipboardToSourceResult | null {
  if (!clipboardData) return null;

  // Defensive: some legacy environments return undefined for `.types`.
  const types: readonly string[] = Array.isArray(clipboardData.types)
    ? clipboardData.types
    : clipboardData.types
      ? (Array.from(clipboardData.types as unknown as Iterable<string>) as string[])
      : [];

  if (types.length === 0) return null;

  const html = types.includes("text/html") ? clipboardData.getData("text/html") : "";
  const md = types.includes("text/markdown")
    ? clipboardData.getData("text/markdown")
    : "";
  const plain = types.includes("text/plain") ? clipboardData.getData("text/plain") : "";

  const hasHtml = html.length > 0;
  const hasMd = md.length > 0;
  const hasPlain = plain.length > 0;

  // Explicit text/markdown wins outright — the source already labeled itself.
  if (hasMd) {
    return buildResult("markdown", md, options.now);
  }

  // Dual html + plain: html wins unless it's a meta wrapper AND plain looks like md.
  if (hasHtml && hasPlain) {
    if (isMetaOnlyHtml(html) && looksLikeMarkdown(plain)) {
      return buildResult("markdown", plain, options.now);
    }
    return buildResult("html", html, options.now);
  }

  if (hasHtml) {
    return buildResult("html", html, options.now);
  }
  if (hasPlain) {
    return buildResult("markdown", plain, options.now);
  }
  return null;
}

function buildResult(
  sourceType: ImportSourceType,
  source: string,
  now?: Date,
): ClipboardToSourceResult {
  const stamp = formatStamp(now ?? new Date());
  return {
    sourceType,
    source,
    sourceFilename: synthesizeFilename(stamp, sourceType),
  };
}
