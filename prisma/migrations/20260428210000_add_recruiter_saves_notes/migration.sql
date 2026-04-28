-- Recruiter saves & notes (anonymous, cookie-keyed)
CREATE TABLE "RecruiterSavedCandidate" (
  "id"                TEXT        NOT NULL,
  "viewerKey"         TEXT        NOT NULL,
  "irSlug"            TEXT        NOT NULL,
  "candidateName"     TEXT,
  "candidateHeadline" TEXT,
  "savedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt"        TIMESTAMP(3),

  CONSTRAINT "RecruiterSavedCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruiterSavedCandidate_viewerKey_irSlug_key"
  ON "RecruiterSavedCandidate"("viewerKey", "irSlug");
CREATE INDEX "RecruiterSavedCandidate_viewerKey_savedAt_idx"
  ON "RecruiterSavedCandidate"("viewerKey", "savedAt");
CREATE INDEX "RecruiterSavedCandidate_irSlug_idx"
  ON "RecruiterSavedCandidate"("irSlug");

CREATE TABLE "RecruiterNote" (
  "id"        TEXT        NOT NULL,
  "viewerKey" TEXT        NOT NULL,
  "irSlug"    TEXT        NOT NULL,
  "body"      TEXT        NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecruiterNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruiterNote_viewerKey_irSlug_key"
  ON "RecruiterNote"("viewerKey", "irSlug");
CREATE INDEX "RecruiterNote_viewerKey_updatedAt_idx"
  ON "RecruiterNote"("viewerKey", "updatedAt");
