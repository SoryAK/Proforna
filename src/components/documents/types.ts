/**
 * Shared types for the documents UI.
 * Server shapes are mirrored here so client code doesn't reach into Prisma types.
 */

export interface DocFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { children: number; documents: number };
}

/**
 * A folder node enriched with its children, built client-side from the flat
 * /api/document-folders response.
 */
export interface FolderTreeNode {
  folder: DocFolder;
  children: FolderTreeNode[];
}

export interface Doc {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: string;
  entityType: string | null;
  entityId: string | null;
  folderId: string | null;
  notes: string | null;
  createdAt: string;
}

/** Single breadcrumb segment — id=null represents the root ("Documents"). */
export interface Crumb {
  id: string | null;
  name: string;
}

export type ViewMode = "grid" | "list";

import { STORAGE_KEYS } from "@/lib/storage-keys";
export const VIEW_MODE_STORAGE_KEY = STORAGE_KEYS.documents.viewMode;
export const DEFAULT_VIEW_MODE: ViewMode = "grid";
