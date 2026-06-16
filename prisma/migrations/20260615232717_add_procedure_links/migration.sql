-- ADR-0030: ProcedureLink — first-class structural links between procedures.
--
-- Surfaces the "if box is in a machine → follow Lockout-tagout first"
-- pattern as a typed edge in the properties rail. Distinct from inline
-- `@r:` mentions: mentions are doc-body references extracted from
-- contentJson; ProcedureLinks are explicit user actions stored as rows.
--
-- Both endpoints reference WorkLog (procedures are kind='procedure' rows
-- under ADR-0029's discriminator). DB does NOT enforce kind='procedure'
-- on the endpoints — that's an application-level guard in the API route
-- (avoids a partial-index dance for marginal benefit). ON DELETE CASCADE
-- on both sides so deleting a procedure cleans up every edge it sits on.
--
-- Relationship vocabulary (locked v1):
--   prereq | branch | next | related
-- A CHECK constraint enforces this at the DB level so a stray client
-- bug can't silently insert garbage values (mirrors the kind discriminator
-- defense pattern from ADR-0029 P0-#3).
CREATE TABLE "ProcedureLink" (
    "id" TEXT NOT NULL,
    "fromProcedureId" TEXT NOT NULL,
    "toProcedureId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcedureLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProcedureLink_relationship_check"
      CHECK ("relationship" IN ('prereq', 'branch', 'next', 'related'))
);

-- Idempotent edge identity: a given ordered pair under a given relationship
-- is unique. Allows distinct relationships between the same pair (e.g. A is
-- both a "prereq" AND "related" to B).
CREATE UNIQUE INDEX "ProcedureLink_from_to_relationship_key"
  ON "ProcedureLink"("fromProcedureId", "toProcedureId", "relationship");

-- Both-direction lookup indexes. Properties rail renders both:
--   "this procedure → these procedures"  uses fromProcedureId
--   "these procedures → this procedure"  uses toProcedureId
CREATE INDEX "ProcedureLink_fromProcedureId_idx" ON "ProcedureLink"("fromProcedureId");
CREATE INDEX "ProcedureLink_toProcedureId_idx"   ON "ProcedureLink"("toProcedureId");

ALTER TABLE "ProcedureLink"
  ADD CONSTRAINT "ProcedureLink_fromProcedureId_fkey"
  FOREIGN KEY ("fromProcedureId") REFERENCES "WorkLog"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcedureLink"
  ADD CONSTRAINT "ProcedureLink_toProcedureId_fkey"
  FOREIGN KEY ("toProcedureId") REFERENCES "WorkLog"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
