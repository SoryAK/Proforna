/**
 * Pure helpers for working with the WorkLogFolder adjacency-list tree.
 *
 * The folder tree is built client-side from a flat list returned by
 * `GET /api/work-logs/folders`. All helpers here are pure — no React, no
 * data fetching — so they can be reused by the rail, the move-to-folder
 * dialog, and any future export tooling.
 */

import type { WorkLogFolder, WorkLogFolderWithCount } from "@/types/worklog";

/** Maximum nesting depth allowed by the server. UI clamps a level deeper for safety. */
export const FOLDER_MAX_DEPTH = 8;
export const FOLDER_NAME_MAX = 80;

/** Tree node — a folder plus its already-built children, alphabetically sorted. */
export type FolderTreeNode = WorkLogFolderWithCount & {
  depth: number;
  children: FolderTreeNode[];
};

/**
 * Build an alphabetically-sorted tree from a flat folder list.
 * Folders with a `parentId` whose parent is missing (orphaned by a stale
 * client cache) are surfaced at the root so they don't disappear.
 */
export function buildFolderTree(folders: WorkLogFolderWithCount[]): FolderTreeNode[] {
  const byId = new Map<string, FolderTreeNode>();
  for (const f of folders) {
    byId.set(f.id, { ...f, depth: 0, children: [] });
  }
  const roots: FolderTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Assign depth + alphabetical sort, recursively.
  const sortAndDepth = (nodes: FolderTreeNode[], depth: number) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    for (const n of nodes) {
      n.depth = depth;
      sortAndDepth(n.children, depth + 1);
    }
  };
  sortAndDepth(roots, 0);
  return roots;
}

/** Flatten a tree into a depth-annotated list (pre-order). */
export function flattenFolderTree(roots: FolderTreeNode[]): FolderTreeNode[] {
  const out: FolderTreeNode[] = [];
  const walk = (nodes: FolderTreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/**
 * Collect the id-set of a folder + all its descendants. Used when the user
 * selects a folder in the rail and we need to show every note under it.
 */
export function collectDescendantIds(
  folders: WorkLogFolder[],
  folderId: string,
): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    if (!childrenOf.has(f.parentId)) childrenOf.set(f.parentId, []);
    childrenOf.get(f.parentId)!.push(f.id);
  }
  const out = new Set<string>([folderId]);
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of childrenOf.get(id) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

/**
 * Returns true if `targetParentId` is the same as `movingId` or any descendant
 * of it — which would create a cycle if used as a new parent. Used by both
 * the server (authoritative) and the move-to-folder dialog (UX).
 */
export function wouldCreateCycle(
  folders: WorkLogFolder[],
  movingId: string,
  targetParentId: string | null,
): boolean {
  if (targetParentId === null) return false;
  if (targetParentId === movingId) return true;
  const descendants = collectDescendantIds(folders, movingId);
  return descendants.has(targetParentId);
}

/** Compute the depth a folder would sit at if moved under `targetParentId`. */
export function depthOfParent(
  folders: WorkLogFolder[],
  targetParentId: string | null,
): number {
  if (!targetParentId) return 0;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let depth = 1;
  let cursor: WorkLogFolder | undefined = byId.get(targetParentId);
  const seen = new Set<string>();
  while (cursor && cursor.parentId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    cursor = byId.get(cursor.parentId);
    depth += 1;
  }
  return depth;
}

/**
 * Validate a folder name. Returns null when valid; otherwise a human-readable
 * error message suitable for inline display.
 */
export function validateFolderName(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return "Name is required";
  if (name.length > FOLDER_NAME_MAX) return `Name must be ${FOLDER_NAME_MAX} characters or fewer`;
  return null;
}
