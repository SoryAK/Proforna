-- CreateTable
CREATE TABLE "MediaAnnotationComment" (
    "id" TEXT NOT NULL,
    "annotationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAnnotationComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAnnotationComment_annotationId_idx" ON "MediaAnnotationComment"("annotationId");

-- CreateIndex
CREATE INDEX "MediaAnnotationComment_annotationId_createdAt_idx" ON "MediaAnnotationComment"("annotationId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaAnnotationComment" ADD CONSTRAINT "MediaAnnotationComment_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "MediaAnnotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
