/**
 * Tests for the CareerEvent input validator.
 *
 * Phase 2.5 TDD (per `testing.instructions.md`): this test file MUST
 * exist (and fail to compile) before any implementation appears in
 * `event-schema.ts`.
 *
 * Style: plain-TS validator returning `{ ok: true, value } | { ok: false, error }`.
 * Mirrors the worklog-categories.ts / worklog-folders.ts pattern. The
 * repo does not use zod (see ADR-0027 implementation correction).
 *
 * Cross-field rule (load-bearing — ADR-0027 Q1A):
 *   - workHistoryId === null         => lat AND lng AND location all required + non-empty
 *   - workHistoryId === "<some id>"  => lat/lng/location all optional (work-history provides geo)
 *
 * Optional fields preserve null vs undefined semantics so the API
 * route (Day 2) can pass straight to Prisma without re-massaging.
 */

import { describe, it, expect } from "vitest";
import {
  CAREER_EVENT_TITLE_MAX,
  CAREER_EVENT_DESCRIPTION_MAX,
  CAREER_EVENT_LOCATION_MAX,
  CAREER_EVENT_METRICS_MAX,
  CAREER_EVENT_CATEGORY_FALLBACK,
  CAREER_EVENT_CATEGORY_SUGGESTIONS,
  validateCareerEventInput,
} from "./event-schema";

// ─── Constants ──────────────────────────────────────────────────────

describe("CareerEvent constants", () => {
  it("title max is 200 (matches existing route handler)", () => {
    expect(CAREER_EVENT_TITLE_MAX).toBe(200);
  });

  it("description max is 2000 (matches existing route handler)", () => {
    expect(CAREER_EVENT_DESCRIPTION_MAX).toBe(2000);
  });

  it("location max is 200 (matches existing route handler)", () => {
    expect(CAREER_EVENT_LOCATION_MAX).toBe(200);
  });

  it("metrics max is 500 (matches existing route handler)", () => {
    expect(CAREER_EVENT_METRICS_MAX).toBe(500);
  });

  it("category fallback is 'company_event' (matches existing route handler)", () => {
    expect(CAREER_EVENT_CATEGORY_FALLBACK).toBe("company_event");
  });

  it("category suggestions include legacy + 'things you participated in' buckets", () => {
    // Sanity: the existing route handler whitelist is preserved as a starting point.
    expect(CAREER_EVENT_CATEGORY_SUGGESTIONS).toContain("project");
    expect(CAREER_EVENT_CATEGORY_SUGGESTIONS).toContain("milestone");
    expect(CAREER_EVENT_CATEGORY_SUGGESTIONS).toContain("company_event");
    expect(CAREER_EVENT_CATEGORY_SUGGESTIONS).toContain("field_day");
    expect(CAREER_EVENT_CATEGORY_SUGGESTIONS).toContain("other");
  });
});

// ─── validateCareerEventInput — happy paths ────────────────────────

describe("validateCareerEventInput — anchored events (workHistoryId set)", () => {
  it("accepts a fully populated anchored payload", () => {
    const result = validateCareerEventInput({
      title: "Led GCP Migration",
      workHistoryId: "wh_abc",
      description: "Migrated 200 services to GCP.",
      category: "project",
      startDate: "2025-01-01T00:00:00.000Z",
      endDate: "2025-06-01T00:00:00.000Z",
      location: "Mountain View, CA",
      lat: 37.4221,
      lng: -122.0841,
      metrics: "200 services, $2M ARR",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Led GCP Migration");
      expect(result.value.workHistoryId).toBe("wh_abc");
      expect(result.value.startDate).toBeInstanceOf(Date);
      expect(result.value.endDate).toBeInstanceOf(Date);
      expect(result.value.lat).toBe(37.4221);
      expect(result.value.lng).toBe(-122.0841);
    }
  });

  it("accepts a minimal anchored payload (just title + workHistoryId)", () => {
    const result = validateCareerEventInput({
      title: "Standup",
      workHistoryId: "wh_abc",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Standup");
      expect(result.value.lat).toBeNull();
      expect(result.value.lng).toBeNull();
      expect(result.value.location).toBeNull();
      expect(result.value.startDate).toBeNull();
    }
  });

  it("falls back to 'company_event' when category is missing", () => {
    const result = validateCareerEventInput({
      title: "Quarterly review",
      workHistoryId: "wh_abc",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.category).toBe("company_event");
    }
  });

  it("preserves an unrecognized category as free-form (Q3B)", () => {
    const result = validateCareerEventInput({
      title: "Solar eclipse viewing",
      workHistoryId: "wh_abc",
      category: "astronomy_outing",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Free-form taxonomy: passes through verbatim, no whitelist gating.
      expect(result.value.category).toBe("astronomy_outing");
    }
  });

  it("trims and clamps overlong description / metrics", () => {
    const longDesc = "x".repeat(CAREER_EVENT_DESCRIPTION_MAX + 50);
    const longMetrics = "y".repeat(CAREER_EVENT_METRICS_MAX + 50);
    const result = validateCareerEventInput({
      title: "Big project",
      workHistoryId: "wh_abc",
      description: longDesc,
      metrics: longMetrics,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description!.length).toBe(CAREER_EVENT_DESCRIPTION_MAX);
      expect(result.value.metrics!.length).toBe(CAREER_EVENT_METRICS_MAX);
    }
  });

  it("parses ISO date strings into Date objects", () => {
    const result = validateCareerEventInput({
      title: "Launch",
      workHistoryId: "wh_abc",
      startDate: "2025-04-15T13:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startDate).toBeInstanceOf(Date);
      expect((result.value.startDate as Date).toISOString()).toBe(
        "2025-04-15T13:00:00.000Z"
      );
    }
  });
});

describe("validateCareerEventInput — free-floating events (workHistoryId null)", () => {
  it("accepts a fully populated free-floating payload", () => {
    const result = validateCareerEventInput({
      title: "Solar eclipse viewing",
      workHistoryId: null,
      location: "Cleveland, OH",
      lat: 41.4993,
      lng: -81.6944,
      startDate: "2024-04-08T18:13:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workHistoryId).toBeNull();
      expect(result.value.location).toBe("Cleveland, OH");
      expect(result.value.lat).toBe(41.4993);
      expect(result.value.lng).toBe(-81.6944);
    }
  });
});

// ─── validateCareerEventInput — failure paths ──────────────────────

describe("validateCareerEventInput — rejection cases", () => {
  it("rejects missing title", () => {
    const result = validateCareerEventInput({
      workHistoryId: "wh_abc",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/title/i);
    }
  });

  it("rejects empty / whitespace-only title", () => {
    expect(
      validateCareerEventInput({ title: "", workHistoryId: "wh_abc" }).ok
    ).toBe(false);
    expect(
      validateCareerEventInput({ title: "   ", workHistoryId: "wh_abc" }).ok
    ).toBe(false);
  });

  it("rejects overlong title (> CAREER_EVENT_TITLE_MAX)", () => {
    const result = validateCareerEventInput({
      title: "x".repeat(CAREER_EVENT_TITLE_MAX + 1),
      workHistoryId: "wh_abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/title/i);
  });

  it("rejects empty-string workHistoryId (anchored-to-nothing)", () => {
    // Empty string is neither null (free-floating) nor a real id; reject explicitly
    // so the caller is forced to pick one.
    const result = validateCareerEventInput({
      title: "Standup",
      workHistoryId: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/workHistoryId/i);
  });

  it("rejects free-floating event missing lat", () => {
    const result = validateCareerEventInput({
      title: "Solar eclipse viewing",
      workHistoryId: null,
      location: "Cleveland, OH",
      lng: -81.6944,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/lat/i);
  });

  it("rejects free-floating event missing lng", () => {
    const result = validateCareerEventInput({
      title: "Solar eclipse viewing",
      workHistoryId: null,
      location: "Cleveland, OH",
      lat: 41.4993,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/lng/i);
  });

  it("rejects free-floating event missing location", () => {
    const result = validateCareerEventInput({
      title: "Solar eclipse viewing",
      workHistoryId: null,
      lat: 41.4993,
      lng: -81.6944,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/location/i);
  });

  it("rejects free-floating event with empty-string location (after trim)", () => {
    const result = validateCareerEventInput({
      title: "Solar eclipse viewing",
      workHistoryId: null,
      lat: 41.4993,
      lng: -81.6944,
      location: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/location/i);
  });

  it("rejects non-finite lat / lng", () => {
    expect(
      validateCareerEventInput({
        title: "x",
        workHistoryId: null,
        location: "Somewhere",
        lat: Number.NaN,
        lng: 0,
      }).ok
    ).toBe(false);
    expect(
      validateCareerEventInput({
        title: "x",
        workHistoryId: null,
        location: "Somewhere",
        lat: 0,
        lng: Number.POSITIVE_INFINITY,
      }).ok
    ).toBe(false);
  });

  it("rejects malformed ISO date strings", () => {
    const result = validateCareerEventInput({
      title: "Launch",
      workHistoryId: "wh_abc",
      startDate: "not-a-date",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/startDate|date/i);
  });

  it("rejects non-object input", () => {
    expect(validateCareerEventInput(null).ok).toBe(false);
    expect(validateCareerEventInput("string").ok).toBe(false);
    expect(validateCareerEventInput(42).ok).toBe(false);
    expect(validateCareerEventInput(undefined).ok).toBe(false);
  });
});
