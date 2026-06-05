/**
 * dnd-kit IDs for the documents page.
 *
 * Encoding:
 *   - "doc:<uuid>"     → draggable document
 *   - "folder:<uuid>"  → droppable folder (also draggable: folder move)
 *   - "folder:root"    → droppable representing the root (parentId=null)
 *
 * Helpers normalize the format so we don't reach into string parsing in
 * multiple places.
 */

export const ROOT_DROP_ID = "folder:root";

export function folderDropId(folderId: string | null): string {
  return folderId === null ? ROOT_DROP_ID : `folder:${folderId}`;
}

export function docDragId(docId: string): string {
  return `doc:${docId}`;
}

export function parseDragId(id: string): { kind: "doc"; id: string } | null {
  if (id.startsWith("doc:")) return { kind: "doc", id: id.slice(4) };
  return null;
}

export function parseDropId(
  id: string
): { kind: "folder"; folderId: string | null } | null {
  if (id === ROOT_DROP_ID) return { kind: "folder", folderId: null };
  if (id.startsWith("folder:")) return { kind: "folder", folderId: id.slice(7) };
  return null;
}
