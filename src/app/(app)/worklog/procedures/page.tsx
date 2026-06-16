/**
 * `/worklog/procedures` — sibling surface to `/worklog/notes` for runbooks
 * (ADR-0029).
 *
 * Procedures are stored as `WorkLog` rows with `kind = 'procedure'`. This
 * route filters the list query to only that bucket and adds a "+ New
 * procedure" CTA. Click-through opens the row in the standard worklog
 * reader at `/worklog/notes/[id]` — procedures inherit the full Tiptap
 * editor / version history / mention surface of regular notes.
 */

import { WorklogProceduresView } from "@/components/worklog/worklog-procedures-view";

export const metadata = {
  title: "Procedures · Worklog · Resumsify",
};

export default function ProceduresPage() {
  return <WorklogProceduresView />;
}
