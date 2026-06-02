"use client";

import { JobMap } from "@/components/job-map";

/**
 * Work History Map — locked to work-history mode.
 * Mode-switcher is hidden; use JobSearchMap for job search.
 */
export function WorkHistoryMap() {
  return <JobMap initialMode="work-history" lockedMode />;
}
