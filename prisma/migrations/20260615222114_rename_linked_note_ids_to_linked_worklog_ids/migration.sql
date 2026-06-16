-- ADR-0029 P0-#1: rename linkedNoteIds → linkedWorkLogIds.
--
-- The original ADR-0016 column was misnamed: notes and procedures are the
-- same model under the `kind` discriminator (ADR-0029), so the projection
-- column should be kind-agnostic. The PUT route now unions @n: + @r: chip
-- ids into this column, and the backlinks endpoint answers "what mentions
-- this worklog" for any kind in a single query.
--
-- Pure rename — no data movement, no downtime — RENAME COLUMN preserves
-- the existing String[] values and the GIN index physical pages; we just
-- re-point the schema name. Existing rows already have the right ids
-- (note-id projections); the backfill script then widens those rows to
-- also include @r: procedure mentions where present.
ALTER TABLE "WorkLog" RENAME COLUMN "linkedNoteIds" TO "linkedWorkLogIds";
ALTER INDEX  "WorkLog_linkedNoteIds_idx" RENAME TO "WorkLog_linkedWorkLogIds_idx";
