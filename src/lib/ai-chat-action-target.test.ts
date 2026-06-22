/**
 * Pure-function unit tests for the action-target resolver introduced by
 * ADR-0046 Phase D.
 *
 * The resolver decides where a code-block toolbar action lands: ambient
 * page context → most-recent matching @-mention in the chat thread →
 * needs-picker. This is the single source of truth for the precedence
 * codified in ADR-0046's "target-picker pattern" section.
 *
 * RED phase per testing.instructions.md: every test in this file is
 * expected to fail before `resolveActionTarget` is implemented.
 */

import { describe, expect, it } from "vitest";

import {
  resolveActionTarget,
  type ActionType,
  type AmbientEntityRef,
  type PageContext,
  type ThreadContext,
} from "./ai-chat-action-target";

const jobA: AmbientEntityRef = { type: "job", id: "job-a", label: "Acme" };
const jobB: AmbientEntityRef = { type: "job", id: "job-b", label: "Beta" };
const worklogA: AmbientEntityRef = {
  type: "worklog",
  id: "wl-a",
  label: "Sprint plan",
};
const skillA: AmbientEntityRef = {
  type: "skill",
  id: "skill-a",
  label: "TypeScript",
};

const emptyPage: PageContext = {
  activeJob: null,
  activeWorklog: null,
  activeSkill: null,
};
const emptyThread: ThreadContext = { recentMentions: [] };

describe("resolveActionTarget — ADR-0046 Phase D", () => {
  // ── Ambient (precedence 1) ───────────────────────────────────────────────

  it("returns ambient activeJob for `add-to-job-notes`", () => {
    const result = resolveActionTarget(
      "add-to-job-notes",
      emptyThread,
      { ...emptyPage, activeJob: jobA },
    );
    expect(result).toEqual({ kind: "resolved", target: jobA });
  });

  it("returns ambient activeJob for `save-as-bullet`", () => {
    const result = resolveActionTarget(
      "save-as-bullet",
      emptyThread,
      { ...emptyPage, activeJob: jobA },
    );
    expect(result).toEqual({ kind: "resolved", target: jobA });
  });

  it("returns ambient activeWorklog for `send-to-worklog`", () => {
    const result = resolveActionTarget(
      "send-to-worklog",
      emptyThread,
      { ...emptyPage, activeWorklog: worklogA },
    );
    expect(result).toEqual({ kind: "resolved", target: worklogA });
  });

  it("ignores ambient slices of the wrong type for the action", () => {
    // A `add-to-job-notes` action on a page with no activeJob but an
    // activeWorklog should NOT resolve to the worklog. It falls through.
    const result = resolveActionTarget(
      "add-to-job-notes",
      emptyThread,
      { ...emptyPage, activeWorklog: worklogA },
    );
    expect(result).toEqual({ kind: "needs-picker", entityType: "job" });
  });

  // ── Thread fallback (precedence 2) ───────────────────────────────────────

  it("falls back to most-recent matching @-mention when ambient is missing", () => {
    // For thread context: most-recent = last element of recentMentions.
    const result = resolveActionTarget(
      "add-to-job-notes",
      { recentMentions: [jobA, skillA, jobB] },
      emptyPage,
    );
    expect(result).toEqual({ kind: "resolved", target: jobB });
  });

  it("skips non-matching-type mentions when scanning the thread", () => {
    const result = resolveActionTarget(
      "send-to-worklog",
      { recentMentions: [jobA, worklogA, jobB] },
      emptyPage,
    );
    expect(result).toEqual({ kind: "resolved", target: worklogA });
  });

  it("returns needs-picker when no matching-type mentions exist in thread", () => {
    const result = resolveActionTarget(
      "send-to-worklog",
      { recentMentions: [jobA, skillA, jobB] },
      emptyPage,
    );
    expect(result).toEqual({ kind: "needs-picker", entityType: "worklog" });
  });

  // ── Precedence ordering ──────────────────────────────────────────────────

  it("ambient WINS over thread (precedence 1 beats 2)", () => {
    const result = resolveActionTarget(
      "add-to-job-notes",
      { recentMentions: [jobB] },
      { ...emptyPage, activeJob: jobA },
    );
    expect(result).toEqual({ kind: "resolved", target: jobA });
  });

  // ── Empty inputs ─────────────────────────────────────────────────────────

  it("returns needs-picker when both ambient and thread are empty (jobs)", () => {
    const result = resolveActionTarget(
      "save-as-bullet",
      emptyThread,
      emptyPage,
    );
    expect(result).toEqual({ kind: "needs-picker", entityType: "job" });
  });

  it("returns needs-picker when both ambient and thread are empty (worklog)", () => {
    const result = resolveActionTarget(
      "send-to-worklog",
      emptyThread,
      emptyPage,
    );
    expect(result).toEqual({ kind: "needs-picker", entityType: "worklog" });
  });

  // ── Action-to-entity-type mapping ────────────────────────────────────────

  it.each<[ActionType, "job" | "worklog"]>([
    ["add-to-job-notes", "job"],
    ["save-as-bullet", "job"],
    ["send-to-worklog", "worklog"],
  ])("maps action `%s` to entity type `%s` for picker fallback", (action, expectedType) => {
    const result = resolveActionTarget(action, emptyThread, emptyPage);
    expect(result).toEqual({ kind: "needs-picker", entityType: expectedType });
  });
});
