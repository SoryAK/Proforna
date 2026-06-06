import { WorklogHomeView } from "@/components/worklog/home/worklog-home-view";

export const metadata = {
  title: "Worklog · Resumsify",
};

/**
 * `/worklog` — the worklog landing page (ADR-0014). Capture-first home.
 * `<FullBleedShell>` is provided by the parent worklog layout.
 *
 * The list+reader experience now lives at `/worklog/notes`.
 */
export default function Page() {
  return <WorklogHomeView />;
}

