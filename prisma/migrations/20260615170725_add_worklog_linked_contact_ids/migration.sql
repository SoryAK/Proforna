-- ADR-0028: persona / contact reverse-lookup
--
-- Adds `WorkLog.linkedContactIds: String[]` (denormalized projection of @p:
-- mentions in contentJson, populated on save) plus a GIN index for cheap
-- backlinks queries (`findMany({ where: { linkedContactIds: { has: id } } })`).
--
-- The `ALTER COLUMN "search_vector" DROP DEFAULT` lines that `prisma migrate
-- dev` auto-generated for CareerEvent and WorkLog were intentionally dropped.
-- Those columns are GENERATED ALWAYS tsvector projections (see
-- 20260523220000_add_worklog_search_vector and
-- 20260615044153_career_event_worklog_extension); Postgres rejects DROP
-- DEFAULT on generated columns. This is the same intrinsic Prisma
-- false-positive flagged in docs/workflows/recover-from-prisma-drift.md.

-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN     "linkedContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "WorkLog_linkedContactIds_idx" ON "WorkLog" USING GIN ("linkedContactIds");