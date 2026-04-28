-- CreateTable
CREATE TABLE "IrViewEvent" (
    "id" TEXT NOT NULL,
    "irSlug" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "accessRequestId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventData" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IrViewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IrViewEvent_irSlug_createdAt_idx" ON "IrViewEvent"("irSlug", "createdAt");

-- CreateIndex
CREATE INDEX "IrViewEvent_irSlug_sessionId_idx" ON "IrViewEvent"("irSlug", "sessionId");

-- CreateIndex
CREATE INDEX "IrViewEvent_irSlug_eventType_idx" ON "IrViewEvent"("irSlug", "eventType");
