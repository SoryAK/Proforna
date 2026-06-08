/**
 * Shared shapes for the worklog note import pipeline (Sprint 1).
 *
 * Sprint 1 scope: pure functions converting external note formats
 * (Markdown, HTML) → Tiptap-shaped ProseMirror JSON. No DB, API, or UI.
 *
 * Lossy-by-design (ADR-0019 pending): unsupported source constructs are
 * dropped and counted in `droppedBlocks`; v1 ignores the array, future
 * surfaces will display it.
 */

/**
 * Tally of source-side constructs that were dropped during conversion.
 * `type` is parser-specific (e.g. "html:script", "md:html_block",
 * "html:style"). Counts aggregate per type for compact reporting.
 */
export type DroppedBlock = {
  type: string;
  count: number;
};

/**
 * Public output of every importer. `contentJson` is ProseMirror JSON
 * shaped to match the worklog editor's schema (StarterKit + Image +
 * Link + TaskList + TaskItem). `plaintext` is the projection used for
 * `WorkLog.content` (search / exports).
 */
export type ImportResult = {
  title: string;
  contentJson: ProseMirrorDoc;
  plaintext: string;
  droppedBlocks: DroppedBlock[];
};

/** Minimal structural shape of a ProseMirror doc. Not exhaustive. */
export type ProseMirrorDoc = {
  type: "doc";
  content?: ProseMirrorNode[];
};

export type ProseMirrorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  marks?: ProseMirrorMark[];
  text?: string;
};

export type ProseMirrorMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

/** Optional inputs accepted by every importer. */
export type ImportOptions = {
  /** Source filename, used as title fallback when no H1/frontmatter title. */
  filename?: string;
};
