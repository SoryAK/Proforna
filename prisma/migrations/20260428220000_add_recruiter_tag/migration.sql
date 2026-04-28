-- Add recruiter tag to saved candidates (hot | maybe | no_go | null)
ALTER TABLE "RecruiterSavedCandidate" ADD COLUMN "tag" TEXT;

CREATE INDEX "RecruiterSavedCandidate_viewerKey_tag_idx"
  ON "RecruiterSavedCandidate"("viewerKey", "tag");
