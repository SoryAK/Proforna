/**
 * useWorklogDnd — @dnd-kit sensors + drag event handlers for worklog notes & folders.
 *
 * ID prefix convention (enforced by sortable consumers):
 *   "note:<workLogId>"      — draggable note row
 *   "folder:<folderId>"     — draggable folder row
 *   "zone:unfiled"          — drop target for Unfiled section
 *   "zone:notable"          — drop target for Notable section (read-only; notes rejected by handler)
 */

import { useState } from "react";
import {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkLog } from "@/types/worklog";
import type { FolderListResponse } from "./use-worklog-folders";
import { useWorklogMutations } from "./use-worklog-mutations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorklogDndState {
  sensors: ReturnType<typeof useSensors>;
  activeId: string | null;
  activeType: "note" | "folder" | null;
  overId: string | null;
  overIsFolder: boolean;
  onDragStart: (e: DragStartEvent) => void;
  onDragOver: (e: DragOverEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseType(id: string): "note" | "folder" | null {
  if (id.startsWith("note:")) return "note";
  if (id.startsWith("folder:")) return "folder";
  return null;
}

export function stripPrefix(id: string): string {
  return id.replace(/^(note:|folder:|zone:)/, "");
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorklogDnd(): WorklogDndState {
  const qc = useQueryClient();
  const { reorderNotes, reorderFolders } = useWorklogMutations();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeType = activeId ? parseType(activeId) : null;
  const overIsFolder = overId?.startsWith("folder:") ?? false;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragOver = (e: DragOverEvent) => {
    setOverId(e.over ? String(e.over.id) : null);
  };

  const onDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    // Always reset first
    setActiveId(null);
    setOverId(null);

    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;

    if (!active || !over || active === over) return;

    const type = parseType(active);

    // -----------------------------------------------------------------------
    // NOTE DRAG
    // -----------------------------------------------------------------------
    if (type === "note") {
      const noteId = stripPrefix(active);

      // Determine target folder
      let targetFolderId: string | null = null;
      if (over.startsWith("folder:")) {
        targetFolderId = stripPrefix(over);
      } else if (over.startsWith("zone:unfiled")) {
        targetFolderId = null;
      } else if (over.startsWith("note:")) {
        const overNoteId = stripPrefix(over);
        const notes = qc.getQueryData<WorkLog[]>(["worklogs"]) ?? [];
        targetFolderId = notes.find((n) => n.id === overNoteId)?.folderId ?? null;
      }

      const notes = qc.getQueryData<WorkLog[]>(["worklogs"]) ?? [];

      // All notes in the landing container, sorted by sortOrder
      let siblings = notes
        .filter((n) => (n.folderId ?? null) === targetFolderId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      const activeNote = notes.find((n) => n.id === noteId);
      if (!activeNote) return;

      // Remove active from siblings
      siblings = siblings.filter((n) => n.id !== noteId);

      // Find insertion index
      let insertAt = siblings.length; // default: end
      if (over.startsWith("note:")) {
        const overNoteId = stripPrefix(over);
        const overIdx = siblings.findIndex((n) => n.id === overNoteId);
        if (overIdx !== -1) insertAt = overIdx;
      }

      siblings.splice(insertAt, 0, activeNote);

      // Re-assign dense sortOrders
      const reordered = siblings.map((n, i) => ({ ...n, sortOrder: i }));

      // Build changed items only
      const items = reordered
        .filter((n) => {
          const orig = notes.find((o) => o.id === n.id);
          return orig && (orig.sortOrder !== n.sortOrder || (orig.folderId ?? null) !== targetFolderId);
        })
        .map((n) => ({ id: n.id, sortOrder: n.sortOrder!, folderId: targetFolderId }));

      if (items.length === 0) return;
      reorderNotes.mutate({ items });
      return;
    }

    // -----------------------------------------------------------------------
    // FOLDER DRAG
    // -----------------------------------------------------------------------
    if (type === "folder") {
      if (!over.startsWith("folder:")) return; // can't drop folder onto note/zone

      const folderId = stripPrefix(active);
      const targetFolderId = stripPrefix(over);

      const data = qc.getQueryData<FolderListResponse>(["worklog-folders"]);
      const folders = data?.folders ?? [];

      const activeFolder = folders.find((f) => f.id === folderId);
      const targetFolder = folders.find((f) => f.id === targetFolderId);
      if (!activeFolder || !targetFolder) return;

      // Only reorder within same parent
      if ((activeFolder.parentId ?? null) !== (targetFolder.parentId ?? null)) return;

      const sharedParent = activeFolder.parentId ?? null;

      let siblings = folders
        .filter((f) => (f.parentId ?? null) === sharedParent)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      siblings = siblings.filter((f) => f.id !== folderId);

      const insertAt = siblings.findIndex((f) => f.id === targetFolderId);
      siblings.splice(insertAt === -1 ? siblings.length : insertAt, 0, activeFolder);

      const reordered = siblings.map((f, i) => ({ ...f, sortOrder: i }));

      const items = reordered
        .filter((f) => {
          const orig = folders.find((o) => o.id === f.id);
          return orig && orig.sortOrder !== f.sortOrder;
        })
        .map((f) => ({ id: f.id, sortOrder: f.sortOrder!, parentId: sharedParent }));

      if (items.length === 0) return;
      reorderFolders.mutate({ items });
    }
  };

  return { sensors, activeId, activeType, overId, overIsFolder, onDragStart, onDragOver, onDragEnd, onDragCancel };
}
