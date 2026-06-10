/**
 * Worklog "Grill Me" — re-import routing decision.
 *
 * Pure function: given parsed frontmatter and the result of an
 * owner-scoped lookup, returns one of four outcomes the route handler
 * uses to decide what to do next. No I/O.
 */

import type { GrillFrontmatter } from "@/lib/worklog/export/frontmatter";

export type ImportDecision =
  | { kind: "match"; workLogId: string }
  | {
      kind: "conflict";
      workLogId: string;
      fileVersion: number;
      currentVersion: number;
    }
  | { kind: "needs-picker"; reason: "no-frontmatter" }
  | { kind: "not-found"; attemptedId: string };

export interface DecideImportInput {
  parsedFrontmatter: GrillFrontmatter | null;
  /** True when the frontmatter id maps to a worklog owned by the caller. */
  workLogExists: boolean;
  /** Total WorkLogVersion rows for that worklog. Ignored when not workLogExists. */
  currentVersionCount: number;
}

export function decideImport(input: DecideImportInput): ImportDecision {
  if (!input.parsedFrontmatter) {
    return { kind: "needs-picker", reason: "no-frontmatter" };
  }

  if (!input.workLogExists) {
    return { kind: "not-found", attemptedId: input.parsedFrontmatter.id };
  }

  const fileVersion = input.parsedFrontmatter.version;
  const currentVersion = input.currentVersionCount;

  // File-is-ahead-or-equal: safe to write. The auto-snapshot writer (ADR-0017)
  // means every successful re-import is reversible from the version history.
  if (fileVersion >= currentVersion) {
    return { kind: "match", workLogId: input.parsedFrontmatter.id };
  }

  // Server has changed since export → conflict, return diff payload to client.
  return {
    kind: "conflict",
    workLogId: input.parsedFrontmatter.id,
    fileVersion,
    currentVersion,
  };
}
