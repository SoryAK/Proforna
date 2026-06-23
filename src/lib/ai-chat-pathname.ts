/**
 * URL-pathname → ambient-entity-id parser for the AI chat panel
 * (ADR-0046 Phase D follow-up D).
 *
 * The AI chat panel asks `/api/ai/context` for an `ambient` block that
 * tells the action-target resolver who a code-block action should land
 * on. Before this module the server picked ambient entities by recency
 * heuristic (`WorkLog.updatedAt within 24h`, `WorkHistory.isActive`),
 * which was wrong any time the user was looking at a non-recent entity.
 *
 * This parser lets the client send the URL it's currently on so the
 * server can override the heuristic with a userId-scoped lookup of the
 * exact entity on screen. Only an explicit allowlist of route patterns
 * is recognized; everything else returns `{}` and the heuristic stays
 * in charge.
 *
 * Allowlist v1:
 *   - `/worklog/notes/[id]`  → `activeWorklogId`
 *   - `/experience/[id]`     → `activeJobId` (a WorkHistory row)
 *
 * Reserved subroutes are explicitly skipped so they don't get
 * misinterpreted as an entity id (e.g. `/experience/verify` is the
 * Equifax verification screen, NOT a WorkHistory with id `"verify"`).
 *
 * Pure module — no React, no Next imports — so the hook layer
 * (`use-ai-chat-context`) can call this synchronously inside a memo
 * and so the parser is trivially unit-testable.
 */

export interface PathnameAmbient {
  activeWorklogId?: string;
  activeJobId?: string;
}

const WORKLOG_NOTES_PATTERN = /^\/worklog\/notes\/([\w-]+)$/;
const EXPERIENCE_PATTERN = /^\/experience\/([\w-]+)$/;

// Reserved subroutes under `/experience/`. These are real Next pages that
// happen to live at the same `[segment]` slot as the WorkHistory id route,
// so a naive regex would incorrectly identify them as entity ids.
const RESERVED_EXPERIENCE_SEGMENTS = new Set(["verify"]);

/**
 * Strip everything after the path itself (query string, hash fragment)
 * and any trailing slash so the regex patterns can stay anchored. Returns
 * an empty string if the input is empty / root / null-ish.
 */
function normalize(pathname: string): string {
  if (!pathname || pathname === "/") return "";
  const queryStart = pathname.indexOf("?");
  const hashStart = pathname.indexOf("#");
  const cutAt =
    queryStart === -1
      ? hashStart === -1
        ? pathname.length
        : hashStart
      : hashStart === -1
        ? queryStart
        : Math.min(queryStart, hashStart);
  let cleaned = pathname.slice(0, cutAt);
  if (cleaned.length > 1 && cleaned.endsWith("/")) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

export function parsePathnameForAmbient(pathname: string): PathnameAmbient {
  const cleaned = normalize(pathname);
  if (!cleaned) return {};

  const worklogMatch = cleaned.match(WORKLOG_NOTES_PATTERN);
  if (worklogMatch) {
    return { activeWorklogId: worklogMatch[1] };
  }

  const experienceMatch = cleaned.match(EXPERIENCE_PATTERN);
  if (experienceMatch) {
    const segment = experienceMatch[1];
    if (RESERVED_EXPERIENCE_SEGMENTS.has(segment)) return {};
    return { activeJobId: segment };
  }

  return {};
}
