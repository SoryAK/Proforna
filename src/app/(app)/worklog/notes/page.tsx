import { WorklogNotesView } from "@/components/worklog/worklog-notes-view";

export const metadata = {
  title: "Notes · Worklog · Resumsify",
};

/**
 * `/worklog/notes` — Drive-style document-manager surface per ADR-0015.
 * Replaces the legacy 2-pane list+reader experience that lived here under
 * ADR-0014. The dashboard embed continues to render <WorklogPage compact />
 * directly — it's not affected by this swap.
 *
 * Row click in the table routes to `/worklog/notes/[id]` (full-screen
 * reader); the half-page reader drawer is a deferred Phase 5 follow-up.
 */
export default function NotesPage() {
  return <WorklogNotesView />;
}
