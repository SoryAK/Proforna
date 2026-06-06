import { FullBleedShell } from "@/components/full-bleed-shell";

/**
 * Worklog section layout — wraps both `/worklog` (home) and
 * `/worklog/notes` (list+reader) in <FullBleedShell> per ADR-0014.
 *
 * The sidebar override (ADR-0013) gates on `pathname.startsWith("/worklog")`
 * so it covers every page rendered through this layout without further
 * configuration.
 */
export default function WorklogLayout({ children }: { children: React.ReactNode }) {
  return <FullBleedShell>{children}</FullBleedShell>;
}
