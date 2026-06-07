/**
 * WorklogNotesShared — pure helpers shared between <WorklogNotesTable> and
 * <WorklogNotesGrid> (per ADR-0015).
 *
 * Both views render the same row-level fields (category dot, title, position,
 * folder, last-edited, preview snippet) with different chrome. Putting the
 * formatting + sort helpers in a sibling module avoids the implicit coupling
 * where the grid imports from the table — neither file should depend on the
 * other.
 *
 * No JSX in here. Strictly pure functions + types + constant maps so this
 * module stays trivially testable.
 */

import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import type { Position, WorkLog, WorkLogFolderWithCount } from "@/types/worklog";

// ---------------------------------------------------------------------------
// Sort state — owned by the parent surface, consumed by both views.
// ---------------------------------------------------------------------------

export type SortColumn = "title" | "position" | "folder" | "lastEdited";
export type SortDir = "asc" | "desc";

export interface WorklogNotesTableSortState {
  column: SortColumn;
  dir: SortDir;
}

// ---------------------------------------------------------------------------
// Category → dot color (matches the chip palette in worklog/constants.ts).
// ---------------------------------------------------------------------------

export const CATEGORY_DOT: Record<string, string> = {
  task: "bg-orange-500",
  project: "bg-purple-500",
  meeting: "bg-indigo-500",
  training: "bg-emerald-500",
  administrative: "bg-slate-400",
  maintenance: "bg-amber-500",
  troubleshooting: "bg-cyan-500",
  "on-call": "bg-red-500",
  other: "bg-gray-400",
};

// ---------------------------------------------------------------------------
// Cell formatters
// ---------------------------------------------------------------------------

/** Strip HTML and clamp to 200 chars for the inline preview. */
export function previewLine(content: string | null | undefined): string {
  if (!content) return "";
  const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > 200 ? `${plain.slice(0, 200)}…` : plain;
}

/** Format the Last-edited column. Relative ≤ 6 days, absolute beyond. */
export function formatLastEdited(
  updatedAt: string | undefined,
  fallbackDate: string,
): string {
  const stamp = updatedAt ?? fallbackDate;
  if (!stamp) return "—";
  const d = parseISO(stamp);
  const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 7) {
    return formatDistanceToNowStrict(d, { addSuffix: true });
  }
  const nowYear = new Date().getFullYear();
  return d.getFullYear() === nowYear ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

/** Position cell text. Italic "No position" when missing. */
export function positionLabel(
  positionId: string | null | undefined,
  map: Map<string, Position>,
): { text: string; italic: boolean } {
  if (!positionId) return { text: "No position", italic: true };
  const p = map.get(positionId);
  if (!p) return { text: "No position", italic: true };
  const role = p.title || p.company || "Position";
  const company = p.title && p.company ? ` · ${p.company}` : "";
  return { text: `${role}${company}`, italic: false };
}

/** Folder cell text. Italic "Unfiled" when missing. */
export function folderLabel(
  folderId: string | null | undefined,
  folders: WorkLogFolderWithCount[],
): { text: string; italic: boolean } {
  if (!folderId) return { text: "Unfiled", italic: true };
  const f = folders.find((x) => x.id === folderId);
  if (!f) return { text: "Unfiled", italic: true };
  return { text: f.name, italic: false };
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

/** Pure sort. Returns a new array; never mutates the input. */
export function applySort(
  logs: WorkLog[],
  sort: WorklogNotesTableSortState,
  positionMap: Map<string, Position>,
  folders: WorkLogFolderWithCount[],
): WorkLog[] {
  const out = [...logs];
  const dirMul = sort.dir === "asc" ? 1 : -1;

  switch (sort.column) {
    case "title":
      out.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "") * dirMul);
      break;
    case "position":
      out.sort((a, b) => {
        const aL = positionLabel(a.positionId, positionMap).text.toLowerCase();
        const bL = positionLabel(b.positionId, positionMap).text.toLowerCase();
        return aL.localeCompare(bL) * dirMul;
      });
      break;
    case "folder":
      out.sort((a, b) => {
        const aL = folderLabel(a.folderId, folders).text.toLowerCase();
        const bL = folderLabel(b.folderId, folders).text.toLowerCase();
        return aL.localeCompare(bL) * dirMul;
      });
      break;
    case "lastEdited":
    default:
      out.sort((a, b) => {
        const aT = (a.updatedAt ?? a.date ?? "") as string;
        const bT = (b.updatedAt ?? b.date ?? "") as string;
        return aT.localeCompare(bT) * dirMul;
      });
      break;
  }
  return out;
}
