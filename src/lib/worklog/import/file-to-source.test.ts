/**
 * Tests for fileToSource — pure helper that turns a browser File into the
 * payload shape /api/work-logs/import expects.
 *
 * Discrimination strategy (extension first, MIME as tiebreaker):
 *   - .md, .markdown  → sourceType: "markdown"
 *   - .html, .htm     → sourceType: "html"
 *   - else, falls back to MIME type ("text/markdown" / "text/html")
 *   - everything else → null sourceType (caller surfaces "unsupported")
 *
 * The helper does NOT enforce a size cap — the server is authoritative on
 * that (413). Client-side we just warn the user; never silently drop.
 */

import { fileToSource } from "@/lib/worklog/import/file-to-source";

// Vitest's jsdom-less node env doesn't ship a File polyfill that supports
// .text(); we shim the minimal surface used by the helper.
function makeFile(
  name: string,
  contents: string,
  type = "",
): File {
  const file = new File([contents], name, { type });
  // Some Node versions lack File.prototype.text(); patch defensively.
  if (typeof file.text !== "function") {
    Object.defineProperty(file, "text", {
      value: async () => contents,
    });
  }
  return file;
}

describe("fileToSource — file extension discrimination", () => {
  it("maps .md to markdown sourceType", async () => {
    const f = makeFile("note.md", "# hi");
    const r = await fileToSource(f);
    expect(r.sourceType).toBe("markdown");
    expect(r.source).toBe("# hi");
    expect(r.sourceFilename).toBe("note.md");
  });

  it("maps .markdown to markdown sourceType", async () => {
    const f = makeFile("note.markdown", "# hi");
    const r = await fileToSource(f);
    expect(r.sourceType).toBe("markdown");
  });

  it("maps .html to html sourceType", async () => {
    const f = makeFile("note.html", "<h1>hi</h1>");
    const r = await fileToSource(f);
    expect(r.sourceType).toBe("html");
    expect(r.source).toBe("<h1>hi</h1>");
  });

  it("maps .htm to html sourceType", async () => {
    const f = makeFile("note.htm", "<h1>hi</h1>");
    const r = await fileToSource(f);
    expect(r.sourceType).toBe("html");
  });

  it("is case-insensitive on the extension", async () => {
    const f = makeFile("NOTE.MD", "# hi");
    const r = await fileToSource(f);
    expect(r.sourceType).toBe("markdown");
  });

  it("preserves the original filename casing in sourceFilename", async () => {
    const f = makeFile("NOTE.MD", "# hi");
    const r = await fileToSource(f);
    expect(r.sourceFilename).toBe("NOTE.MD");
  });
});

describe("fileToSource — MIME fallback for extension-less files", () => {
  it("uses text/markdown MIME when extension is missing", async () => {
    const f = makeFile("note", "# hi", "text/markdown");
    const r = await fileToSource(f);
    expect(r.sourceType).toBe("markdown");
  });

  it("uses text/html MIME when extension is missing", async () => {
    const f = makeFile("note", "<h1>hi</h1>", "text/html");
    const r = await fileToSource(f);
    expect(r.sourceType).toBe("html");
  });

  it("prefers extension over MIME when both disagree", async () => {
    // .md extension + text/html MIME: extension wins (filename was intentional).
    const f = makeFile("note.md", "<h1>hi</h1>", "text/html");
    const r = await fileToSource(f);
    expect(r.sourceType).toBe("markdown");
  });
});

describe("fileToSource — unsupported types", () => {
  it("returns sourceType: null for unsupported extensions", async () => {
    const f = makeFile("note.pdf", "binary-ish");
    const r = await fileToSource(f);
    expect(r.sourceType).toBeNull();
  });

  it("returns sourceType: null for extension-less files with unknown MIME", async () => {
    const f = makeFile("note", "stuff", "application/octet-stream");
    const r = await fileToSource(f);
    expect(r.sourceType).toBeNull();
  });

  it("returns sourceType: null for extension-less files with no MIME", async () => {
    const f = makeFile("note", "stuff");
    const r = await fileToSource(f);
    expect(r.sourceType).toBeNull();
  });

  it("still includes filename + source contents for unsupported files (caller decides)", async () => {
    const f = makeFile("note.pdf", "stuff");
    const r = await fileToSource(f);
    expect(r.sourceFilename).toBe("note.pdf");
    expect(r.source).toBe("stuff");
  });
});

describe("fileToSource — content reading", () => {
  it("reads file contents via File.text()", async () => {
    const f = makeFile("a.md", "line one\nline two\n");
    const r = await fileToSource(f);
    expect(r.source).toBe("line one\nline two\n");
  });

  it("handles empty files", async () => {
    const f = makeFile("a.md", "");
    const r = await fileToSource(f);
    expect(r.source).toBe("");
    // Empty file is still markdown-typed — server's 400-on-empty validation kicks in.
    expect(r.sourceType).toBe("markdown");
  });

  it("handles unicode contents without corruption", async () => {
    const text = "# Café ☕ 日本語";
    const f = makeFile("a.md", text);
    const r = await fileToSource(f);
    expect(r.source).toBe(text);
  });
});
