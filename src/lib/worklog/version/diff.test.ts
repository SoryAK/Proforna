/**
 * Tests for computePlainTextDiff — ADR-0017 Phase 7b.
 *
 * Pure helper that returns an LCS-based segment list comparing two
 * plain-text snapshots word by word. The history panel's "View diff"
 * button renders these segments with green (added) / red (removed) /
 * neutral (equal) styling.
 *
 * Whitespace boundary: split on whitespace runs but keep the
 * separators attached to the preceding token so the rendered output
 * doesn't collapse the spacing. Newlines are split as their own
 * tokens so a paragraph break still feels like a break in the diff.
 */

import { describe, it, expect } from "vitest";
import { computePlainTextDiff } from "./diff";

describe("computePlainTextDiff", () => {
  it("returns a single equal segment when both inputs are identical", () => {
    const out = computePlainTextDiff("hello world", "hello world");
    expect(out).toEqual([{ type: "equal", text: "hello world" }]);
  });

  it("returns an empty list when both inputs are empty", () => {
    const out = computePlainTextDiff("", "");
    expect(out).toEqual([]);
  });

  it("entire next input is an addition when prev is empty", () => {
    const out = computePlainTextDiff("", "hello world");
    expect(out).toEqual([{ type: "add", text: "hello world" }]);
  });

  it("entire prev input is a removal when next is empty", () => {
    const out = computePlainTextDiff("hello world", "");
    expect(out).toEqual([{ type: "remove", text: "hello world" }]);
  });

  it("marks an appended word as an addition", () => {
    const out = computePlainTextDiff("hello world", "hello world again");
    // Segments coalesce same-type runs; an addition tacked onto an equal
    // prefix should produce exactly two segments.
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ type: "equal", text: "hello world" });
    expect(out[1].type).toBe("add");
    expect(out[1].text).toContain("again");
  });

  it("marks a removed trailing word as a removal", () => {
    const out = computePlainTextDiff("hello cruel world", "hello world");
    // equal "hello " → remove "cruel " → equal "world"
    const types = out.map((s) => s.type);
    expect(types).toContain("remove");
    const removed = out.find((s) => s.type === "remove");
    expect(removed?.text).toContain("cruel");
  });

  it("marks an inline substitution as remove + add", () => {
    const out = computePlainTextDiff("the quick brown fox", "the slow brown fox");
    const removed = out.find((s) => s.type === "remove");
    const added   = out.find((s) => s.type === "add");
    expect(removed?.text).toContain("quick");
    expect(added?.text).toContain("slow");
    // Equal anchors should survive on both sides.
    expect(out.some((s) => s.type === "equal" && s.text.includes("the"))).toBe(true);
    expect(out.some((s) => s.type === "equal" && s.text.includes("brown fox"))).toBe(true);
  });

  it("coalesces consecutive same-type segments (no run-of-1-token noise)", () => {
    const out = computePlainTextDiff("a b c", "a x y c");
    // Adjacent additions should land in a single segment, not two.
    let prevType: string | null = null;
    for (const seg of out) {
      expect(seg.type === prevType).toBe(false);
      prevType = seg.type;
    }
  });

  it("treats newlines as standalone tokens (paragraph breaks visible)", () => {
    const out = computePlainTextDiff("a\nb", "a\nc");
    // The newline anchor must survive in an equal segment so the diff
    // renders on two lines and not a flattened one.
    expect(out.some((s) => s.type === "equal" && s.text.includes("\n"))).toBe(true);
    expect(out.some((s) => s.type === "remove" && s.text.includes("b"))).toBe(true);
    expect(out.some((s) => s.type === "add"    && s.text.includes("c"))).toBe(true);
  });
});
