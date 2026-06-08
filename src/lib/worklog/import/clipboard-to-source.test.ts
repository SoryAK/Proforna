/**
 * Tests for clipboardToSource — pure helper that turns a browser
 * DataTransfer (from a paste event's `clipboardData`) into the same payload
 * shape /api/work-logs/import expects.
 *
 * Discrimination strategy (Sprint 5 Q1):
 *   - If both text/html and text/plain are present, prefer text/html for
 *     structure preservation — UNLESS the html is just a wrapper/meta bundle
 *     AND the plain text looks like real markdown (has `# `, `- `, `* `,
 *     fenced code, etc.). Then prefer markdown.
 *   - html-only          → sourceType: "html"
 *   - plain-only         → sourceType: "markdown" (raw text is closest to md)
 *   - empty / no types   → null
 *
 * The helper does NOT inspect `clipboardData.files` — those flow through the
 * existing file path (drag/drop / file picker / paste of an actual File).
 * Image clipboard items are deliberately ignored (parked: docs/parked-ideas).
 *
 * Filename: caller supplies a `now()` Date so tests are deterministic. The
 * returned `sourceFilename` is `Pasted note — YYYY-MM-DD HH:mm.{md|html}`
 * so the import endpoint's `filenameToTitle` fallback produces a readable
 * title.
 */

import { clipboardToSource } from "@/lib/worklog/import/clipboard-to-source";

// Minimal DataTransfer-like fake: only `types` and `getData` are touched.
function makeClipboard(parts: Record<string, string>): DataTransfer {
  const types = Object.keys(parts);
  return {
    types,
    getData(type: string) {
      return parts[type] ?? "";
    },
    // The helper never reads .files, but jsdom-less env doesn't ship a real
    // FileList; stub for shape only.
    files: [] as unknown as FileList,
  } as unknown as DataTransfer;
}

const FIXED_NOW = new Date("2026-06-08T14:35:00Z");

describe("clipboardToSource — single-type clipboards", () => {
  it("returns html sourceType when only text/html is present", () => {
    const cb = makeClipboard({ "text/html": "<h1>Hi</h1><p>Body</p>" });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r?.sourceType).toBe("html");
    expect(r?.source).toBe("<h1>Hi</h1><p>Body</p>");
    expect(r?.sourceFilename).toMatch(/\.html$/);
  });

  it("returns markdown sourceType when only text/plain is present", () => {
    const cb = makeClipboard({ "text/plain": "Just some plain text." });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r?.sourceType).toBe("markdown");
    expect(r?.source).toBe("Just some plain text.");
    expect(r?.sourceFilename).toMatch(/\.md$/);
  });

  it("returns markdown sourceType when only text/markdown is present", () => {
    const cb = makeClipboard({ "text/markdown": "# Heading" });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r?.sourceType).toBe("markdown");
    expect(r?.source).toBe("# Heading");
  });
});

describe("clipboardToSource — dual html+plain clipboards", () => {
  it("prefers html when both rich html and plain are present (default)", () => {
    const cb = makeClipboard({
      "text/html": "<h1>Hi</h1><p>Body</p>",
      "text/plain": "Hi\nBody",
    });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r?.sourceType).toBe("html");
    expect(r?.source).toBe("<h1>Hi</h1><p>Body</p>");
  });

  it("prefers markdown when html is just a meta/wrapper bundle and plain text looks like real markdown", () => {
    // Notion/some apps put the *source URL* in a meta-only html payload
    // but the actual markdown structure in text/plain.
    const cb = makeClipboard({
      "text/html":
        '<meta charset="utf-8"><meta name="source-url" content="https://notion.so/x">',
      "text/plain": "# Real Heading\n\n- item 1\n- item 2\n\n```ts\nlet x = 1;\n```",
    });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r?.sourceType).toBe("markdown");
    expect(r?.source).toContain("# Real Heading");
  });

  it("still prefers html when plain text has no markdown markers", () => {
    const cb = makeClipboard({
      "text/html": '<meta charset="utf-8"><p>Pretty body</p>',
      "text/plain": "Pretty body",
    });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r?.sourceType).toBe("html");
  });
});

describe("clipboardToSource — empty / unusable clipboards", () => {
  it("returns null when no recognized types are present", () => {
    const cb = makeClipboard({ "image/png": "binary data" });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r).toBeNull();
  });

  it("returns null when all recognized payloads are empty strings", () => {
    const cb = makeClipboard({ "text/html": "", "text/plain": "" });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r).toBeNull();
  });

  it("returns null when clipboardData is null", () => {
    const r = clipboardToSource(null, { now: FIXED_NOW });
    expect(r).toBeNull();
  });

  it("returns null when types is undefined (legacy edge case)", () => {
    const cb = {
      types: undefined,
      getData: () => "",
      files: [] as unknown as FileList,
    } as unknown as DataTransfer;
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r).toBeNull();
  });
});

describe("clipboardToSource — generated filename", () => {
  it("formats sourceFilename as 'Pasted note — YYYY-MM-DD HH:mm.<ext>'", () => {
    const cb = makeClipboard({ "text/plain": "hi" });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    // Format uses LOCAL time so the test must be tolerant of TZ but the
    // base pattern should always hold. Match the prefix + extension shape.
    expect(r?.sourceFilename).toMatch(
      /^Pasted note — \d{4}-\d{2}-\d{2} \d{2}:\d{2}\.md$/,
    );
  });

  it("uses .html extension when html payload wins", () => {
    const cb = makeClipboard({ "text/html": "<p>x</p>" });
    const r = clipboardToSource(cb, { now: FIXED_NOW });
    expect(r?.sourceFilename).toMatch(/\.html$/);
  });
});
