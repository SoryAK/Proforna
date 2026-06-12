/**
 * computeNextAfterOrganize — inbox-style auto-advance for the Unfiled
 * processing loop.
 *
 * After a note is moved / archived / deleted from the Unfiled bucket
 * the reader should jump to the next visible note so the user can
 * drain the inbox without ever touching the list. In any other bucket
 * the reader closes (returns null) to preserve the ADR-0026 Unit 5
 * "drop-the-reader-when-it-leaves-view" contract.
 *
 * Pure function — no React, no side effects. Tested in auto-advance.test.ts.
 */

import type { WorkLog, FolderSelection } from "@/types/worklog";

export interface ComputeNextAfterOrganizeInput {
  currentId: string | null;
  removedIds: string[];
  visibleLogs: WorkLog[];
  activeFolder: FolderSelection;
}

export function computeNextAfterOrganize(input: ComputeNextAfterOrganizeInput): string | null {
  const { currentId, removedIds, visibleLogs, activeFolder } = input;

  // Auto-advance is an inbox semantic — only fires in Unfiled.
  if (activeFolder.kind !== "unfiled") return null;
  if (!currentId) return null;

  const removed = new Set(removedIds);

  // Current note untouched — nothing to advance, keep reader as-is.
  if (!removed.has(currentId)) return currentId;

  // Find current's slot in the visible ordering. If it's gone (e.g. the
  // list refreshed mid-mutation), fall back to the first surviving row.
  const idx = visibleLogs.findIndex((l) => l.id === currentId);
  if (idx < 0) {
    const survivor = visibleLogs.find((l) => !removed.has(l.id));
    return survivor?.id ?? null;
  }

  // Prefer the next surviving row (forward advance).
  for (let i = idx + 1; i < visibleLogs.length; i++) {
    if (!removed.has(visibleLogs[i].id)) return visibleLogs[i].id;
  }
  // Fall back to the previous surviving row (we were at the tail).
  for (let i = idx - 1; i >= 0; i--) {
    if (!removed.has(visibleLogs[i].id)) return visibleLogs[i].id;
  }
  // Whole list was removed — close the reader.
  return null;
}
