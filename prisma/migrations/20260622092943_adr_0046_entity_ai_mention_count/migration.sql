-- ADR-0046 Phase C — per-user @-mention ranking signal.
-- Purely additive: new table + unique constraint + index + cascade FK.
-- No existing rows are touched. Safe to apply on any environment.

CREATE TABLE "EntityAIMentionCount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastMentionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityAIMentionCount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntityAIMentionCount_userId_entityType_entityId_key"
    ON "EntityAIMentionCount"("userId", "entityType", "entityId");

CREATE INDEX "EntityAIMentionCount_userId_entityType_idx"
    ON "EntityAIMentionCount"("userId", "entityType");

ALTER TABLE "EntityAIMentionCount"
    ADD CONSTRAINT "EntityAIMentionCount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
