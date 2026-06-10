/**
 * HistoryTab — rail panel body for the History tab (ADR-0023).
 * Bare wrapper around WorklogHistoryPanel; rail provides outer chrome.
 */

"use client";

import { WorklogHistoryPanel } from "@/components/worklog/worklog-history-panel";

export interface HistoryTabProps {
  noteId: string;
  currentPlainText: string;
}

export function HistoryTab({ noteId, currentPlainText }: HistoryTabProps) {
  return (
    <div className="px-3 py-3">
      <WorklogHistoryPanel
        noteId={noteId}
        currentPlainText={currentPlainText}
        bare
      />
    </div>
  );
}
