"use client";

import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentTile } from "./document-tile";
import { FolderTile } from "./folder-tile";
import type { Doc, DocFolder } from "./types";

interface Props {
  folders: DocFolder[];
  docs: Doc[];
  isLoading: boolean;
  onOpenFolder: (folderId: string) => void;
  onRenameFolder: (folder: DocFolder) => void;
  onMoveFolder: (folder: DocFolder) => void;
  onDeleteFolder: (folder: DocFolder) => void;
  onEditDoc: (doc: Doc) => void;
  onMoveDoc: (doc: Doc) => void;
  onDeleteDoc: (id: string) => void;
}

export function DocumentsGrid({
  folders,
  docs,
  isLoading,
  onOpenFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onEditDoc,
  onMoveDoc,
  onDeleteDoc,
}: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (folders.length === 0 && docs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p>This folder is empty.</p>
          <p className="text-sm">Create a folder or upload a document to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {folders.map((f) => (
              <FolderTile
                key={f.id}
                folder={f}
                onOpen={onOpenFolder}
                onRename={onRenameFolder}
                onMove={onMoveFolder}
                onDelete={onDeleteFolder}
              />
            ))}
          </div>
        </section>
      )}

      {docs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Files
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => (
              <DocumentTile
                key={d.id}
                doc={d}
                onEdit={onEditDoc}
                onMove={onMoveDoc}
                onDelete={onDeleteDoc}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
