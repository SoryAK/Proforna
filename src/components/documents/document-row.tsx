"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CATEGORY_COLORS,
  categoryLabel,
  fileIcon,
  formatSize,
} from "./constants";
import type { Doc } from "./types";
import { docDragId } from "./dnd-ids";

interface Props {
  doc: Doc;
  onEdit: (doc: Doc) => void;
  onMove: (doc: Doc) => void;
  onDelete: (id: string) => void;
}

export function DocumentRow({ doc, onEdit, onMove, onDelete }: Props) {
  const Icon = fileIcon(doc.mimeType);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: docDragId(doc.id),
  });
  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group border-b transition-colors hover:bg-muted/40",
        isDragging && "opacity-60"
      )}
    >
      <td className="w-[44%] px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm" title={doc.name}>
            {doc.name}
          </span>
        </div>
      </td>
      <td className="w-[18%] px-3 py-2">
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-[11px]",
            CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.other
          )}
        >
          {categoryLabel(doc.category)}
        </span>
      </td>
      <td className="w-[14%] px-3 py-2 text-xs text-muted-foreground">
        {formatSize(doc.fileSize)}
      </td>
      <td className="w-[18%] px-3 py-2 text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
      </td>
      <td className="w-[6%] px-3 py-2 text-right">
        <div
          className="inline-flex items-center gap-0.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => window.open(`/api/documents/${doc.id}`, "_blank")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground"
            aria-label={`Download ${doc.name}`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(doc)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground"
            aria-label={`Edit ${doc.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground data-[popup-open]:opacity-100"
              aria-label={`More actions for ${doc.name}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMove(doc)}>Move…</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(doc.id)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
