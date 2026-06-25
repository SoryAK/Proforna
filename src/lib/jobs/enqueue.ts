import { prisma } from "@/lib/prisma";

/**
 * Enqueue an `extract` `DocumentProcessingJob` for the given document
 * (ADR-0050 β1.3).
 *
 * Idempotent: if a non-terminal job (`pending` or `running`) of the same
 * kind already exists for this document, returns that row unchanged. Only
 * terminal rows (`succeeded` or `failed`) allow re-enqueue — useful when a
 * doc is replaced and needs re-extraction.
 *
 * Always inserts at `attempts: 0` / `maxAttempts: 5` (the schema defaults)
 * and `scheduledFor: now` so the next poller tick picks it up. The
 * caller is `createDocument` when the `enqueueExtractJob` flag is set
 * AND the MIME is extractable.
 */

export type EnqueuedJob = {
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

export async function enqueueExtractJob(
  documentId: string,
  now: Date = new Date(),
): Promise<EnqueuedJob> {
  // findFirst restricts to non-terminal status — terminal rows
  // (succeeded/failed) are excluded so they don't block a legitimate
  // re-enqueue (e.g. when a document is replaced).
  const existing = await prisma.documentProcessingJob.findFirst({
    where: {
      documentId,
      kind: "extract",
      status: { in: ["pending", "running"] },
    },
  });
  if (existing) {
    return existing as EnqueuedJob;
  }

  const created = await prisma.documentProcessingJob.create({
    data: {
      kind: "extract",
      status: "pending",
      scheduledFor: now,
      document: { connect: { id: documentId } },
    },
  });
  return created as EnqueuedJob;
}
