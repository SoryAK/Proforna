/**
 * Unit tests for proseMirrorDocToPlainText and plainTextToProseMirrorDoc.
 * Pure functions; no mocks needed.
 */

import {
  proseMirrorDocToPlainText,
  plainTextToProseMirrorDoc,
} from "@/lib/worklog/prosemirror-to-text";

// ─────────────────────────────────────────────────────────
// proseMirrorDocToPlainText — guard clauses
// ─────────────────────────────────────────────────────────

describe("proseMirrorDocToPlainText — guard clauses", () => {
  it("returns empty string for null input", () => {
    expect(proseMirrorDocToPlainText(null)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(proseMirrorDocToPlainText(undefined)).toBe("");
  });

  it("returns empty string for string input", () => {
    expect(proseMirrorDocToPlainText("string")).toBe("");
  });

  it("returns empty string for numeric input", () => {
    expect(proseMirrorDocToPlainText(42)).toBe("");
  });

  it("returns empty string for doc with empty content array", () => {
    expect(proseMirrorDocToPlainText({ type: "doc", content: [] })).toBe("");
  });

  it("returns empty string for doc missing content array", () => {
    expect(proseMirrorDocToPlainText({ type: "doc" })).toBe("");
  });
});

// ─────────────────────────────────────────────────────────
// paragraphs
// ─────────────────────────────────────────────────────────

describe("proseMirrorDocToPlainText — paragraphs", () => {
  it("projects a paragraph with a text node", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("Hello world");
  });

  it("joins multiple paragraphs with newlines", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line one" }] },
        { type: "paragraph", content: [{ type: "text", text: "Line two" }] },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("Line one\nLine two");
  });

  it("renders an empty paragraph as a blank line between non-empty blocks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("Before\n\nAfter");
  });

  it("renders hardBreak as newline inside a paragraph", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line A" },
            { type: "hardBreak" },
            { type: "text", text: "Line B" },
          ],
        },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("Line A\nLine B");
  });
});

// ─────────────────────────────────────────────────────────
// horizontalRule
// ─────────────────────────────────────────────────────────

describe("proseMirrorDocToPlainText — horizontalRule", () => {
  it("projects horizontalRule as '---'", () => {
    const doc = { type: "doc", content: [{ type: "horizontalRule" }] };
    expect(proseMirrorDocToPlainText(doc)).toBe("---");
  });
});

// ─────────────────────────────────────────────────────────
// photo
// ─────────────────────────────────────────────────────────

describe("proseMirrorDocToPlainText — photo", () => {
  it("projects photo with caption as [Photo: caption]", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "photo",
          attrs: { photoId: "p1", src: "/img.jpg", alt: "alt text", caption: "My caption" },
        },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Photo: My caption]");
  });

  it("falls back to alt when caption is absent", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "photo",
          attrs: { photoId: "p1", src: "/img.jpg", alt: "An image", caption: null },
        },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Photo: An image]");
  });

  it("falls back to generic label when both caption and alt are absent", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "photo",
          attrs: { photoId: "p1", src: "/img.jpg", alt: null, caption: null },
        },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Photo: image]");
  });
});

// ─────────────────────────────────────────────────────────
// moodBlock
// ─────────────────────────────────────────────────────────

describe("proseMirrorDocToPlainText — moodBlock", () => {
  it("projects mood good as [Mood: Good]", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "moodBlock", attrs: { value: "good" } }] }],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Mood: Good]");
  });

  it("projects mood neutral as [Mood: OK]", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "moodBlock", attrs: { value: "neutral" } }] }],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Mood: OK]");
  });

  it("projects mood tough as [Mood: Tough]", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "moodBlock", attrs: { value: "tough" } }] }],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Mood: Tough]");
  });
});

// ─────────────────────────────────────────────────────────
// canvasBlock
// ─────────────────────────────────────────────────────────

describe("proseMirrorDocToPlainText — canvasBlock", () => {
  it("renders [Canvas: title] when title is a non-empty string", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "canvasBlock", attrs: { canvasId: "abc-123", title: "My Board", snapshot: "" } },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Canvas: My Board]");
  });

  it("renders [Canvas] when title is null", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "canvasBlock", attrs: { canvasId: "abc-123", title: null, snapshot: "" } },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Canvas]");
  });

  it("renders [Canvas] when title is empty string", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "canvasBlock", attrs: { canvasId: "abc-123", title: "", snapshot: "" } },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Canvas]");
  });

  it("renders correctly among other blocks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "canvasBlock", attrs: { canvasId: "abc-123", title: "My Diagram", snapshot: "" } },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("Before\n[Canvas: My Diagram]\nAfter");
  });

  it("does not include snapshot JSON in the plain-text projection", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "canvasBlock",
          attrs: {
            canvasId: "abc-123",
            title: "Board",
            snapshot: JSON.stringify({ store: {}, schema: {} }),
          },
        },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Canvas: Board]");
  });

  it("renders correctly with a prefix (nested list context)", () => {
    // canvasBlock appearing as a top-level block gets the empty prefix
    const doc = {
      type: "doc",
      content: [
        { type: "canvasBlock", attrs: { canvasId: "abc-123", title: "Nested", snapshot: "" } },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("[Canvas: Nested]");
  });
});

// ─────────────────────────────────────────────────────────
// lists
// ─────────────────────────────────────────────────────────

describe("proseMirrorDocToPlainText — lists", () => {
  it("projects bulletList with '- ' prefix on each item", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Beta" }] }] },
          ],
        },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("- Alpha\n- Beta");
  });

  it("projects orderedList with numeric prefix", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }] },
          ],
        },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("1. First\n2. Second");
  });

  it("projects taskList with checked/unchecked prefixes", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Todo" }] }],
            },
          ],
        },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("- [x] Done\n- [ ] Todo");
  });
});

// ─────────────────────────────────────────────────────────
// attrs.plainText hint
// ─────────────────────────────────────────────────────────

describe("proseMirrorDocToPlainText — attrs.plainText hint", () => {
  it("uses attrs.plainText when provided on an unrecognised node", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "customNode", attrs: { plainText: "Custom text projection" } },
      ],
    };
    expect(proseMirrorDocToPlainText(doc)).toBe("Custom text projection");
  });
});

// ─────────────────────────────────────────────────────────
// plainTextToProseMirrorDoc
// ─────────────────────────────────────────────────────────

describe("plainTextToProseMirrorDoc", () => {
  it("returns a minimal doc for null input", () => {
    const result = plainTextToProseMirrorDoc(null);
    expect(result.type).toBe("doc");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("paragraph");
  });

  it("returns a minimal doc for empty string", () => {
    const result = plainTextToProseMirrorDoc("");
    expect(result.type).toBe("doc");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("paragraph");
  });

  it("produces a single paragraph for a single line", () => {
    const result = plainTextToProseMirrorDoc("Hello world");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("paragraph");
    expect(result.content[0].content?.[0].text).toBe("Hello world");
  });

  it("produces separate paragraphs for double-newline-separated text", () => {
    const result = plainTextToProseMirrorDoc("Paragraph one\n\nParagraph two");
    expect(result.content).toHaveLength(2);
    expect(result.content[0].content?.[0].text).toBe("Paragraph one");
    expect(result.content[1].content?.[0].text).toBe("Paragraph two");
  });

  it("inserts hardBreak nodes for single newlines within a paragraph", () => {
    const result = plainTextToProseMirrorDoc("Line A\nLine B");
    expect(result.content).toHaveLength(1);
    const para = result.content[0];
    expect(para.content).toHaveLength(3);
    expect(para.content?.[0]).toEqual({ type: "text", text: "Line A" });
    expect(para.content?.[1]).toEqual({ type: "hardBreak" });
    expect(para.content?.[2]).toEqual({ type: "text", text: "Line B" });
  });
});
