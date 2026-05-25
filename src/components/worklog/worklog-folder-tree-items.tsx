/**
 * WorklogFolderTreeItems — the user-defined folders section of the rail.
 *
 * Extracted from worklog-folders-rail.tsx (T4.0 pre-split) so that DnD
 * sortable wrappers can be added here without pushing the rail past 600 lines.
 *
 * Owns:
 *   • useWorklogFolders() query + mutations
 *   • Move / delete dialog open state
 *   • "New folder" (root) and "New subfolder" creation handlers
 *   • Renders the "Folders" section header, WorklogFolderTree, and dialogs
 *
 * Renders a fragment — callers place it inside the rail's scroll container.
 * Dialogs are portal-rendered so their DOM position has no visual effect.
 */

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import {
  WorklogFolderTree,
  computeDeleteBlastRadius,
} from "@/components/worklog/worklog-folder-tree";
import { WorklogMoveToFolderDialog } from "@/components/worklog/worklog-move-to-folder-dialog";
import { WorklogFolderDeleteDialog } from "@/components/worklog/worklog-folder-delete-dialog";
import { validateFolderName } from "@/lib/worklog-folders";
import type { FolderSelection } from "@/types/worklog";

export interface WorklogFolderTreeItemsProps {
  selected: FolderSelection;
  onSelect: (sel: FolderSelection) => void;
  compact?: boolean;
  /** Fired on keyboard Enter to hand focus forward to the notes list pane. */
  onActivate?: () => void;
}

export function WorklogFolderTreeItems({
  selected,
  onSelect,
  compact,
  onActivate,
}: WorklogFolderTreeItemsProps) {
  const { folders, unfiledCount, createFolder, updateFolder, deleteFolder } =
    useWorklogFolders();

  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleCreateRoot = async () => {
    const name = window.prompt("New folder name");
    if (!name) return;
    const err = validateFolderName(name);
    if (err) {
      window.alert(err);
      return;
    }
    await createFolder.mutateAsync({ name: name.trim(), parentId: null });
  };

  const handleCreateChild = async (parentId: string | null) => {
    const name = window.prompt("New folder name");
    if (!name) return;
    const err = validateFolderName(name);
    if (err) {
      window.alert(err);
      return;
    }
    await createFolder.mutateAsync({ name: name.trim(), parentId });
  };

  const deleteTarget = deleteTargetId
    ? folders.find((f) => f.id === deleteTargetId)
    : null;
  const blast = deleteTarget
    ? computeDeleteBlastRadius(folders, deleteTarget.id)
    : { noteCount: 0, descendantFolderCount: 0 };

  const moveTarget = moveTargetId
    ? folders.find((f) => f.id === moveTargetId)
    : null;

  return (
    <>
      {/* ---- Folders section header ------------------------------------ */}
      {!compact && (
        <div className="pt-3 pb-1 px-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Folders
          </span>
          <button
            type="button"
            onClick={handleCreateRoot}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="New folder"
            aria-label="New folder"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
      {compact && <div className="my-1 h-px w-6 bg-border" />}

      {/* ---- Recursive folder tree ------------------------------------ */}
      <WorklogFolderTree
        folders={folders}
        unfiledCount={unfiledCount}
        selectedFolderId={selected.kind === "folder" ? selected.folderId : null}
        isUnfiledSelected={selected.kind === "unfiled"}
        compact={compact}
        onSelectFolder={(folderId) => onSelect({ kind: "folder", folderId })}
        onSelectUnfiled={() => onSelect({ kind: "unfiled" })}
        onActivate={onActivate}
        onRename={(id, name) => updateFolder.mutateAsync({ id, name })}
        onCreate={(parentId) => void handleCreateChild(parentId)}
        onRequestMove={(id) => setMoveTargetId(id)}
        onRequestDelete={(id) => setDeleteTargetId(id)}
      />

      {/* ---- Folder management dialogs (portal-rendered) -------------- */}
      <WorklogMoveToFolderDialog
        open={!!moveTargetId}
        onOpenChange={(o) => !o && setMoveTargetId(null)}
        folders={folders}
        currentFolderId={moveTarget?.parentId ?? null}
        title={moveTarget ? `Move "${moveTarget.name}" to…` : "Move to folder"}
        onChoose={async (newParentId) => {
          if (!moveTargetId) return;
          try {
            await updateFolder.mutateAsync({ id: moveTargetId, parentId: newParentId });
          } catch (e) {
            window.alert(e instanceof Error ? e.message : String(e));
          }
          setMoveTargetId(null);
        }}
      />
      <WorklogFolderDeleteDialog
        open={!!deleteTargetId}
        onOpenChange={(o) => !o && setDeleteTargetId(null)}
        folderName={deleteTarget?.name ?? ""}
        noteCount={blast.noteCount}
        descendantFolderCount={blast.descendantFolderCount}
        pending={deleteFolder.isPending}
        onConfirm={async (mode, nameConfirm) => {
          if (!deleteTargetId) return;
          try {
            await deleteFolder.mutateAsync({ id: deleteTargetId, mode, nameConfirm });
            // If we were viewing the deleted folder, fall back to "All notes".
            if (selected.kind === "folder" && selected.folderId === deleteTargetId) {
              onSelect({ kind: "all" });
            }
            setDeleteTargetId(null);
          } catch (e) {
            window.alert(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </>
  );
}
