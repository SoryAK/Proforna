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

// ─────────────────────────────────────────────────────────
// ADR-0030 Unit 10 — procedureDoc → markdown
// ─────────────────────────────────────────────────────────

describe("serializeToMarkdown — procedureDoc (ADR-0030 Unit 10)", () => {
  /**
   * Locked rules:
   *   R1. procedureTitle → `# Title` (single H1).
   *       If empty/missing, no H1 is emitted (frontmatter already carries
   *       the title).
   *   R2. procedureTools → `## Tools` heading + the tools content emitted
   *       as a regular markdown block (paragraph or list — pass-through).
   *       Skipped entirely when the tools node is missing OR has no
   *       non-whitespace text content.
   *   R3. procedureStep → `## Step N — title` (with an em dash, unicode
   *       U+2014). When the step has no title, just `## Step N`. Numbering
   *       is positional and starts at 1.
   *   R4. The body of each procedureStep is the rest of pm-to-markdown's
   *       block emitters (paragraphs, lists, headings demoted? — no, we
   *       trust paste normalization in Unit 7 to have already stripped
   *       headings; we just emit recursively).
   *   R5. droppedBlocks for procedure-only nodes is empty when the doc is
   *       valid (procedureTitle / procedureTools / procedureStep are not
   *       "dropped" — they are the new emitter targets).
   */

  // Fixture builders
  const pdoc = (...content: ProseMirrorNode[]): ProseMirrorDoc =>
    ({ type: "procedureDoc", content } as unknown as ProseMirrorDoc);

  const ptitle = (text: string): ProseMirrorNode => ({
    type: "procedureTitle",
    content: text ? [t(text)] : [],
  });

  const ptools = (...content: ProseMirrorNode[]): ProseMirrorNode => ({
    type: "procedureTools",
    content,
  });

  const pstep = (
    title: string | null,
    ...content: ProseMirrorNode[]
  ): ProseMirrorNode => ({
    type: "procedureStep",
    attrs: { title },
    content,
  });

  it("emits procedureTitle as a single H1", () => {
    const result = serializeToMarkdown(
      pdoc(ptitle("Reset workstation"), pstep(null, p(t("body")))),
    );
    expect(result.markdown).toContain("# Reset workstation");
  });

  it("skips title H1 when procedureTitle is empty", () => {
    const result = serializeToMarkdown(
      pdoc(ptitle(""), pstep(null, p(t("body")))),
    );
    // No leading "# " line should appear
    expect(result.markdown).not.toMatch(/^#\s/m);
  });

  it("emits procedureTools as `## Tools` followed by the tools body", () => {
    const result = serializeToMarkdown(
      pdoc(
        ptitle("Reset"),
        ptools(p(t("Multimeter, screwdriver"))),
        pstep(null, p(t("Step body"))),
      ),
    );
    expect(result.markdown).toContain("## Tools");
    expect(result.markdown).toContain("Multimeter, screwdriver");
    // Tools must come BEFORE the first step
    const toolsIdx = result.markdown.indexOf("## Tools");
    const stepIdx = result.markdown.indexOf("## Step");
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(stepIdx).toBeGreaterThan(toolsIdx);
  });

  it("skips procedureTools entirely when its content is empty", () => {
    const result = serializeToMarkdown(
      pdoc(
        ptitle("Reset"),
        ptools(),
        pstep(null, p(t("Step body"))),
      ),
    );
    expect(result.markdown).not.toContain("## Tools");
  });

  it("emits procedureStep without title as `## Step N`", () => {
    const result = serializeToMarkdown(
      pdoc(
        ptitle("Reset"),
        pstep(null, p(t("alpha"))),
        pstep(null, p(t("beta"))),
      ),
    );
    expect(result.markdown).toContain("## Step 1");
    expect(result.markdown).toContain("## Step 2");
    expect(result.markdown).not.toContain("## Step 1 —");
  });

  it("emits procedureStep with title as `## Step N — title` (em dash)", () => {
    const result = serializeToMarkdown(
      pdoc(
        ptitle("Reset"),
        pstep("Power down", p(t("Pull the plug"))),
        pstep("Verify", p(t("Check LED"))),
      ),
    );
    expect(result.markdown).toContain("## Step 1 \u2014 Power down");
    expect(result.markdown).toContain("## Step 2 \u2014 Verify");
  });

  it("emits step body as nested markdown blocks", () => {
    const result = serializeToMarkdown(
      pdoc(
        ptitle("Reset"),
        pstep(
          "Power down",
          p(t("Pull the plug")),
          {
            type: "bulletList",
            content: [
              { type: "listItem", content: [p(t("first"))] },
              { type: "listItem", content: [p(t("second"))] },
            ],
          },
        ),
      ),
    );
    expect(result.markdown).toContain("Pull the plug");
    expect(result.markdown).toContain("- first");
    expect(result.markdown).toContain("- second");
  });

  it("numbers steps positionally (skips empty/dropped intermediates)", () => {
    const result = serializeToMarkdown(
      pdoc(
        ptitle("Reset"),
        pstep("First", p(t("a"))),
        pstep(null, p(t("b"))),
        pstep("Third", p(t("c"))),
      ),
    );
    expect(result.markdown).toContain("## Step 1 \u2014 First");
    expect(result.markdown).toContain("## Step 2");
    expect(result.markdown).toContain("## Step 3 \u2014 Third");
  });

  it("does not list procedure-only nodes in droppedBlocks", () => {
    const result = serializeToMarkdown(
      pdoc(
        ptitle("Reset"),
        ptools(p(t("Multimeter"))),
        pstep("First", p(t("a"))),
      ),
    );
    const droppedTypes = result.droppedBlocks.map((d) => d.type);
    expect(droppedTypes).not.toContain("procedureTitle");
    expect(droppedTypes).not.toContain("procedureTools");
    expect(droppedTypes).not.toContain("procedureStep");
  });

  it("emits an empty procedureDoc as the empty string", () => {
    const result = serializeToMarkdown(pdoc());
    expect(result.markdown).toBe("");
    expect(result.droppedBlocks).toEqual([]);
  });

  it("orders title, tools, then steps deterministically", () => {
    const result = serializeToMarkdown(
      pdoc(
        ptitle("Reset"),
        ptools(p(t("Toolset"))),
        pstep("First", p(t("a"))),
        pstep("Second", p(t("b"))),
      ),
    );
    const idxTitle = result.markdown.indexOf("# Reset");
    const idxTools = result.markdown.indexOf("## Tools");
    const idxStep1 = result.markdown.indexOf("## Step 1");
    const idxStep2 = result.markdown.indexOf("## Step 2");
    expect(idxTitle).toBeGreaterThan(-1);
    expect(idxTools).toBeGreaterThan(idxTitle);
    expect(idxStep1).toBeGreaterThan(idxTools);
    expect(idxStep2).toBeGreaterThan(idxStep1);
  });

  it("escapes em dash literally in step body (not in step heading)", () => {
    // Sanity check that the heading uses U+2014 specifically and the body
    // text passes through escaping without altering em dashes.
    const result = serializeToMarkdown(
      pdoc(ptitle("X"), pstep("A — B", p(t("dash — in body")))),
    );
    expect(result.markdown).toContain("## Step 1 \u2014 A \u2014 B");
    expect(result.markdown).toContain("dash \u2014 in body");
  });
});
