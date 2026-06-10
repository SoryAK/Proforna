/**
 * Worklog "Grill Me" — composer for the final exportable markdown artifact.
 *
 * Pure function: takes a worklog snapshot + version count, returns the
 * markdown string + a slugified filename. Caller (server route) handles
 * DB I/O and HTTP response.
 *
 * The exportedAt timestamp is provided by the caller so server-side time
 * is authoritative (no client clock skew in the frontmatter).
 */

import {
  serializeFrontmatter,
  type GrillFrontmatter,
} from "@/lib/worklog/export/frontmatter";
import {
  serializeToMarkdown,
} from "@/lib/worklog/export/pm-to-markdown";
import type {
  DroppedBlock,
  ProseMirrorDoc,
} from "@/lib/worklog/import/types";

export interface WorklogExportInput {
  id: string;
  title: string;
  contentJson: ProseMirrorDoc;
  /** Total number of WorkLogVersion rows for this worklog (caller fetches). */
  versionCount: number;
  /** Server-side export timestamp. Caller passes a fresh Date at export time. */
  exportedAt: Date;
}

export interface WorklogExportResult {
  markdown: string;
  filename: string;
  droppedBlocks: DroppedBlock[];
}

const FILENAME_MAX = 80;

export function worklogToMarkdown(
  input: WorklogExportInput,
): WorklogExportResult {
  const fm: GrillFrontmatter = {
    id: input.id,
    version: input.versionCount,
    exportedAt: input.exportedAt.toISOString(),
    title: input.title || undefined,
  };

  const frontmatter = serializeFrontmatter(fm);
  const body = serializeToMarkdown(input.contentJson);

  return {
    markdown: frontmatter + body.markdown,
    filename: slugifyTitle(input.title) + ".md",
    droppedBlocks: body.droppedBlocks,
  };
}

// ─────────────────────────────────────────────────────────
// Filename slug
// ─────────────────────────────────────────────────────────

function slugifyTitle(title: string): string {
  if (!title) return "untitled";

  // Normalize and strip diacritics (é → e)
  const normalized = title.normalize("NFKD").replace(/\p{M}+/gu, "");

  // Lowercase, replace non-alphanumeric runs with `-`, collapse, trim
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) return "untitled";

  return slug.length > FILENAME_MAX ? slug.slice(0, FILENAME_MAX) : slug;
}
