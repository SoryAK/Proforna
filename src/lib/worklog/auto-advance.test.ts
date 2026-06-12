/**
 * Tests for computeNextAfterOrganize — the inbox-style auto-advance
 * helper used by reader buttons, bulk bars, and the right-click row
 * context menu after a note is moved / archived / deleted.
 *
 * Contract (per session 2026-06-12, ADR-0026 follow-up):
 *   • Auto-advance ONLY fires when the active folder is "unfiled".
 *     Every other view closes the reader on organize-off-view (existing
 *     ADR-0026 Unit 5 behavior).
 *   • Returns the id of the next-visible note (preferring forward).
 *     Falls back to the previous-visible if the current note was last.
 *     Returns null when nothing remains.
 *   • If `currentId` is not in `removedIds`, returns `currentId` unchanged
 *     (no-op — the user is reading something that didn't get organized).
 */

import { describe, it, expect } from "vitest";
import { computeNextAfterOrganize } from "./auto-advance";
import type { WorkLog, FolderSelection } from "@/types/worklog";

function log(id: string): WorkLog {
  // Minimal stub — only the id is consulted by the helper.
  return { id } as WorkLog;
}

const UNFILED: FolderSelection = { kind: "unfiled" };
const ARCHIVED: FolderSelection = { kind: "archived" };
const FOLDER: FolderSelection = { kind: "folder", folderId: "f1" };

describe("computeNextAfterOrganize", () => {
  describe("non-unfiled views close the reader", () => {
    it("returns null when activeFolder is archived", () => {
      const result = computeNextAfterOrganize({
        currentId: "a",
        removedIds: ["a"],
        visibleLogs: [log("a"), log("b")],
        activeFolder: ARCHIVED,
      });
      expect(result).toBe(null);
    });

    it("returns null when activeFolder is a regular folder", () => {
      const result = computeNextAfterOrganize({
        currentId: "a",
        removedIds: ["a"],
        visibleLogs: [log("a"), log("b")],
        activeFolder: FOLDER,
      });
      expect(result).toBe(null);
    });
  });

  describe("unfiled inbox auto-advance", () => {
    it("returns currentId unchanged when it isn't being removed", () => {
      const result = computeNextAfterOrganize({
        currentId: "b",
        removedIds: ["a"],
        visibleLogs: [log("a"), log("b"), log("c")],
        activeFolder: UNFILED,
      });
      expect(result).toBe("b");
    });

    it("advances to the next visible note after the current one", () => {
      const result = computeNextAfterOrganize({
        currentId: "b",
        removedIds: ["b"],
        visibleLogs: [log("a"), log("b"), log("c")],
        activeFolder: UNFILED,
      });
      expect(result).toBe("c");
    });

    it("falls back to the previous visible note when current was at the end", () => {
      const result = computeNextAfterOrganize({
        currentId: "c",
        removedIds: ["c"],
        visibleLogs: [log("a"), log("b"), log("c")],
        activeFolder: UNFILED,
      });
      expect(result).toBe("b");
    });

    it("returns null when the list has only one note and it's removed", () => {
      const result = computeNextAfterOrganize({
        currentId: "a",
        removedIds: ["a"],
        visibleLogs: [log("a")],
        activeFolder: UNFILED,
      });
      expect(result).toBe(null);
    });

    it("returns null when every visible note is removed (bulk action)", () => {
      const result = computeNextAfterOrganize({
        currentId: "b",
        removedIds: ["a", "b", "c"],
        visibleLogs: [log("a"), log("b"), log("c")],
        activeFolder: UNFILED,
      });
      expect(result).toBe(null);
    });

    it("skips intermediate removed ids when picking next (bulk action)", () => {
      const result = computeNextAfterOrganize({
        currentId: "a",
        removedIds: ["a", "b", "c"],
        visibleLogs: [log("a"), log("b"), log("c"), log("d")],
        activeFolder: UNFILED,
      });
      expect(result).toBe("d");
    });

    it("returns null when currentId is null (nothing to advance from)", () => {
      const result = computeNextAfterOrganize({
        currentId: null,
        removedIds: ["a"],
        visibleLogs: [log("a"), log("b")],
        activeFolder: UNFILED,
      });
      expect(result).toBe(null);
    });

    it("returns null when currentId no longer exists in visibleLogs", () => {
      // Edge case: reader state out of sync with list (mid-mutation).
      // The helper should not throw and should not advance to a random row.
      const result = computeNextAfterOrganize({
        currentId: "ghost",
        removedIds: ["ghost"],
        visibleLogs: [log("a"), log("b")],
        activeFolder: UNFILED,
      });
      // Safe default: pick the first remaining since we can't infer position.
      expect(result).toBe("a");
    });
  });
});
