/**
 * T5.1 — Unit tests for assertNoCycle and getDepth
 * Pure functions; no mocks needed.
 */

import { vi } from "vitest";
import { assertNoCycle, getDepth } from "@/lib/worklog-folders";

type FolderNode = { id: string; parentId: string | null };

// ─────────────────────────────────────────────────────────
// assertNoCycle
// ─────────────────────────────────────────────────────────

describe("assertNoCycle", () => {
  it("no cycle — root move: both folders are roots, no ancestry", () => {
    const folders: FolderNode[] = [
      { id: "a", parentId: null },
      { id: "b", parentId: null },
    ];
    // Moving "a" under "b": walking up from b leads nowhere — no throw
    expect(() => assertNoCycle("a", "b", folders)).not.toThrow();
  });

  it("no cycle — moving a leaf to a non-ancestor (sibling subtree is safe)", () => {
    // Tree: a → b → c  (c.parentId = b, b.parentId = a)
    // Moving "c" under "a" is valid — "a" is not a descendant of "c"
    const folders: FolderNode[] = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
    ];
    expect(() => assertNoCycle("c", "a", folders)).not.toThrow();
  });

  it("direct cycle: moving a folder under its own child throws", () => {
    // Tree: a → b  (b.parentId = a)
    // Moving "a" under "b": walk from b → hits a (= folderId) → cycle
    const folders: FolderNode[] = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
    ];
    expect(() => assertNoCycle("a", "b", folders)).toThrow(
      "Cannot move a folder into one of its descendants",
    );
  });

  it("indirect cycle (3 levels): moving a folder under its grandchild throws", () => {
    // Tree: a → b → c
    // Moving "a" under "c": walk from c → b → a (= folderId) → cycle
    const folders: FolderNode[] = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
    ];
    expect(() => assertNoCycle("a", "c", folders)).toThrow(
      "Cannot move a folder into one of its descendants",
    );
  });

  it("no cycle — moving to a valid non-descendant in a multi-subtree forest", () => {
    // Two independent subtrees: x-tree and y-tree
    const folders: FolderNode[] = [
      { id: "x", parentId: null },
      { id: "x1", parentId: "x" },
      { id: "y", parentId: null },
      { id: "y1", parentId: "y" },
    ];
    // "y1" is not in x's subtree — safe to move x under y1
    expect(() => assertNoCycle("x", "y1", folders)).not.toThrow();
  });

  it("pre-existing cycle guard: does not infinite-loop when data already has a cycle", () => {
    // Malformed data: a.parentId = b, b.parentId = a (a ↔ b loop)
    const folders: FolderNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
      { id: "c", parentId: null },
    ];
    // Moving "c" under "a": visited set breaks the a↔b loop after two iterations
    expect(() => assertNoCycle("c", "a", folders)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────
// getDepth
// ─────────────────────────────────────────────────────────

describe("getDepth", () => {
  it("root folder (parentId: null) → depth 0", () => {
    const folders: FolderNode[] = [{ id: "root", parentId: null }];
    expect(getDepth("root", folders)).toBe(0);
  });

  it("direct child of root → depth 1", () => {
    const folders: FolderNode[] = [
      { id: "root", parentId: null },
      { id: "child", parentId: "root" },
    ];
    expect(getDepth("child", folders)).toBe(1);
  });

  it("three levels deep → depth 2", () => {
    const folders: FolderNode[] = [
      { id: "root", parentId: null },
      { id: "mid", parentId: "root" },
      { id: "leaf", parentId: "mid" },
    ];
    expect(getDepth("leaf", folders)).toBe(2);
  });

  it("orphaned folder (parentId points to a missing id) → depth 1 (increments once then cursor becomes undefined)", () => {
    // The implementation increments depth before discovering the parent is undefined.
    // Behaviour: walks one edge up, cursor becomes undefined, loop exits → depth 1.
    const folders: FolderNode[] = [{ id: "orphan", parentId: "missing" }];
    expect(getDepth("orphan", folders)).toBe(1);
  });
});
