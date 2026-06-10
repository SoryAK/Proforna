/**
 * Worklog version snapshot helpers — pure, deterministic, no I/O.
 *
 * Scope (per ADR-0017, Sprint Kickoff Q1–Q3):
 *   - Auto-snapshot trigger uses length-delta only (no Levenshtein for v1).
 *   - Retention planner returns a `{ keep, delete }` partition of version ids;
 *     callers are responsible for issuing the actual `prisma.workLogVersion.deleteMany`.
 *   - All time math is deterministic given an injected `now` — no `Date.now()`
 *     calls leak into the pure surface.
 *
 * Consumed by the PUT /api/work-logs/[id] route handler (auto path) and the
 * POST /api/work-logs/[id]/versions endpoint (manual path, evict-only).
 */

/** Idle wait before an auto-snapshot is allowed to fire again (ms). */
export const IDLE_THRESHOLD_MS = 30_000;

/**
 * Minimum |plainText length delta| between prev and curr to count as a
 * "meaningful" edit worth snapshotting. Length-delta is intentionally a
 * cheap proxy — pure substitutions of equal length will be missed, which
 * the manual "Save version" button compensates for.
 */
export const CHAR_DELTA_THRESHOLD = 50;

/** Tiered retention: keep at most this many auto-snapshots within the last hour. */
export const RECENT_HOUR_KEEP = 10;

/** Hard cap on manual snapshots per note. Oldest-first FIFO eviction beyond this. */
export const MANUAL_CAP_PER_NOTE = 50;

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

// ─── Auto-snapshot trigger ────────────────────────────────────────────────

export interface ShouldAutoSnapshotInput {
  prevPlainText: string;
  currPlainText: string;
  /** `null` = no prior snapshot exists for this note (treated as infinitely old). */
  lastSnapshotAt: Date | null;
  now: Date;
}

export function shouldAutoSnapshot({
  prevPlainText,
  currPlainText,
  lastSnapshotAt,
  now,
}: ShouldAutoSnapshotInput): boolean {
  if (prevPlainText === currPlainText) return false;

  const idleMs =
    lastSnapshotAt === null
      ? Number.POSITIVE_INFINITY
      : now.getTime() - lastSnapshotAt.getTime();
  if (idleMs <= IDLE_THRESHOLD_MS) return false;

  const delta = Math.abs(currPlainText.length - prevPlainText.length);
  return delta >= CHAR_DELTA_THRESHOLD;
}

// ─── Retention planner ────────────────────────────────────────────────────

export interface VersionRow {
  id: string;
  createdAt: Date;
  isManual: boolean;
}

export interface RetentionPlan {
  /** Version ids to keep. */
  keep: string[];
  /** Version ids to delete. */
  delete: string[];
}

export interface ComputeRetentionPlanInput {
  versions: VersionRow[];
  now: Date;
}

/**
 * Returns the partition of version ids to keep vs. delete given the tiered
 * retention rules. Pure: input order independent, deterministic given `now`.
 *
 * Tiers (auto-snapshots only):
 *   1. Within the last hour: keep newest RECENT_HOUR_KEEP, drop the rest.
 *   2. 1h–24h ago:           keep the newest per UTC-hour bucket.
 *   3. >24h ago:              keep the newest per UTC-calendar-day bucket.
 *
 * Manual snapshots bypass the tiered rules entirely. They are only evicted
 * when their count exceeds MANUAL_CAP_PER_NOTE, in which case the oldest
 * are dropped FIFO until the cap is met.
 */
export function computeRetentionPlan({
  versions,
  now,
}: ComputeRetentionPlanInput): RetentionPlan {
  const auto = versions.filter((v) => !v.isManual);
  const manual = versions.filter((v) => v.isManual);

  const deleteIds = new Set<string>();

  // ── Tier 1: last hour, keep newest RECENT_HOUR_KEEP auto-snapshots ──
  const recent = auto
    .filter((v) => now.getTime() - v.createdAt.getTime() <= HOUR_MS)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const v of recent.slice(RECENT_HOUR_KEEP)) deleteIds.add(v.id);

  // ── Tier 2: 1h–24h, bucket by UTC hour, keep newest per bucket ──
  const midband = auto.filter((v) => {
    const ageMs = now.getTime() - v.createdAt.getTime();
    return ageMs > HOUR_MS && ageMs <= DAY_MS;
  });
  thinByBucket(midband, hourBucketKey, deleteIds);

  // ── Tier 3: >24h, bucket by UTC calendar day ──
  const old = auto.filter((v) => now.getTime() - v.createdAt.getTime() > DAY_MS);
  thinByBucket(old, dayBucketKey, deleteIds);

  // ── Manual cap: FIFO oldest-first eviction beyond MANUAL_CAP_PER_NOTE ──
  if (manual.length > MANUAL_CAP_PER_NOTE) {
    const sortedNewestFirst = [...manual].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    for (const v of sortedNewestFirst.slice(MANUAL_CAP_PER_NOTE)) {
      deleteIds.add(v.id);
    }
  }

  const keep: string[] = [];
  const del: string[] = [];
  for (const v of versions) {
    if (deleteIds.has(v.id)) del.push(v.id);
    else keep.push(v.id);
  }
  return { keep, delete: del };
}

/**
 * For each bucket, keep the newest row and mark the rest for deletion.
 * Mutates `deleteIds` in place.
 */
function thinByBucket(
  rows: VersionRow[],
  bucketKey: (d: Date) => string,
  deleteIds: Set<string>,
): void {
  const buckets = new Map<string, VersionRow>();
  for (const row of rows) {
    const key = bucketKey(row.createdAt);
    const incumbent = buckets.get(key);
    if (!incumbent) {
      buckets.set(key, row);
    } else if (row.createdAt.getTime() > incumbent.createdAt.getTime()) {
      deleteIds.add(incumbent.id);
      buckets.set(key, row);
    } else {
      deleteIds.add(row.id);
    }
  }
}

function hourBucketKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

function dayBucketKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
