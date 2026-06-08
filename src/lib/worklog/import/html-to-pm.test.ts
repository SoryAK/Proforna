/**
 * RED tests for importHtml — Sprint 1 of worklog note import.
 *
 * Public contract: (html: string, opts?) => ImportResult
 *   - title resolution: <title> tag → first <h1> → opts.filename → "Untitled"
 *   - contentJson is Tiptap-shaped ProseMirror JSON
 *   - plaintext is visible text projection
 *   - droppedBlocks counts <script>, <style>, <meta>, comments, and any
 *     element types not supported by the worklog editor schema
 *
 * Written BEFORE the implementation exists. MUST fail on first run.
 * Phase 2.5 — TDD Iron Law.
 */

import { importHtml } from "@/lib/worklog/import/html-to-pm";
import type { ProseMirrorNode } from "@/lib/worklog/import/types";

// ─────────────────────────────────────────────────────────
// Title resolution
// ─────────────────────────────────────────────────────────

describe("importHtml — title resolution", () => {
  it("uses <title> tag when present", () => {
    const html = `<!doctype html><html><head><title>Doc Title</title></head><body><h1>Other</h1></body></html>`;
    expect(importHtml(html).title).toBe("Doc Title");
  });

  it("falls back to first <h1> when no <title>", () => {
    const html = `<body><h1>From H1</h1><p>body</p></body>`;
    expect(importHtml(html).title).toBe("From H1");
  });

  it("falls back to filename when no <title> and no <h1>", () => {
    const html = `<p>only paragraph</p>`;
    expect(importHtml(html, { filename: "apple-notes.html" }).title).toBe(
      "apple-notes",
    );
  });

  it("returns 'Untitled' when nothing else available", () => {
    expect(importHtml(`<p>x</p>`).title).toBe("Untitled");
  });

  it("ignores empty <title>", () => {
    const html = `<head><title>   </title></head><body><h1>Real</h1></body>`;
    expect(importHtml(html).title).toBe("Real");
  });
});

// ─────────────────────────────────────────────────────────
// Block-level node mapping
// ─────────────────────────────────────────────────────────

describe("importHtml — block nodes", () => {
  it("produces a Tiptap-shaped doc root", () => {
    const result = importHtml(`<p>hello</p>`);
    expect(result.contentJson.type).toBe("doc");
    expect(Array.isArray(result.contentJson.content)).toBe(true);
  });

  it("maps <h1>/<h2>/<h3> to `heading` with level attr", () => {
    const result = importHtml(`<h1>A</h1><h2>B</h2><h3>C</h3>`);
    const levels = (result.contentJson.content ?? [])
      .filter((n) => n.type === "heading")
      .map((h) => h.attrs?.level);
    expect(levels).toEqual([1, 2, 3]);
  });

  it("maps <ul><li> to `bulletList` / `listItem`", () => {
    const result = importHtml(`<ul><li>one</li><li>two</li></ul>`);
    const list = (result.contentJson.content ?? []).find(
      (n) => n.type === "bulletList",
    );
    expect(list).toBeDefined();
    expect(list?.content?.length).toBe(2);
    expect(list?.content?.[0].type).toBe("listItem");
  });

  it("supports nested bullet lists", () => {
    const html = `<ul><li>outer<ul><li>inner</li></ul></li></ul>`;
    const result = importHtml(html);
    const outer = (result.contentJson.content ?? []).find(
      (n) => n.type === "bulletList",
    );
    const firstItem = outer?.content?.[0];
    const nested = (firstItem?.content ?? []).find(
      (n) => n.type === "bulletList",
    );
    expect(nested).toBeDefined();
  });

  it("maps <ol><li> to `orderedList`", () => {
    const result = importHtml(`<ol><li>one</li></ol>`);
    const list = (result.contentJson.content ?? []).find(
      (n) => n.type === "orderedList",
    );
    expect(list).toBeDefined();
  });

  it("maps <pre><code class='language-ts'> to `codeBlock` with language attr", () => {
    const html = `<pre><code class="language-ts">const x = 1;</code></pre>`;
    const result = importHtml(html);
    const code = (result.contentJson.content ?? []).find(
      (n) => n.type === "codeBlock",
    );
    expect(code).toBeDefined();
    expect(code?.attrs?.language).toBe("ts");
  });

  it("maps <blockquote> to `blockquote`", () => {
    const result = importHtml(`<blockquote><p>q</p></blockquote>`);
    const quote = (result.contentJson.content ?? []).find(
      (n) => n.type === "blockquote",
    );
    expect(quote).toBeDefined();
  });

  it("maps <img src> to `image` node with src attr", () => {
    const result = importHtml(
      `<p><img src="https://example.com/x.png" alt="cat" /></p>`,
    );
    let img: ProseMirrorNode | null = null;
    function walk(n: ProseMirrorNode) {
      if (n.type === "image") img = n;
      n.content?.forEach(walk);
    }
    walk(result.contentJson);
    expect(img).not.toBeNull();
    expect((img as ProseMirrorNode | null)?.attrs?.src).toBe(
      "https://example.com/x.png",
    );
  });
});

// ─────────────────────────────────────────────────────────
// Inline marks
// ─────────────────────────────────────────────────────────

describe("importHtml — inline marks", () => {
  function findTextWithMark(
    root: ProseMirrorNode,
    markType: string,
  ): ProseMirrorNode | null {
    if (root.type === "text" && root.marks?.some((m) => m.type === markType)) {
      return root;
    }
    for (const child of root.content ?? []) {
      const hit = findTextWithMark(child, markType);
      if (hit) return hit;
    }
    return null;
  }

  it("maps <strong> to `bold` mark", () => {
    const result = importHtml(`<p><strong>hi</strong></p>`);
    const text = findTextWithMark(result.contentJson, "bold");
    expect(text?.text).toBe("hi");
  });

  it("maps <em> to `italic` mark", () => {
    const result = importHtml(`<p><em>hi</em></p>`);
    const text = findTextWithMark(result.contentJson, "italic");
    expect(text?.text).toBe("hi");
  });

  it("maps inline <code> to `code` mark", () => {
    const result = importHtml(`<p>a <code>b</code> c</p>`);
    const text = findTextWithMark(result.contentJson, "code");
    expect(text?.text).toBe("b");
  });

  it("maps <a href> to `link` mark with href attr", () => {
    const result = importHtml(
      `<p><a href="https://example.com/x">anchor</a></p>`,
    );
    const text = findTextWithMark(result.contentJson, "link");
    const link = text?.marks?.find((m) => m.type === "link");
    expect(link?.attrs?.href).toBe("https://example.com/x");
  });
});

// ─────────────────────────────────────────────────────────
// Dropped blocks accounting
// ─────────────────────────────────────────────────────────

describe("importHtml — droppedBlocks", () => {
  it("counts <script> as dropped", () => {
    const html = `<body><p>ok</p><script>alert(1)</script></body>`;
    const result = importHtml(html);
    const total = result.droppedBlocks.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("counts <style> as dropped", () => {
    const html = `<body><style>p{color:red}</style><p>ok</p></body>`;
    const result = importHtml(html);
    const total = result.droppedBlocks.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("does not include the script payload in plaintext", () => {
    const result = importHtml(
      `<body><p>visible</p><script>SECRET_TOKEN</script></body>`,
    );
    expect(result.plaintext).not.toContain("SECRET_TOKEN");
    expect(result.plaintext).toContain("visible");
  });

  it("returns an empty array for plain HTML", () => {
    const result = importHtml(`<body><p>hi</p></body>`);
    expect(result.droppedBlocks).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Plaintext projection
// ─────────────────────────────────────────────────────────

describe("importHtml — plaintext projection", () => {
  it("extracts visible text only", () => {
    const result = importHtml(`<h1>Heading</h1><p><strong>bold</strong> rest</p>`);
    expect(result.plaintext).toContain("Heading");
    expect(result.plaintext).toContain("bold");
    expect(result.plaintext).toContain("rest");
    expect(result.plaintext).not.toMatch(/<\/?[a-z]/i);
  });

  it("joins paragraphs with newlines", () => {
    const result = importHtml(`<p>first</p><p>second</p>`);
    expect(result.plaintext.split(/\n+/).filter(Boolean)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────

describe("importHtml — edge cases", () => {
  it("returns valid empty doc for empty input", () => {
    const result = importHtml("");
    expect(result.contentJson.type).toBe("doc");
    expect(result.title).toBe("Untitled");
    expect(result.plaintext).toBe("");
  });

  it("does not crash on body-less HTML", () => {
    expect(() => importHtml(`<!doctype html><html></html>`)).not.toThrow();
  });

  it("flattens loose text nodes into paragraphs", () => {
    // Apple Notes / Notion-export style: bare text wrapped in <div>
    const result = importHtml(`<div>loose text</div>`);
    expect(result.plaintext).toContain("loose text");
    // Either wrapped in a paragraph or flat — but never crash
    expect(result.contentJson.content?.length).toBeGreaterThan(0);
  });
});
