import type { DatabaseSync } from "node:sqlite";
import { residenceForMap } from "../core/residence";
import {
  judgeListingFit,
  type FitJudgment,
  type JudgmentCareerRecord,
} from "../core/fit-judgment";
import type { JobListing } from "../core/job-search";
import type { JudgmentSection } from "../core/job-sources";
import { readProfile } from "./occupant";
import { listResidences } from "./residences";

export function careerRecordForJudgment(
  db: DatabaseSync,
  occupantId: string,
  sections: readonly JudgmentSection[],
): JudgmentCareerRecord {
  const record: JudgmentCareerRecord = {};
  if (sections.includes("profile")) {
    const profile = readProfile(db, occupantId);
    record.profile = { headline: profile.headline, bio: profile.bio };
  }
  if (sections.includes("history")) {
    record.history = db
      .prepare(
        `SELECT title, company AS organization
         FROM work_history
         WHERE occupant_id = ?
         ORDER BY is_current DESC, COALESCE(start_date, '') DESC
         LIMIT 12`,
      )
      .all(occupantId) as Array<{ title: string; organization: string }>;
  }
  if (sections.includes("skills")) {
    record.skills = (
      db
        .prepare(
          "SELECT name FROM skills WHERE occupant_id = ? ORDER BY created_at ASC",
        )
        .all(occupantId) as Array<{ name: string }>
    ).map((row) => row.name);
  }
  if (sections.includes("worklog")) {
    record.worklog = db
      .prepare(
        `SELECT title FROM worklog_entries
         WHERE occupant_id = ?
         ORDER BY occurred_on DESC, created_at DESC
         LIMIT 12`,
      )
      .all(occupantId) as Array<{ title: string }>;
  }
  if (sections.includes("residence")) {
    const home = residenceForMap(listResidences(db, occupantId), null);
    record.residence = home ? { address: home.address } : null;
  }
  return record;
}

export function judgeListings(
  listings: JobListing[],
  record: JudgmentCareerRecord,
  sections: readonly JudgmentSection[],
): Array<JobListing & { fit: FitJudgment }> {
  return listings.map((listing) => ({
    ...listing,
    fit: judgeListingFit(listing, record, sections),
  }));
}
