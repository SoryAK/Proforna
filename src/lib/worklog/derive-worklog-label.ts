/**
 * Worklog label derivation — single source of truth for "how do we display a
 * WorkLog entry as a chip / picker row / backlink?".
 *
 * Used by:
 *   - GET /api/work-logs/mention-search (worklog branch — search + existence)
 *   - GET /api/work-logs/[id]/backlinks (linker label)
 *   - scripts/migrations/2026-06-09-fix-worklog-mention-labels.ts
 *
 * Fallback chain:
 *   1. WorkLog.title (trimmed, truncated to 80 chars)
 *   2. First non-empty plain-text line of contentJson (truncated)
 *   3. ISO date (YYYY-MM-DD) — never empty
 */

import { proseMirrorDocToPlainText } from "@/lib/worklog/prosemirror-to-text";

const MAX_LABEL_LENGTH = 80;

export interface DeriveWorklogLabelInput {
  title: string | null | undefined;
  contentJson: unknown;
  date: Date;
}

export function deriveWorklogLabel(input: DeriveWorklogLabelInput): string {
  const trimmedTitle = (input.title ?? "").trim();
  if (trimmedTitle) return truncate(trimmedTitle);

  const text = proseMirrorDocToPlainText(input.contentJson).trim();
  if (text) {
    const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (firstLine) return truncate(firstLine);
  }

  return input.date.toISOString().slice(0, 10);
}

function truncate(value: string): string {
  return value.length > MAX_LABEL_LENGTH ? value.slice(0, MAX_LABEL_LENGTH - 3) + "…" : value;
}
