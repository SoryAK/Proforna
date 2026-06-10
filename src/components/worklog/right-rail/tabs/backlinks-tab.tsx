/**
 * BacklinksTab — rail panel body for the Backlinks tab (ADR-0023).
 * Bare wrapper around WorklogBacklinksPanel; rail provides outer chrome.
 */

"use client";

import { WorklogBacklinksPanel } from "@/components/worklog/worklog-backlinks-panel";

export interface BacklinksTabProps {
  noteId: string;
}

export function BacklinksTab({ noteId }: BacklinksTabProps) {
  return (
    <div className="px-3 py-3">
      <WorklogBacklinksPanel noteId={noteId} bare />
    </div>
  );
}
