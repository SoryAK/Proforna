/**
 * fileToSource — turn a browser `File` into the request payload for
 * POST /api/work-logs/import.
 *
 * Pure helper. No network. No size enforcement (server is authoritative
 * with 413). Discrimination is extension-first (because the user picked
 * the filename intentionally), with MIME as a tiebreaker for extension-less
 * files saved from a clipboard / paste handler.
 *
 * Returns `sourceType: null` for unsupported files so the calling UI can
 * surface a friendly "unsupported file" badge without throwing.
 */

import type { ImportSourceType } from "./build-import-record";

export type FileToSourceResult = {
  sourceType: ImportSourceType | null;
  source: string;
  sourceFilename: string;
};

const EXT_TO_TYPE: Record<string, ImportSourceType> = {
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
};

const MIME_TO_TYPE: Record<string, ImportSourceType> = {
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/html": "html",
};

function extensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toLowerCase();
}

function discriminate(filename: string, mimeType: string): ImportSourceType | null {
  // Extension first — the filename is the user's stated intent.
  const ext = extensionOf(filename);
  if (ext && EXT_TO_TYPE[ext]) {
    return EXT_TO_TYPE[ext];
  }
  // MIME fallback for extension-less files (pasted blobs, etc.).
  if (mimeType && MIME_TO_TYPE[mimeType.toLowerCase()]) {
    return MIME_TO_TYPE[mimeType.toLowerCase()];
  }
  return null;
}

export async function fileToSource(file: File): Promise<FileToSourceResult> {
  const source = await file.text();
  return {
    sourceType: discriminate(file.name, file.type),
    source,
    sourceFilename: file.name,
  };
}
