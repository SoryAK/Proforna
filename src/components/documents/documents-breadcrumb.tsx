"use client";

import { useDroppable } from "@dnd-kit/core";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Crumb } from "./types";
import { folderDropId } from "./dnd-ids";

interface Props {
  path: Crumb[];
  onNavigate: (folderId: string | null) => void;
}

/**
 * Each navigable crumb is a droppable target (id="folder:root" or "folder:<id>")
 * so a user dragging a document can drop it on an ancestor folder. The current
 * (last) segment renders as plain text — you can't drop onto where you already are.
 */
function CrumbButton({
  crumb,
  isLast,
  onNavigate,
}: {
  crumb: Crumb;
  isLast: boolean;
  onNavigate: (id: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: folderDropId(crumb.id),
    disabled: isLast,
  });

  if (isLast) {
    return (
      <span
        className="truncate font-medium text-foreground"
        aria-current="page"
        title={crumb.name}
      >
        {crumb.name}
      </span>
    );
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onNavigate(crumb.id)}
      className={cn(
        "truncate rounded-sm px-1 py-0.5 text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        isOver && "bg-orange-100 text-foreground dark:bg-orange-900/40"
      )}
      title={crumb.name}
    >
      {crumb.name}
    </button>
  );
}

export function DocumentsBreadcrumb({ path, onNavigate }: Props) {
  return (
    <nav aria-label="Folder path" className="flex items-center text-sm">
      {path.map((crumb, idx) => {
        const isLast = idx === path.length - 1;
        return (
          <span key={crumb.id ?? "root"} className="flex items-center">
            {idx > 0 && (
              <ChevronRight
                className="mx-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <CrumbButton crumb={crumb} isLast={isLast} onNavigate={onNavigate} />
          </span>
        );
      })}
    </nav>
  );
}
