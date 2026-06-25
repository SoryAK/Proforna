import { describe, it, expect } from "vitest";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  computeBackoffMs,
  computeNextScheduledAt,
} from "./backoff";

describe("computeBackoffMs", () => {
  it("returns 0 for negative attempt counts (defensive)", () => {
    expect(computeBackoffMs(-1)).toBe(0);
    expect(computeBackoffMs(-5)).toBe(0);
  });

  it("returns BACKOFF_BASE_MS for the first retry (attempts=0)", () => {
    expect(computeBackoffMs(0)).toBe(BACKOFF_BASE_MS);
  });

  it("doubles per attempt up to the cap", () => {
    expect(computeBackoffMs(0)).toBe(BACKOFF_BASE_MS);
    expect(computeBackoffMs(1)).toBe(BACKOFF_BASE_MS * 2);
    expect(computeBackoffMs(2)).toBe(BACKOFF_BASE_MS * 4);
    expect(computeBackoffMs(3)).toBe(BACKOFF_BASE_MS * 8);
    expect(computeBackoffMs(4)).toBe(BACKOFF_BASE_MS * 16);
  });

  it("caps at BACKOFF_MAX_MS regardless of attempt count", () => {
    // With base=60s and max=1h, the cap kicks in at attempts >= 6
    // (60s * 2^6 = 3840s = 64m > 60m cap).
    expect(computeBackoffMs(6)).toBe(BACKOFF_MAX_MS);
    expect(computeBackoffMs(10)).toBe(BACKOFF_MAX_MS);
    expect(computeBackoffMs(100)).toBe(BACKOFF_MAX_MS);
  });
});

describe("computeNextScheduledAt", () => {
  it("offsets `now` by the computed backoff", () => {
    const now = new Date("2026-06-25T12:00:00Z");
    const next = computeNextScheduledAt(0, now);
    expect(next.getTime() - now.getTime()).toBe(BACKOFF_BASE_MS);
  });

  it("respects the cap when computing the schedule", () => {
    const now = new Date("2026-06-25T12:00:00Z");
    const next = computeNextScheduledAt(100, now);
    expect(next.getTime() - now.getTime()).toBe(BACKOFF_MAX_MS);
  });

  it("returns a new Date — does not mutate the input", () => {
    const now = new Date("2026-06-25T12:00:00Z");
    const nowMs = now.getTime();
    computeNextScheduledAt(2, now);
    expect(now.getTime()).toBe(nowMs);
  });
});
