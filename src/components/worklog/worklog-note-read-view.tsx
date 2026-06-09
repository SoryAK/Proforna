/**
 * WorklogNoteReadView — pure read-only render of a WorkLog (ADR-0015 Phase 5).
 *
 * Used by <WorklogReaderDrawer> as a quick "skim before you open" surface.
 * Zero autosave, zero editor mount, zero side effects — just a static
 * paint of title, meta, photos, and body content.
 *
 * Body uses <WorklogNoteView> (hand-rolled ProseMirror JSON walker), the
 * same lightweight renderer the editor uses in collapsed mode. No Tiptap,
 * no Y.js, no IndexedDB hit on open.
 *
 * Photos render as thumbnails only — no upload / delete affordances. Those
 * live in the full-screen reader (<WorklogNoteReader>) which the drawer's
 * "Open" button escalates to.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Calendar, Clock, Folder as FolderIcon, Inbox, Star } from "lucide-react";
import type { WorkLog, WorkLogPhoto, Position } from "@/types/worklog";
import { MOODS, resolveCategoryMeta } from "@/components/worklog/constants";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import { WorklogNoteView } from "@/components/worklog/worklog-note-view";
import { WorklogBacklinksPanel } from "@/components/worklog/worklog-backlinks-panel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface WorklogNoteReadViewProps {
  log: WorkLog;
  positions: Position[];
  positionMap: Map<string, Position>;
  className?: string;
}

export function WorklogNoteReadView({
  log,
  positionMap,
  className,
}: WorklogNoteReadViewProps) {
  // Folder name (Unfiled when null/missing).
  const { folders } = useWorklogFolders();
  const folder = log.folderId ? folders.find((f) => f.id === log.folderId) ?? null : null;

  // Read-only photo thumbnails. Identical query to <WorklogPhotoSection>
  // so the cache is shared — opens are instant after the full-screen
  // reader has visited the same note (or vice versa).
  const { data: photos = [] } = useQuery<WorkLogPhoto[]>({
    queryKey: ["worklog-photos", log.id],
    queryFn: async () => {
      const r = await fetch(`/api/work-logs/photos?workLogId=${log.id}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const category = resolveCategoryMeta(log.category);
  const CategoryIcon = category.icon;
  const mood = log.mood ? MOODS.find((m) => m.value === log.mood) ?? null : null;
  const position = log.positionId ? positionMap.get(log.positionId) ?? null : null;

  // Date label — short form ("Thu, May 21, 2026").
  let dateLabel = "—";
  try {
    dateLabel = format(parseISO(log.date), "EEE, MMM d, yyyy");
  } catch {
    /* fall through */
  }

  // Tag split — `tags` is a comma-separated string per WorkLog schema.
  const tagList = (log.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Title row */}
      <div className="flex items-start gap-2">
        <h1 className="text-xl font-semibold leading-tight flex-1 min-w-0 break-words">
          {log.title || "Untitled"}
        </h1>
        {log.isNotable && (
          <Star
            className="h-5 w-5 text-amber-500 fill-amber-500 shrink-0 mt-1"
            aria-label="Notable"
          />
        )}
      </div>

      {/* Meta strip — read-only summary line(s) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {dateLabel}
        </span>

        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium",
            category.color,
          )}
        >
          <CategoryIcon className="h-3 w-3" />
          {category.label}
        </span>

        {position && (
          <span className="inline-flex items-center gap-1 max-w-[14rem] truncate">
            <span className="truncate">{position.title}</span>
          </span>
        )}

        {log.hours != null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {log.hours}h
          </span>
        )}

        <span className="inline-flex items-center gap-1">
          {folder ? (
            <>
              <FolderIcon className="h-3.5 w-3.5" />
              {folder.name}
            </>
          ) : (
            <>
              <Inbox className="h-3.5 w-3.5" />
              Unfiled
            </>
          )}
        </span>

        {mood && (
          <span className={cn("inline-flex items-center gap-1", mood.color)}>
            <mood.icon className="h-3.5 w-3.5" />
            {mood.label}
          </span>
        )}
      </div>

      {/* Tags */}
      {tagList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tagList.map((t) => (
            <Badge key={t} variant="secondary" className="text-[11px] font-normal">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {/* Photos (read-only thumbnails) */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p) => (
            <div
              key={p.id}
              className="relative aspect-square rounded-md overflow-hidden border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.filePath}
                alt={p.caption ?? ""}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="border-t pt-4">
        <WorklogNoteView json={log.contentJson} contentText={log.content} />
      </div>

      {/* ADR-0016: Backlinks panel — notes that link to this one via @n: mentions */}
      <WorklogBacklinksPanel noteId={log.id} className="mt-4" />
    </div>
  );
}
