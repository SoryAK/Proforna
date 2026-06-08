/**
 * RED tests for importMarkdown — Sprint 1 of worklog note import.
 *
 * Public contract: (markdown: string, opts?) => ImportResult
 *   - title resolution: frontmatter.title → first H1 → opts.filename → "Untitled"
 *   - contentJson is Tiptap-shaped ProseMirror JSON (camelCase node names)
 *   - plaintext is the visible text projection (no markdown punctuation)
 *   - droppedBlocks counts unsupported constructs (raw HTML embeds, etc.)
 *
 * These tests are written BEFORE the implementation exists. They MUST fail
 * (RED) on first run. Phase 2.5 — TDD Iron Law.
 */

import { importMarkdown } from "@/lib/worklog/import/markdown-to-pm";
import type { ProseMirrorNode } from "@/lib/worklog/import/types";

// ─────────────────────────────────────────────────────────
// Title resolution
// ─────────────────────────────────────────────────────────

describe("importMarkdown — title resolution", () => {
  it("uses frontmatter title when present", () => {
    const md = `---\ntitle: My Frontmatter Title\n---\n\n# A Different H1\n`;
    expect(importMarkdown(md).title).toBe("My Frontmatter Title");
  });

  it("falls back to first H1 when no frontmatter", () => {
    const md = `# Hello World\n\nbody`;
    expect(importMarkdown(md).title).toBe("Hello World");
  });

  it("falls back to filename when no H1 and no frontmatter", () => {
    const md = `just a paragraph`;
    expect(importMarkdown(md, { filename: "my-note.md" }).title).toBe("my-note");
  });

  it("strips file extension from filename fallback", () => {
    const md = `body`;
    expect(importMarkdown(md, { filename: "ideas.markdown" }).title).toBe("ideas");
  });

  it("returns 'Untitled' when nothing else available", () => {
    expect(importMarkdown("body only").title).toBe("Untitled");
  });

  it("ignores frontmatter that is not a yaml object", () => {
    const md = `---\nnot: real: yaml: ::\n---\n\n# Real Title\n`;
    // gray-matter is permissive; if it parses garbage, we still want H1 to win
    // when frontmatter has no `title` key
    const result = importMarkdown(md);
    expect(result.title).toBe("Real Title");
  });
});

// ─────────────────────────────────────────────────────────
// Block-level node mapping
// ─────────────────────────────────────────────────────────

describe("importMarkdown — block nodes", () => {
  it("produces a Tiptap-shaped doc root", () => {
    const result = importMarkdown(`hello`);
    expect(result.contentJson.type).toBe("doc");
    expect(Array.isArray(result.contentJson.content)).toBe(true);
  });

  it("maps headings to `heading` nodes with level attr", () => {
    const result = importMarkdown(`# H1\n\n## H2\n\n### H3`);
    const headings = (result.contentJson.content ?? []).filter(
      (n) => n.type === "heading",
    );
    expect(headings.map((h) => h.attrs?.level)).toEqual([1, 2, 3]);
  });

  it("maps bullet lists to `bulletList` (camelCase, Tiptap convention)", () => {
    const result = importMarkdown(`- one\n- two`);
    const list = (result.contentJson.content ?? []).find(
      (n) => n.type === "bulletList",
    );
    expect(list).toBeDefined();
    expect(list?.content?.length).toBe(2);
    expect(list?.content?.[0].type).toBe("listItem");
  });

  it("supports nested bullet lists", () => {
    const result = importMarkdown(`- outer\n  - inner`);
    const outer = (result.contentJson.content ?? []).find(
      (n) => n.type === "bulletList",
    );
    const firstItem = outer?.content?.[0];
    // Find a bulletList inside the first list item's children
    const nested = (firstItem?.content ?? []).find(
      (n) => n.type === "bulletList",
    );
    expect(nested).toBeDefined();
  });

  it("maps ordered lists to `orderedList`", () => {
    const result = importMarkdown(`1. one\n2. two`);
    const list = (result.contentJson.content ?? []).find(
      (n) => n.type === "orderedList",
    );
    expect(list).toBeDefined();
  });

  it("maps fenced code with language to `codeBlock` with language attr", () => {
    const result = importMarkdown("```ts\nconst x = 1;\n```");
    const code = (result.contentJson.content ?? []).find(
      (n) => n.type === "codeBlock",
    );
    expect(code).toBeDefined();
    expect(code?.attrs?.language).toBe("ts");
  });

  it("maps blockquote to `blockquote`", () => {
    const result = importMarkdown(`> quoted line`);
    const quote = (result.contentJson.content ?? []).find(
      (n) => n.type === "blockquote",
    );
    expect(quote).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// Inline marks
// ─────────────────────────────────────────────────────────

describe("importMarkdown — inline marks", () => {
  function findFirstTextNode(root: ProseMirrorNode): ProseMirrorNode | null {
    if (root.type === "text") return root;
    for (const child of root.content ?? []) {
      const hit = findFirstTextNode(child);
      if (hit) return hit;
    }
    return null;
  }

  it("maps **bold** to a `bold` mark (Tiptap), not `strong` (PM default)", () => {
    const result = importMarkdown(`**hello**`);
    const text = findFirstTextNode(result.contentJson);
    expect(text?.text).toBe("hello");
    expect(text?.marks?.[0]?.type).toBe("bold");
  });

  it("maps *italic* to an `italic` mark, not `em`", () => {
    const result = importMarkdown(`*hello*`);
    const text = findFirstTextNode(result.contentJson);
    expect(text?.marks?.[0]?.type).toBe("italic");
  });

  it("maps inline `code` to a `code` mark", () => {
    const result = importMarkdown("a \`b\` c");
    // walk all paragraphs / inline children for any text node carrying the mark
    let found = false;
    function walk(n: ProseMirrorNode) {
      if (n.type === "text" && n.marks?.some((m) => m.type === "code")) {
        found = true;
      }
      n.content?.forEach(walk);
    }
    walk(result.contentJson);
    expect(found).toBe(true);
  });

  it("maps [text](url) to a `link` mark with href attr", () => {
    const result = importMarkdown(`[anchor](https://example.com/path)`);
    let link: ProseMirrorNode | null = null;
    function walk(n: ProseMirrorNode) {
      if (n.type === "text" && n.marks?.some((m) => m.type === "link")) {
        link = n;
      }
      n.content?.forEach(walk);
    }
    walk(result.contentJson);
    expect(link).not.toBeNull();
    const linkMark = (link as ProseMirrorNode | null)?.marks?.find(
      (m) => m.type === "link",
    );
    expect(linkMark?.attrs?.href).toBe("https://example.com/path");
  });
});

// ─────────────────────────────────────────────────────────
// Plaintext projection
// ─────────────────────────────────────────────────────────

describe("importMarkdown — plaintext projection", () => {
  it("strips markdown punctuation", () => {
    const result = importMarkdown(`# Heading\n\n**bold** and *italic*`);
    expect(result.plaintext).not.toMatch(/[*#]/);
    expect(result.plaintext).toContain("bold");
    expect(result.plaintext).toContain("italic");
  });

  it("joins paragraphs with newlines", () => {
    const result = importMarkdown(`first\n\nsecond`);
    expect(result.plaintext).toContain("first");
    expect(result.plaintext).toContain("second");
    expect(result.plaintext.split(/\n+/).filter(Boolean)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────
// Dropped blocks accounting
// ─────────────────────────────────────────────────────────

describe("importMarkdown — droppedBlocks", () => {
  it("returns an empty array for plain markdown", () => {
    const result = importMarkdown(`# Title\n\nbody`);
    expect(result.droppedBlocks).toEqual([]);
  });

  it("counts raw HTML embeds as dropped", () => {
    const md = `# Title\n\n<iframe src="https://x.com"></iframe>\n\nbody`;
    const result = importMarkdown(md);
    const total = result.droppedBlocks.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────

describe("importMarkdown — edge cases", () => {
  it("returns a valid empty doc for empty input", () => {
    const result = importMarkdown("");
    expect(result.contentJson.type).toBe("doc");
    expect(result.title).toBe("Untitled");
    expect(result.plaintext).toBe("");
  });

  it("does not crash on whitespace-only input", () => {
    expect(() => importMarkdown("   \n\n   ")).not.toThrow();
  });
});
