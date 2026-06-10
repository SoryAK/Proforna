/**
 * RED tests for serializeToMarkdown — Phase 1.2 of the grill-me sprint.
 *
 * Public contract:
 *   serializeToMarkdown(doc, opts?) => { markdown, droppedBlocks }
 *
 * Walks Tiptap-shaped ProseMirror JSON (camelCase node names) and emits
 * markdown that can be re-imported via importMarkdown() without losing
 * structural fidelity for the supported subset. Lossy nodes (canvasBlock,
 * shift/mood/photo metadata) are documented in droppedBlocks.
 *
 * Phase 2.5 — TDD Iron Law. These tests are written BEFORE the
 * implementation exists. They MUST fail (RED) on first run.
 */

import { serializeToMarkdown } from "@/lib/worklog/export/pm-to-markdown";
import type { ProseMirrorDoc, ProseMirrorNode } from "@/lib/worklog/import/types";

// Tiny helpers to keep test fixtures readable.
const doc = (...content: ProseMirrorNode[]): ProseMirrorDoc => ({
  type: "doc",
  content,
});
const p = (...content: ProseMirrorNode[]): ProseMirrorNode => ({
  type: "paragraph",
  content,
});
const t = (text: string, marks?: ProseMirrorNode["marks"]): ProseMirrorNode => ({
  type: "text",
  text,
  ...(marks ? { marks } : {}),
});

// ─────────────────────────────────────────────────────────
// Block-level basics
// ─────────────────────────────────────────────────────────

describe("serializeToMarkdown — block nodes", () => {
  it("returns empty string for an empty doc", () => {
    const result = serializeToMarkdown(doc());
    expect(result.markdown).toBe("");
    expect(result.droppedBlocks).toEqual([]);
  });

  it("emits a single paragraph as plain text", () => {
    const result = serializeToMarkdown(doc(p(t("Hello world"))));
    expect(result.markdown.trim()).toBe("Hello world");
  });

  it("separates paragraphs with a blank line", () => {
    const result = serializeToMarkdown(
      doc(p(t("First")), p(t("Second"))),
    );
    expect(result.markdown).toBe("First\n\nSecond\n");
  });

  it("emits headings with the right hash count", () => {
    const result = serializeToMarkdown(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [t("H1")] },
        { type: "heading", attrs: { level: 2 }, content: [t("H2")] },
        { type: "heading", attrs: { level: 3 }, content: [t("H3")] },
      ),
    );
    expect(result.markdown).toContain("# H1");
    expect(result.markdown).toContain("## H2");
    expect(result.markdown).toContain("### H3");
  });

  it("emits a blockquote with > prefix", () => {
    const result = serializeToMarkdown(
      doc({ type: "blockquote", content: [p(t("quoted"))] }),
    );
    expect(result.markdown.trim()).toBe("> quoted");
  });

  it("emits a code block with fences", () => {
    const result = serializeToMarkdown(
      doc({
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [t("const x = 1;")],
      }),
    );
    expect(result.markdown).toContain("```ts");
    expect(result.markdown).toContain("const x = 1;");
    expect(result.markdown).toContain("```");
  });

  it("emits a code block without language as bare fences", () => {
    const result = serializeToMarkdown(
      doc({ type: "codeBlock", content: [t("plain")] }),
    );
    expect(result.markdown).toMatch(/^```\nplain\n```/m);
  });

  it("emits a hardBreak as two trailing spaces + newline", () => {
    const result = serializeToMarkdown(
      doc(p(t("line1"), { type: "hardBreak" }, t("line2"))),
    );
    // CommonMark hard break: two spaces + newline within the same paragraph
    expect(result.markdown).toMatch(/line1 {2}\nline2/);
  });
});

// ─────────────────────────────────────────────────────────
// Lists
// ─────────────────────────────────────────────────────────

describe("serializeToMarkdown — lists", () => {
  it("emits a bullet list with - prefix", () => {
    const result = serializeToMarkdown(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(t("one"))] },
          { type: "listItem", content: [p(t("two"))] },
        ],
      }),
    );
    expect(result.markdown).toContain("- one");
    expect(result.markdown).toContain("- two");
  });

  it("emits an ordered list with 1. 2. prefixes", () => {
    const result = serializeToMarkdown(
      doc({
        type: "orderedList",
        content: [
          { type: "listItem", content: [p(t("one"))] },
          { type: "listItem", content: [p(t("two"))] },
        ],
      }),
    );
    expect(result.markdown).toMatch(/1\. one/);
    expect(result.markdown).toMatch(/2\. two/);
  });

  it("emits a task list as GFM checkboxes", () => {
    const result = serializeToMarkdown(
      doc({
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [p(t("todo item"))],
          },
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [p(t("done item"))],
          },
        ],
      }),
    );
    expect(result.markdown).toContain("- [ ] todo item");
    expect(result.markdown).toContain("- [x] done item");
  });
});

// ─────────────────────────────────────────────────────────
// Inline marks
// ─────────────────────────────────────────────────────────

describe("serializeToMarkdown — inline marks", () => {
  it("emits bold as **text**", () => {
    const result = serializeToMarkdown(
      doc(p(t("bold", [{ type: "bold" }]))),
    );
    expect(result.markdown.trim()).toBe("**bold**");
  });

  it("emits italic as *text*", () => {
    const result = serializeToMarkdown(
      doc(p(t("italic", [{ type: "italic" }]))),
    );
    expect(result.markdown.trim()).toBe("*italic*");
  });

  it("emits inline code as `text`", () => {
    const result = serializeToMarkdown(
      doc(p(t("inline", [{ type: "code" }]))),
    );
    expect(result.markdown.trim()).toBe("`inline`");
  });

  it("emits strike as ~~text~~", () => {
    const result = serializeToMarkdown(
      doc(p(t("gone", [{ type: "strike" }]))),
    );
    expect(result.markdown.trim()).toBe("~~gone~~");
  });

  it("emits links as [label](href)", () => {
    const result = serializeToMarkdown(
      doc(
        p(t("click", [{ type: "link", attrs: { href: "https://example.com" } }])),
      ),
    );
    expect(result.markdown.trim()).toBe("[click](https://example.com)");
  });

  it("composes bold + italic on the same range", () => {
    const result = serializeToMarkdown(
      doc(
        p(t("both", [{ type: "bold" }, { type: "italic" }])),
      ),
    );
    // Order can be either ***x*** or **_x_** — accept either CommonMark form
    expect(result.markdown.trim()).toMatch(/^(\*\*\*both\*\*\*|\*\*_both_\*\*|_\*\*both\*\*_)$/);
  });
});

// ─────────────────────────────────────────────────────────
// Custom Tiptap nodes (Resumsify-specific)
// ─────────────────────────────────────────────────────────

describe("serializeToMarkdown — custom inline atoms", () => {
  it("emits a tag as #label inline", () => {
    const result = serializeToMarkdown(
      doc(p(t("Wrote about "), { type: "tag", attrs: { label: "react" } })),
    );
    expect(result.markdown.trim()).toBe("Wrote about #react");
  });

  it("emits a mention with the asset prefix as @a:<id>", () => {
    const result = serializeToMarkdown(
      doc(
        p(
          t("See "),
          {
            type: "mention",
            attrs: { entityType: "asset", entityId: "ast_123", label: "My Asset" },
          },
        ),
      ),
    );
    expect(result.markdown.trim()).toBe("See @a:ast_123");
  });

  it("uses correct prefix for each entityType", () => {
    const cases = [
      { entityType: "asset", expected: "a" },
      { entityType: "skill", expected: "s" },
      { entityType: "company", expected: "c" },
      { entityType: "contact", expected: "p" },
      { entityType: "worklog", expected: "n" },
    ];
    for (const { entityType, expected } of cases) {
      const result = serializeToMarkdown(
        doc(
          p({
            type: "mention",
            attrs: { entityType, entityId: "abc" },
          }),
        ),
      );
      expect(result.markdown.trim()).toBe(`@${expected}:abc`);
    }
  });

  it("emits a shiftBlock as [Shift: label window]", () => {
    const result = serializeToMarkdown(
      doc(
        p({
          type: "shiftBlock",
          attrs: {
            shiftId: "s1",
            label: "Morning",
            startMinute: 540,
            endMinute: 720,
          },
        }),
      ),
    );
    expect(result.markdown.trim()).toMatch(/^\[Shift: Morning .+\]$/);
  });

  it("emits a moodBlock as [Mood: value]", () => {
    const result = serializeToMarkdown(
      doc(p({ type: "moodBlock", attrs: { value: "good" } })),
    );
    expect(result.markdown.trim()).toBe("[Mood: good]");
  });
});

// ─────────────────────────────────────────────────────────
// Block atoms — photo + canvas
// ─────────────────────────────────────────────────────────

describe("serializeToMarkdown — block atoms", () => {
  it("emits a photo as a markdown image with alt + src", () => {
    const result = serializeToMarkdown(
      doc({
        type: "photo",
        attrs: {
          photoId: "ph_1",
          src: "/uploads/abc.jpg",
          alt: "A puppy",
          caption: null,
        },
      }),
    );
    expect(result.markdown.trim()).toBe("![A puppy](/uploads/abc.jpg)");
  });

  it("emits a photo with caption as image followed by figcaption blockquote", () => {
    const result = serializeToMarkdown(
      doc({
        type: "photo",
        attrs: {
          photoId: "ph_1",
          src: "/uploads/abc.jpg",
          alt: "A puppy",
          caption: "My dog Rex",
        },
      }),
    );
    expect(result.markdown).toContain("![A puppy](/uploads/abc.jpg)");
    expect(result.markdown).toContain("> My dog Rex");
  });

  it("uses empty alt when photo.alt is null", () => {
    const result = serializeToMarkdown(
      doc({
        type: "photo",
        attrs: { photoId: "p", src: "/uploads/x.jpg", alt: null, caption: null },
      }),
    );
    expect(result.markdown).toContain("![](/uploads/x.jpg)");
  });

  it("drops canvasBlock and reports it in droppedBlocks", () => {
    const result = serializeToMarkdown(
      doc(
        p(t("before")),
        {
          type: "canvasBlock",
          attrs: { canvasId: "cv_1", snapshot: "<svg/>", title: "My Canvas" },
        },
        p(t("after")),
      ),
    );
    expect(result.droppedBlocks).toEqual([
      { type: "canvasBlock", count: 1 },
    ]);
    // Body still emits surrounding paragraphs
    expect(result.markdown).toContain("before");
    expect(result.markdown).toContain("after");
    // Placeholder makes the omission visible to the user/AI
    expect(result.markdown).toMatch(/\[Canvas:.*not exported\]/);
  });
});

// ─────────────────────────────────────────────────────────
// Round-trip with importMarkdown (the load-bearing assertion)
// ─────────────────────────────────────────────────────────

describe("serializeToMarkdown — round-trip", () => {
  it("text-only doc round-trips through importMarkdown", async () => {
    const { importMarkdown } = await import("@/lib/worklog/import/markdown-to-pm");
    const original = doc(
      { type: "heading", attrs: { level: 1 }, content: [t("Title")] },
      p(t("Paragraph one with "), t("bold", [{ type: "bold" }]), t(".")),
      p(t("Paragraph two.")),
    );
    const { markdown } = serializeToMarkdown(original);
    const reimported = importMarkdown(markdown);
    // Plaintext must be preserved exactly across the round trip
    const expectedText = "Title\nParagraph one with bold.\nParagraph two.";
    expect(reimported.plaintext).toBe(expectedText);
  });
});
