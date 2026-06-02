"use client";

/**
 * WorklogDndProvider — mounts the single @dnd-kit DndContext that spans the
 * 3-pane worklog grid.
 *
 * Responsibilities:
 *   • Provides sensors, drag event handlers from useWorklogDnd().
 *   • Renders the DragOverlay ghost using lightweight note/folder lookups.
 *
 * Ghost data is read from hooks that are already mounted by the page's data
 * layer (no extra network requests — TanStack Query deduplicates them).
 */

import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useWorklogDnd } from "@/components/worklog/hooks/use-worklog-dnd";
import { useWorklogData } from "@/components/worklog/hooks/use-worklog-data";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";

// ---------------------------------------------------------------------------
// Pure ghost-resolution helper — exported for unit testing
// ---------------------------------------------------------------------------

export function resolveGhosts(
  activeId: string | null,
  activeType: "note" | "folder" | null,
  logs: Array<{ id: string; title?: string | null }>,
  folders: Array<{ id: string; name: string }>,
) {
  const rawId = activeId ? activeId.replace(/^(note:|folder:)/, "") : null;
  const noteGhost =
    activeType === "note" && rawId ? (logs.find((l) => l.id === rawId) ?? null) : null;
  const folderGhost =
    activeType === "folder" && rawId ? (folders.find((f) => f.id === rawId) ?? null) : null;
  return { noteGhost, folderGhost };
}

interface WorklogDndProviderProps {
  children: React.ReactNode;
}

export function WorklogDndProvider({ children }: WorklogDndProviderProps) {
  const { sensors, activeId, activeType, onDragStart, onDragOver, onDragEnd, onDragCancel } =
    useWorklogDnd();

  // Ghost data lookups — read from query cache via hooks.
  // Keep lightweight: only what we need to render the overlay ghost.
  const { logs } = useWorklogData();
  const { folders } = useWorklogFolders();

  const { noteGhost, folderGhost } = resolveGhosts(activeId, activeType, logs, folders);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {noteGhost && (
          // Ghost: show note title + category dot in a pill
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-lg ring-1 ring-ring/30 max-w-[260px]">
            <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
            <span className="truncate font-medium">{noteGhost.title || "Untitled"}</span>
          </div>
        )}
        {folderGhost && (
          // Ghost: folder icon + name
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-lg ring-1 ring-ring/30 max-w-[200px]">
            <span className="text-muted-foreground">📁</span>
            <span className="truncate font-medium">{folderGhost.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
