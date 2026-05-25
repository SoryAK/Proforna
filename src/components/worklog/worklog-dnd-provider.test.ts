/**
 * T5.5 — DragOverlay ghost-resolution unit tests
 *
 * Covers the three pure helpers exported from the DnD layer:
 *   parseType    (5 cases)
 *   stripPrefix  (5 cases)
 *   resolveGhosts (7 cases)
 *
 * Total: 17 tests — node environment, no React/DOM needed.
 */
import { vi } from "vitest";
import { parseType, stripPrefix } from "@/components/worklog/hooks/use-worklog-dnd";
import { resolveGhosts } from "@/components/worklog/worklog-dnd-provider";

// ─────────────────────────────────────────────────────────────────────────────
// parseType
// ─────────────────────────────────────────────────────────────────────────────

describe("parseType", () => {
  it("returns 'note' for note: prefix", () => {
    expect(parseType("note:abc")).toBe("note");
  });

  it("returns 'folder' for folder: prefix", () => {
    expect(parseType("folder:xyz")).toBe("folder");
  });

  it("returns null for zone: prefix", () => {
    expect(parseType("zone:unfiled")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseType("")).toBeNull();
  });

  it("returns null for unknown prefix", () => {
    expect(parseType("some-random-id")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stripPrefix
// ─────────────────────────────────────────────────────────────────────────────

describe("stripPrefix", () => {
  it("strips note: prefix", () => {
    expect(stripPrefix("note:abc123")).toBe("abc123");
  });

  it("strips folder: prefix", () => {
    expect(stripPrefix("folder:f1")).toBe("f1");
  });

  it("strips zone: prefix", () => {
    expect(stripPrefix("zone:unfiled")).toBe("unfiled");
  });

  it("returns input unchanged when no known prefix matches", () => {
    expect(stripPrefix("bare-id")).toBe("bare-id");
  });

  it("returns empty string when id is prefix-only (note: with no payload)", () => {
    expect(stripPrefix("note:")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveGhosts
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveGhosts", () => {
  const logs = [
    { id: "n1", title: "Daily standup" },
    { id: "n2", title: null },
  ];
  const folders = [
    { id: "f1", name: "Work" },
    { id: "f2", name: "Personal" },
  ];

  it("resolves noteGhost and nulls folderGhost for note type", () => {
    const { noteGhost, folderGhost } = resolveGhosts("note:n1", "note", logs, folders);
    expect(noteGhost?.title).toBe("Daily standup");
    expect(folderGhost).toBeNull();
  });

  it("resolves folderGhost and nulls noteGhost for folder type", () => {
    const { noteGhost, folderGhost } = resolveGhosts("folder:f2", "folder", logs, folders);
    expect(folderGhost?.name).toBe("Personal");
    expect(noteGhost).toBeNull();
  });

  it("returns non-null noteGhost even when note title is null", () => {
    const { noteGhost } = resolveGhosts("note:n2", "note", logs, folders);
    expect(noteGhost).not.toBeNull();
    expect(noteGhost?.title).toBeNull();
  });

  it("returns both null when activeId and activeType are null", () => {
    const { noteGhost, folderGhost } = resolveGhosts(null, null, logs, folders);
    expect(noteGhost).toBeNull();
    expect(folderGhost).toBeNull();
  });

  it("returns null noteGhost when note id is not found in logs", () => {
    const { noteGhost } = resolveGhosts("note:MISSING", "note", logs, folders);
    expect(noteGhost).toBeNull();
  });

  it("returns both null on type mismatch (folder id with note activeType)", () => {
    // rawId resolves to "f1", but activeType="note" so logs.find(l.id==="f1") → null
    const { noteGhost, folderGhost } = resolveGhosts("folder:f1", "note", logs, folders);
    expect(noteGhost).toBeNull();
    expect(folderGhost).toBeNull();
  });

  it("returns both null for zone: prefixed id with null activeType", () => {
    // rawId = "unfiled" (zone: stripped), but activeType=null so both guards fail
    const { noteGhost, folderGhost } = resolveGhosts("zone:unfiled", null, logs, folders);
    expect(noteGhost).toBeNull();
    expect(folderGhost).toBeNull();
  });
});
