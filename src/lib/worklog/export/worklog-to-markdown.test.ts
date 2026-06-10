/**
 * RED tests for worklogToMarkdown — Phase 1.3 of the grill-me sprint.
 *
 * Pure-function composer:
 *   worklogToMarkdown(input) => { markdown, filename, droppedBlocks }
 *
 * Composes serializeFrontmatter() + serializeToMarkdown() into the final
 * exported `.md` artifact. Caller (server route) is responsible for
 * fetching the worklog + version count from the DB.
 *
 * Phase 2.5 — TDD Iron Law. Tests written BEFORE implementation. RED first.
 */

import {
  worklogToMarkdown,
  type WorklogExportInput,
} from "@/lib/worklog/export/worklog-to-markdown";
import type { ProseMirrorDoc } from "@/lib/worklog/import/types";

const FIXED_DATE = new Date("2026-06-09T12:00:00.000Z");

const baseInput = (
  override: Partial<WorklogExportInput> = {},
): WorklogExportInput => ({
  id: "wl_abc123",
  title: "My Worklog",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Body text" }] }],
  } as ProseMirrorDoc,
  versionCount: 4,
  exportedAt: FIXED_DATE,
  ...override,
});

// ─────────────────────────────────────────────────────────
// Composition
// ─────────────────────────────────────────────────────────

describe("worklogToMarkdown — composition", () => {
  it("emits frontmatter followed by body", () => {
    const result = worklogToMarkdown(baseInput());
    expect(result.markdown.startsWith("---\n")).toBe(true);
    expect(result.markdown).toContain("id: wl_abc123");
    expect(result.markdown).toContain("version: 4");
    expect(result.markdown).toContain("exportedAt: ");
    expect(result.markdown).toContain("title: ");
    // Body comes after the closing fence + blank line
    expect(result.markdown).toMatch(/---\n\nBody text/);
  });

  it("uses the provided exportedAt as ISO string", () => {
    const result = worklogToMarkdown(baseInput({ exportedAt: FIXED_DATE }));
    expect(result.markdown).toMatch(/exportedAt: ['"]?2026-06-09T12:00:00\.000Z['"]?/);
  });

  it("forwards droppedBlocks from the body serializer", () => {
    const docWithCanvas: ProseMirrorDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "before" }] },
        {
          type: "canvasBlock",
          attrs: { canvasId: "c1", snapshot: "<svg/>", title: "My Canvas" },
        },
      ],
    };
    const result = worklogToMarkdown(baseInput({ contentJson: docWithCanvas }));
    expect(result.droppedBlocks).toEqual([{ type: "canvasBlock", count: 1 }]);
    expect(result.markdown).toMatch(/\[Canvas:.*not exported\]/);
  });

  it("emits an empty body when contentJson has no content", () => {
    const result = worklogToMarkdown(
      baseInput({ contentJson: { type: "doc", content: [] } as ProseMirrorDoc }),
    );
    // Frontmatter still present, body is empty after the fence
    expect(result.markdown).toContain("---");
    expect(result.markdown.endsWith("---\n\n")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Filename generation
// ─────────────────────────────────────────────────────────

describe("worklogToMarkdown — filename", () => {
  it("slugifies the title with .md extension", () => {
    const result = worklogToMarkdown(baseInput({ title: "My Worklog" }));
    expect(result.filename).toBe("my-worklog.md");
  });

  it("collapses repeated whitespace and punctuation", () => {
    const result = worklogToMarkdown(
      baseInput({ title: "Hello,  World!! How are you?" }),
    );
    expect(result.filename).toBe("hello-world-how-are-you.md");
  });

  it("strips diacritics and emoji", () => {
    const result = worklogToMarkdown(
      baseInput({ title: "Café 🚀 résumé" }),
    );
    expect(result.filename).toBe("cafe-resume.md");
  });

  it("falls back to 'untitled' when slug is empty", () => {
    const result = worklogToMarkdown(baseInput({ title: "!!!" }));
    expect(result.filename).toBe("untitled.md");
  });

  it("falls back to 'untitled' when title is empty", () => {
    const result = worklogToMarkdown(baseInput({ title: "" }));
    expect(result.filename).toBe("untitled.md");
  });

  it("truncates extremely long slugs at 80 chars before adding extension", () => {
    const longTitle = "a".repeat(200);
    const result = worklogToMarkdown(baseInput({ title: longTitle }));
    // 80 chars of "a" + ".md" = 83 chars total
    expect(result.filename.length).toBeLessThanOrEqual(83);
    expect(result.filename.endsWith(".md")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Round-trip safety
// ─────────────────────────────────────────────────────────

describe("worklogToMarkdown — round-trip", () => {
  it("produces output whose frontmatter parses back to the source values", async () => {
    const { parseFrontmatter } = await import(
      "@/lib/worklog/export/frontmatter"
    );
    const result = worklogToMarkdown(
      baseInput({ id: "wl_xyz", title: "Round Trip", versionCount: 7 }),
    );
    const parsed = parseFrontmatter(result.markdown);
    expect(parsed.frontmatter).toEqual({
      id: "wl_xyz",
      version: 7,
      exportedAt: FIXED_DATE.toISOString(),
      title: "Round Trip",
    });
  });
});
