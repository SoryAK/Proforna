/**
 * PhotosTab — rail panel body for the Photos tab (ADR-0023).
 * Mounts WorklogPhotoSection at 3 cols (rail panel is 320px wide).
 */

"use client";

import { WorklogPhotoSection } from "@/components/worklog/worklog-photo-section";

export interface PhotosTabProps {
  noteId: string;
}

export function PhotosTab({ noteId }: PhotosTabProps) {
  return (
    <div className="px-3 py-3">
      <WorklogPhotoSection workLogId={noteId} cols={3} />
    </div>
  );
}
