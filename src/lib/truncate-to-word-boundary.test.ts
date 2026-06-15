import { describe, it, expect } from "vitest";
import { truncateToWordBoundary } from "./truncate-to-word-boundary";

describe("truncateToWordBoundary", () => {
  it("returns input unchanged when length <= maxLength", () => {
    expect(truncateToWordBoundary("Hello", 5)).toBe("Hello");
    expect(truncateToWordBoundary("Hello", 10)).toBe("Hello");
  });

  it("truncates at last whitespace before maxLength and appends ellipsis", () => {
    expect(truncateToWordBoundary("Hello World", 8)).toBe("Hello\u2026");
  });

  it("result length is always <= maxLength", () => {
    const text = "This is a very long string that needs truncation";
    const maxLength = 10;
    const result = truncateToWordBoundary(text, maxLength);
    expect(result.length).toBeLessThanOrEqual(maxLength);
  });

  it("trims trailing space before the ellipsis", () => {
    expect(truncateToWordBoundary("Hello  World", 7)).toBe("Hello\u2026");
  });

  it("hard-cuts when no whitespace exists in the window", () => {
    expect(truncateToWordBoundary("Supercalifragilistic", 5)).toBe("Supe\u2026");
  });

  it("returns just ellipsis when maxLength === 1", () => {
    expect(truncateToWordBoundary("Hello", 1)).toBe("\u2026");
  });

  it("returns just ellipsis when maxLength === 0", () => {
    expect(truncateToWordBoundary("Hello", 0)).toBe("\u2026");
  });

  it("handles maxLength larger than text length (no-op)", () => {
    expect(truncateToWordBoundary("Short", 100)).toBe("Short");
  });

  it("handles empty string input", () => {
    expect(truncateToWordBoundary("", 5)).toBe("");
  });
});