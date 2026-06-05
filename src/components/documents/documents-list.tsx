"use client";

import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentRow } from "./document-row";
import { FolderRow } from "./folder-row";
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

const HEADERS = ["Name", "Type / Category", "Size / Items", "Modified", ""] as const;

export function DocumentsList({
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
    return <Skeleton className="h-64 rounded-xl" />;
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
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full table-fixed">
        <thead className="bg-muted/30">
          <tr className="border-b">
            {HEADERS.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {folders.map((f) => (
            <FolderRow
              key={f.id}
              folder={f}
              onOpen={onOpenFolder}
              onRename={onRenameFolder}
              onMove={onMoveFolder}
              onDelete={onDeleteFolder}
            />
          ))}
          {docs.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              onEdit={onEditDoc}
              onMove={onMoveDoc}
              onDelete={onDeleteDoc}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
