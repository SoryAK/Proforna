/**
 * RED tests for grill-me frontmatter (serialize + parse).
 *
 * Public contract:
 *   serializeFrontmatter(fm: GrillFrontmatter): string
 *     - Returns a YAML block: "---\n<keys>\n---\n\n"
 *     - Caller appends body directly afterwards.
 *
 *   parseFrontmatter(raw: string): { frontmatter, body }
 *     - frontmatter is null when missing, malformed, or missing required keys.
 *     - body is the remainder (raw markdown after the closing `---`).
 *     - Required keys: id (string), version (number).
 *     - title is optional.
 *
 * Phase 2.5 — TDD Iron Law. These tests are written BEFORE the
 * implementation exists. They MUST fail (RED) on first run.
 */

import {
  parseFrontmatter,
  serializeFrontmatter,
  type GrillFrontmatter,
} from "@/lib/worklog/export/frontmatter";

// ─────────────────────────────────────────────────────────
// serializeFrontmatter
// ─────────────────────────────────────────────────────────

describe("serializeFrontmatter", () => {
  it("emits a fenced YAML block ending with a blank line", () => {
    const fm: GrillFrontmatter = {
      id: "wl_abc123",
      version: 4,
      exportedAt: "2026-06-09T12:00:00.000Z",
    };
    const out = serializeFrontmatter(fm);
    expect(out.startsWith("---\n")).toBe(true);
    // Closing fence followed by exactly one blank line so a body can be appended
    expect(out.endsWith("---\n\n")).toBe(true);
  });

  it("includes id, version, and exportedAt keys", () => {
    const out = serializeFrontmatter({
      id: "wl_abc123",
      version: 4,
      exportedAt: "2026-06-09T12:00:00.000Z",
    });
    expect(out).toMatch(/^id: wl_abc123$/m);
    expect(out).toMatch(/^version: 4$/m);
    expect(out).toMatch(/^exportedAt: ['"]?2026-06-09T12:00:00\.000Z['"]?$/m);
  });

  it("includes title when provided", () => {
    const out = serializeFrontmatter({
      id: "wl_abc",
      version: 1,
      exportedAt: "2026-06-09T00:00:00.000Z",
      title: "My Note",
    });
    expect(out).toMatch(/^title: ['"]?My Note['"]?$/m);
  });

  it("omits title when undefined", () => {
    const out = serializeFrontmatter({
      id: "wl_abc",
      version: 1,
      exportedAt: "2026-06-09T00:00:00.000Z",
    });
    expect(out).not.toMatch(/^title:/m);
  });

  it("safely quotes titles containing colons or special characters", () => {
    const out = serializeFrontmatter({
      id: "wl_abc",
      version: 1,
      exportedAt: "2026-06-09T00:00:00.000Z",
      title: "Q3: Things I learned",
    });
    // Round-trip is the real assertion — parseFrontmatter must recover it.
    const { frontmatter } = parseFrontmatter(out + "body content");
    expect(frontmatter?.title).toBe("Q3: Things I learned");
  });
});

// ─────────────────────────────────────────────────────────
// parseFrontmatter — happy path
// ─────────────────────────────────────────────────────────

describe("parseFrontmatter — happy path", () => {
  it("returns frontmatter and body when both required keys are present", () => {
    const raw = `---\nid: wl_abc123\nversion: 4\nexportedAt: '2026-06-09T12:00:00.000Z'\n---\n\nHello body\n`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toEqual({
      id: "wl_abc123",
      version: 4,
      exportedAt: "2026-06-09T12:00:00.000Z",
    });
    expect(result.body.trim()).toBe("Hello body");
  });

  it("includes optional title when present", () => {
    const raw = `---\nid: wl_abc\nversion: 1\nexportedAt: '2026-06-09T00:00:00.000Z'\ntitle: My Note\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter?.title).toBe("My Note");
  });

  it("round-trips through serializeFrontmatter", () => {
    const fm: GrillFrontmatter = {
      id: "wl_xyz",
      version: 12,
      exportedAt: "2026-06-09T10:30:00.000Z",
      title: "Round trip",
    };
    const serialized = serializeFrontmatter(fm) + "body text";
    const parsed = parseFrontmatter(serialized);
    expect(parsed.frontmatter).toEqual(fm);
    expect(parsed.body.trim()).toBe("body text");
  });
});

// ─────────────────────────────────────────────────────────
// parseFrontmatter — failure modes (the load-bearing UX cases)
// ─────────────────────────────────────────────────────────

describe("parseFrontmatter — failure modes", () => {
  it("returns null frontmatter when no fence is present", () => {
    const raw = "Just a body. No frontmatter.";
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(raw);
  });

  it("returns null frontmatter when YAML is malformed", () => {
    // Unbalanced quotes, broken indentation
    const raw = `---\nid: "unterminated\nversion: 1\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toBeNull();
    // Body fallback: the original raw, since we couldn't parse the frontmatter
    expect(result.body).toBe(raw);
  });

  it("returns null frontmatter when id is missing", () => {
    const raw = `---\nversion: 1\nexportedAt: '2026-06-09T00:00:00.000Z'\n---\n\nbody`;
    expect(parseFrontmatter(raw).frontmatter).toBeNull();
  });

  it("returns null frontmatter when version is missing", () => {
    const raw = `---\nid: wl_abc\nexportedAt: '2026-06-09T00:00:00.000Z'\n---\n\nbody`;
    expect(parseFrontmatter(raw).frontmatter).toBeNull();
  });

  it("returns null frontmatter when version is not a number", () => {
    const raw = `---\nid: wl_abc\nversion: hello\nexportedAt: '2026-06-09T00:00:00.000Z'\n---\n\nbody`;
    expect(parseFrontmatter(raw).frontmatter).toBeNull();
  });

  it("returns null frontmatter when id is empty string", () => {
    const raw = `---\nid: ''\nversion: 1\nexportedAt: '2026-06-09T00:00:00.000Z'\n---\n\nbody`;
    expect(parseFrontmatter(raw).frontmatter).toBeNull();
  });

  it("ignores extra unknown fields silently", () => {
    const raw = `---\nid: wl_abc\nversion: 1\nexportedAt: '2026-06-09T00:00:00.000Z'\nrandom: stuff\n---\n\nbody`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toEqual({
      id: "wl_abc",
      version: 1,
      exportedAt: "2026-06-09T00:00:00.000Z",
    });
  });

  it("preserves body exactly when frontmatter is valid", () => {
    const body = "# Heading\n\nLine 1\n\nLine 2\n";
    const raw = `---\nid: wl_abc\nversion: 1\nexportedAt: '2026-06-09T00:00:00.000Z'\n---\n\n${body}`;
    const result = parseFrontmatter(raw);
    // gray-matter trims one leading newline; we want the body restored verbatim
    expect(result.body).toBe(body);
  });
});
