/**
 * RED tests for importNotion — Sprint 6B v1 (ADR-0019).
 *
 * Public contract:
 *   (input: { title: string, blocks: NotionBlock[] }, opts?) => ImportResult
 *   - title is taken straight from input.title (Notion pages always have one)
 *   - contentJson is Tiptap-shaped ProseMirror JSON (camelCase node names)
 *   - plaintext is the visible text projection (matches WorkLog.content)
 *   - droppedBlocks counts unsupported Notion block types
 *
 * Fixtures use a minimal hand-shaped subset of the Notion `BlockObjectResponse`
 * surface (the route handler narrows the SDK type to ours before calling).
 *
 * Phase 2.5 — TDD Iron Law. Written BEFORE implementation. MUST fail RED.
 */

import { describe, it, expect } from "vitest";
import { importNotion } from "@/lib/worklog/import/notion-to-pm";
import type { NotionBlock, NotionRichText } from "@/lib/worklog/import/notion-to-pm";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function rt(content: string, ann: Partial<NotionRichText["annotations"]> = {}, href: string | null = null): NotionRichText {
  return {
    type: "text",
    text: { content, link: href ? { url: href } : null },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      ...ann,
    },
    plain_text: content,
    href,
  };
}

function block<T extends NotionBlock["type"]>(
  type: T,
  body: Record<string, unknown>,
): NotionBlock {
  return {
    id: `block-${Math.random().toString(36).slice(2, 10)}`,
    type,
    has_children: false,
    [type]: body,
  } as NotionBlock;
}

// ─────────────────────────────────────────────────────────
// Title
// ─────────────────────────────────────────────────────────

describe("importNotion — title", () => {
  it("uses the page title verbatim", () => {
    const result = importNotion({ title: "My Notion Page", blocks: [] });
    expect(result.title).toBe("My Notion Page");
  });

  it("falls back to 'Untitled' for empty title", () => {
    const result = importNotion({ title: "", blocks: [] });
    expect(result.title).toBe("Untitled");
  });

  it("trims whitespace from title", () => {
    const result = importNotion({ title: "  spaced  ", blocks: [] });
    expect(result.title).toBe("spaced");
  });
});

// ─────────────────────────────────────────────────────────
// Doc shape
// ─────────────────────────────────────────────────────────

describe("importNotion — doc shape", () => {
  it("produces a Tiptap-shaped doc root", () => {
    const result = importNotion({ title: "T", blocks: [] });
    expect(result.contentJson.type).toBe("doc");
    expect(Array.isArray(result.contentJson.content)).toBe(true);
  });

  it("emits a single empty paragraph for an empty page", () => {
    const result = importNotion({ title: "T", blocks: [] });
    expect(result.contentJson.content?.length).toBe(1);
    expect(result.contentJson.content?.[0].type).toBe("paragraph");
  });
});

// ─────────────────────────────────────────────────────────
// Block-level mapping
// ─────────────────────────────────────────────────────────

describe("importNotion — paragraphs", () => {
  it("maps a paragraph block to a paragraph node", () => {
    const result = importNotion({
      title: "T",
      blocks: [block("paragraph", { rich_text: [rt("hello world")] })],
    });
    const p = result.contentJson.content?.[0];
    expect(p?.type).toBe("paragraph");
    expect(p?.content?.[0]?.text).toBe("hello world");
  });

  it("emits an empty paragraph for a paragraph with no rich_text", () => {
    const result = importNotion({
      title: "T",
      blocks: [block("paragraph", { rich_text: [] })],
    });
    const p = result.contentJson.content?.[0];
    expect(p?.type).toBe("paragraph");
    expect(p?.content ?? []).toEqual([]);
  });
});

describe("importNotion — headings", () => {
  it("maps heading_1/2/3 to heading nodes with level 1/2/3", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("heading_1", { rich_text: [rt("H1")] }),
        block("heading_2", { rich_text: [rt("H2")] }),
        block("heading_3", { rich_text: [rt("H3")] }),
      ],
    });
    const headings = (result.contentJson.content ?? []).filter((n) => n.type === "heading");
    expect(headings.map((h) => h.attrs?.level)).toEqual([1, 2, 3]);
  });
});

describe("importNotion — lists", () => {
  it("aggregates consecutive bulleted_list_item into one bulletList", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("bulleted_list_item", { rich_text: [rt("one")] }),
        block("bulleted_list_item", { rich_text: [rt("two")] }),
      ],
    });
    const lists = (result.contentJson.content ?? []).filter((n) => n.type === "bulletList");
    expect(lists.length).toBe(1);
    expect(lists[0].content?.length).toBe(2);
    expect(lists[0].content?.[0].type).toBe("listItem");
  });

  it("aggregates consecutive numbered_list_item into one orderedList", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("numbered_list_item", { rich_text: [rt("one")] }),
        block("numbered_list_item", { rich_text: [rt("two")] }),
      ],
    });
    const lists = (result.contentJson.content ?? []).filter((n) => n.type === "orderedList");
    expect(lists.length).toBe(1);
    expect(lists[0].content?.length).toBe(2);
  });

  it("breaks list runs when interrupted by a different block", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("bulleted_list_item", { rich_text: [rt("a")] }),
        block("paragraph", { rich_text: [rt("middle")] }),
        block("bulleted_list_item", { rich_text: [rt("b")] }),
      ],
    });
    const top = result.contentJson.content ?? [];
    expect(top.map((n) => n.type)).toEqual(["bulletList", "paragraph", "bulletList"]);
  });
});

describe("importNotion — to-do", () => {
  it("aggregates consecutive to_do into a taskList with checked attrs", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("to_do", { rich_text: [rt("done")], checked: true }),
        block("to_do", { rich_text: [rt("not done")], checked: false }),
      ],
    });
    const lists = (result.contentJson.content ?? []).filter((n) => n.type === "taskList");
    expect(lists.length).toBe(1);
    const items = lists[0].content ?? [];
    expect(items.length).toBe(2);
    expect(items[0].type).toBe("taskItem");
    expect(items[0].attrs?.checked).toBe(true);
    expect(items[1].attrs?.checked).toBe(false);
  });
});

describe("importNotion — code", () => {
  it("maps code block to codeBlock with language attr", () => {
    const result = importNotion({
      title: "T",
      blocks: [block("code", { rich_text: [rt("const x = 1;")], language: "typescript" })],
    });
    const code = (result.contentJson.content ?? []).find((n) => n.type === "codeBlock");
    expect(code).toBeDefined();
    expect(code?.attrs?.language).toBe("typescript");
    expect(code?.content?.[0]?.text).toBe("const x = 1;");
  });

  it("normalizes 'plain text' language to null", () => {
    const result = importNotion({
      title: "T",
      blocks: [block("code", { rich_text: [rt("nope")], language: "plain text" })],
    });
    const code = (result.contentJson.content ?? []).find((n) => n.type === "codeBlock");
    expect(code?.attrs?.language).toBeNull();
  });
});

describe("importNotion — quote and callout", () => {
  it("maps quote to blockquote", () => {
    const result = importNotion({
      title: "T",
      blocks: [block("quote", { rich_text: [rt("quoted")] })],
    });
    const q = (result.contentJson.content ?? []).find((n) => n.type === "blockquote");
    expect(q).toBeDefined();
    // blockquote wraps a paragraph
    expect(q?.content?.[0]?.type).toBe("paragraph");
    expect(q?.content?.[0]?.content?.[0]?.text).toBe("quoted");
  });

  it("maps callout to blockquote with emoji prefix preserved", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("callout", {
          rich_text: [rt("important note")],
          icon: { type: "emoji", emoji: "💡" },
        }),
      ],
    });
    const q = (result.contentJson.content ?? []).find((n) => n.type === "blockquote");
    expect(q).toBeDefined();
    const inlines = q?.content?.[0]?.content ?? [];
    const text = inlines.map((c) => c.text ?? "").join("");
    expect(text.startsWith("💡")).toBe(true);
    expect(text).toContain("important note");
  });
});

describe("importNotion — divider", () => {
  it("maps divider to horizontalRule", () => {
    const result = importNotion({
      title: "T",
      blocks: [block("divider", {})],
    });
    expect((result.contentJson.content ?? []).some((n) => n.type === "horizontalRule")).toBe(true);
  });
});

describe("importNotion — toggle", () => {
  it("renders a toggle as a heading-3 plus an indented paragraph fallback", () => {
    const result = importNotion({
      title: "T",
      blocks: [block("toggle", { rich_text: [rt("Toggle title")] })],
    });
    const top = result.contentJson.content ?? [];
    // Fallback: emit a paragraph carrying the toggle title text. v1 is lossy
    // (no children expanded inline because a separate API call would be needed).
    expect(top.length).toBeGreaterThan(0);
    const para = top.find((n) => n.type === "paragraph");
    expect(para).toBeDefined();
    const text = para?.content?.map((c) => c.text ?? "").join("") ?? "";
    expect(text).toContain("Toggle title");
  });
});

describe("importNotion — unsupported blocks", () => {
  it("counts image as a dropped block and emits a placeholder paragraph", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("image", {
          type: "external",
          external: { url: "https://example.com/x.png" },
          caption: [],
        }),
      ],
    });
    const dropped = result.droppedBlocks.find((d) => d.type === "notion:image");
    expect(dropped?.count).toBe(1);
    const placeholder = (result.contentJson.content ?? []).find(
      (n) =>
        n.type === "paragraph" &&
        (n.content ?? []).some((c) => (c.text ?? "").includes("[unsupported")),
    );
    expect(placeholder).toBeDefined();
  });

  it("counts each unsupported type independently", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("image", { type: "external", external: { url: "" }, caption: [] }),
        block("embed", { url: "", caption: [] }),
        block("video", { type: "external", external: { url: "" }, caption: [] }),
        block("table", { table_width: 2, has_column_header: false, has_row_header: false }),
      ],
    });
    const types = result.droppedBlocks.map((d) => d.type).sort();
    expect(types).toEqual(
      ["notion:embed", "notion:image", "notion:table", "notion:video"].sort(),
    );
    for (const d of result.droppedBlocks) expect(d.count).toBe(1);
  });

  it("aggregates duplicate dropped types", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("image", { type: "external", external: { url: "" }, caption: [] }),
        block("image", { type: "external", external: { url: "" }, caption: [] }),
        block("image", { type: "external", external: { url: "" }, caption: [] }),
      ],
    });
    const dropped = result.droppedBlocks.find((d) => d.type === "notion:image");
    expect(dropped?.count).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────
// Inline marks
// ─────────────────────────────────────────────────────────

describe("importNotion — inline marks", () => {
  it("applies bold mark", () => {
    const result = importNotion({
      title: "T",
      blocks: [block("paragraph", { rich_text: [rt("strong", { bold: true })] })],
    });
    const t = result.contentJson.content?.[0]?.content?.[0];
    expect(t?.marks?.some((m) => m.type === "bold")).toBe(true);
  });

  it("applies italic, strikethrough, underline, code marks", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("paragraph", {
          rich_text: [
            rt("i", { italic: true }),
            rt("s", { strikethrough: true }),
            rt("u", { underline: true }),
            rt("c", { code: true }),
          ],
        }),
      ],
    });
    const inlines = result.contentJson.content?.[0]?.content ?? [];
    const markTypes = inlines.map((n) => n.marks?.[0]?.type);
    expect(markTypes).toEqual(["italic", "strike", "underline", "code"]);
  });

  it("applies link mark when href is present", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("paragraph", {
          rich_text: [rt("click me", {}, "https://example.com")],
        }),
      ],
    });
    const t = result.contentJson.content?.[0]?.content?.[0];
    const link = t?.marks?.find((m) => m.type === "link");
    expect(link).toBeDefined();
    expect(link?.attrs?.href).toBe("https://example.com");
  });
});

// ─────────────────────────────────────────────────────────
// Plaintext projection + integration
// ─────────────────────────────────────────────────────────

describe("importNotion — plaintext projection", () => {
  it("joins block-level text with newlines, no markdown punctuation", () => {
    const result = importNotion({
      title: "T",
      blocks: [
        block("heading_1", { rich_text: [rt("Title")] }),
        block("paragraph", { rich_text: [rt("hello world")] }),
        block("bulleted_list_item", { rich_text: [rt("a")] }),
        block("bulleted_list_item", { rich_text: [rt("b")] }),
      ],
    });
    expect(result.plaintext).toContain("Title");
    expect(result.plaintext).toContain("hello world");
    expect(result.plaintext).toContain("a");
    expect(result.plaintext).toContain("b");
    // No markdown punctuation
    expect(result.plaintext).not.toMatch(/^#/m);
    expect(result.plaintext).not.toMatch(/^- /m);
  });
});
