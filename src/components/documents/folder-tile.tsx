"use client";

import { useDroppable } from "@dnd-kit/core";
import { Folder, MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

/**
 * Grid-view folder tile. Click anywhere to open. Kebab menu exposes rename, move
 * (opens move-target picker), and delete (opens cascade-confirm if non-empty).
 *
 * Acts as a dnd-kit drop target: dragging a document onto it patches the doc's
 * folderId to this folder. A subtle orange tint signals an active drop.
 */
export function FolderTile({ folder, onOpen, onRename, onMove, onDelete }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: folderDropId(folder.id) });

  return (
    <Card
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
        "group cursor-pointer transition-all hover:shadow-md",
        isOver && "ring-2 ring-orange-500 ring-offset-1"
      )}
      aria-label={`Open folder ${folder.name}`}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <Folder className="h-8 w-8 shrink-0 text-orange-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{folder.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {folder._count.children} folders &middot; {folder._count.documents} files
          </p>
        </div>
        {/*
          Wrapper stops onClick from bubbling to the parent Card (which would
          navigate into the folder). We don't put onClick on the Trigger itself
          — base-ui's internal onClick opens the menu and React last-write-wins
          would clobber it.
        */}
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground data-[popup-open]:opacity-100"
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
      </CardContent>
    </Card>
  );
}
