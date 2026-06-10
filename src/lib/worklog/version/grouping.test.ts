/**
 * Tests for groupVersionsByDate — ADR-0017 Phase 7 (UI history panel scaffolding).
 *
 * Pure helper: given a chronological-list of version rows (newest first, as
 * returned by GET /api/work-logs/[id]/versions) and a reference `now`,
 * bucket them into Today / Yesterday / Earlier this week / Older. Empty
 * buckets are returned (not stripped) so the UI can decide whether to
 * render the section heading.
 *
 * Boundary rules (all evaluated in local time):
 *   - "Today"     → same calendar day as `now`
 *   - "Yesterday" → calendar day immediately before `now`
 *   - "ThisWeek"  → within the last 7 days but NOT Today/Yesterday
 *   - "Older"     → everything else
 *
 * Versions within a bucket preserve input order (newest first).
 */

import { describe, it, expect } from "vitest";
import { groupVersionsByDate, type GroupableVersion } from "./grouping";

function v(id: string, isoDate: string): GroupableVersion {
  return { id, createdAt: isoDate };
}

describe("groupVersionsByDate", () => {
  it("returns four empty buckets for an empty input", () => {
    const out = groupVersionsByDate({
      versions: [],
      now: new Date("2026-06-09T12:00:00Z"),
    });
    expect(out).toEqual({ today: [], yesterday: [], thisWeek: [], older: [] });
  });

  it("bucket: today — same calendar day as `now`", () => {
    const now = new Date("2026-06-09T15:00:00");
    const rows = [
      v("a", "2026-06-09T14:30:00"), // just earlier today
      v("b", "2026-06-09T00:01:00"), // first minute of today
    ];
    const out = groupVersionsByDate({ versions: rows, now });
    expect(out.today.map((r) => r.id)).toEqual(["a", "b"]);
    expect(out.yesterday).toEqual([]);
    expect(out.thisWeek).toEqual([]);
    expect(out.older).toEqual([]);
  });

  it("bucket: yesterday — calendar day immediately before `now`", () => {
    const now = new Date("2026-06-09T10:00:00");
    const rows = [
      v("y1", "2026-06-08T23:59:00"),
      v("y2", "2026-06-08T00:00:00"),
    ];
    const out = groupVersionsByDate({ versions: rows, now });
    expect(out.yesterday.map((r) => r.id)).toEqual(["y1", "y2"]);
    expect(out.today).toEqual([]);
    expect(out.thisWeek).toEqual([]);
  });

  it("bucket: thisWeek — 2–7 days ago", () => {
    const now = new Date("2026-06-09T10:00:00");
    const rows = [
      v("w-2d", "2026-06-07T12:00:00"),
      v("w-6d", "2026-06-03T12:00:00"),
      v("w-7d", "2026-06-02T11:00:00"), // exactly 7 days before `now`
    ];
    const out = groupVersionsByDate({ versions: rows, now });
    expect(out.thisWeek.map((r) => r.id)).toEqual(["w-2d", "w-6d", "w-7d"]);
  });

  it("bucket: older — strictly more than 7 days ago", () => {
    const now = new Date("2026-06-09T10:00:00");
    const rows = [
      v("o1", "2026-06-02T09:59:00"), // 7d + 1m → older
      v("o2", "2026-05-30T12:00:00"),
      v("o3", "2025-12-31T23:00:00"),
    ];
    const out = groupVersionsByDate({ versions: rows, now });
    expect(out.older.map((r) => r.id)).toEqual(["o1", "o2", "o3"]);
    expect(out.thisWeek).toEqual([]);
  });

  it("preserves input order within each bucket (newest first stays newest first)", () => {
    const now = new Date("2026-06-09T15:00:00");
    const rows = [
      v("t-late",  "2026-06-09T14:00:00"),
      v("t-early", "2026-06-09T08:00:00"),
      v("y-late",  "2026-06-08T22:00:00"),
      v("y-early", "2026-06-08T01:00:00"),
    ];
    const out = groupVersionsByDate({ versions: rows, now });
    expect(out.today.map((r) => r.id)).toEqual(["t-late", "t-early"]);
    expect(out.yesterday.map((r) => r.id)).toEqual(["y-late", "y-early"]);
  });

  it("handles a mixed input across all buckets in one call", () => {
    const now = new Date("2026-06-09T12:00:00");
    const rows = [
      v("today",     "2026-06-09T10:00:00"),
      v("yesterday", "2026-06-08T10:00:00"),
      v("week",      "2026-06-05T10:00:00"),
      v("older",     "2026-05-01T10:00:00"),
    ];
    const out = groupVersionsByDate({ versions: rows, now });
    expect(out.today.map((r) => r.id)).toEqual(["today"]);
    expect(out.yesterday.map((r) => r.id)).toEqual(["yesterday"]);
    expect(out.thisWeek.map((r) => r.id)).toEqual(["week"]);
    expect(out.older.map((r) => r.id)).toEqual(["older"]);
  });

  it("accepts Date instances in addition to ISO strings on createdAt", () => {
    const now = new Date("2026-06-09T12:00:00");
    const rows: GroupableVersion[] = [
      { id: "d", createdAt: new Date("2026-06-09T10:00:00") },
    ];
    const out = groupVersionsByDate({ versions: rows, now });
    expect(out.today.map((r) => r.id)).toEqual(["d"]);
  });
});
