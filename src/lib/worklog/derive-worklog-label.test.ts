/**
 * Tests for deriveWorklogLabel — the shared label-derivation helper used by
 * mention-search and backlinks routes (and indirectly by the migration that
 * rewrites stale chip labels to the canonical title).
 *
 * Contract (ADR-0016 + bug-fix 2026-06-09):
 *   1. WorkLog.title (trimmed) is preferred when non-empty.
 *   2. Falls back to first non-empty plain-text line of contentJson.
 *   3. Falls back to ISO date (YYYY-MM-DD) when both are empty.
 *   4. Truncates results to 80 chars (77 + "…") for chip width safety.
 */

import { describe, expect, it } from "vitest";
import { deriveWorklogLabel } from "@/lib/worklog/derive-worklog-label";

const date = new Date("2026-06-09T12:00:00Z");

function docWithFirstLine(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };

describe("deriveWorklogLabel", () => {
  it("prefers title when title is non-empty", () => {
    const label = deriveWorklogLabel({
      title: "Crusher #3 motor issue",
      contentJson: docWithFirstLine("Some body content"),
      date,
    });
    expect(label).toBe("Crusher #3 motor issue");
  });

  it("trims whitespace from title before deciding non-empty", () => {
    expect(
      deriveWorklogLabel({
        title: "  Spaced title  ",
        contentJson: docWithFirstLine("Body"),
        date,
      }),
    ).toBe("Spaced title");
  });

  it("falls back to contentJson first line when title is empty string", () => {
    expect(
      deriveWorklogLabel({
        title: "",
        contentJson: docWithFirstLine("Body fallback"),
        date,
      }),
    ).toBe("Body fallback");
  });

  it("falls back to contentJson first line when title is whitespace-only", () => {
    expect(
      deriveWorklogLabel({
        title: "   ",
        contentJson: docWithFirstLine("Whitespace title fallback"),
        date,
      }),
    ).toBe("Whitespace title fallback");
  });

  it("falls back to contentJson first line when title is null/undefined", () => {
    expect(
      deriveWorklogLabel({
        title: null,
        contentJson: docWithFirstLine("Null title fallback"),
        date,
      }),
    ).toBe("Null title fallback");
    expect(
      deriveWorklogLabel({
        title: undefined,
        contentJson: docWithFirstLine("Undef title fallback"),
        date,
      }),
    ).toBe("Undef title fallback");
  });

  it("falls back to ISO date when both title and contentJson are empty", () => {
    expect(
      deriveWorklogLabel({
        title: "",
        contentJson: emptyDoc,
        date,
      }),
    ).toBe("2026-06-09");
  });

  it("falls back to ISO date when contentJson is null and title is empty", () => {
    expect(
      deriveWorklogLabel({
        title: null,
        contentJson: null,
        date,
      }),
    ).toBe("2026-06-09");
  });

  it("truncates titles longer than 80 chars to 77 + ellipsis", () => {
    const longTitle = "A".repeat(120);
    const label = deriveWorklogLabel({
      title: longTitle,
      contentJson: emptyDoc,
      date,
    });
    expect(label).toHaveLength(78); // 77 chars + 1 ellipsis char
    expect(label.endsWith("…")).toBe(true);
    expect(label.startsWith("A".repeat(77))).toBe(true);
  });

  it("truncates first-line fallback longer than 80 chars to 77 + ellipsis", () => {
    const longLine = "B".repeat(120);
    const label = deriveWorklogLabel({
      title: "",
      contentJson: docWithFirstLine(longLine),
      date,
    });
    expect(label).toHaveLength(78);
    expect(label.endsWith("…")).toBe(true);
  });

  it("uses only the first line when contentJson has multiple paragraphs", () => {
    const multi = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First line" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second line" }] },
      ],
    };
    expect(
      deriveWorklogLabel({ title: "", contentJson: multi, date }),
    ).toBe("First line");
  });
});
