/**
 * Pure-helper tests for src/lib/worklog-categories.ts.
 *
 * Mirrors the worklog-folders helper pattern: validation rules + seeded
 * defaults live here so both the API routes and the client hook can share
 * the exact same constants.
 *
 * Phase 2.5 TDD: this file MUST exist (and fail to compile) before any
 * implementation appears in worklog-categories.ts.
 */

import {
  WORKLOG_CATEGORY_NAME_MAX,
  WORKLOG_CATEGORY_RESERVED,
  WORKLOG_CATEGORY_FALLBACK,
  WORKLOG_CATEGORY_SEEDS,
  validateWorklogCategoryName,
  isReservedCategoryName,
} from "@/lib/worklog-categories";

describe("worklog-categories constants", () => {
  it("seed list is exactly [task, project, meeting]", () => {
    expect(WORKLOG_CATEGORY_SEEDS).toEqual(["task", "project", "meeting"]);
  });

  it("'other' is the permanent fallback bucket and is reserved", () => {
    expect(WORKLOG_CATEGORY_FALLBACK).toBe("other");
    expect(WORKLOG_CATEGORY_RESERVED).toContain("other");
  });

  it("name max length is 40", () => {
    expect(WORKLOG_CATEGORY_NAME_MAX).toBe(40);
  });
});

describe("isReservedCategoryName", () => {
  it("flags 'other' regardless of case + surrounding whitespace", () => {
    expect(isReservedCategoryName("other")).toBe(true);
    expect(isReservedCategoryName("Other")).toBe(true);
    expect(isReservedCategoryName("  OTHER  ")).toBe(true);
  });

  it("does not flag unrelated names", () => {
    expect(isReservedCategoryName("project")).toBe(false);
    expect(isReservedCategoryName("brother")).toBe(false);
    expect(isReservedCategoryName("")).toBe(false);
  });
});

describe("validateWorklogCategoryName", () => {
  it("returns null for a valid trimmed name", () => {
    expect(validateWorklogCategoryName("standup")).toBeNull();
    expect(validateWorklogCategoryName("Code Review")).toBeNull();
  });

  it("requires a non-empty name", () => {
    expect(validateWorklogCategoryName("")).toMatch(/required/i);
    expect(validateWorklogCategoryName("   ")).toMatch(/required/i);
  });

  it("enforces the 40-char limit", () => {
    const ok = "a".repeat(40);
    const tooLong = "a".repeat(41);
    expect(validateWorklogCategoryName(ok)).toBeNull();
    expect(validateWorklogCategoryName(tooLong)).toMatch(/40/);
  });

  it("rejects the reserved 'other' name (any case, trimmed)", () => {
    expect(validateWorklogCategoryName("other")).toMatch(/reserved/i);
    expect(validateWorklogCategoryName("Other")).toMatch(/reserved/i);
    expect(validateWorklogCategoryName(" OTHER ")).toMatch(/reserved/i);
  });
});
