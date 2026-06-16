-- ADR-0029: Worklog Procedures (Runbooks)
--
-- Adds `kind` discriminator to WorkLog. Default 'note' makes the migration a
-- no-op for every existing row — no backfill required. The /worklog/notes
-- list query gains a `kind = 'note'` filter (Unit 2); /worklog/procedures
-- filters `kind = 'procedure'`. PUT route preserves kind (audit guard, Unit 3).
--
-- Sanitized of the intrinsic tsvector DROP DEFAULT drift per
-- docs/workflows/recover-from-prisma-drift.md — only the additive column + index.

ALTER TABLE "WorkLog" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'note';

CREATE INDEX "WorkLog_userId_kind_idx" ON "WorkLog" ("userId", "kind");
