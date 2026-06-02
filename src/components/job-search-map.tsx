"use client";

import { JobMap } from "@/components/job-map";

/**
 * Job Search Map — locked to job-search mode.
 * Mode-switcher is hidden; use WorkHistoryMap for work history.
 */
export function JobSearchMap() {
  return <JobMap lockedMode />;
}
