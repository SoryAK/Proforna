import { prisma } from "@/lib/prisma";

/**
 * Atomic claim for `DocumentProcessingJob` (ADR-0050 β1.2).
 *
 * Uses Postgres `FOR UPDATE SKIP LOCKED` so multiple poller processes
 * never grab the same row, even if β1 only runs one. The compound index
 * `(status, scheduledFor)` on `DocumentProcessingJob` is what makes this
 * fast — without it the inner SELECT scans the whole table.
 *
 * The whole UPDATE + SELECT runs inside a single transaction (Prisma
 * wraps `$queryRaw` in its own implicit tx); attempts are incremented
 * during the claim itself, so even a poller that dies mid-extraction
 * still consumes one attempt — preventing infinite retry loops on
 * crash-loop scenarios.
 */

// Discriminator union for the kind column. New kinds added in β2 (ocr-page)
// and β3 (chunk-embed) extend this union.
export type DocumentProcessingJobKind = "extract" | "ocr-page" | "chunk-embed";

export type ClaimedJob = {
  id: string;
  documentId: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  scheduledFor: Date;
  claimedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function claimNextJob(
  kind: DocumentProcessingJobKind,
  now: Date = new Date(),
): Promise<ClaimedJob | null> {
  // The two `now` interpolations bind to:
  //   1. claimedAt / updatedAt (sets the audit timestamps on the claimed row)
  //   2. scheduledFor cutoff   (selects rows whose scheduledFor <= now)
  // Postgres parameter binding ensures the timestamps are timezone-correct
  // regardless of the client's locale.
  //
  // TZ-safety (TWO mirror-image bugs in the same SQL block):
  //
  //   1. WHERE side — `"scheduledFor"` is stored as bare `timestamp` (no
  //      TZ — project-wide DateTime convention; no `@db.Timestamptz`
  //      anywhere in the schema). When compared against `${now}` (which
  //      Prisma binds as `timestamptz`), Postgres implicitly converts
  //      the bare timestamp by reinterpreting it in the session TZ — so
  //      on any non-UTC connection (e.g. America/New_York) the row
  //      appears 4–5h in the future and the poller silently never
  //      claims anything. Fix: `("scheduledFor" AT TIME ZONE 'UTC')`
  //      forces the column to read as UTC.
  //
  //   2. SET side — assigning a `timestamptz` param (${now}) to a bare
  //      `timestamp` column does the inverse implicit cast: Postgres
  //      converts the timestamptz to the session TZ then strips the TZ.
  //      Result: `claimedAt` stores the session-local wall clock but
  //      Prisma reads it back as a UTC instant, so the value drifts 4–5h
  //      from reality. In β1 (single poller, sub-second extracts) this
  //      is benign; in β2+ (multi-poller, longer jobs) it makes the
  //      staleReset cutoff fire on freshly-claimed rows → double-process.
  //      Fix: `(${now} AT TIME ZONE 'UTC')` reinterprets the timestamptz
  //      as UTC and converts to bare `timestamp`, preserving the wall
  //      clock through write/read round-trip.
  //
  // Regression-guarded by claim.test.ts. Parked: a schema-wide migration
  // to `@db.Timestamptz` would let us drop both casts (see
  // parked-ideas.md → "schema-wide timestamptz migration").
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "DocumentProcessingJob"
    SET status = 'running',
        attempts = attempts + 1,
        "claimedAt" = (${now} AT TIME ZONE 'UTC'),
        "updatedAt" = (${now} AT TIME ZONE 'UTC')
    WHERE id = (
      SELECT id FROM "DocumentProcessingJob"
      WHERE status = 'pending'
        AND kind = ${kind}
        AND ("scheduledFor" AT TIME ZONE 'UTC') <= ${now}
      ORDER BY "scheduledFor" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}
