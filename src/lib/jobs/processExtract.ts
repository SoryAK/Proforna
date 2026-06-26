import { prisma } from "@/lib/prisma";
import { readDocumentBytes } from "@/lib/documents/storage";
import { extractText, isExtractableMime } from "@/lib/manuals/extract";
import { markJobSucceeded, markJobFailed } from "./complete";
import type { ClaimedJob } from "./claim";

/**
 * Process one claimed `extract` job (ADR-0050 β1.4).
 *
 * Owns the full per-job lifecycle:
 *   1. Fetch the Document row (must exist — ON DELETE CASCADE guarantees
 *      this; if it doesn't, the job is permanently broken).
 *   2. Read bytes via the storage service (unified disk + legacy base64).
 *   3. If MIME is not extractable, this is a poller bug (should have been
 *      blocked at enqueue time) — mark job failed.
 *   4. Run `extractText`. Empty markdown signals a scanned PDF — stamp
 *      Document.processingStatus="skipped" so β2 OCR can pick it up; the
 *      job itself succeeded (no retry needed).
 *   5. Non-empty markdown — stamp Document.processingStatus="ready",
 *      markdownContent, pageCount, processedAt.
 *   6. On any thrown error, call markJobFailed — backoff math + terminal
 *      transition live in `complete.ts`.
 *
 * The poller (scripts/document-processor.mjs) is the only caller. It
 * keeps the loop dumb and the per-job logic testable here.
 */

export async function processExtract(job: ClaimedJob): Promise<void> {
  try {
    const document = await prisma.document.findUnique({
      where: { id: job.documentId },
      select: {
        id: true,
        mimeType: true,
        filePath: true,
        data: true,
      },
    });

    if (!document) {
      // Cascade should prevent this; if it happens, the job is rotten.
      await markJobFailed(job.id, `Document ${job.documentId} not found`);
      return;
    }

    if (!isExtractableMime(document.mimeType)) {
      // Enqueue guard should have caught this; if it didn't, fail loudly.
      await markJobFailed(
        job.id,
        `Document MIME ${document.mimeType} is not extractable`,
      );
      return;
    }

    const bytes = await readDocumentBytes({
      filePath: document.filePath,
      data: document.data,
    });

    const { markdown, pageCount } = await extractText({
      buffer: bytes,
      mimeType: document.mimeType,
    });

    // Empty markdown → likely a scanned PDF with no text layer. Stamp
    // skipped (β2 OCR signal) but mark the JOB succeeded — retrying the
    // same extract path will keep producing the same empty string.
    const processingStatus = markdown.length === 0 ? "skipped" : "ready";

    await prisma.document.update({
      where: { id: document.id },
      data: {
        markdownContent: markdown,
        pageCount,
        processingStatus,
        processedAt: new Date(),
        extractionError: null,
      },
    });

    await markJobSucceeded(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markJobFailed(job.id, msg);
  }
}
