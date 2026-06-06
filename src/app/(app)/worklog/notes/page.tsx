import { WorklogPage } from "@/components/worklog/worklog-page";

export const metadata = {
  title: "Notes · Worklog · Resumsify",
};

/**
 * `/worklog/notes` — the existing 2-pane list+reader experience moved here
 * from `/worklog` per ADR-0014. <FullBleedShell> is provided by the parent
 * worklog layout, so we render the page component directly.
 */
export default function NotesPage() {
  return <WorklogPage />;
}
