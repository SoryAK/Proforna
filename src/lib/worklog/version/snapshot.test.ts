import { describe, expect, it } from "vitest";
import {
  CHAR_DELTA_THRESHOLD,
  computeRetentionPlan,
  IDLE_THRESHOLD_MS,
  MANUAL_CAP_PER_NOTE,
  shouldAutoSnapshot,
} from "./snapshot";

// ─── Auto-snapshot trigger heuristic (ADR-0017 Sprint Kickoff Q1) ──────────
// length-delta only; Levenshtein is intentionally out of scope for v1.
describe("shouldAutoSnapshot", () => {
  const NOW = new Date("2026-06-09T20:00:00Z");
  const longEnoughAgo = new Date(NOW.getTime() - IDLE_THRESHOLD_MS - 1);
  const tooRecent = new Date(NOW.getTime() - 1_000);

  it("returns false when prev and curr text are identical", () => {
    expect(
      shouldAutoSnapshot({
        prevPlainText: "hello world",
        currPlainText: "hello world",
        lastSnapshotAt: longEnoughAgo,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("returns false when the idle threshold has not elapsed yet", () => {
    expect(
      shouldAutoSnapshot({
        prevPlainText: "",
        currPlainText: "x".repeat(200),
        lastSnapshotAt: tooRecent,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("returns false when char delta is below threshold even after idle", () => {
    expect(
      shouldAutoSnapshot({
        prevPlainText: "hello world",
        currPlainText: "hello worlds", // delta = 1
        lastSnapshotAt: longEnoughAgo,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("returns true when both idle and char-delta thresholds are met", () => {
    expect(
      shouldAutoSnapshot({
        prevPlainText: "",
        currPlainText: "x".repeat(CHAR_DELTA_THRESHOLD),
        lastSnapshotAt: longEnoughAgo,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("treats lastSnapshotAt = null as 'no prior snapshot' (idle check passes)", () => {
    expect(
      shouldAutoSnapshot({
        prevPlainText: "",
        currPlainText: "x".repeat(CHAR_DELTA_THRESHOLD),
        lastSnapshotAt: null,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("fires on large deletions (curr shorter than prev by threshold)", () => {
    expect(
      shouldAutoSnapshot({
        prevPlainText: "x".repeat(CHAR_DELTA_THRESHOLD + 1),
        currPlainText: "",
        lastSnapshotAt: longEnoughAgo,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("returns false when curr is empty AND prev was empty (new doc, no content)", () => {
    expect(
      shouldAutoSnapshot({
        prevPlainText: "",
        currPlainText: "",
        lastSnapshotAt: null,
        now: NOW,
      }),
    ).toBe(false);
  });
});

// ─── Retention thinning plan (ADR-0017 tiered retention) ──────────────────
//   - Last hour: keep newest 10 auto-snapshots, drop the rest.
//   - 1h–24h:    keep one auto-snapshot per hour bucket (newest per bucket).
//   - >24h:      keep one auto-snapshot per UTC calendar day (newest per day).
//   - Manual:    never auto-thinned; per-note cap of MANUAL_CAP_PER_NOTE, FIFO.
describe("computeRetentionPlan", () => {
  const NOW = new Date("2026-06-09T20:00:00Z");
  function v(id: string, hoursAgo: number, isManual = false) {
    return {
      id,
      createdAt: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000),
      isManual,
    };
  }

  it("keeps everything when no rule fires (small history)", () => {
    const versions = [v("a", 0.1), v("b", 0.2), v("c", 0.3)];
    const plan = computeRetentionPlan({ versions, now: NOW });
    expect(plan.delete).toEqual([]);
    expect([...plan.keep].sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps only the newest 10 auto-snapshots within the last hour", () => {
    const versions = Array.from({ length: 12 }, (_, i) =>
      v(`a${String(i).padStart(2, "0")}`, i * 0.05),
    );
    const plan = computeRetentionPlan({ versions, now: NOW });
    expect([...plan.delete].sort()).toEqual(["a10", "a11"]);
  });

  it("thins 1h–24h auto-snapshots to one per hour (newest in each bucket survives)", () => {
    const versions = [
      v("a", 2.1),
      v("b", 2.5),
      v("c", 2.05), // newest in the 2h bucket
      v("d", 5.0), // alone in 5h bucket
    ];
    const plan = computeRetentionPlan({ versions, now: NOW });
    expect([...plan.keep].sort()).toEqual(["c", "d"]);
    expect([...plan.delete].sort()).toEqual(["a", "b"]);
  });

  it("thins >24h auto-snapshots to one per UTC calendar day", () => {
    const versions = [
      v("a", 48), // 2 days ago, newer
      v("b", 50), // same day, older
      v("c", 72), // 3 days ago, alone
    ];
    const plan = computeRetentionPlan({ versions, now: NOW });
    expect([...plan.keep].sort()).toEqual(["a", "c"]);
    expect([...plan.delete].sort()).toEqual(["b"]);
  });

  it("never deletes manual snapshots when count is under the cap", () => {
    const versions = [
      v("m1", 100, true),
      v("m2", 200, true),
      v("a", 100), // auto, > 24h old, alone in its day
    ];
    const plan = computeRetentionPlan({ versions, now: NOW });
    expect(plan.delete).toEqual([]);
  });

  it("evicts oldest manual snapshots once the per-note cap is exceeded", () => {
    const versions = Array.from({ length: MANUAL_CAP_PER_NOTE + 2 }, (_, i) =>
      v(`m${String(i).padStart(3, "0")}`, i * 0.1, true),
    );
    const plan = computeRetentionPlan({ versions, now: NOW });
    const evicted = [
      `m${String(MANUAL_CAP_PER_NOTE).padStart(3, "0")}`,
      `m${String(MANUAL_CAP_PER_NOTE + 1).padStart(3, "0")}`,
    ];
    expect([...plan.delete].sort()).toEqual(evicted.sort());
  });

  it("auto + manual mix: applies each rule set independently", () => {
    const versions = [
      ...Array.from({ length: 12 }, (_, i) =>
        v(`a${String(i).padStart(2, "0")}`, i * 0.05),
      ), // 12 auto in last hour → drop oldest 2
      v("m1", 100, true), // manual, kept
      v("m2", 200, true), // manual, kept
    ];
    const plan = computeRetentionPlan({ versions, now: NOW });
    expect([...plan.delete].sort()).toEqual(["a10", "a11"]);
    expect(plan.keep).toContain("m1");
    expect(plan.keep).toContain("m2");
  });
});
