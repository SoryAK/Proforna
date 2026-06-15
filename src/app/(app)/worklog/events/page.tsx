import { WorklogEventsView } from "@/components/worklog/worklog-events-view";

export const metadata = {
  title: "Events · Worklog · Resumsify",
};

/**
 * `/worklog/events` — sibling surface to `/worklog/notes` (ADR-0027 Day 3).
 *
 * Shows CareerEvents (anchored + free-floating). Day 3 Cycle A ships only
 * the route + nav entry + skeleton; the list view + drawer come in Cycle B.
 */
export default function EventsPage() {
  return <WorklogEventsView />;
}
