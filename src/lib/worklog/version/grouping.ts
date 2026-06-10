/**
 * groupVersionsByDate — ADR-0017 Phase 7 (UI history panel scaffolding).
 *
 * Pure helper that buckets WorkLogVersion rows by recency relative to a
 * reference `now`. Used by WorklogHistoryPanel to render sectioned lists
 * (Today / Yesterday / Earlier this week / Older).
 *
 * All bucket boundaries are evaluated in LOCAL time (the user's
 * timezone), matching how the UI labels these groups.
 *
 *   today     → same calendar day as `now`
 *   yesterday → calendar day immediately before `now`
 *   thisWeek  → within the last 7 days but NOT today/yesterday
 *               (inclusive of the moment exactly 7 days ago)
 *   older     → everything strictly more than 7 days before `now`
 *
 * Input order is preserved within each bucket — the API hands us
 * newest-first, the UI wants to display newest-first, so we don't sort.
 */

export interface GroupableVersion {
  id: string;
  createdAt: string | Date;
  /** Any extra fields the caller carries through (label, charDelta, etc.). */
  [key: string]: unknown;
}

export interface GroupedVersions<T extends GroupableVersion> {
  today:     T[];
  yesterday: T[];
  thisWeek:  T[];
  older:     T[];
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function groupVersionsByDate<T extends GroupableVersion>({
  versions,
  now,
}: {
  versions: T[];
  now: Date;
}): GroupedVersions<T> {
  const todayStart     = startOfLocalDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  // 7d window is measured against `now` (not start-of-day) so a row
  // exactly 7 days ago by the clock still lands in "thisWeek".
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const out: GroupedVersions<T> = {
    today:     [],
    yesterday: [],
    thisWeek:  [],
    older:     [],
  };

  for (const row of versions) {
    const created = row.createdAt instanceof Date
      ? row.createdAt
      : new Date(row.createdAt);

    if (created >= todayStart) {
      out.today.push(row);
    } else if (created >= yesterdayStart) {
      out.yesterday.push(row);
    } else if (created >= sevenDaysAgo) {
      out.thisWeek.push(row);
    } else {
      out.older.push(row);
    }
  }

  return out;
}
