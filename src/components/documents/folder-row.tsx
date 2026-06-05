"use client";

import { useDroppable } from "@dnd-kit/core";
import { Folder, MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DocFolder } from "./types";
import { folderDropId } from "./dnd-ids";

interface Props {
  folder: DocFolder;
  onOpen: (folderId: string) => void;
  onRename: (folder: DocFolder) => void;
  onMove: (folder: DocFolder) => void;
  onDelete: (folder: DocFolder) => void;
}

/** List-view folder row. Drop target for documents being dragged. */
export function FolderRow({ folder, onOpen, onRename, onMove, onDelete }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: folderDropId(folder.id) });

  return (
    <tr
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(folder.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(folder.id);
        }
      }}
      className={cn(
        "group cursor-pointer border-b transition-colors hover:bg-muted/40",
        isOver && "bg-orange-50 dark:bg-orange-900/30"
      )}
      aria-label={`Open folder ${folder.name}`}
    >
      <td className="w-[44%] px-3 py-2">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="truncate text-sm font-medium">{folder.name}</span>
        </div>
      </td>
      <td className="w-[18%] px-3 py-2 text-xs text-muted-foreground">Folder</td>
      <td className="w-[14%] px-3 py-2 text-xs text-muted-foreground">
        {folder._count.children + folder._count.documents} items
      </td>
      <td className="w-[18%] px-3 py-2 text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(folder.updatedAt), { addSuffix: true })}
      </td>
      <td className="w-[6%] px-3 py-2 text-right">
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground data-[popup-open]:opacity-100"
              aria-label={`Folder ${folder.name} actions`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRename(folder)}>Rename</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(folder)}>Move…</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(folder)}
                className="text-red-600 focus:text-red-600"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
