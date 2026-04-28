-- ── Adaptive Interactive Resume ──
-- Add IR config fields directly to UserProfile so the IR is profile-driven
ALTER TABLE "UserProfile"
  ADD COLUMN "irSlug"       TEXT,
  ADD COLUMN "irTheme"      TEXT NOT NULL DEFAULT 'modern',
  ADD COLUMN "irSections"   TEXT,
  ADD COLUMN "irTargetRole" TEXT;

CREATE UNIQUE INDEX "UserProfile_irSlug_key" ON "UserProfile"("irSlug");

-- Per-share overrides on AccessRequest (recruiter-specific targeting)
ALTER TABLE "AccessRequest"
  ADD COLUMN "targetRole"    TEXT,
  ADD COLUMN "focusSections" TEXT;

-- Per-share overrides on SingleUseLink
ALTER TABLE "SingleUseLink"
  ADD COLUMN "targetRole"    TEXT,
  ADD COLUMN "focusSections" TEXT;

-- ── Backfill irSlug from existing data ──
-- Priority: portalSlug if not the default 'portal', else slug from fullName,
-- else from the user's most-recently-updated active InteractiveResume,
-- else a short id-based fallback. Conflicts get a numeric suffix added below.
UPDATE "UserProfile" p
SET "irSlug" = COALESCE(
  -- 1. existing custom portalSlug (skip the default value)
  NULLIF(CASE WHEN p."portalSlug" <> 'portal' THEN p."portalSlug" ELSE NULL END, ''),
  -- 2. slugified full name
  NULLIF(LOWER(REGEXP_REPLACE(COALESCE(p."fullName", ''), '[^a-zA-Z0-9]+', '-', 'g')), ''),
  -- 3. slug from a published interactive resume
  (
    SELECT ir."slug" FROM "InteractiveResume" ir
    WHERE ir."userId" = p."userId" AND ir."isPublished" = true
    ORDER BY ir."updatedAt" DESC
    LIMIT 1
  ),
  -- 4. fallback: short id
  CONCAT('r-', SUBSTRING(p."id" FROM 1 FOR 8))
);

-- Trim leading/trailing dashes that REGEXP_REPLACE may have left
UPDATE "UserProfile"
SET "irSlug" = TRIM(BOTH '-' FROM "irSlug")
WHERE "irSlug" IS NOT NULL;

-- Resolve duplicate slugs by appending a row-number suffix
WITH dups AS (
  SELECT "id",
         "irSlug",
         ROW_NUMBER() OVER (PARTITION BY "irSlug" ORDER BY "id") AS rn
  FROM "UserProfile"
  WHERE "irSlug" IS NOT NULL
)
UPDATE "UserProfile" p
SET "irSlug" = p."irSlug" || '-' || (dups.rn - 1)
FROM dups
WHERE p."id" = dups."id" AND dups.rn > 1;

-- Backfill irTheme + irSections from active InteractiveResume when present
UPDATE "UserProfile" p
SET
  "irTheme"    = COALESCE(ir."theme", p."irTheme"),
  "irSections" = COALESCE(ir."sections", p."irSections")
FROM (
  SELECT DISTINCT ON ("userId") "userId", "theme", "sections"
  FROM "InteractiveResume"
  WHERE "isPublished" = true
  ORDER BY "userId", "updatedAt" DESC
) ir
WHERE p."userId" = ir."userId";
