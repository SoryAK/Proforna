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
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "DocumentProcessingJob"
    SET status = 'running',
        attempts = attempts + 1,
        "claimedAt" = ${now},
        "updatedAt" = ${now}
    WHERE id = (
      SELECT id FROM "DocumentProcessingJob"
      WHERE status = 'pending'
        AND kind = ${kind}
        AND "scheduledFor" <= ${now}
      ORDER BY "scheduledFor" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}
