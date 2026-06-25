-- ADR-0050 β1.2 — durable processing queue for Document pipeline jobs.
-- See model `DocumentProcessingJob` in prisma/schema.prisma for field rationale.

-- CreateTable
CREATE TABLE "DocumentProcessingJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — poller query: WHERE status='pending' AND scheduledFor <= NOW() ORDER BY scheduledFor
CREATE INDEX "DocumentProcessingJob_status_scheduledFor_idx" ON "DocumentProcessingJob"("status", "scheduledFor");

-- CreateIndex — per-document job lookup (admin / debug)
CREATE INDEX "DocumentProcessingJob_documentId_idx" ON "DocumentProcessingJob"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentProcessingJob" ADD CONSTRAINT "DocumentProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;