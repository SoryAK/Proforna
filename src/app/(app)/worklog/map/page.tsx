import { WorklogMapView } from "@/components/worklog/worklog-map-view";

export const metadata = {
  title: "Map · Worklog · Resumsify",
};

/**
 * `/worklog/map` — dedicated events-on-a-map surface (ADR-0027 Day 4
 * Cycle B). Sibling route to `/worklog/events` and `/worklog/notes`.
 */
export default function MapPage() {
  return <WorklogMapView />;
}
