/**
 * RED tests for decideImport — Phase 4a of grill-me sprint.
 *
 * Pure decision function: given a parsed frontmatter and the result of an
 * owner-scoped worklog lookup, returns one of four outcomes:
 *
 *   1. "match"          — frontmatter id belongs to user AND version matches
 *                         the current count → safe to write
 *   2. "conflict"       — frontmatter id belongs to user BUT version is older
 *                         than the current count (server has changed since
 *                         export) → return diff payload to client modal
 *   3. "needs-picker"   — no frontmatter present in the file
 *   4. "not-found"      — frontmatter exists but id doesn't belong to user
 *                         (treated separately so the route can keep response
 *                         status codes consistent; UI surfaces this the same
 *                         way as needs-picker)
 *
 * The decision function does NO I/O. Callers fetch the worklog + version
 * count and pass them in.
 *
 * Phase 2.5 — TDD Iron Law. RED first.
 */

import {
  decideImport,
  type ImportDecision,
} from "@/lib/worklog/import/grill-frontmatter";
import type { GrillFrontmatter } from "@/lib/worklog/export/frontmatter";

const validFM: GrillFrontmatter = {
  id: "wl_abc",
  version: 4,
  exportedAt: "2026-06-09T10:00:00.000Z",
  title: "My Note",
};

// ─────────────────────────────────────────────────────────
// 1. Match
// ─────────────────────────────────────────────────────────

describe("decideImport — match", () => {
  it("returns 'match' when frontmatter version === current version count", () => {
    const decision = decideImport({
      parsedFrontmatter: validFM,
      workLogExists: true,
      currentVersionCount: 4,
    });
    expect(decision.kind).toBe("match");
    expect((decision as Extract<ImportDecision, { kind: "match" }>).workLogId).toBe(
      "wl_abc",
    );
  });

  it("returns 'match' when frontmatter version > current count (file is ahead — also safe)", () => {
    // Edge case: user re-imports their own file before any save happened.
    // No risk of clobbering newer server state.
    const decision = decideImport({
      parsedFrontmatter: { ...validFM, version: 5 },
      workLogExists: true,
      currentVersionCount: 4,
    });
    expect(decision.kind).toBe("match");
  });
});

// ─────────────────────────────────────────────────────────
// 2. Conflict
// ─────────────────────────────────────────────────────────

describe("decideImport — conflict", () => {
  it("returns 'conflict' when current version count > frontmatter version", () => {
    const decision = decideImport({
      parsedFrontmatter: { ...validFM, version: 4 },
      workLogExists: true,
      currentVersionCount: 6,
    });
    expect(decision.kind).toBe("conflict");
    if (decision.kind === "conflict") {
      expect(decision.workLogId).toBe("wl_abc");
      expect(decision.fileVersion).toBe(4);
      expect(decision.currentVersion).toBe(6);
    }
  });
});

// ─────────────────────────────────────────────────────────
// 3. Needs picker (no frontmatter)
// ─────────────────────────────────────────────────────────

describe("decideImport — needs picker", () => {
  it("returns 'needs-picker' with reason 'no-frontmatter' when frontmatter is null", () => {
    const decision = decideImport({
      parsedFrontmatter: null,
      workLogExists: false,
      currentVersionCount: 0,
    });
    expect(decision.kind).toBe("needs-picker");
    if (decision.kind === "needs-picker") {
      expect(decision.reason).toBe("no-frontmatter");
    }
  });

  it("returns 'needs-picker' regardless of workLogExists when frontmatter is null", () => {
    // Even if some unrelated id was passed in by mistake, if frontmatter is
    // missing the file has no identity claim — user must pick.
    const decision = decideImport({
      parsedFrontmatter: null,
      workLogExists: true,
      currentVersionCount: 9,
    });
    expect(decision.kind).toBe("needs-picker");
  });
});

// ─────────────────────────────────────────────────────────
// 4. Not found (frontmatter present but id unknown / cross-user)
// ─────────────────────────────────────────────────────────

describe("decideImport — not-found", () => {
  it("returns 'not-found' when frontmatter exists but workLog does not for this user", () => {
    const decision = decideImport({
      parsedFrontmatter: validFM,
      workLogExists: false,
      currentVersionCount: 0,
    });
    expect(decision.kind).toBe("not-found");
    if (decision.kind === "not-found") {
      expect(decision.attemptedId).toBe("wl_abc");
    }
  });
});
