/**
 * Pure-function unit tests for the URL → ambient-id parser introduced
 * by ADR-0046 Phase D follow-up D (URL-aware ambient).
 *
 * The parser decides which active worklog / active job the AI chat
 * panel's `pageContext` should expose, based on the current pathname.
 * Only an explicit allowlist of route patterns is honored; anything
 * else returns `{}` and the server-side heuristic (recency-based)
 * remains in charge. See `docs/c-yard/ai-chat.json`.
 *
 * RED phase per testing.instructions.md: every test in this file is
 * expected to fail before `parsePathnameForAmbient` is implemented.
 */

import { describe, expect, it } from "vitest";

import {
  parsePathnameForAmbient,
  type PathnameAmbient,
} from "./ai-chat-pathname";

const empty: PathnameAmbient = {};

describe("parsePathnameForAmbient", () => {
  describe("worklog editor route", () => {
    it("extracts activeWorklogId from /worklog/notes/[id]", () => {
      expect(parsePathnameForAmbient("/worklog/notes/abc-123")).toEqual({
        activeWorklogId: "abc-123",
      });
    });

    it("tolerates a trailing slash", () => {
      expect(parsePathnameForAmbient("/worklog/notes/abc-123/")).toEqual({
        activeWorklogId: "abc-123",
      });
    });

    it("strips a query string defensively", () => {
      expect(parsePathnameForAmbient("/worklog/notes/abc-123?tab=foo")).toEqual({
        activeWorklogId: "abc-123",
      });
    });

    it("strips a hash fragment defensively", () => {
      expect(parsePathnameForAmbient("/worklog/notes/abc-123#section")).toEqual({
        activeWorklogId: "abc-123",
      });
    });

    it("does NOT match the worklog list at /worklog/notes", () => {
      expect(parsePathnameForAmbient("/worklog/notes")).toEqual(empty);
    });

    it("does NOT match an extra path segment after the id", () => {
      expect(parsePathnameForAmbient("/worklog/notes/abc-123/edit")).toEqual(
        empty,
      );
    });
  });

  describe("experience (WorkHistory) detail route", () => {
    it("extracts activeJobId from /experience/[id]", () => {
      expect(parsePathnameForAmbient("/experience/xyz-789")).toEqual({
        activeJobId: "xyz-789",
      });
    });

    it("ignores the reserved /experience/verify subroute", () => {
      expect(parsePathnameForAmbient("/experience/verify")).toEqual(empty);
    });

    it("does NOT match an extra path segment after the id", () => {
      expect(parsePathnameForAmbient("/experience/xyz-789/edit")).toEqual(
        empty,
      );
    });
  });

  describe("non-matching routes", () => {
    it("returns empty for the dashboard", () => {
      expect(parsePathnameForAmbient("/dashboard")).toEqual(empty);
    });

    it("returns empty for the worklog landing page", () => {
      expect(parsePathnameForAmbient("/worklog")).toEqual(empty);
    });

    it("returns empty for unrelated dynamic routes", () => {
      expect(parsePathnameForAmbient("/experience")).toEqual(empty);
      expect(parsePathnameForAmbient("/jobs/some-slug")).toEqual(empty);
      expect(parsePathnameForAmbient("/career-model")).toEqual(empty);
    });

    it("returns empty for an empty / root pathname", () => {
      expect(parsePathnameForAmbient("")).toEqual(empty);
      expect(parsePathnameForAmbient("/")).toEqual(empty);
    });
  });
});
