/**
 * Tests for arraysEqualAsSets — used by the WorkLog PUT route's
 * skip-if-equal guard so autosave does not re-write GIN-indexed array
 * columns (assetIds, linkedWorkLogIds) on every save when nothing changed.
 *
 * @see ADR-0016
 */

import { arraysEqualAsSets } from "@/lib/array-set-equal";

describe("arraysEqualAsSets", () => {
  it("returns true for two empty arrays", () => {
    expect(arraysEqualAsSets([], [])).toBe(true);
  });

  it("returns true for identical single-element arrays", () => {
    expect(arraysEqualAsSets(["a"], ["a"])).toBe(true);
  });

  it("returns true regardless of order", () => {
    expect(arraysEqualAsSets(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });

  it("returns true when one side has duplicates and the other doesn't", () => {
    // Set semantics: ["a", "a", "b"] and ["a", "b"] represent the same set.
    expect(arraysEqualAsSets(["a", "a", "b"], ["a", "b"])).toBe(true);
  });

  it("returns false when sets differ by one element", () => {
    expect(arraysEqualAsSets(["a", "b"], ["a", "b", "c"])).toBe(false);
  });

  it("returns false when arrays have same length but different members", () => {
    expect(arraysEqualAsSets(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(arraysEqualAsSets([], ["a"])).toBe(false);
    expect(arraysEqualAsSets(["a"], [])).toBe(false);
  });
});
