"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function DocumentTile({ doc, onEdit, onMove, onDelete }: Props) {
  const Icon = fileIcon(doc.mimeType);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: docDragId(doc.id),
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "transition-shadow hover:shadow-md",
        isDragging && "z-50 cursor-grabbing opacity-60 shadow-xl"
      )}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-medium" title={doc.name}>
              {doc.name}
            </p>
          </div>
          <Badge className={CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.other}>
            {categoryLabel(doc.category)}
          </Badge>
        </div>

        <p className="truncate text-xs text-muted-foreground" title={doc.fileName}>
          {doc.fileName}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatSize(doc.fileSize)}</span>
          <span>&middot;</span>
          <span>{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</span>
        </div>
        {doc.notes && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{doc.notes}</p>
        )}

        {/*
          Action buttons live below the draggable surface. We stopPropagation +
          preventDefault on pointerdown so dnd-kit doesn't start a drag when the
          user is just clicking a button.
        */}
        <div
          className="flex gap-1 pt-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(`/api/documents/${doc.id}`, "_blank")}
            aria-label={`Download ${doc.name}`}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(doc)}
            aria-label={`Edit ${doc.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
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
      </CardContent>
    </Card>
  );
}
